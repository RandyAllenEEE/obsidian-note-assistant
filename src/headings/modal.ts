import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { t } from '../i18n/helpers';
import { formatFrontMatterDiagnostics, formatSaveError } from '../i18n/diagnostics';
import {
    FileNumberingPolicy,
    FrontMatterDiagnostic,
    parseHeadingsFrontMatter,
    saveSettingsToFrontMatter,
} from '../utils/frontmatter';
import { MyHeadingsSettings } from '../settings';
import { DEFAULT_HEADING_SEPARATORS, DEFAULT_HEADING_START_VALUES, DEFAULT_HEADING_STYLES } from './manager';

type EditablePolicy = Exclude<FileNumberingPolicy, 'invalid'>;

export class HeadingsControlModal extends Modal {
    private readonly plugin: NoteAssistantPlugin;
    private readonly file: TFile;
    private settings: MyHeadingsSettings;
    private policy: EditablePolicy;
    private parseErrors: FrontMatterDiagnostic[];
    private unsupportedTokens: string[];
    private rawValue?: string;
    private originalSettings: string;

    constructor(app: App, plugin: NoteAssistantPlugin, file: TFile) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        const parsed = parseHeadingsFrontMatter(app.metadataCache.getFileCache(file)?.frontmatter, plugin.settings.myHeadings);
        this.settings = parsed.settings;
        this.policy = parsed.policy === 'invalid' ? 'off' : parsed.policy;
        this.parseErrors = parsed.errors;
        this.unsupportedTokens = parsed.unsupportedTokens ?? [];
        this.rawValue = parsed.rawValue;
        this.originalSettings = this.settingsSignature();
    }

    onOpen(): void {
        this.display();
    }

    private display(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('command.configureHeadings') });
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
                ? t('numbering.headingNoneDescription')
                : t('numbering.headingOffDescription'),
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
                    const result = await this.plugin.headingsManager.applySettingsToFile(this.file, this.settings, 'clear');
                    if (result.skipped) new Notice(t('notice.targetInactive'));
                    else {
                        new Notice(t('notice.headingRemoved'));
                        this.plugin.headingsManager.openAmbiguousCleanup(this.file, this.settings);
                    }
                    this.close();
                }));
    }

    private renderNumberingSettings(contentEl: HTMLElement): void {
        new Setting(contentEl)
            .setName(t('headings.firstLevel'))
            .setDesc(t('headings.firstLevelDescription'))
            .addSlider(slider => slider.setLimits(1, 6, 1).setValue(this.settings.firstLevel).setDynamicTooltip().onChange(value => {
                this.settings.firstLevel = value;
                if (this.settings.maxLevel < value) this.settings.maxLevel = value;
            }));

        new Setting(contentEl)
            .setName(t('headings.maxLevel'))
            .setDesc(t('headings.maxLevelDescription'))
            .addSlider(slider => slider.setLimits(1, 6, 1).setValue(this.settings.maxLevel).setDynamicTooltip().onChange(value => {
                this.settings.maxLevel = value;
                if (this.settings.firstLevel > value) this.settings.firstLevel = value;
            }));

        const stylesSetting = new Setting(contentEl)
            .setName(t('headings.styles'))
            .setDesc(`${t('headings.stylesDescription')} ${t('headings.stylesCaseNote')}`);
        const stylesContainer = createDiv({ cls: 'heading-styles-container' });
        stylesSetting.settingEl.appendChild(stylesContainer);
        const styleOptions = ['1', 'a', 'A', 'I', '一', '①'];
        for (let i = 0; i < 6; i++) {
            const wrapper = stylesContainer.createDiv({ cls: 'style-item' });
            wrapper.createEl('label', { text: `H${i + 1}: ` });
            const select = wrapper.createEl('select');
            styleOptions.forEach(option => select.createEl('option', { text: option, value: option }));
            const currentStyle = styleOptions.includes(this.settings.headingStyles[i]) ? this.settings.headingStyles[i] : DEFAULT_HEADING_STYLES[i];
            this.settings.headingStyles[i] = currentStyle;
            select.value = currentStyle;
            select.onchange = () => this.settings.headingStyles[i] = select.value;
        }

        const separatorsSetting = new Setting(contentEl)
            .setName(t('headings.separators'))
            .setDesc(t('headings.compactSeparatorsDescription'));
        const separatorsContainer = createDiv({ cls: 'heading-separators-container' });
        separatorsSetting.settingEl.appendChild(separatorsContainer);
        for (let i = 1; i < 6; i++) {
            const wrapper = separatorsContainer.createDiv({ cls: 'separator-item' });
            wrapper.createEl('label', { text: `H${i + 1}: ` });
            const select = wrapper.createEl('select');
            const separatorOptions = ['.', '-', ':', '—'];
            separatorOptions.forEach(option => select.createEl('option', { text: option, value: option }));
            const currentSeparator = separatorOptions.includes(this.settings.headingSeparators[i])
                ? this.settings.headingSeparators[i]
                : DEFAULT_HEADING_SEPARATORS[i];
            this.settings.headingSeparators[i] = currentSeparator;
            select.value = currentSeparator;
            select.onchange = () => this.settings.headingSeparators[i] = select.value;
        }

        const startsSetting = new Setting(contentEl)
            .setName(t('headings.startValues'))
            .setDesc(t('headings.startValuesDescription'));
        const startsContainer = createDiv({ cls: 'start-values-container' });
        startsSetting.settingEl.appendChild(startsContainer);
        for (let i = 0; i < 6; i++) {
            const wrapper = startsContainer.createDiv({ cls: 'start-value-item' });
            wrapper.createEl('label', { text: `H${i + 1}: ` });
            const input = wrapper.createEl('input', { type: 'text' });
            const currentStart = /^\d$/.test(this.settings.headingStartValues[i])
                ? this.settings.headingStartValues[i]
                : DEFAULT_HEADING_START_VALUES[i];
            this.settings.headingStartValues[i] = currentStart;
            input.value = currentStart;
            input.maxLength = 1;
            input.inputMode = 'numeric';
            input.oninput = () => {
                if (/^\d$/.test(input.value)) this.settings.headingStartValues[i] = input.value;
            };
        }
    }

    private async applyCurrentPolicy(): Promise<void> {
        if (this.policy === 'off') {
            new Notice(t('notice.headingUnchanged'));
            return;
        }
        const intent = this.policy === 'none' ? 'clear' : 'number';
        const result = await this.plugin.headingsManager.applySettingsToFile(this.file, this.settings, intent);
        if (result.skipped) {
            new Notice(t('notice.targetInactive'));
            return;
        }
        if (intent === 'clear') this.plugin.headingsManager.openAmbiguousCleanup(this.file, this.settings);
        new Notice(t('notice.behaviorApplied'));
    }

    private async saveAndApply(): Promise<boolean> {
        try {
            await saveSettingsToFrontMatter(this.app, this.file, {
                settings: this.settings,
                policy: this.policy,
                unsupportedTokens: this.unsupportedTokens,
                rawValue: this.rawValue,
                preserveTail: this.settingsSignature() === this.originalSettings,
            });
        } catch (error) {
            new Notice(formatSaveError('notice.unableToSaveHeadings', error));
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
