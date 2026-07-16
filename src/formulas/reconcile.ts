import { ManagedNumberRecord, MyFormulasSettings, MyHeadingsSettings } from '../settings';
import { computeHeadingExpectations } from '../headings/reconcile';
import { AmbiguousCandidate, fingerprintText, normalizeEdits, scanMarkdownLines, TextEdit } from '../utils/reconcile';

export interface DisplayMathBlock {
    start: number;
    end: number;
    contentStart: number;
    contentEnd: number;
    line: number;
}

export interface FormulaReconcilePlan {
    edits: TextEdit[];
    records: ManagedNumberRecord[];
    ambiguousLines: number[];
    ambiguousCandidates: AmbiguousCandidate[];
    blocks: DisplayMathBlock[];
}

interface FormulaTag {
    from: number;
    to: number;
    token: string;
    value: string;
}

function inlineCodeRanges(line: string): Array<{ from: number; to: number }> {
    const ranges: Array<{ from: number; to: number }> = [];
    let index = 0;
    while (index < line.length) {
        if (line[index] !== '`') {
            index++;
            continue;
        }
        let run = 1;
        while (line[index + run] === '`') run++;
        const delimiter = '`'.repeat(run);
        const close = line.indexOf(delimiter, index + run);
        if (close === -1) {
            ranges.push({ from: index, to: line.length });
            break;
        }
        ranges.push({ from: index, to: close + run });
        index = close + run;
    }
    return ranges;
}

function isEscaped(line: string, index: number): boolean {
    let slashes = 0;
    for (let i = index - 1; i >= 0 && line[i] === '\\'; i--) slashes++;
    return slashes % 2 === 1;
}

export function scanDisplayMathBlocks(source: string): DisplayMathBlock[] {
    const blocks: DisplayMathBlock[] = [];
    let opening: { offset: number; line: number } | undefined;
    for (const line of scanMarkdownLines(source)) {
        if (line.ignored) {
            opening = undefined;
            continue;
        }
        const codeRanges = inlineCodeRanges(line.text);
        let index = 0;
        while (index < line.text.length - 1) {
            if (line.text[index] !== '$') {
                index++;
                continue;
            }
            let run = 1;
            while (line.text[index + run] === '$') run++;
            const inCode = codeRanges.some(range => index >= range.from && index < range.to);
            if (run !== 2 || inCode || isEscaped(line.text, index)) {
                if (run > 2) {
                    opening = undefined;
                    break;
                }
                index += run;
                continue;
            }
            const offset = line.start + index;
            if (!opening) {
                opening = { offset, line: line.number };
            } else {
                blocks.push({
                    start: opening.offset,
                    end: offset + 2,
                    contentStart: opening.offset + 2,
                    contentEnd: offset,
                    line: opening.line,
                });
                opening = undefined;
            }
            index += 2;
        }
    }
    return blocks;
}

function findTags(source: string, block: DisplayMathBlock): FormulaTag[] {
    const content = source.slice(block.contentStart, block.contentEnd);
    const regex = /\\tag\{([^{}]*)\}/g;
    const tags: FormulaTag[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        tags.push({
            from: block.contentStart + match.index,
            to: block.contentStart + match.index + match[0].length,
            token: match[0],
            value: match[1],
        });
    }
    return tags;
}

function hasUnparsedTagCommand(source: string, block: DisplayMathBlock, tags: FormulaTag[]): boolean {
    const content = source.slice(block.contentStart, block.contentEnd);
    const commandCount = content.match(/\\tag(?:\*|\s|\{)/g)?.length ?? 0;
    return commandCount !== tags.length;
}

function formulaHash(source: string, block: DisplayMathBlock, tag?: FormulaTag): string {
    let content = source.slice(block.contentStart, block.contentEnd);
    if (tag) {
        const relativeFrom = tag.from - block.contentStart;
        const relativeTo = tag.to - block.contentStart;
        content = content.slice(0, relativeFrom) + content.slice(relativeTo);
    }
    return fingerprintText(content.trim());
}

function configSignature(settings: MyFormulasSettings): string {
    return JSON.stringify({ mode: settings.mode, maxDepth: settings.maxDepth });
}

function expectedFormulaNumbers(
    source: string,
    blocks: DisplayMathBlock[],
    settings: MyFormulasSettings,
    headingSettings: MyHeadingsSettings,
): string[] {
    if (settings.mode === 'continuous') return blocks.map((_, index) => String(index + 1));

    const headings = computeHeadingExpectations(source, headingSettings)
        .filter(heading => heading.level <= settings.maxDepth && heading.expectedToken);
    const sectionCounters = new Map<number, number>();
    let fallbackCounter = 1;
    return blocks.map(block => {
        let section = undefined as typeof headings[number] | undefined;
        for (const heading of headings) {
            if (heading.contentStart > block.start) break;
            section = heading;
        }
        if (!section || !section.expectedToken) return String(fallbackCounter++);
        const count = sectionCounters.get(section.line) ?? 1;
        sectionCounters.set(section.line, count + 1);
        const trailing = headingSettings.headingSeparators[0] || '';
        const prefix = trailing && section.expectedToken.endsWith(trailing)
            ? section.expectedToken.slice(0, -trailing.length)
            : section.expectedToken;
        return `${prefix}-${count}`;
    });
}

function findUniqueOwnedMatches(
    source: string,
    blocks: DisplayMathBlock[],
    records: ManagedNumberRecord[],
): Map<number, ManagedNumberRecord> {
    const result = new Map<number, ManagedNumberRecord>();
    for (const record of records) {
        const matches = blocks.filter((block, index) => {
            const tags = findTags(source, block);
            return tags.length === 1 && tags[0].token === record.token && formulaHash(source, block, tags[0]) === record.elementHash;
        });
        if (matches.length === 1) {
            const index = blocks.indexOf(matches[0]);
            if (!result.has(index)) result.set(index, record);
        }
    }
    return result;
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

export function planFormulaReconcile(
    source: string,
    settings: MyFormulasSettings,
    headingSettings: MyHeadingsSettings,
    intent: 'number' | 'clear',
    existingRecords: ManagedNumberRecord[] = [],
): FormulaReconcilePlan {
    const blocks = scanDisplayMathBlocks(source);
    const expectedNumbers = expectedFormulaNumbers(source, blocks, settings, headingSettings);
    const ownedByBlock = findUniqueOwnedMatches(source, blocks, existingRecords);
    const signature = configSignature(settings);
    const usedRecords = new Set<ManagedNumberRecord>();
    const nextRecords: ManagedNumberRecord[] = [];
    const ambiguousLines: number[] = [];
    const ambiguousCandidates: AmbiguousCandidate[] = [];
    const edits: TextEdit[] = [];

    blocks.forEach((block, index) => {
        const tags = findTags(source, block);
        if (tags.length > 1 || hasUnparsedTagCommand(source, block, tags)) {
            ambiguousLines.push(block.line + 1);
            return;
        }
        const expectedToken = `\\tag{${expectedNumbers[index]}}`;
        const tag = tags[0];
        const exact = tag?.token === expectedToken;
        const owned = ownedByBlock.get(index);
        if (owned) usedRecords.add(owned);
        const managed = exact ? tag : owned && tag?.token === owned.token ? tag : undefined;

        if (intent === 'clear') {
            if (managed) {
                let from = managed.from;
                if (owned?.leadingSpace && source[from - 1] === ' ') from--;
                edits.push({ from, to: managed.to, text: '' });
            } else if (tag) {
                ambiguousLines.push(block.line + 1);
                ambiguousCandidates.push({
                    line: block.line + 1,
                    token: tag.token,
                    edit: { from: tag.from, to: tag.to, text: '' },
                });
            }
            return;
        }

        if (exact && tag) {
            nextRecords.push({
                elementHash: formulaHash(source, block, tag),
                token: expectedToken,
                configSignature: signature,
                leadingSpace: owned?.leadingSpace ?? false,
            });
            return;
        }
        if (owned && tag?.token === owned.token) {
            edits.push({ from: tag.from, to: tag.to, text: expectedToken });
            nextRecords.push({
                elementHash: owned.elementHash,
                token: expectedToken,
                configSignature: signature,
                leadingSpace: owned.leadingSpace,
            });
            return;
        }
        if (tag) {
            ambiguousLines.push(block.line + 1);
            ambiguousCandidates.push({
                line: block.line + 1,
                token: tag.token,
                edit: { from: tag.from, to: tag.to, text: '' },
            });
            return;
        }

        edits.push({ from: block.contentEnd, to: block.contentEnd, text: ` ${expectedToken}` });
        nextRecords.push({
            elementHash: formulaHash(source, block),
            token: expectedToken,
            configSignature: signature,
            leadingSpace: true,
        });
    });

    for (const record of existingRecords) {
        if (!usedRecords.has(record)) nextRecords.push(record);
    }

    return {
        edits: normalizeEdits(source, edits),
        records: intent === 'clear' ? existingRecords.filter(record => !usedRecords.has(record)) : deduplicateRecords(nextRecords),
        ambiguousLines,
        ambiguousCandidates,
        blocks,
    };
}
