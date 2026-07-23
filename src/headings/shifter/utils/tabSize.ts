import { EditorState } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, type Editor } from "obsidian";
import { TABSIZE } from "./constants";

const tabSizes = new WeakMap<Editor, number>();

export function rememberEditorTabSize(editor: Editor, tabSize: number): void {
    if (Number.isInteger(tabSize) && tabSize > 0) tabSizes.set(editor, tabSize);
}

function capture(view: EditorView): void {
    try {
        const editor = view.state.field(editorInfoField)?.editor;
        const tabSize = view.state.facet(EditorState.tabSize);
        if (editor) rememberEditorTabSize(editor, tabSize);
    } catch {
        // The editor field may be unavailable while a view is being detached.
    }
}

export const editorTabSizeTracker = ViewPlugin.fromClass(class {
    constructor(view: EditorView) {
        capture(view);
    }

    update(update: ViewUpdate): void {
        capture(update.view);
    }
});

export function getEditorTabSize(editor: Editor): number {
    return tabSizes.get(editor) ?? TABSIZE;
}
