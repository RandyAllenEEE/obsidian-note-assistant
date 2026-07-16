import { Editor, EditorChange } from 'obsidian';
import { normalizeEdits, TextEdit } from './reconcile';

export function applyEditorEdits(editor: Editor, source: string, edits: TextEdit[]): boolean {
    if (editor.getValue() !== source) return false;
    const normalized = normalizeEdits(source, edits);
    if (normalized.length === 0) return false;
    const changes: EditorChange[] = normalized.map(edit => ({
        from: editor.offsetToPos(edit.from),
        to: editor.offsetToPos(edit.to),
        text: edit.text,
    }));
    editor.transaction({ changes });
    return true;
}
