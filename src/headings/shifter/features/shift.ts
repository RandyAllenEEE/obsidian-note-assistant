import { type Command, type Editor, Notice } from "obsidian";
import type { MyHeadingsSettings } from "../../../settings";
import { composeLineChanges } from "../utils/editorChange";
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
    constructor(
        settings: MyHeadingsSettings,
        includesNoHeadingsLine: boolean,
    ) {
        this.settings = settings;
        this.includesNoHeadingsLine = includesNoHeadingsLine;
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
            new Notice("Cannot Increase (contains more than Heading 6)");
            return true;
        }

        const isOneLine =
            editor.getCursor("from").line === editor.getCursor("to").line;

        // Dispatch Transaction
        const editorChange = composeLineChanges(
            editor,
            headingLines,
            increaseHeading,
            this.settings,
        );
        editor.transaction({
            changes: editorChange,
        });

        // Since SHIFT is for items that already have a HEADING, it does not do `execOutdent`.

        // If only one line is targeted, move the cursor to the end of the line.
        if (isOneLine) {
            editor.setCursor(editor.getCursor("anchor").line);
        }
        return editorChange.length ? true : false;
    };

    createCommand = (): Command => {
        return {
            id: `heading-shifter-increase-heading${this.includesNoHeadingsLine ? "-forced" : ""}`,
            name: this.includesNoHeadingsLine
                ? t("Increase Headings (forced)")
                : t("Increase Headings"),
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
    constructor(settings: MyHeadingsSettings) {
        this.settings = settings;
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
            new Notice(
                `Cannot Decrease (contains less than Heading${Number(
                    this.settings.limitHeadingFrom,
                )})`,
            );
            return true;
        }

        const isOneLine =
            editor.getCursor("from").line === editor.getCursor("to").line;

        // Dispatch Transaction
        const editorChange = composeLineChanges(
            editor,
            headingLines,
            decreaseHeading,
            this.settings,
        );
        editor.transaction({
            changes: editorChange,
        });

        // If only one line is targeted, move the cursor to the end of the line.
        if (isOneLine) {
            editor.setCursor(editor.getCursor("anchor").line);
        }
        return editorChange.length ? true : false;
    };

    createCommand = () => {
        return {
            id: "heading-shifter-decrease-heading",
            name: t("Decrease Headings"),
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
