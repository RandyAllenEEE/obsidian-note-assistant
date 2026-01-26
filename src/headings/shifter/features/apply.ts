/* eslint-disable no-mixed-spaces-and-tabs */
import { TABSIZE } from "../utils/constants";
import { RegExpExample } from "../utils/regExp";
import type { EditorChange } from "obsidian";
import type { MyHeadingsSettings } from "../../../settings";
import {
    createListIndentChanges,
    type MinimumEditor,
} from "../utils/editorChange";
import {
    checkHeading,
    countIndentLevel,
    removeUsingRegexpStrings,
} from "../utils/markdown";

type ListBehavior = "outdent to zero" | "sync with headings" | "noting";

/**Return heading applied string from chunk
 * @return heading applied string
 * @params chunk - String to which heading is to be applied
 * @params headingSize - The Heading Size to be applied
 */
export const applyHeading = (
    chunk: string,
    headingSize: number,
    settings?: Partial<MyHeadingsSettings>,
): string => {
    const extractRegExp = (
        settingObj: any, // Relaxed type for settings object
        regExpObj: Record<string, string>,
    ): string[] => {
        return Object.entries(settingObj ?? {}).flatMap(([k, v]) => {
            if (Array.isArray(v)) {
                return v as string[];
            }
            if (k in regExpObj && v === true) {
                return [regExpObj[k as keyof typeof regExpObj] ?? []];
            }
            return [];
        });
    };

    const bulletRegExp = /\s*(- \[.+\]|-|\*|[0-9]+)\s+/;
    const headingRegExp = /#+\s+/;

    const isBullet =
        settings?.list?.childrenBehavior === "sync with headings" &&
        bulletRegExp.test(chunk);

    let removed = chunk;

    // Remove any style only when it is not HEADING (because it may be daring to put it on when HEADING)
    if (!checkHeading(chunk)) {
        removed = settings?.styleToRemove
            ? removeUsingRegexpStrings(chunk, {
                beginning: extractRegExp(
                    {
                        ...settings.styleToRemove.beginning,
                        ul: !isBullet && settings.styleToRemove.beginning.ul,
                    },
                    RegExpExample.beginning,
                ),
                surrounding: extractRegExp(
                    settings.styleToRemove.surrounding,
                    RegExpExample.surrounding,
                ),
            })
            : chunk;
    }

    const leadingMarkersRegExp = isBullet
        ? new RegExp(
            `^(?:${bulletRegExp.source}${headingRegExp.source}|${bulletRegExp.source})`,
        )
        : new RegExp(`^${headingRegExp.source}`);

    let capturedBullet = "-";
    // Remove current leading markers
    const principleText = removed.replace(leadingMarkersRegExp, (match, p1) => {
        // Capture the bullet part if it exists
        if (isBullet && p1) {
            capturedBullet = p1; // p1 from regex group
            // Regex used above: /\s*(- \[.+\]|-|\*|[0-9]+)\s+/
            const m = match.match(bulletRegExp);
            if (m && m[1]) capturedBullet = m[1];
        }
        return "";
    });

    // Make makers
    const bulletMarkers = `${"\t".repeat(Math.max(headingSize - 1, 0))}${capturedBullet} `;
    const headingMarkers =
        "#".repeat(Math.max(headingSize, 0)) + (headingSize > 0 ? " " : "");

    // Make marker to apply
    const leadingMarkers = isBullet
        ? `${bulletMarkers}${headingMarkers}`
        : headingMarkers;

    return leadingMarkers + principleText;
};

export const createListIndentChangesByListBehavior = (
    editor: MinimumEditor,
    {
        listBehavior,
        tabSize = TABSIZE,
        parentIndentLevel,
        parentLineNumber,
    }: {
        listBehavior: ListBehavior;
        tabSize?: number;
        parentIndentLevel: number;
        parentLineNumber: number;
    },
): EditorChange[] => {
    if (
        listBehavior !== "outdent to zero" &&
        listBehavior !== "sync with headings"
    ) {
        return [];
    }

    const parentIndentLevelByBehavior =
        listBehavior === "sync with headings"
            ? // follow parent
            Math.max(0, parentIndentLevel)
            : // Force the next line of parent to be 0
            -countIndentLevel(editor.getLine(parentLineNumber + 1), tabSize) +
            countIndentLevel(editor.getLine(parentLineNumber), tabSize);

    const indentChanges = createListIndentChanges(editor, {
        parentLineNumber,
        parentIndentLevel: parentIndentLevelByBehavior,
        tabSize,
    });

    return indentChanges;
};

// Operation Class
import type { Command, Editor } from "obsidian";
import { createRange } from "../utils/range";
import { composeLineChanges } from "../utils/editorChange";
import { t } from "../../../i18n/helpers";

export class ApplyHeading {
    settings: MyHeadingsSettings;
    headingSize: number;

    constructor(settings: MyHeadingsSettings, headingSize: number) {
        this.settings = settings;
        this.headingSize = headingSize;
    }

    editorCallback = (editor: Editor): boolean => {
        const lines = createRange(
            editor.getCursor("from").line,
            editor.getCursor("to").line - editor.getCursor("from").line + 1,
        );

        const isOneLine =
            editor.getCursor("from").line === editor.getCursor("to").line;

        const lastHeaderLineNumber = lines[lines.length - 1] ?? 0;

        const headingsChanges = composeLineChanges(editor, lines, (chunk) =>
            applyHeading(chunk, this.headingSize, this.settings),
        );

        const indentChanges = createListIndentChangesByListBehavior(editor, {
            parentIndentLevel: this.headingSize - 1,
            tabSize: this.settings.editor.tabSize,
            listBehavior: this.settings.list.childrenBehavior,
            parentLineNumber: lastHeaderLineNumber,
        });

        editor.transaction({
            changes: [...headingsChanges, ...indentChanges],
        });

        // If only one line is targeted, move the cursor to the end of the line.
        if (isOneLine) {
            editor.setCursor(editor.getCursor("anchor").line);
        }
        return true;
    };

    createCommand = (): Command => {
        return {
            id: `heading-shifter-apply-heading-${this.headingSize}`,
            name: `${t('Apply Heading')} ${this.headingSize}`,
            icon: `headingShifter_heading${this.headingSize}`,
            editorCallback: this.editorCallback,
        };
    };
}
