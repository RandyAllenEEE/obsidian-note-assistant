import { App, MarkdownView, Modal, Notice, Setting, TFile } from 'obsidian';
import { applyEditorEdits } from './editor-reconcile';
import { AmbiguousCandidate } from './reconcile';
import { t } from '../i18n/helpers';

export class AmbiguousCleanupModal extends Modal {
    private readonly file: TFile;
    private readonly source: string;
    private readonly candidates: AmbiguousCandidate[];
    private readonly selected = new Set<number>();

    constructor(app: App, file: TFile, source: string, candidates: AmbiguousCandidate[]) {
        super(app);
        this.file = file;
        this.source = source;
        this.candidates = candidates;
    }

    onOpen(): void {
        this.contentEl.empty();
        this.contentEl.createEl('h2', { text: t('cleanup.title') });
        this.contentEl.createEl('p', {
            text: t('cleanup.description'),
        });
        const sourceLines = this.source.split(/\r?\n/);
        this.candidates.forEach((candidate, index) => {
            new Setting(this.contentEl)
                .setName(`${t('common.line')} ${candidate.line}`)
                .setDesc(`${candidate.token} — ${sourceLines[candidate.line - 1] ?? ''}`)
                .addToggle(toggle => toggle.setValue(false).onChange(value => {
                    if (value) this.selected.add(index);
                    else this.selected.delete(index);
                }));
        });
        new Setting(this.contentEl)
            .addButton(button => button.setButtonText(t('common.cancel')).onClick(() => this.close()))
            .addButton(button => button.setButtonText(t('numbering.removeSelected')).setWarning().onClick(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view?.file || view.file.path !== this.file.path || view.editor.getValue() !== this.source) {
                    new Notice(t('notice.targetChanged'));
                    this.close();
                    return;
                }
                const edits = [...this.selected].map(index => this.candidates[index].edit);
                if (edits.length > 0) applyEditorEdits(view.editor, this.source, edits);
                this.close();
            }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
