import { App, EventRef, MarkdownView, Notice, TFile } from 'obsidian';
import type NoteAssistantPlugin from './main';
import type { HeadingsManager } from './headings/manager';
import type { FormulasManager } from './formulas/manager';
import { formatFrontMatterDiagnostics } from './i18n/diagnostics';
import { t } from './i18n/helpers';
import { applyEditorEdits } from './utils/editor-reconcile';
import {
    FrontMatterDiagnostic,
    parseFormulasFrontMatter,
    parseHeadingsFrontMatter,
    resolveReconcileIntent,
} from './utils/frontmatter';
import { normalizeEdits } from './utils/reconcile';

type ScheduledRunKind = 'blur' | 'clear-only';

interface ScheduledRun {
    timer: number;
    view: MarkdownView;
    path: string;
    kind: ScheduledRunKind;
}

export class AutoNumberingController {
    app: App;
    plugin: NoteAssistantPlugin;
    headingsManager: HeadingsManager;
    formulasManager: FormulasManager;
    private isLoaded = false;
    private isApplying = false;
    private dirtyFiles = new Set<string>();
    private scheduled = new Map<string, ScheduledRun>();
    private workspaceRefs: EventRef[] = [];
    private metadataRefs: EventRef[] = [];
    private reportedInvalid = new Set<string>();
    private reportedAmbiguous = new Set<string>();
    private blurHandler: () => void;
    private focusHandler: () => void;

    constructor(app: App, plugin: NoteAssistantPlugin, headingsManager: HeadingsManager, formulasManager: FormulasManager) {
        this.app = app;
        this.plugin = plugin;
        this.headingsManager = headingsManager;
        this.formulasManager = formulasManager;
        this.blurHandler = () => this.handleBlur();
        this.focusHandler = () => this.clearScheduledRuns();
    }

    onload(): void {
        if (this.isLoaded) return;
        this.isLoaded = true;
        window.addEventListener('blur', this.blurHandler);
        window.addEventListener('focus', this.focusHandler);

        this.workspaceRefs.push(this.app.workspace.on('editor-change', (editor, info) => {
            if (this.isApplying) return;
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const view = info instanceof MarkdownView
                ? info
                : activeView?.editor === editor ? activeView : undefined;
            if (!view?.file) return;
            this.dirtyFiles.add(view.file.path);
            const policies = this.getPolicies(view.file);
            if (policies.headings === 'none' || policies.formulas === 'none') this.schedule(view, 'clear-only');
        }));

        this.workspaceRefs.push(this.app.workspace.on('file-open', file => {
            if (!file) return;
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view?.file || view.file.path !== file.path) return;
            const policies = this.getPolicies(file);
            if (policies.headings === 'none' || policies.formulas === 'none') this.schedule(view, 'clear-only', 50);
        }));

        this.metadataRefs.push(this.app.metadataCache.on('changed', file => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view?.file || view.file.path !== file.path) return;
            const policies = this.getPolicies(file);
            if (policies.headings === 'none' || policies.formulas === 'none') this.schedule(view, 'clear-only', 50);
        }));

        this.app.workspace.onLayoutReady(() => {
            if (!this.isLoaded) return;
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view?.file) return;
            const policies = this.getPolicies(view.file);
            if (policies.headings === 'none' || policies.formulas === 'none') this.schedule(view, 'clear-only', 50);
        });
    }

    onunload(): void {
        if (!this.isLoaded) return;
        this.clearScheduledRuns();
        window.removeEventListener('blur', this.blurHandler);
        window.removeEventListener('focus', this.focusHandler);
        for (const ref of this.workspaceRefs) this.app.workspace.offref(ref);
        for (const ref of this.metadataRefs) this.app.metadataCache.offref(ref);
        this.workspaceRefs = [];
        this.metadataRefs = [];
        this.dirtyFiles.clear();
        this.reportedInvalid.clear();
        this.reportedAmbiguous.clear();
        this.isLoaded = false;
    }

    settingsChanged(): void {
        this.clearScheduledRuns();
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return;
        const policies = this.getPolicies(view.file);
        if (policies.headings === 'none' || policies.formulas === 'none') this.schedule(view, 'clear-only', 50);
    }

    private getPolicies(file: TFile): { headings?: string; formulas?: string } {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const headings = parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings);
        const formulas = parseFormulasFrontMatter(fm, this.plugin.settings.myFormulas);
        this.reportInvalid(file, 'headings', headings.policy, headings.rawValue, headings.errors);
        this.reportInvalid(file, 'formulas', formulas.policy, formulas.rawValue, formulas.errors);
        return {
            headings: this.plugin.settings.myHeadings.enabled
                ? headings.policy
                : undefined,
            formulas: this.plugin.settings.myFormulas.enabled
                ? formulas.policy
                : undefined,
        };
    }

    private reportInvalid(
        file: TFile,
        module: 'headings' | 'formulas',
        policy: string,
        rawValue: string | undefined,
        errors: FrontMatterDiagnostic[],
    ): void {
        const enabled = module === 'headings' ? this.plugin.settings.myHeadings.enabled : this.plugin.settings.myFormulas.enabled;
        if (!enabled || policy !== 'invalid') return;
        const key = `${file.path}\u0000${module}\u0000${rawValue ?? ''}`;
        if (this.reportedInvalid.has(key)) return;
        this.reportedInvalid.add(key);
        const moduleName = t(module === 'headings' ? 'module.heading' : 'module.formula');
        new Notice(t('notice.invalidFrontmatter', {
            module: moduleName,
            errors: formatFrontMatterDiagnostics(errors),
        }));
    }

    private handleBlur(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || !this.dirtyFiles.has(view.file.path)) return;
        const policies = this.getPolicies(view.file);
        if (policies.headings === 'auto' || policies.headings === 'none' || policies.formulas === 'auto' || policies.formulas === 'none') {
            this.schedule(view, 'blur');
        }
    }

    private schedule(
        view: MarkdownView,
        kind: ScheduledRunKind,
        delay = this.plugin.settings.refreshInterval,
    ): void {
        if (!view.file) return;
        const path = view.file.path;
        const key = `${path}\u0000${kind}`;
        const existing = this.scheduled.get(key);
        if (existing) window.clearTimeout(existing.timer);
        const timer = window.setTimeout(() => {
            this.scheduled.delete(key);
            void this.performReconcile(view, path, kind);
        }, Math.max(0, delay));
        this.scheduled.set(key, { timer, view, path, kind });
    }

    private clearScheduledRuns(): void {
        for (const run of this.scheduled.values()) window.clearTimeout(run.timer);
        this.scheduled.clear();
    }

    private async performReconcile(
        view: MarkdownView,
        expectedPath: string,
        kind: ScheduledRunKind,
    ): Promise<void> {
        if (!view.file || view.file.path !== expectedPath || this.isApplying) return;
        if (!this.plugin.settings.myHeadings.enabled && !this.plugin.settings.myFormulas.enabled) return;

        const file = view.file;
        const source = view.editor.getValue();
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const headings = parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings);
        const formulas = parseFormulasFrontMatter(fm, this.plugin.settings.myFormulas);
        const resolvedHeadingIntent = resolveReconcileIntent(this.plugin.settings.myHeadings.enabled, headings.policy);
        const resolvedFormulaIntent = resolveReconcileIntent(this.plugin.settings.myFormulas.enabled, formulas.policy);
        const headingIntent = kind === 'clear-only' && resolvedHeadingIntent !== 'clear'
            ? undefined
            : resolvedHeadingIntent;
        const formulaIntent = kind === 'clear-only' && resolvedFormulaIntent !== 'clear'
            ? undefined
            : resolvedFormulaIntent;
        const hasDeferredNumbering = kind === 'clear-only'
            && (resolvedHeadingIntent === 'number' || resolvedFormulaIntent === 'number');
        if (!headingIntent && !formulaIntent) {
            if (!hasDeferredNumbering) this.dirtyFiles.delete(expectedPath);
            return;
        }

        const headingPlan = headingIntent ? this.headingsManager.buildPlan(file, source, headings, headingIntent) : undefined;
        const formulaPlan = formulaIntent ? this.formulasManager.buildPlan(file, source, formulas, headings, formulaIntent) : undefined;
        let edits;
        try {
            edits = normalizeEdits(source, [...(headingPlan?.edits ?? []), ...(formulaPlan?.edits ?? [])]);
        } catch (error) {
            console.error('Note Assistant rejected overlapping numbering edits', error);
            return;
        }
        if (!view.file || view.file.path !== expectedPath || view.editor.getValue() !== source) return;

        this.isApplying = true;
        try {
            const changed = applyEditorEdits(view.editor, source, edits);
            if (edits.length > 0 && !changed) return;
            await Promise.all([
                headingPlan ? this.headingsManager.commitPlan(headingPlan) : Promise.resolve(),
                formulaPlan ? this.formulasManager.commitPlan(formulaPlan) : Promise.resolve(),
            ]);
            this.reportAmbiguous(expectedPath, 'headings', headingPlan?.ambiguousLines ?? []);
            this.reportAmbiguous(expectedPath, 'formulas', formulaPlan?.ambiguousLines ?? []);
            if (kind === 'blur' || !hasDeferredNumbering) this.dirtyFiles.delete(expectedPath);
        } catch (error) {
            console.error('Note Assistant automatic reconcile failed', error);
        } finally {
            this.isApplying = false;
        }
    }

    private reportAmbiguous(path: string, module: 'headings' | 'formulas', lines: number[]): void {
        if (lines.length === 0) return;
        const key = `${path}\u0000${module}\u0000${lines.join(',')}`;
        if (this.reportedAmbiguous.has(key)) return;
        this.reportedAmbiguous.add(key);
        const moduleName = t(module === 'headings' ? 'module.heading' : 'module.formula');
        new Notice(t(
            lines.length === 1 ? 'notice.ambiguousPreservedOne' : 'notice.ambiguousPreservedMany',
            { count: lines.length, module: moduleName },
        ));
    }
}
