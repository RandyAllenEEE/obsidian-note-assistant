import { App, MarkdownView, TFile } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { MyHeadingsSettings } from '../settings';
import { AmbiguousCleanupModal } from '../utils/cleanup-modal';
import { applyEditorEdits } from '../utils/editor-reconcile';
import {
    ParsedHeadingsFrontMatter,
    parseHeadingsFrontMatter,
    ReconcileIntent,
    resolveReconcileIntent,
} from '../utils/frontmatter';
import { HeadingsControlModal } from './modal';
import { HeadingReconcilePlan, planHeadingReconcile } from './reconcile';
import { ShifterManager } from './shifter/manager';

export const DEFAULT_HEADING_STYLES = ['1', 'a', 'A', '一', '①', '1'];
export const DEFAULT_HEADING_SEPARATORS = ['', '-', ':', '.', '—', '-'];
export const DEFAULT_HEADING_START_VALUES = ['0', '1', '1', '1', '1', '1'];

export interface HeadingExecutionPlan extends HeadingReconcilePlan {
    filePath: string;
    source: string;
}

export interface NumberingRunResult {
    changed: boolean;
    ambiguousLines: number[];
    skipped: boolean;
}

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

    async onload(): Promise<void> {
        if (this.isLoaded) return;
        this.isLoaded = true;
        this.shifterManager.onload();
    }

    onunload(): void {
        if (!this.isLoaded) return;
        this.isLoaded = false;
        this.shifterManager.onunload();
    }

    openControlModal(): void {
        if (!this.isLoaded || !this.plugin.settings.myHeadings.enabled) return;
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.file) new HeadingsControlModal(this.app, this.plugin, activeView.file).open();
    }

    getActiveViewInfo() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView?.file || !activeView.editor) return undefined;
        return {
            activeView,
            file: activeView.file,
            editor: activeView.editor,
            data: this.app.metadataCache.getFileCache(activeView.file),
        };
    }

    getEffectiveSettings(fm: Parameters<typeof parseHeadingsFrontMatter>[0]): ParsedHeadingsFrontMatter {
        return parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings);
    }

    buildPlan(
        file: TFile,
        source: string,
        parsed: ParsedHeadingsFrontMatter,
        intent: ReconcileIntent,
    ): HeadingExecutionPlan | undefined {
        if (!this.plugin.settings.myHeadings.enabled || parsed.policy === 'off' || parsed.policy === 'invalid') return undefined;
        const records = this.plugin.getOwnershipRecords('headings', file.path);
        return {
            ...planHeadingReconcile(source, parsed.settings, intent, records),
            filePath: file.path,
            source,
        };
    }

    async commitPlan(plan: HeadingExecutionPlan): Promise<void> {
        await this.plugin.setOwnershipRecords('headings', plan.filePath, plan.records);
    }

    async reconcileView(
        view: MarkdownView,
        parsed?: ParsedHeadingsFrontMatter,
        explicitIntent?: ReconcileIntent,
    ): Promise<NumberingRunResult> {
        if (!this.plugin.settings.myHeadings.enabled || !view.file) {
            return { changed: false, ambiguousLines: [], skipped: true };
        }
        const resolved = parsed ?? this.getEffectiveSettings(this.app.metadataCache.getFileCache(view.file)?.frontmatter);
        const intent = resolveReconcileIntent(this.plugin.settings.myHeadings.enabled, resolved.policy, explicitIntent);
        if (!intent) {
            return { changed: false, ambiguousLines: [], skipped: true };
        }

        const source = view.editor.getValue();
        const plan = this.buildPlan(view.file, source, resolved, intent);
        if (!plan) return { changed: false, ambiguousLines: [], skipped: true };
        if (view.file.path !== plan.filePath || view.editor.getValue() !== source) {
            return { changed: false, ambiguousLines: plan.ambiguousLines, skipped: true };
        }
        const changed = applyEditorEdits(view.editor, source, plan.edits);
        if (plan.edits.length === 0 || changed) await this.commitPlan(plan);
        return { changed, ambiguousLines: plan.ambiguousLines, skipped: false };
    }

    async applySettingsToFile(file: TFile, settings: MyHeadingsSettings, intent: ReconcileIntent): Promise<NumberingRunResult> {
        if (!this.plugin.settings.myHeadings.enabled) return { changed: false, ambiguousLines: [], skipped: true };
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.file.path !== file.path) return { changed: false, ambiguousLines: [], skipped: true };
        const parsed: ParsedHeadingsFrontMatter = {
            policy: intent === 'clear' ? 'none' : 'manual',
            settings,
            errors: [],
            inherited: false,
        };
        return this.reconcileView(view, parsed, intent);
    }

    openAmbiguousCleanup(file: TFile, settings: MyHeadingsSettings): boolean {
        if (!this.plugin.settings.myHeadings.enabled) return false;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.file.path !== file.path) return false;
        const source = view.editor.getValue();
        const parsed: ParsedHeadingsFrontMatter = {
            policy: 'none',
            settings,
            errors: [],
            inherited: false,
        };
        const plan = this.buildPlan(file, source, parsed, 'clear');
        if (!plan || plan.ambiguousCandidates.length === 0) return false;
        new AmbiguousCleanupModal(this.app, file, source, plan.ambiguousCandidates).open();
        return true;
    }
}
