import { ManagedNumberRecord, MyHeadingsSettings } from '../settings';
import {
    firstNumberingTokenInStyle,
    makeNumberingString,
    nextNumberingToken,
    NumberingStyle,
    NumberingToken,
} from '../utils/numbering-tokens';
import { AmbiguousCandidate, escapeRegExp, fingerprintText, normalizeEdits, scanMarkdownLines, TextEdit } from '../utils/reconcile';

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

function configSignature(settings: MyHeadingsSettings): string {
    return JSON.stringify({
        firstLevel: settings.firstLevel,
        maxLevel: settings.maxLevel,
        styles: settings.headingStyles,
        separators: settings.headingSeparators,
        starts: settings.headingStartValues,
        skip: settings.skipHeadings,
    });
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

function configuredPrefix(body: string, settings: MyHeadingsSettings): { token: string; consumed: number } | undefined {
    const styles: NumberingStyle[] = [];
    const matches: Array<{ token: string; consumed: number }> = [];

    for (let level = settings.firstLevel; level <= 6; level++) {
        const styleIndex = Math.min(level - 1, settings.headingStyles.length - 1);
        styles.push(supportedStyle(settings.headingStyles[styleIndex]));

        let pattern = tokenPattern(styles[0]);
        for (let index = 1; index < styles.length; index++) {
            pattern += `${escapeRegExp(settings.headingSeparators[index] || '')}${tokenPattern(styles[index])}`;
        }
        pattern += escapeRegExp(settings.headingSeparators[0] || '');
        const match = body.match(new RegExp(`^(${pattern})[ \\t]+`));
        if (match) matches.push({ token: match[1], consumed: match[0].length });
    }

    return matches.sort((left, right) => right.consumed - left.consumed)[0];
}

function bodyHash(body: string): string {
    return fingerprintText(body.trim());
}

function findUniqueOwnedMatches(
    expectations: HeadingExpectation[],
    records: ManagedNumberRecord[],
): Map<number, ManagedNumberRecord> {
    const candidatesByLine = new Map<number, ManagedNumberRecord[]>();
    for (const record of records) {
        if (!record.token) continue;
        const matches = expectations.filter(expectation => {
            if (!expectation.body.startsWith(`${record.token} `)) return false;
            return bodyHash(expectation.body.slice(record.token.length + 1)) === record.elementHash;
        });
        if (matches.length !== 1) continue;
        const line = matches[0].line;
        const candidates = candidatesByLine.get(line) ?? [];
        candidates.push(record);
        candidatesByLine.set(line, candidates);
    }

    const byLine = new Map<number, ManagedNumberRecord>();
    for (const [line, candidates] of candidatesByLine) {
        if (candidates.length === 1) byLine.set(line, candidates[0]);
    }
    return byLine;
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
): HeadingReconcilePlan {
    const expectations = computeHeadingExpectations(source, settings);
    const signature = configSignature(settings);
    const records = deduplicateRecords(existingRecords);
    const ownedByLine = findUniqueOwnedMatches(expectations, records);
    const usedRecords = new Set<ManagedNumberRecord>();
    const nextRecords: ManagedNumberRecord[] = [];
    const ambiguousLines: number[] = [];
    const ambiguousCandidates: AmbiguousCandidate[] = [];
    const edits: TextEdit[] = [];

    for (const expectation of expectations) {
        const expected = expectation.expectedToken;
        const exact = expected !== undefined && expectation.body.startsWith(`${expected} `);
        const owned = ownedByLine.get(expectation.line);
        if (owned) usedRecords.add(owned);
        const managedToken = exact ? expected : owned?.token;

        if (intent === 'clear') {
            if (managedToken) {
                edits.push({
                    from: expectation.contentStart,
                    to: expectation.contentStart + managedToken.length + 1,
                    text: '',
                });
                continue;
            }
            const ambiguous = expected ? configuredPrefix(expectation.body, settings) : undefined;
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
            if (owned) {
                edits.push({
                    from: expectation.contentStart,
                    to: expectation.contentStart + owned.token.length + 1,
                    text: '',
                });
            }
            continue;
        }

        if (exact) {
            nextRecords.push({
                elementHash: bodyHash(expectation.body.slice(expected.length + 1)),
                token: expected,
                configSignature: signature,
                level: expectation.level,
            });
            continue;
        }
        if (owned) {
            edits.push({
                from: expectation.contentStart,
                to: expectation.contentStart + owned.token.length,
                text: expected,
            });
            nextRecords.push({
                elementHash: owned.elementHash,
                token: expected,
                configSignature: signature,
                level: expectation.level,
            });
            continue;
        }
        const ambiguous = configuredPrefix(expectation.body, settings);
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

    for (const record of records) {
        if (!usedRecords.has(record)) nextRecords.push(record);
    }

    return {
        edits: normalizeEdits(source, edits),
        records: intent === 'clear' ? records.filter(record => !usedRecords.has(record)) : deduplicateRecords(nextRecords),
        ambiguousLines,
        ambiguousCandidates,
        expectations,
    };
}
