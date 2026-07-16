export interface TextEdit {
    from: number;
    to: number;
    text: string;
}

export interface AmbiguousCandidate {
    line: number;
    token: string;
    edit: TextEdit;
}

export interface MarkdownLine {
    number: number;
    start: number;
    end: number;
    text: string;
    ignored: boolean;
}

function fnv32(input: string, seed: number): string {
    let hash = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export function fingerprintText(input: string): string {
    return [
        fnv32(input, 0x811c9dc5),
        fnv32(input, 0x9e3779b9),
        fnv32(input, 0x85ebca6b),
        fnv32(input, 0xc2b2ae35),
    ].join('');
}

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanMarkdownLines(source: string): MarkdownLine[] {
    const lines: MarkdownLine[] = [];
    let offset = 0;
    const rawLines = source.split('\n');
    let inFrontmatter = rawLines.length > 0 && rawLines[0].replace(/\r$/, '').trim() === '---';
    let frontmatterCanClose = false;
    let fenceChar = '';
    let fenceLength = 0;

    for (let number = 0; number < rawLines.length; number++) {
        const raw = rawLines[number];
        const text = raw.replace(/\r$/, '');
        const lineStart = offset;
        const lineEnd = lineStart + text.length;
        let ignored = false;

        if (inFrontmatter) {
            ignored = true;
            if (frontmatterCanClose && /^(---|\.\.\.)\s*$/.test(text.trim())) inFrontmatter = false;
            frontmatterCanClose = true;
        } else if (fenceChar) {
            ignored = true;
            const close = text.match(/^\s{0,3}(`+|~+)\s*$/);
            if (close && close[1][0] === fenceChar && close[1].length >= fenceLength) {
                fenceChar = '';
                fenceLength = 0;
            }
        } else {
            const open = text.match(/^\s{0,3}(`{3,}|~{3,})/);
            if (open) {
                ignored = true;
                fenceChar = open[1][0];
                fenceLength = open[1].length;
            } else if (/^\s*\|/.test(text)) {
                ignored = true;
            }
        }

        lines.push({ number, start: lineStart, end: lineEnd, text, ignored });
        offset += raw.length + (number < rawLines.length - 1 ? 1 : 0);
    }
    return lines;
}

export function normalizeEdits(source: string, edits: TextEdit[]): TextEdit[] {
    const result = edits
        .filter(edit => edit.from >= 0 && edit.to >= edit.from && edit.to <= source.length)
        .filter(edit => source.slice(edit.from, edit.to) !== edit.text)
        .sort((a, b) => a.from - b.from || a.to - b.to);
    for (let i = 1; i < result.length; i++) {
        if (result[i].from < result[i - 1].to) throw new Error('Overlapping numbering edits were rejected');
    }
    return result;
}

export function applyEditsToText(source: string, edits: TextEdit[]): string {
    const normalized = normalizeEdits(source, edits);
    let result = source;
    for (let i = normalized.length - 1; i >= 0; i--) {
        const edit = normalized[i];
        result = result.slice(0, edit.from) + edit.text + result.slice(edit.to);
    }
    return result;
}
