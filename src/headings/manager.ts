import { App, Editor, MarkdownView, debounce } from 'obsidian';
import NoteAssistantPlugin from '../main';
import {
    firstNumberingTokenInStyle,
    makeNumberingString,
    nextNumberingToken,
    NumberingToken
} from '../utils/numbering-tokens';
import {
    findHeadingPrefixRange,
    getCodeBlockRanges,
    isLineIgnored,
    makeHeadingHashString,
    replaceRangeEconomically,
    restoreCursor
} from '../utils/text-processing';
import { parseHeadingsFrontMatter } from '../utils/frontmatter';
import { HeadingsControlModal } from './modal';
import { t } from '../i18n/helpers';
import { ShifterManager } from './shifter/manager';

export const DEFAULT_HEADING_STYLES = ['1', 'a', 'A', '一', '①', '1'];
export const DEFAULT_HEADING_SEPARATORS = ['', '-', ':', '.', '—', '-'];
export const DEFAULT_HEADING_START_VALUES = ['0', '1', '1', '1', '1', '1'];

export class HeadingsManager {
    app: App;
    plugin: NoteAssistantPlugin;
    shifterManager: ShifterManager;
    private isLoaded = false;

    constructor(app: App, plugin: NoteAssistantPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.shifterManager = new ShifterManager(app, plugin);
    }

    async onload() {
        if (this.isLoaded) return;
        this.isLoaded = true;

        // Initialize Shifter Manager
        this.shifterManager.onload();

    }

    openControlModal() {
        if (!this.isLoaded) return;
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
            new HeadingsControlModal(this.app, this.plugin, activeView.file).open();
        }
    }

    onunload() {
        if (!this.isLoaded) return;
        this.isLoaded = false;
        this.shifterManager.onunload();
    }

    getActiveViewInfo() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
            const data = this.app.metadataCache.getFileCache(activeView.file);
            const editor = activeView.editor;
            if (data && editor) {
                return { activeView, data, editor };
            }
        }
        return undefined;
    }

    getEffectiveSettings(fm: any) {
        return parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings);
    }

    // Returns true if changes were made
    updateNumbering(force: boolean = false, performRestore: boolean = true): boolean {
        const info = this.getActiveViewInfo();
        if (!info) return false;

        const { data, editor } = info;
        const settings = this.getEffectiveSettings(data.frontmatter);

        if (!settings.enabled && !force) return false;

        const cursorBefore = editor.getCursor();
        const scrollBefore = editor.getScrollInfo();

        const headings = data.headings ?? [];
        if (headings.length === 0) return false;

        const codeRanges = getCodeBlockRanges(data);
        const headingStyles = settings.headingStyles || DEFAULT_HEADING_STYLES;
        const headingSeparators = settings.headingSeparators || DEFAULT_HEADING_SEPARATORS;
        const headingStartValues = settings.headingStartValues || DEFAULT_HEADING_START_VALUES;

        let previousLevel = settings.firstLevel - 1;
        let numberingStack: NumberingToken[] = [];
        const changes: any[] = [];

        for (const heading of headings) {
            const level = heading.level;
            const lineNum = heading.position.start.line;
            const lineText = editor.getLine(lineNum);

            if (isLineIgnored(lineNum, lineText, codeRanges)) continue;

            // 1. Skip levels before firstLevel
            if (settings.firstLevel > level) {
                previousLevel = settings.firstLevel - 1;
                numberingStack = [];
                continue;
            }

            // 2. Skip specific skipped headings
            if (settings.skipHeadings && settings.skipHeadings.length > 0) {
                if (heading.heading.endsWith(settings.skipHeadings)) continue;
            }

            // 3. Adjust Stack
            if (level === previousLevel) {
                const x = numberingStack.pop();
                if (x) numberingStack.push(nextNumberingToken(x));
            } else if (level < previousLevel) {
                for (let i = previousLevel; i > level; i--) numberingStack.pop();
                const x = numberingStack.pop();
                if (x) numberingStack.push(nextNumberingToken(x));
            } else if (level > previousLevel) {
                for (let i = previousLevel; i < level; i++) {
                    const styleIndex = Math.min(i, headingStyles.length - 1);
                    const startVal = headingStartValues[styleIndex] !== undefined ? headingStartValues[styleIndex] : '1';
                    numberingStack.push(firstNumberingTokenInStyle(headingStyles[styleIndex] as any, startVal));
                }
            }

            previousLevel = level;

            if (level > settings.maxLevel) continue;

            const prefixRange = findHeadingPrefixRange(editor, heading);
            if (!prefixRange) continue;

            const headingHashString = makeHeadingHashString(editor, heading);
            if (!headingHashString) continue;

            const prefixString = makeNumberingString(numberingStack, headingSeparators);
            const separator = headingSeparators[0] || '';

            replaceRangeEconomically(editor, changes, prefixRange, headingHashString + prefixString + separator + ' ');
        }

        if (changes.length > 0) {
            editor.transaction({ changes: changes });
            if (performRestore) {
                restoreCursor(editor, cursorBefore);
                editor.scrollTo(scrollBefore.left, scrollBefore.top);
            }
            return true;
        }
        return false;
    }

    removeNumbering() {
        const info = this.getActiveViewInfo();
        if (!info) return;
        const { data, editor } = info;

        const changes: any[] = [];
        const headings = data.headings ?? [];
        if (headings.length === 0) return;


        for (const heading of headings) {
            const prefixRange = findHeadingPrefixRange(editor, heading);
            if (!prefixRange) continue;
            const headingHashString = makeHeadingHashString(editor, heading);
            if (!headingHashString) continue;

            replaceRangeEconomically(editor, changes, prefixRange, headingHashString + ' ');
        }

        if (changes.length > 0) {
            editor.transaction({ changes });
        }
    }
}
