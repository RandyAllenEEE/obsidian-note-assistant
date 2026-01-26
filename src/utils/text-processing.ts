
import { Editor, EditorChange, EditorRange, EditorPosition, HeadingCache, CachedMetadata } from 'obsidian';
import { NumberingStyle } from './numbering-tokens';

export interface SupportFlags {
    alphabet: boolean;
    roman: boolean;
}

// Regex to find existing numbering in headers
// Matches: 
// ^\s{0,3}#+( )?           -> Hash and space
// ([Token]+ [Separator]+ ( )?)* -> Optional parent levels
// ([Token]+)?              -> Current level number
// ( )? [Separator]? ( )+   -> Trailing separator/space
export function getRegexForHeaderString(flags?: SupportFlags): RegExp {
    // Enhanced regex from source:
    // /^\s{0,3}#+( )?([0-9a-zA-Z\u4e00-\u9fa5\u2460-\u2473&⓪]+[.:—\-]+( )?)*([0-9a-zA-Z\u4e00-\u9fa5\u2460-\u2473&⓪]+)?( )?[.:—\-]?( )+/g
    return /^\s{0,3}#+( )?([0-9a-zA-Z\u4e00-\u9fa5\u2460-\u2473&⓪]+[.:—\-]+( )?)*([0-9a-zA-Z\u4e00-\u9fa5\u2460-\u2473&⓪]+)?( )?[.:—\-]?( )+/g;
}

export function findRangeInHeaderString(lineText: string, lineNumber: number): EditorRange | undefined {
    const regex = getRegexForHeaderString();
    if (!lineText) return undefined;

    const matches = lineText.match(regex);
    if (matches && matches.length !== 1) {
        // Unexpected format or multiple matches (unlikely for ^ regex)
        return undefined;
    }

    const match = matches ? matches[0] : '';
    return {
        from: { line: lineNumber, ch: 0 },
        to: { line: lineNumber, ch: match.length }
    };
}

export function findHeadingPrefixRange(editor: Editor, heading: HeadingCache): EditorRange | undefined {
    const lineNumber = heading.position.start.line;
    const lineText = editor.getLine(lineNumber);
    return findRangeInHeaderString(lineText, lineNumber);
}

export function makeHeadingHashString(editor: Editor, heading: HeadingCache): string | undefined {
    const regex = /^\s{0,4}#+/g;
    const headingLineString = editor.getLine(heading.position.start.line);
    if (!headingLineString) return undefined;

    const matches = headingLineString.match(regex);
    if (!matches || matches.length !== 1) return undefined;

    return matches[0].trimLeft();
}

export function replaceRangeEconomically(editor: Editor, changes: EditorChange[], range: EditorRange, text: string): void {
    const previousText = editor.getRange(range.from, range.to);
    if (previousText !== text) {
        changes.push({
            from: range.from,
            to: range.to,
            text: text
        });
    }
}

export function restoreCursor(editor: Editor, cursor: EditorPosition): void {
    const lineCount = editor.lineCount();
    if (cursor.line < lineCount) {
        const lineLength = editor.getLine(cursor.line).length;
        if (cursor.ch <= lineLength) {
            editor.setCursor(cursor);
        } else {
            editor.setCursor(cursor.line, lineLength);
        }
    }
}

export function getCodeBlockRanges(data: CachedMetadata): { start: number, end: number }[] {
    if (!data || !data.sections) return [];
    return data.sections
        .filter(section => section.type === 'code')
        .map(section => ({
            start: section.position.start.line,
            end: section.position.end.line
        }));
}

export function isLineIgnored(lineNum: number, lineText: string, codeRanges: { start: number, end: number }[]): boolean {
    for (const range of codeRanges) {
        if (lineNum >= range.start && lineNum <= range.end) return true;
    }
    // Ignore table lines
    if (/^\s*\|/.test(lineText)) return true;
    return false;
}
