import { type App, type Editor, editorInfoField, Plugin } from "obsidian";
import type { EditorState } from "@codemirror/state";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type NoteAssistantPlugin from "../../main";
import { IncreaseHeading, DecreaseHeading } from "./features/shift";
import { ApplyHeading } from "./features/apply";
import {
    InsertHeadingAtCurrentLevel,
    InsertHeadingAtDeeperLevel,
    InsertHeadingAtHigherLevel,
} from "./features/insert";

export const HEADINGS = [0, 1, 2, 3, 4, 5, 6] as const;

export class ShifterManager {
    app: App;
    plugin: NoteAssistantPlugin;

    constructor(app: App, plugin: NoteAssistantPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    onload() {
        this.addCommands();
    }

    onunload() {
        // Commands are automatically unregistered when the plugin is unloaded
    }

    private addCommands() {
        const settings = this.plugin.settings.myHeadings;

        const increaseHeading = new IncreaseHeading(settings, false);
        const increaseHeadingForced = new IncreaseHeading(settings, true);
        const decreaseHeading = new DecreaseHeading(settings);
        const insertHeadingAtCurrentLabel = new InsertHeadingAtCurrentLevel(settings);
        const insertHeadingAtDeeperLevel = new InsertHeadingAtDeeperLevel(settings);
        const insertHeadingAtHigherLevel = new InsertHeadingAtHigherLevel(settings);

        HEADINGS.forEach((heading) => {
            const applyHeadingCmd = new ApplyHeading(settings, heading);
            this.plugin.addCommand({
                ...applyHeadingCmd.createCommand(),
                // Unified naming: Use the ID from the command itself (e.g., 'shifter-apply-heading-0')
                // Obsidian will prefix with 'obsidian-note-assistant:' automatically.
            });
        });

        this.plugin.addCommand(increaseHeading.createCommand());
        this.plugin.addCommand(increaseHeadingForced.createCommand());
        this.plugin.addCommand(decreaseHeading.createCommand());
        this.plugin.addCommand(insertHeadingAtCurrentLabel.createCommand());
        this.plugin.addCommand(insertHeadingAtDeeperLevel.createCommand());
        this.plugin.addCommand(insertHeadingAtHigherLevel.createCommand());

        // Register Keymap for Tab/Shift-Tab
        if (settings.overrideTab) {
            this.plugin.registerEditorExtension(
                Prec.high(
                    keymap.of([
                        {
                            key: "Tab",
                            run: this.createKeyMapRunCallback({
                                check: increaseHeading.check,
                                run: increaseHeading.editorCallback,
                            }),
                        },
                    ]),
                ),
            );

            this.plugin.registerEditorExtension(
                Prec.high(
                    keymap.of([
                        {
                            key: "s-Tab",
                            run: this.createKeyMapRunCallback({
                                check: decreaseHeading.check,
                                run: decreaseHeading.editorCallback,
                            }),
                        },
                    ]),
                ),
            );
        }
    }

    // Helper from ObsidianService
    private getEditorFromState(state: EditorState): Editor | null {
        try {
            // @ts-expect-error - editorInfoField is available at runtime
            return state.field(editorInfoField)?.editor ?? null;
        } catch (e) {
            console.error("Failed to get editor from state:", e);
            return null;
        }
    }

    private createKeyMapRunCallback(config: {
        check?: (editor: Editor) => boolean;
        run: (editor: Editor) => any; // StopPropagation logic maps to boolean
    }) {
        const check = config.check || (() => true);
        const { run } = config;

        return (view: EditorView): boolean => {
            const editor = this.getEditorFromState(view.state);

            if (!editor) {
                return false;
            }

            if (!check(editor)) {
                return false;
            }

            // run returns true (stop prop) or false (continue)
            return run(editor);
        };
    }
}
