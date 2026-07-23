import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { t } from '../i18n/helpers';
import { formatFrontMatterDiagnostics, formatSaveError } from '../i18n/diagnostics';
import {
    FileNumberingPolicy,
    FrontMatterDiagnostic,
    parseFormulasFrontMatter,
    saveSettingsToFrontMatter,
} from '../utils/frontmatter';
import { MyFormulasSettings } from '../settings';
import { FormulaNumberingConfig, snapshotFormulaNumberingConfig } from '../utils/reconcile-context';

type EditablePolicy = Exclude<FileNumberingPolicy, 'invalid'>;

export class FormulasControlModal extends Modal {
    private readonly plugin: NoteAssistantPlugin;
    private readonly file: TFile;
    private settings: MyFormulasSettings;
    private policy: EditablePolicy;
    private parseErrors: FrontMatterDiagnostic[];
    private unsupportedTokens: string[];
    private rawValue?: string;
    private originalSettings: string;
    private readonly originalNumberingConfig: FormulaNumberingConfig;

    constructor(app: App, plugin: NoteAssistantPlugin, file: TFile) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        const parsed = parseFormulasFrontMatter(app.metadataCache.getFileCache(file)?.frontmatter, plugin.settings.myFormulas);
        this.settings = parsed.settings;
        this.policy = parsed.policy === 'invalid' ? 'off' : parsed.policy;
        this.parseErrors = parsed.errors;
        this.unsupportedTokens = parsed.unsupportedTokens ?? [];
        this.rawValue = parsed.rawValue;
        this.originalSettings = this.settingsSignature();
        this.originalNumberingConfig = snapshotFormulaNumberingConfig(this.settings);
    }

    onOpen(): void {
        this.display();
    }

    private display(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('command.configureFormulas') });
        if (this.parseErrors.length > 0) {
            contentEl.createEl('p', { text: formatFrontMatterDiagnostics(this.parseErrors), cls: 'mod-warning' });
        }

        new Setting(contentEl)
            .setName(t('numbering.behavior'))
            .setDesc(t('numbering.behaviorDescription'))
            .addDropdown(dropdown => dropdown
                .addOption('manual', t('numbering.manual'))
                .addOption('auto', t('numbering.auto'))
                .addOption('none', t('numbering.none'))
                .addOption('off', t('numbering.off'))
                .setValue(this.policy)
                .onChange(value => {
                    this.policy = value as EditablePolicy;
                    this.settings.auto = this.policy === 'auto';
                    this.display();
                }));

        if (this.policy === 'manual' || this.policy === 'auto') this.renderNumberingSettings(contentEl);
        else contentEl.createEl('p', {
            text: this.policy === 'none'
                ? t('numbering.formulaNoneDescription')
                : t('numbering.formulaOffDescription'),
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        new Setting(buttonContainer)
            .addButton(button => button
                .setButtonText(t('numbering.applyNow'))
                .setTooltip(t('numbering.applyNowTooltip'))
                .onClick(async () => {
                    await this.applyCurrentPolicy();
                    this.close();
                }))
            .addButton(button => button
                .setButtonText(t('numbering.saveToFrontmatter'))
                .setTooltip(t('numbering.saveTooltip'))
                .setCta()
                .onClick(async () => {
                    if (await this.saveAndApply()) this.close();
                }))
            .addButton(button => button
                .setButtonText(t('numbering.remove'))
                .setWarning()
                .onClick(async () => {
                    const result = await this.plugin.formulasManager.applySettingsToFile(
                        this.file,
                        this.settings,
                        'clear',
                        { trigger: 'explicit-apply', acceptedFormulaConfigs: [this.originalNumberingConfig] },
                    );
                    if (result.skipped) new Notice(t('notice.targetInactive'));
                    else {
                        new Notice(t('notice.formulaRemoved'));
                        this.plugin.formulasManager.openAmbiguousCleanup(this.file, this.settings);
                    }
                    this.close();
                }));
    }

    private renderNumberingSettings(contentEl: HTMLElement): void {
        new Setting(contentEl)
            .setName(t('formulas.mode'))
            .setDesc(t('formulas.modeDescription'))
            .addDropdown(dropdown => dropdown
                .addOption('continuous', t('formulas.continuous'))
                .addOption('heading-based', t('formulas.headingBased'))
                .setValue(this.settings.mode)
                .onChange(value => {
                    this.settings.mode = value as 'continuous' | 'heading-based';
                    this.display();
                }));

        if (this.settings.mode === 'heading-based') {
            new Setting(contentEl)
                .setName(t('formulas.maxHeadingDepth'))
                .setDesc(t('formulas.maxHeadingDepthDescription'))
                .addSlider(slider => slider.setLimits(1, 6, 1).setValue(this.settings.maxDepth).setDynamicTooltip().onChange(value => {
                    this.settings.maxDepth = value;
                }));
        }
    }

    private async applyCurrentPolicy(): Promise<void> {
        if (this.policy === 'off') {
            new Notice(t('notice.formulaUnchanged'));
            return;
        }
        const intent = this.policy === 'none' ? 'clear' : 'number';
        const result = await this.plugin.formulasManager.applySettingsToFile(
            this.file,
            this.settings,
            intent,
            { trigger: 'explicit-apply', acceptedFormulaConfigs: [this.originalNumberingConfig] },
        );
        if (result.skipped) {
            new Notice(t('notice.targetInactive'));
            return;
        }
        if (intent === 'clear') this.plugin.formulasManager.openAmbiguousCleanup(this.file, this.settings);
        new Notice(t('notice.behaviorApplied'));
    }

    private async saveAndApply(): Promise<boolean> {
        try {
            await saveSettingsToFrontMatter(this.app, this.file, undefined, {
                settings: this.settings,
                policy: this.policy,
                unsupportedTokens: this.unsupportedTokens,
                rawValue: this.rawValue,
                preserveTail: this.settingsSignature() === this.originalSettings,
            });
        } catch (error) {
            new Notice(formatSaveError('notice.unableToSaveFormulas', error));
            return false;
        }
        await this.applyCurrentPolicy();
        new Notice(t('notice.settingsSaved'));
        return true;
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private settingsSignature(): string {
        return JSON.stringify({ ...this.settings, enabled: true, auto: false });
    }
}
