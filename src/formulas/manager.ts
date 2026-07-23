import { App, MarkdownView, TFile } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { MyFormulasSettings } from '../settings';
import { AmbiguousCleanupModal } from '../utils/cleanup-modal';
import { applyEditorEdits } from '../utils/editor-reconcile';
import {
    ParsedFormulasFrontMatter,
    ParsedHeadingsFrontMatter,
    parseFormulasFrontMatter,
    parseHeadingsFrontMatter,
    ReconcileIntent,
    resolveReconcileIntent,
} from '../utils/frontmatter';
import { FormulasControlModal } from './modal';
import { FormulaReconcilePlan, planFormulaReconcile } from './reconcile';
import { ReconcileContext } from '../utils/reconcile-context';

export interface FormulaExecutionPlan extends FormulaReconcilePlan {
    filePath: string;
    source: string;
}

export interface FormulaRunResult {
    changed: boolean;
    ambiguousLines: number[];
    skipped: boolean;
}

export class FormulasManager {
    app: App;
    plugin: NoteAssistantPlugin;
    private isLoaded = false;

    constructor(app: App, plugin: NoteAssistantPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    async onload(): Promise<void> {
        if (this.isLoaded) return;
        this.isLoaded = true;
    }

    onunload(): void {
        this.isLoaded = false;
    }

    openControlModal(): void {
        if (!this.isLoaded || !this.plugin.settings.myFormulas.enabled) return;
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.file) new FormulasControlModal(this.app, this.plugin, activeView.file).open();
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

    getEffectiveSettings(fm: Parameters<typeof parseFormulasFrontMatter>[0]): ParsedFormulasFrontMatter {
        return parseFormulasFrontMatter(fm, this.plugin.settings.myFormulas);
    }

    buildPlan(
        file: TFile,
        source: string,
        parsed: ParsedFormulasFrontMatter,
        headings: ParsedHeadingsFrontMatter,
        intent: ReconcileIntent,
        context?: ReconcileContext,
    ): FormulaExecutionPlan | undefined {
        if (!this.plugin.settings.myFormulas.enabled || parsed.policy === 'off' || parsed.policy === 'invalid') return undefined;
        if (parsed.settings.mode === 'heading-based' && headings.policy === 'invalid') return undefined;
        const records = this.plugin.getOwnershipRecords('formulas', file.path);
        return {
            ...planFormulaReconcile(source, parsed.settings, headings.settings, intent, records, context),
            filePath: file.path,
            source,
        };
    }

    async commitPlan(plan: FormulaExecutionPlan): Promise<void> {
        await this.plugin.setOwnershipRecords('formulas', plan.filePath, plan.records);
    }

    async reconcileView(
        view: MarkdownView,
        parsed?: ParsedFormulasFrontMatter,
        headings?: ParsedHeadingsFrontMatter,
        explicitIntent?: ReconcileIntent,
        context?: ReconcileContext,
    ): Promise<FormulaRunResult> {
        if (!this.plugin.settings.myFormulas.enabled || !view.file) {
            return { changed: false, ambiguousLines: [], skipped: true };
        }
        const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
        const resolved = parsed ?? this.getEffectiveSettings(fm);
        const headingSettings = headings ?? parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings);
        const intent = resolveReconcileIntent(this.plugin.settings.myFormulas.enabled, resolved.policy, explicitIntent);
        if (!intent) {
            return { changed: false, ambiguousLines: [], skipped: true };
        }

        const source = view.editor.getValue();
        const plan = this.buildPlan(view.file, source, resolved, headingSettings, intent, context);
        if (!plan) return { changed: false, ambiguousLines: [], skipped: true };
        if (view.file.path !== plan.filePath || view.editor.getValue() !== source) {
            return { changed: false, ambiguousLines: plan.ambiguousLines, skipped: true };
        }
        const changed = applyEditorEdits(view.editor, source, plan.edits);
        if (plan.edits.length === 0 || changed) await this.commitPlan(plan);
        return { changed, ambiguousLines: plan.ambiguousLines, skipped: false };
    }

    async applySettingsToFile(
        file: TFile,
        settings: MyFormulasSettings,
        intent: ReconcileIntent,
        context?: ReconcileContext,
    ): Promise<FormulaRunResult> {
        if (!this.plugin.settings.myFormulas.enabled) return { changed: false, ambiguousLines: [], skipped: true };
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.file.path !== file.path) return { changed: false, ambiguousLines: [], skipped: true };
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const parsed: ParsedFormulasFrontMatter = {
            policy: intent === 'clear' ? 'none' : 'manual',
            settings,
            errors: [],
            inherited: false,
        };
        return this.reconcileView(
            view,
            parsed,
            parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings),
            intent,
            context,
        );
    }

    openAmbiguousCleanup(file: TFile, settings: MyFormulasSettings): boolean {
        if (!this.plugin.settings.myFormulas.enabled) return false;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.file.path !== file.path) return false;
        const source = view.editor.getValue();
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const parsed: ParsedFormulasFrontMatter = {
            policy: 'none',
            settings,
            errors: [],
            inherited: false,
        };
        const headings = parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings);
        const plan = this.buildPlan(file, source, parsed, headings, 'clear');
        if (!plan || plan.ambiguousCandidates.length === 0) return false;
        new AmbiguousCleanupModal(this.app, file, source, plan.ambiguousCandidates).open();
        return true;
    }
}
