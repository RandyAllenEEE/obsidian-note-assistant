import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { t } from '../i18n/helpers';
import { parseFormulasFrontMatter, saveSettingsToFrontMatter } from '../utils/frontmatter';
import { MyFormulasSettings } from '../settings';

export class FormulasControlModal extends Modal {
    plugin: NoteAssistantPlugin;
    file: TFile;
    settings: MyFormulasSettings;

    constructor(app: App, plugin: NoteAssistantPlugin, file: TFile) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        const cache = app.metadataCache.getFileCache(file);
        const fm = cache ? cache.frontmatter : undefined;
        this.settings = JSON.parse(JSON.stringify(parseFormulasFrontMatter(fm, this.plugin.settings.myFormulas)));
    }

    onOpen() {
        this.display();
    }

    display() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('Configure Formulas') });

        // Auto Toggle
        new Setting(contentEl)
            .setName(t('Auto Number Formulas'))
            .setDesc(t('Automatically number formulas on blur'))
            .addToggle(toggle => toggle
                .setValue(this.settings.auto)
                .onChange(v => this.settings.auto = v));

        // Mode
        new Setting(contentEl)
            .setName(t('Numbering Mode'))
            .setDesc(t('Continuous (1, 2, 3) or Heading-based (1.1-1, 1.1-2)'))
            .addDropdown(dropdown => dropdown
                .addOption('continuous', t('Continuous'))
                .addOption('heading-based', t('Heading-based'))
                .setValue(this.settings.mode)
                .onChange(v => {
                    this.settings.mode = v as 'continuous' | 'heading-based';
                    this.display(); // Re-render for depth slider
                }));

        // Max Depth (Conditional)
        if (this.settings.mode === 'heading-based') {
            new Setting(contentEl)
                .setName(t('Max Heading Depth'))
                .setDesc(t('Maximum heading level to use for formula numbering'))
                .addSlider(slider => slider
                    .setLimits(1, 6, 1)
                    .setValue(this.settings.maxDepth)
                    .setDynamicTooltip()
                    .onChange(v => this.settings.maxDepth = v));
        }

        // Action Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText(t('Apply Now'))
                .setTooltip(t('Apply numbering once without saving to frontmatter'))
                .onClick(() => {
                    this.applyNumbering();
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText(t('Save to Frontmatter'))
                .setTooltip(t('Save settings to frontmatter and apply'))
                .setCta()
                .onClick(async () => {
                    await this.saveAndApply();
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText(t('Remove Numbering'))
                .setWarning()
                .onClick(() => {
                    this.plugin.formulasManager.removeNumbering();
                    new Notice(t('Formula numbering removed'));
                    this.close();
                }));
    }

    applyNumbering() {
        // Temporarily override effective settings
        const info = this.plugin.formulasManager.getActiveViewInfo();
        if (!info) return;

        // Save original settings
        const originalSettings = this.plugin.settings.myFormulas;

        // Temporarily replace with modal settings
        this.plugin.settings.myFormulas = this.settings;

        // Apply numbering (force=true to override enabled check)
        this.plugin.formulasManager.updateNumbering(true, true);

        // Restore original settings
        this.plugin.settings.myFormulas = originalSettings;

        new Notice(t('Formula numbering applied (one-time)'));
    }

    async saveAndApply() {
        await saveSettingsToFrontMatter(this.app, this.file, undefined, this.settings);

        // Force cache refresh
        await new Promise(resolve => setTimeout(resolve, 100));

        // Apply with frontmatter settings
        this.plugin.formulasManager.updateNumbering(true, true);

        new Notice(t('Settings saved to frontmatter and applied'));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
