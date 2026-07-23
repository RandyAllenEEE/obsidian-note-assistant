import { ManagedNumberRecord, MyHeadingsSettings } from '../settings';
import {
    firstNumberingTokenInStyle,
    makeNumberingString,
    nextNumberingToken,
    NumberingStyle,
    NumberingToken,
} from '../utils/numbering-tokens';
import { AmbiguousCandidate, escapeRegExp, fingerprintText, normalizeEdits, scanMarkdownLines, TextEdit } from '../utils/reconcile';
import {
    DEFAULT_RECONCILE_CONTEXT,
    HeadingNumberingConfig,
    ReconcileContext,
} from '../utils/reconcile-context';

export interface HeadingExpectation {
    line: number;
    level: number;
    contentStart: number;
    body: string;
    expectedToken?: string;
    componentStyles: NumberingStyle[];
}

export interface HeadingReconcilePlan {
    edits: TextEdit[];
    records: ManagedNumberRecord[];
    ambiguousLines: number[];
    ambiguousCandidates: AmbiguousCandidate[];
    expectations: HeadingExpectation[];
}

function supportedStyle(value: string): NumberingStyle {
    return value === 'a' || value === 'A' || value === 'I' || value === '一' || value === '①' ? value : '1';
}

function tokenPattern(style: NumberingStyle): string {
    switch (style) {
        case 'a': return '[a-z&]';
        case 'A': return '[A-Z&]';
        case 'I': return '[IVXLCDM]+';
        case '一': return '(?:[零一二三四五六七八九十]|[0-9]+)';
        case '①': return '(?:[⓪①-⑳]|[0-9]+)';
        default: return '[0-9]+';
    }
}

export function headingConfigSignature(settings: HeadingNumberingConfig): string {
    return JSON.stringify({
        firstLevel: settings.firstLevel,
        maxLevel: settings.maxLevel,
        styles: settings.headingStyles,
        separators: settings.headingSeparators,
        starts: settings.headingStartValues,
        skip: settings.skipHeadings,
    });
}

export function parseHeadingConfigSignature(value: string): HeadingNumberingConfig | undefined {
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        const styles = parsed.styles;
        const separators = parsed.separators;
        const starts = parsed.starts;
        if (!Number.isInteger(parsed.firstLevel)
            || !Number.isInteger(parsed.maxLevel)
            || Number(parsed.firstLevel) < 1
            || Number(parsed.maxLevel) > 6
            || Number(parsed.firstLevel) > Number(parsed.maxLevel)
            || !Array.isArray(styles)
            || styles.length !== 6
            || styles.some(style => typeof style !== 'string' || !['1', 'a', 'A', 'I', '一', '①'].includes(style))
            || !Array.isArray(separators)
            || separators.length !== 6
            || separators.some(separator => typeof separator !== 'string' || separator.length > 1)
            || !Array.isArray(starts)
            || starts.length !== 6
            || starts.some(start => typeof start !== 'string')) {
            return undefined;
        }
        return {
            firstLevel: Number(parsed.firstLevel),
            maxLevel: Number(parsed.maxLevel),
            headingStyles: [...styles] as string[],
            headingSeparators: [...separators] as string[],
            headingStartValues: [...starts] as string[],
            skipHeadings: typeof parsed.skip === 'string' ? parsed.skip : '',
        };
    } catch {
        return undefined;
    }
}

function makeExpectedToken(stack: NumberingToken[], separators: string[]): string {
    return `${makeNumberingString(stack, separators).trimStart()}${separators[0] || ''}`;
}

export function computeHeadingExpectations(source: string, settings: MyHeadingsSettings): HeadingExpectation[] {
    const headings: HeadingExpectation[] = [];
    for (const line of scanMarkdownLines(source)) {
        if (line.ignored) continue;
        const match = line.text.match(/^(\s{0,3})(#{1,6})([ \t]+)(.*)$/);
        if (!match) continue;
        headings.push({
            line: line.number,
            level: match[2].length,
            contentStart: line.start + match[1].length + match[2].length + match[3].length,
            body: match[4],
            componentStyles: [],
        });
    }

    let previousLevel = settings.firstLevel - 1;
    let stack: NumberingToken[] = [];
    let stackStyles: NumberingStyle[] = [];

    for (const heading of headings) {
        const level = heading.level;
        if (level < settings.firstLevel) {
            previousLevel = settings.firstLevel - 1;
            stack = [];
            stackStyles = [];
            continue;
        }
        if (settings.skipHeadings && heading.body.endsWith(settings.skipHeadings)) continue;

        if (level === previousLevel) {
            const current = stack.pop();
            if (current) stack.push(nextNumberingToken(current));
        } else if (level < previousLevel) {
            const targetDepth = level - settings.firstLevel + 1;
            stack = stack.slice(0, Math.max(0, targetDepth));
            stackStyles = stackStyles.slice(0, Math.max(0, targetDepth));
            const current = stack.pop();
            if (current) stack.push(nextNumberingToken(current));
        } else {
            for (let physicalLevel = previousLevel + 1; physicalLevel <= level; physicalLevel++) {
                const index = Math.min(physicalLevel - 1, settings.headingStyles.length - 1);
                const style = supportedStyle(settings.headingStyles[index]);
                const start = settings.headingStartValues[index] ?? '1';
                stack.push(firstNumberingTokenInStyle(style, start));
                stackStyles.push(style);
            }
        }
        previousLevel = level;

        if (level <= settings.maxLevel && stack.length > 0) {
            heading.expectedToken = makeExpectedToken(stack, settings.headingSeparators);
            heading.componentStyles = [...stackStyles];
        }
    }
    return headings;
}

function prefixPattern(config: HeadingNumberingConfig, depth: number, includeTrailingSeparator: boolean): string {
    const styles: NumberingStyle[] = [];
    for (let component = 0; component < depth; component++) {
        const level = config.firstLevel + component;
        const styleIndex = Math.min(level - 1, config.headingStyles.length - 1);
        styles.push(supportedStyle(config.headingStyles[styleIndex]));
    }
    let pattern = tokenPattern(styles[0]);
    for (let index = 1; index < styles.length; index++) {
        pattern += `${escapeRegExp(config.headingSeparators[index] || '')}${tokenPattern(styles[index])}`;
    }
    if (includeTrailingSeparator) pattern += escapeRegExp(config.headingSeparators[0] || '');
    return pattern;
}

export function matchesHeadingNumberingToken(token: string, config: HeadingNumberingConfig): boolean {
    const maxDepth = config.maxLevel - config.firstLevel + 1;
    for (let depth = 1; depth <= maxDepth; depth++) {
        if (new RegExp(`^${prefixPattern(config, depth, false)}$`).test(token)) return true;
    }
    return false;
}

function configuredPrefix(body: string, config: HeadingNumberingConfig): { token: string; consumed: number } | undefined {
    const matches: Array<{ token: string; consumed: number }> = [];
    const maxDepth = config.maxLevel - config.firstLevel + 1;
    for (let depth = 1; depth <= maxDepth; depth++) {
        const pattern = prefixPattern(config, depth, true);
        const match = body.match(new RegExp(`^(${pattern})[ \\t]+`));
        if (match) matches.push({ token: match[1], consumed: match[0].length });
    }
    return matches.sort((left, right) => right.consumed - left.consumed)[0];
}

function bodyHash(body: string): string {
    return fingerprintText(body.trim());
}

function recordedPrefixes(
    expectations: HeadingExpectation[],
    records: ManagedNumberRecord[],
): Map<number, { token: string; consumed: number }> {
    const matchesByHeading = new Map<number, Array<{ token: string; consumed: number }>>();
    for (const record of records) {
        if (!parseHeadingConfigSignature(record.configSignature) || !record.token) continue;
        const matcher = new RegExp(`^(${escapeRegExp(record.token)})[ \\t]+`);
        const matches = expectations.flatMap(expectation => {
            const match = expectation.body.match(matcher);
            if (!match) return [];
            const rest = expectation.body.slice(match[0].length);
            return bodyHash(rest) === record.elementHash
                ? [{ expectation, prefix: { token: record.token, consumed: match[0].length } }]
                : [];
        });
        if (matches.length !== 1) continue;
        const match = matches[0];
        const candidates = matchesByHeading.get(match.expectation.contentStart) ?? [];
        candidates.push(match.prefix);
        matchesByHeading.set(match.expectation.contentStart, candidates);
    }

    const result = new Map<number, { token: string; consumed: number }>();
    for (const [contentStart, matches] of matchesByHeading) {
        if (matches.length === 1) result.set(contentStart, matches[0]);
    }
    return result;
}

function suspiciousPrefix(body: string): { token: string; consumed: number } | undefined {
    const scalar = '(?:[0-9]+|[⓪①-⑳]|[零一二三四五六七八九十])';
    const structured = `(?:${scalar}(?:[-:.—]${scalar})*|[A-Za-zIVXLCDM]+(?:[-:.—][A-Za-z0-9IVXLCDM]+)+)`;
    const match = body.match(new RegExp(`^(${structured})[ \\t]+`));
    return match ? { token: match[1], consumed: match[0].length } : undefined;
}

function acceptedConfigs(
    settings: MyHeadingsSettings,
    records: ManagedNumberRecord[],
    context: ReconcileContext,
): HeadingNumberingConfig[] {
    const configs: HeadingNumberingConfig[] = [settings, ...(context.acceptedHeadingConfigs ?? [])];
    for (const record of records) {
        const parsed = parseHeadingConfigSignature(record.configSignature);
        if (parsed) configs.push(parsed);
    }
    const seen = new Set<string>();
    return configs.filter(config => {
        const signature = headingConfigSignature(config);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });
}

function managedPrefix(
    body: string,
    configs: HeadingNumberingConfig[],
    recorded?: { token: string; consumed: number },
): { token: string; consumed: number } | undefined {
    const matches = configs
        .map(config => configuredPrefix(body, config))
        .filter((match): match is { token: string; consumed: number } => Boolean(match));
    if (recorded) matches.push(recorded);
    return matches.sort((left, right) => right.consumed - left.consumed)[0];
}

function deduplicateRecords(records: ManagedNumberRecord[]): ManagedNumberRecord[] {
    const seen = new Set<string>();
    return records.filter(record => {
        const key = `${record.elementHash}\u0000${record.token}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function planHeadingReconcile(
    source: string,
    settings: MyHeadingsSettings,
    intent: 'number' | 'clear',
    existingRecords: ManagedNumberRecord[] = [],
    context: ReconcileContext = DEFAULT_RECONCILE_CONTEXT,
): HeadingReconcilePlan {
    const expectations = computeHeadingExpectations(source, settings);
    const signature = headingConfigSignature(settings);
    const records = deduplicateRecords(existingRecords);
    const configs = acceptedConfigs(settings, records, context);
    const recorded = recordedPrefixes(expectations, records);
    const nextRecords: ManagedNumberRecord[] = [];
    const ambiguousLines: number[] = [];
    const ambiguousCandidates: AmbiguousCandidate[] = [];
    const edits: TextEdit[] = [];

    for (const expectation of expectations) {
        const expected = expectation.expectedToken;
        const managed = managedPrefix(expectation.body, configs, recorded.get(expectation.contentStart));

        if (intent === 'clear') {
            if (managed) {
                edits.push({
                    from: expectation.contentStart,
                    to: expectation.contentStart + managed.consumed,
                    text: '',
                });
                continue;
            }
            const ambiguous = expected ? suspiciousPrefix(expectation.body) : undefined;
            if (ambiguous) {
                ambiguousLines.push(expectation.line + 1);
                ambiguousCandidates.push({
                    line: expectation.line + 1,
                    token: ambiguous.token,
                    edit: {
                        from: expectation.contentStart,
                        to: expectation.contentStart + ambiguous.consumed,
                        text: '',
                    },
                });
            }
            continue;
        }

        if (!expected) {
            if (managed) {
                edits.push({
                    from: expectation.contentStart,
                    to: expectation.contentStart + managed.consumed,
                    text: '',
                });
            }
            continue;
        }

        if (managed) {
            const rest = expectation.body.slice(managed.consumed);
            if (managed.token !== expected || managed.consumed !== expected.length + 1) {
                edits.push({
                    from: expectation.contentStart,
                    to: expectation.contentStart + managed.consumed,
                    text: `${expected} `,
                });
            }
            nextRecords.push({
                elementHash: bodyHash(rest),
                token: expected,
                configSignature: signature,
                level: expectation.level,
            });
            continue;
        }
        const ambiguous = suspiciousPrefix(expectation.body);
        if (ambiguous) {
            ambiguousLines.push(expectation.line + 1);
            ambiguousCandidates.push({
                line: expectation.line + 1,
                token: ambiguous.token,
                edit: {
                    from: expectation.contentStart,
                    to: expectation.contentStart + ambiguous.consumed,
                    text: '',
                },
            });
            continue;
        }

        edits.push({ from: expectation.contentStart, to: expectation.contentStart, text: `${expected} ` });
        nextRecords.push({
            elementHash: bodyHash(expectation.body),
            token: expected,
            configSignature: signature,
            level: expectation.level,
        });
    }

    return {
        edits: normalizeEdits(source, edits),
        records: intent === 'clear' ? [] : deduplicateRecords(nextRecords),
        ambiguousLines,
        ambiguousCandidates,
        expectations,
    };
}
