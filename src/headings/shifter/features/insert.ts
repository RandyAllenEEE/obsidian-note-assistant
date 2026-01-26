import { type Command, type Editor, Notice } from "obsidian";
import type { MyHeadingsSettings } from "../../../settings";
import { applyHeading, createListIndentChangesByListBehavior } from "./apply";
import { composeLineChanges } from "../utils/editorChange";
import { checkHeading, getPreviousHeading } from "../utils/markdown";
import { t } from "../../../i18n/helpers";

export class InsertHeadingAtCurrentLevel {
    settings: MyHeadingsSettings;
    constructor(settings: MyHeadingsSettings) {
        this.settings = settings;
    }

    editorCallback = (editor: Editor) => {
        const cursorLine = editor.getCursor("from").line;
        const lastHeadingLine = getPreviousHeading(editor, cursorLine);

        // current heading level == most recently added heading
        // 0 if no heading exists yet
        const headingLevel =
            lastHeadingLine !== undefined
                ? checkHeading(editor.getLine(lastHeadingLine))
                : 0;
        const targetHeadingLevel = headingLevel;

        const headingChanges = composeLineChanges(editor, [cursorLine], (chunk) =>
            applyHeading(chunk, targetHeadingLevel, this.settings),
        );

        const indentChanges = createListIndentChangesByListBehavior(editor, {
            parentIndentLevel: targetHeadingLevel - 1,
            tabSize: this.settings.editor.tabSize,
            listBehavior: this.settings.list.childrenBehavior,
            parentLineNumber: cursorLine,
        });

        editor.transaction({
            changes: [...headingChanges, ...indentChanges],
        });

        editor.setCursor(editor.getCursor().line);
        return true;
    };

    createCommand = (): Command => {
        return {
            id: `heading-shifter-insert-heading-current`,
            name: t("Insert Heading at current level"),
            icon: `headingShifter_heading`,
            editorCallback: this.editorCallback,
        };
    };
}

export class InsertHeadingAtDeeperLevel {
    settings: MyHeadingsSettings;
    constructor(settings: MyHeadingsSettings) {
        this.settings = settings;
    }

    editorCallback = (editor: Editor) => {
        const cursorLine = editor.getCursor("from").line;
        const lastHeadingLine = getPreviousHeading(editor, cursorLine);

        // current heading level == most recently added heading
        // 0 if no heading exists yet
        const headingLevel = lastHeadingLine
            ? checkHeading(editor.getLine(lastHeadingLine))
            : 0;

        if (headingLevel + 1 > 6) {
            new Notice("Cannot Increase (contains more than Heading 6)");
            return true;
        }

        const targetHeadingLevel = headingLevel + 1;

        const headingChanges = composeLineChanges(
            editor,
            [cursorLine],
            (chunk: string) => applyHeading(chunk, targetHeadingLevel, this.settings),
        );

        const indentChanges = createListIndentChangesByListBehavior(editor, {
            parentIndentLevel: targetHeadingLevel - 1,
            tabSize: this.settings.editor.tabSize,
            listBehavior: this.settings.list.childrenBehavior,
            parentLineNumber: cursorLine,
        });

        editor.transaction({
            changes: [...headingChanges, ...indentChanges],
        });

        editor.setCursor(editor.getCursor().line);
        return true;
    };

    createCommand = (): Command => {
        return {
            id: `heading-shifter-insert-heading-deeper`,
            name: t("Insert Heading at one level deeper"),
            icon: `headingShifter_heading`,
            editorCallback: this.editorCallback,
        };
    };
}

export class InsertHeadingAtHigherLevel {
    settings: MyHeadingsSettings;
    constructor(settings: MyHeadingsSettings) {
        this.settings = settings;
    }

    editorCallback = (editor: Editor) => {
        const cursorLine = editor.getCursor("from").line;
        const lastHeadingLine = getPreviousHeading(editor, cursorLine);

        // current heading level == most recently added heading
        // 0 if no heading exists yet
        const headingLevel = lastHeadingLine
            ? checkHeading(editor.getLine(lastHeadingLine))
            : 0;

        const targetHeadingLevel = headingLevel - 1;

        const headingChanges = composeLineChanges(
            editor,
            [cursorLine],
            (chunk: string) => applyHeading(chunk, targetHeadingLevel, this.settings),
        );

        const indentChanges = createListIndentChangesByListBehavior(editor, {
            parentIndentLevel: targetHeadingLevel,
            tabSize: this.settings.editor.tabSize,
            listBehavior: this.settings.list.childrenBehavior,
            parentLineNumber: cursorLine,
        });

        editor.transaction({
            changes: [...headingChanges, ...indentChanges],
        });

        editor.setCursor(editor.getCursor().line);
        return true;
    };

    createCommand = (): Command => {
        return {
            id: `heading-shifter-insert-heading-higher`,
            name: t("Insert Heading at one level higher"),
            icon: `headingShifter_heading`,
            editorCallback: this.editorCallback,
        };
    };
}
