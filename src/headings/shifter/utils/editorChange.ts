import { TABSIZE } from "./constants";
import { Notice, type Editor, type EditorChange, type EditorPosition } from "obsidian";
import type { MyHeadingsSettings } from "../../../settings";
import { t } from "../../../i18n/helpers";
import { countIndentLevel, getListChildrenLines } from "./markdown";

export type MinimumEditor = {
    getLine: (number: number) => string;
    lineCount: () => number;
    setSelection: (anchor: EditorPosition, head?: EditorPosition) => void;
    getCursor(string?: "from" | "to" | "head" | "anchor"): EditorPosition;
};

export const composeLineChanges = (
    editor: MinimumEditor,
    lineNumbers: number[],
    changeCallback: (chunk: string, settings?: MyHeadingsSettings) => string,
    settings?: MyHeadingsSettings,
) => {
    const editorChange: EditorChange[] = [];

    for (const line of lineNumbers) {
        if (!Number.isInteger(line) || line < 0 || line >= editor.lineCount()) {
            editorChange.push({
                text: "",
                from: { line, ch: 0 },
                to: { line, ch: 0 },
            });
            continue;
        }
        const current = editor.getLine(line);
        const shifted = changeCallback(current, settings);

        editorChange.push({
            text: shifted,
            from: { line: line, ch: 0 },
            to: {
                line: line,
                ch: current.length,
            },
        });
    }

    return editorChange;
};

export type HeadingChangeDispatchStatus = "applied" | "unchanged" | "rejected";

type TransactionEditor = Editor;

export type HeadingChangeDispatcher = (
    editor: TransactionEditor,
    changes: EditorChange[],
    cursorLine?: number,
) => HeadingChangeDispatchStatus;

interface PreparedChange {
    change: EditorChange;
    fromOffset: number;
    toOffset: number;
}

function validPosition(position: EditorPosition, lines: string[]): boolean {
    return Number.isInteger(position.line)
        && Number.isInteger(position.ch)
        && position.line >= 0
        && position.line < lines.length
        && position.ch >= 0
        && position.ch <= lines[position.line].length;
}

interface HeadingChangePreview {
    source: string;
    result: string;
    changes: EditorChange[];
}

function previewHeadingChanges(
    editor: TransactionEditor,
    changes: EditorChange[],
): HeadingChangePreview | undefined {
    const lineCount = editor.lineCount();
    if (!Number.isInteger(lineCount) || lineCount < 1) {
        return changes.length === 0 ? { source: "", result: "", changes: [] } : undefined;
    }

    const lines: string[] = [];
    try {
        for (let line = 0; line < lineCount; line++) lines.push(editor.getLine(line));
    } catch {
        return undefined;
    }

    const lineStarts: number[] = [];
    let source = "";
    for (let line = 0; line < lines.length; line++) {
        if (line > 0) source += "\n";
        lineStarts.push(source.length);
        source += lines[line];
    }

    const positionToOffset = (position: EditorPosition): number =>
        lineStarts[position.line] + position.ch;
    const prepared: PreparedChange[] = [];
    const seen = new Set<string>();

    for (const change of changes) {
        const to = change.to ?? change.from;
        if (typeof change.text !== "string"
            || !validPosition(change.from, lines)
            || !validPosition(to, lines)) {
            return undefined;
        }

        const fromOffset = positionToOffset(change.from);
        const toOffset = positionToOffset(to);
        if (toOffset < fromOffset) return undefined;
        if (source.slice(fromOffset, toOffset) === change.text) continue;

        const key = `${fromOffset}\u0000${toOffset}\u0000${change.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        prepared.push({
            change: { text: change.text, from: change.from, to },
            fromOffset,
            toOffset,
        });
    }

    prepared.sort((left, right) =>
        left.fromOffset - right.fromOffset || left.toOffset - right.toOffset);

    for (let index = 1; index < prepared.length; index++) {
        const previous = prepared[index - 1];
        const current = prepared[index];
        const previousIsInsertion = previous.fromOffset === previous.toOffset;
        const currentIsInsertion = current.fromOffset === current.toOffset;
        const overlaps = current.fromOffset < previous.toOffset
            || current.fromOffset === previous.fromOffset
            || (current.fromOffset === previous.toOffset && (previousIsInsertion || currentIsInsertion));
        if (overlaps) return undefined;
    }

    let result = source;
    for (let index = prepared.length - 1; index >= 0; index--) {
        const item = prepared[index];
        result = result.slice(0, item.fromOffset) + item.change.text + result.slice(item.toOffset);
    }
    return { source, result, changes: prepared.map(item => item.change) };
}

export function dispatchHeadingChanges(
    editor: TransactionEditor,
    changes: EditorChange[],
    cursorLine?: number,
): HeadingChangeDispatchStatus {
    const preview = previewHeadingChanges(editor, changes);
    if (!preview) {
        new Notice(t("notice.headingEditCancelled"));
        return "rejected";
    }
    if (preview.changes.length === 0) return "unchanged";

    let selection;
    if (cursorLine !== undefined) {
        const resultLines = preview.result.split("\n");
        if (!Number.isInteger(cursorLine) || cursorLine < 0 || cursorLine >= resultLines.length) {
            new Notice(t("notice.headingEditCancelled"));
            return "rejected";
        }
        const position = { line: cursorLine, ch: resultLines[cursorLine].length };
        selection = { from: position, to: position };
    }

    try {
        editor.transaction({ changes: preview.changes, selection });
        return "applied";
    } catch (error) {
        console.error("Note Assistant rejected a heading edit transaction", error);
        new Notice(t("notice.headingEditCancelled"));
        return "rejected";
    }
}

export const createListIndentChanges = (
    editor: MinimumEditor,
    {
        parentLineNumber,
        parentIndentLevel,
        tabSize = TABSIZE,
    }: { parentLineNumber: number; parentIndentLevel: number; tabSize?: number },
): EditorChange[] => {
    const parentLine = editor.getLine(parentLineNumber);
    const prevParentIndentLevel = countIndentLevel(parentLine, tabSize);

    const childrenNumbers = getListChildrenLines(editor, {
        parentLineNumber,
        tabSize,
    });

    const indentDelta = parentIndentLevel - prevParentIndentLevel; // How much to change indent by
    const changes: EditorChange[] = [];

    childrenNumbers.forEach((lineNumber) => {
        const line = editor.getLine(lineNumber);
        const newIndentLevel = Math.max(
            countIndentLevel(line, tabSize) + indentDelta,
            0,
        );

        const match = line.match(
            /^(?<whitespace>\s*)(?<bullet>[-*]\s*|(?<numbered>\d+\.\s*))(?<heading>#+\s*)?(?<content>.*)$/,
        );

        const tabsMarkers = "\t".repeat(newIndentLevel);
        const bulletMarkers = match?.groups?.bullet || "";
        const numberedMarkers = match?.groups?.numbered || "";
        const listMarker = bulletMarkers || numberedMarkers;
        const headingMarkers = match?.groups?.heading
            ? "#".repeat(Math.min(newIndentLevel + 1, 6)) + " "
            : "";
        const content = match?.groups?.content || "";

        const newLine = `${tabsMarkers}${listMarker}${headingMarkers}${content}`;

        changes.push({
            text: newLine,
            from: { line: lineNumber, ch: 0 },
            to: { line: lineNumber, ch: line.length },
        });
    });

    return changes;
};
