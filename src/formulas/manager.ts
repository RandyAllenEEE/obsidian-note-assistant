import { App, MarkdownView, Editor, Debouncer, debounce } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { getCodeBlockRanges, isLineIgnored, restoreCursor } from '../utils/text-processing';
import { parseFormulasFrontMatter } from '../utils/frontmatter';
import { FormulasControlModal } from './modal';
import { t } from '../i18n/helpers';

// Pre-compile Regex patterns for performance (Issue #10)
const TAG_REGEX = /\\tag\{([^}]*)\}/;
const TAG_REMOVE_REGEX = /\s*\\tag\{[^}]*\}/;
const HEADING_NUMBER_REGEX = /^\s{0,4}#+\s*([0-9a-zA-Z\u4e00-\u9fa5\u2460-\u2473&⓪].*?)(\s|$)/;

export class FormulasManager {
    app: App;
    plugin: NoteAssistantPlugin;
    private isLoaded = false;

    constructor(app: App, plugin: NoteAssistantPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    async onload() {
        if (this.isLoaded) return;
        this.isLoaded = true;

        // Command is now registered in main.ts
    }

    openControlModal() {
        if (!this.isLoaded) return;
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
            new FormulasControlModal(this.app, this.plugin, activeView.file).open();
        }
    }

    onunload() {
        if (!this.isLoaded) return;
        this.isLoaded = false;
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
        return parseFormulasFrontMatter(fm, this.plugin.settings.myFormulas);
    }

    updateNumbering(force: boolean = false, performRestore: boolean = true): boolean {
        const info = this.getActiveViewInfo();
        if (!info) return false;

        const { data, editor } = info;
        const settings = this.getEffectiveSettings(data.frontmatter);

        if (!settings.enabled && !force) return false;

        const cursorBefore = editor.getCursor();
        const scrollBefore = editor.getScrollInfo();

        const lineCount = editor.lineCount();
        const codeRanges = getCodeBlockRanges(data);
        const changes: any[] = [];

        let equationCounter = 1;
        const headingFormulaCounters: Record<string, number> = {};

        // 1. Scan for $$ positions
        const dollarPositions: { line: number, ch: number }[] = [];
        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (isLineIgnored(i, line, codeRanges)) continue;

            let pos = -1;
            while ((pos = line.indexOf('$$', pos + 1)) !== -1) {
                dollarPositions.push({ line: i, ch: pos });
            }
        }

        if (dollarPositions.length === 0) return false;

        // 2. Process Pairs
        for (let i = 0; i < dollarPositions.length - 1; i += 2) {
            const start = dollarPositions[i];
            const end = dollarPositions[i + 1];

            // Validate Range (simple check)
            if (start.line > end.line || (start.line === end.line && start.ch >= end.ch)) continue;

            let formulaContent = '';
            if (start.line === end.line) {
                const line = editor.getLine(start.line);
                formulaContent = line.substring(start.ch, end.ch + 2);
            } else {
                const startLine = editor.getLine(start.line);
                formulaContent += startLine.substring(start.ch) + '\n';
                for (let lineNum = start.line + 1; lineNum < end.line; lineNum++) {
                    formulaContent += editor.getLine(lineNum) + '\n';
                }
                const endLine = editor.getLine(end.line);
                formulaContent += endLine.substring(0, end.ch + 2);
            }

            const tagRegex = TAG_REGEX;
            const hasTag = formulaContent.match(tagRegex);

            let equationNumber = '';

            if (settings.mode === 'heading-based') {
                // Decoupled Logic: Read existing numbering from text
                let currentHeadingNumber = '';
                const headings = data.headings || [];
                const maxDepth = settings.maxDepth || 4;

                let searchIndex = -1;
                // Find nearest preceding heading physically
                for (let j = headings.length - 1; j >= 0; j--) {
                    if (headings[j].position.start.line <= start.line) {
                        searchIndex = j;
                        break;
                    }
                }

                // If found, ensure it or its parent satisfies depth limit
                let targetHeading = null;
                if (searchIndex !== -1) {
                    for (let k = searchIndex; k >= 0; k--) {
                        if (headings[k].level <= maxDepth) {
                            targetHeading = headings[k];
                            break;
                        }
                    }
                }

                if (targetHeading) {
                    const headingLine = editor.getLine(targetHeading.position.start.line);
                    // Decoupled Regex: Extract whatever number is there (1.1, A, 1-1, etc.)
                    const numberExtractRegex = HEADING_NUMBER_REGEX;
                    const match = headingLine.match(numberExtractRegex);

                    if (match && match[1]) {
                        currentHeadingNumber = match[1].trim();
                        // Strip trailing separators
                        if (['.', ':', '—', '-'].some(c => currentHeadingNumber.endsWith(c))) {
                            currentHeadingNumber = currentHeadingNumber.slice(0, -1);
                        }
                    }
                }

                if (currentHeadingNumber) {
                    if (!headingFormulaCounters[currentHeadingNumber]) headingFormulaCounters[currentHeadingNumber] = 1;
                    equationNumber = `${currentHeadingNumber}-${headingFormulaCounters[currentHeadingNumber]}`;
                    headingFormulaCounters[currentHeadingNumber]++;
                } else {
                    // Fallback to simple counter if no heading found or parsed
                    equationNumber = `${equationCounter}`;
                    equationCounter++;
                }

            } else {
                // Continuous
                equationNumber = `${equationCounter}`;
                equationCounter++;
            }

            // Update Text
            if (!hasTag) {
                // Insert \tag at end before $$
                const endLine = editor.getLine(end.line);
                const beforeDollars = endLine.substring(0, end.ch);
                const afterDollars = endLine.substring(end.ch);
                const newLine = beforeDollars + ` \\tag{${equationNumber}}` + afterDollars;

                changes.push({
                    from: { line: end.line, ch: 0 },
                    to: { line: end.line, ch: endLine.length },
                    text: newLine
                });
            } else {
                // Replace Existing
                const updatedContent = formulaContent.replace(tagRegex, `\\tag{${equationNumber}}`);
                if (updatedContent !== formulaContent) {
                    if (start.line === end.line) {
                        const line = editor.getLine(start.line);
                        changes.push({
                            from: { line: start.line, ch: 0 },
                            to: { line: start.line, ch: line.length },
                            text: line.substring(0, start.ch) + updatedContent + line.substring(end.ch + 2)
                        });
                    } else {
                        changes.push({
                            from: { line: start.line, ch: start.ch },
                            to: { line: end.line, ch: end.ch + 2 },
                            text: updatedContent
                        });
                    }
                }
            }
        }

        if (changes.length > 0) {
            editor.transaction({ changes });
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
        const { editor } = info;

        const changes: any[] = [];

        const lineCount = editor.lineCount();
        const tagRegex = TAG_REMOVE_REGEX;

        const dollarPositions: { line: number, ch: number }[] = [];
        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);
            let pos = -1;
            while ((pos = line.indexOf('$$', pos + 1)) !== -1) {
                dollarPositions.push({ line: i, ch: pos });
            }
        }

        if (dollarPositions.length === 0) return;

        for (let i = 0; i < dollarPositions.length - 1; i += 2) {
            const start = dollarPositions[i];
            const end = dollarPositions[i + 1];

            if (start.line === end.line) {
                const line = editor.getLine(start.line);
                const content = line.substring(start.ch + 2, end.ch);
                if (tagRegex.test(content)) {
                    const newContent = content.replace(tagRegex, '');
                    changes.push({
                        from: { line: start.line, ch: start.ch + 2 },
                        to: { line: end.line, ch: end.ch },
                        text: newContent
                    });
                }
            } else {
                for (let j = start.line; j <= end.line; j++) {
                    const line = editor.getLine(j);
                    let s = 0, e = line.length;
                    if (j === start.line) s = start.ch + 2;
                    if (j === end.line) e = end.ch;

                    const c = line.substring(s, e);
                    if (tagRegex.test(c)) {
                        const n = c.replace(tagRegex, '');
                        changes.push({
                            from: { line: j, ch: s },
                            to: { line: j, ch: e },
                            text: n
                        });
                    }
                }
            }
        }

        if (changes.length > 0) {
            editor.transaction({ changes });
        }
    }
}
