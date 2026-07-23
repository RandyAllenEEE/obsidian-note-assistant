import { type Command, type Editor, Notice } from "obsidian";
import type { MyHeadingsSettings } from "../../../settings";
import {
    composeLineChanges,
    dispatchHeadingChanges,
    type HeadingChangeDispatcher,
} from "../utils/editorChange";
import { getHeadingLines, checkHeading } from "../utils/markdown";
import { applyHeading } from "./apply";
import { t } from "../../../i18n/helpers";

// Helper for pure shift logic
const shiftHeading = (
    chunk: string,
    dir: 1 | -1,
    settings?: MyHeadingsSettings,
): string => {
    const heading = checkHeading(chunk);
    return applyHeading(chunk, heading + dir, settings);
};

export const increaseHeading = (
    chunk: string,
    settings?: MyHeadingsSettings,
) => {
    return shiftHeading(chunk, 1, settings);
};

export const decreaseHeading = (
    chunk: string,
    settings?: MyHeadingsSettings,
) => {
    return shiftHeading(chunk, -1, settings);
};

export class IncreaseHeading {
    settings: MyHeadingsSettings;
    includesNoHeadingsLine: boolean;
    private readonly dispatch: HeadingChangeDispatcher;
    constructor(
        settings: MyHeadingsSettings,
        includesNoHeadingsLine: boolean,
        dispatch: HeadingChangeDispatcher = dispatchHeadingChanges,
    ) {
        this.settings = settings;
        this.includesNoHeadingsLine = includesNoHeadingsLine;
        this.dispatch = dispatch;
    }

    editorCallback = (editor: Editor) => {
        // Get the lines that contain heading
        const { headingLines, maxHeading } = getHeadingLines(
            editor,
            editor.getCursor("from").line,
            editor.getCursor("to").line,
            {
                includesNoHeadingsLine: this.includesNoHeadingsLine,
            },
        );

        // Do not increase If it contains more than heading 6 .
        if (maxHeading !== undefined && maxHeading >= 6) {
            new Notice(t('notice.cannotIncreasePastH6'));
            return true;
        }

        const editorChange = composeLineChanges(
            editor,
            headingLines,
            increaseHeading,
            this.settings,
        );
        const cursorLine = editor.getCursor("from").line === editor.getCursor("to").line
            ? editor.getCursor("from").line
            : undefined;
        const status = this.dispatch(editor, editorChange, cursorLine);

        // Since SHIFT is for items that already have a HEADING, it does not do `execOutdent`.
        return status === "applied";
    };

    createCommand = (): Command => {
        return {
            id: `heading-shifter-increase-heading${this.includesNoHeadingsLine ? "-forced" : ""}`,
            name: this.includesNoHeadingsLine
                ? t('command.increaseHeadingsForced')
                : t('command.increaseHeadings'),
            icon: "headingShifter_increaseIcon", // Should check if icon exists or use default
            editorCallback: this.editorCallback,
        };
    };

    check = (editor: Editor): boolean => {
        // Disable if there are no headings so as not to interfere with table or other operations.
        const { maxHeading } = getHeadingLines(
            editor,
            editor.getCursor("from").line,
            editor.getCursor("to").line,
        );
        if (maxHeading === undefined) return false;

        return this.settings.overrideTab;
    };
}

export class DecreaseHeading {
    settings: MyHeadingsSettings;
    private readonly dispatch: HeadingChangeDispatcher;
    constructor(
        settings: MyHeadingsSettings,
        dispatch: HeadingChangeDispatcher = dispatchHeadingChanges,
    ) {
        this.settings = settings;
        this.dispatch = dispatch;
    }
    editorCallback = (editor: Editor) => {
        // Get the lines that contain heading
        const { headingLines, minHeading } = getHeadingLines(
            editor,
            editor.getCursor("from").line,
            editor.getCursor("to").line,
        );

        // Do not decrease If it contains less than specified in the configuration heading.
        if (
            minHeading !== undefined &&
            minHeading <= Number(this.settings.limitHeadingFrom)
        ) {
            new Notice(t('notice.cannotDecreasePastLimit', {
                level: Number(this.settings.limitHeadingFrom),
            }));
            return true;
        }

        const editorChange = composeLineChanges(
            editor,
            headingLines,
            decreaseHeading,
            this.settings,
        );
        const cursorLine = editor.getCursor("from").line === editor.getCursor("to").line
            ? editor.getCursor("from").line
            : undefined;
        return this.dispatch(editor, editorChange, cursorLine) === "applied";
    };

    createCommand = () => {
        return {
            id: "heading-shifter-decrease-heading",
            name: t('command.decreaseHeadings'),
            icon: "headingShifter_decreaseIcon",
            editorCallback: this.editorCallback,
        };
    };

    check = (editor: Editor): boolean => {
        // Disable if there are no headings so as not to interfere with table or other operations.
        const { maxHeading } = getHeadingLines(
            editor,
            editor.getCursor("from").line,
            editor.getCursor("to").line,
        );
        if (maxHeading === undefined) return false;

        return this.settings.overrideTab;
    };
}
