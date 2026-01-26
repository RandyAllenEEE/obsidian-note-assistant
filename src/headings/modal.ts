import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import NoteAssistantPlugin from '../main';
import { t } from '../i18n/helpers';
import { parseHeadingsFrontMatter, saveSettingsToFrontMatter } from '../utils/frontmatter';
import { MyHeadingsSettings } from '../settings';
import { DEFAULT_HEADING_STYLES, DEFAULT_HEADING_SEPARATORS, DEFAULT_HEADING_START_VALUES } from './manager';

export class HeadingsControlModal extends Modal {
    plugin: NoteAssistantPlugin;
    file: TFile;
    settings: MyHeadingsSettings;

    constructor(app: App, plugin: NoteAssistantPlugin, file: TFile) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        // Clone current effective settings
        const cache = app.metadataCache.getFileCache(file);
        const fm = cache ? cache.frontmatter : undefined;
        this.settings = JSON.parse(JSON.stringify(parseHeadingsFrontMatter(fm, this.plugin.settings.myHeadings)));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('Configure Headings') });

        // Auto Toggle
        new Setting(contentEl)
            .setName(t('Auto Number Headings'))
            .setDesc(t('Automatically number headings on blur'))
            .addToggle(toggle => toggle
                .setValue(this.settings.auto)
                .onChange(v => this.settings.auto = v));

        // First / Max Level
        new Setting(contentEl)
            .setName(t('First Level'))
            .setDesc(t('Starting heading level for numbering'))
            .addSlider(slider => slider
                .setLimits(1, 6, 1)
                .setValue(this.settings.firstLevel)
                .setDynamicTooltip()
                .onChange(v => this.settings.firstLevel = v));

        new Setting(contentEl)
            .setName(t('Max Level'))
            .setDesc(t('Maximum heading level for numbering'))
            .addSlider(slider => slider
                .setLimits(1, 6, 1)
                .setValue(this.settings.maxLevel)
                .setDynamicTooltip()
                .onChange(v => this.settings.maxLevel = v));

        // Heading Styles
        const stylesSetting = new Setting(contentEl)
            .setName(t('Heading Styles'))
            .setDesc(t('Numbering style for each level (1-6)'))
            .setClass('heading-styles-setting');

        const stylesContainer = createDiv({ cls: 'heading-styles-container' });
        stylesSetting.settingEl.appendChild(stylesContainer);

        const styleOptions = ['1', 'a', 'A', '一', '①'];
        for (let i = 0; i < 6; i++) {
            const wrapper = stylesContainer.createDiv({ cls: 'style-item' });
            wrapper.createEl('label', { text: `H${i + 1}: ` });
            const select = wrapper.createEl('select');
            styleOptions.forEach(option => {
                select.createEl('option', { text: option, value: option });
            });
            select.value = this.settings.headingStyles?.[i] || DEFAULT_HEADING_STYLES[i];
            select.onchange = () => {
                if (!this.settings.headingStyles) this.settings.headingStyles = [...DEFAULT_HEADING_STYLES];
                this.settings.headingStyles[i] = select.value;
            };
        }

        // Heading Separators
        const separatorsSetting = new Setting(contentEl)
            .setName(t('Heading Separators'))
            .setDesc(t('Separator after each level (empty for H1, then 2-6)'))
            .setClass('heading-separators-setting');

        const separatorsContainer = createDiv({ cls: 'heading-separators-container' });
        separatorsSetting.settingEl.appendChild(separatorsContainer);

        for (let i = 1; i < 6; i++) {
            const wrapper = separatorsContainer.createDiv({ cls: 'separator-item' });
            wrapper.createEl('label', { text: `H${i + 1}: ` });
            const input = wrapper.createEl('input', { type: 'text' });
            input.value = this.settings.headingSeparators?.[i] || DEFAULT_HEADING_SEPARATORS[i];
            input.maxLength = 1;
            input.style.width = '2em';
            input.oninput = () => {
                if (!this.settings.headingSeparators) this.settings.headingSeparators = [...DEFAULT_HEADING_SEPARATORS];
                this.settings.headingSeparators[i] = input.value || '';
            };
        }

        // Heading Start Values
        const startValuesSetting = new Setting(contentEl)
            .setName(t('Start Values'))
            .setDesc(t('Starting number for each level'))
            .setClass('heading-start-values-setting');

        const startValuesContainer = createDiv({ cls: 'heading-start-values-container' });
        startValuesSetting.settingEl.appendChild(startValuesContainer);

        for (let i = 0; i < 6; i++) {
            const wrapper = startValuesContainer.createDiv({ cls: 'start-value-item' });
            wrapper.createEl('label', { text: `H${i + 1}: ` });
            const input = wrapper.createEl('input', { type: 'text' });
            input.value = this.settings.headingStartValues?.[i] || DEFAULT_HEADING_START_VALUES[i];
            input.maxLength = 1;
            input.style.width = '2em';
            input.oninput = () => {
                if (!this.settings.headingStartValues) this.settings.headingStartValues = [...DEFAULT_HEADING_START_VALUES];
                this.settings.headingStartValues[i] = input.value || '1';
            };
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
                    this.plugin.headingsManager.removeNumbering();
                    new Notice(t('Heading numbering removed'));
                    this.close();
                }));
    }

    applyNumbering() {
        // Temporarily override effective settings by directly calling with custom settings
        const info = this.plugin.headingsManager.getActiveViewInfo();
        if (!info) return;

        const { data, editor } = info;

        // Save original settings
        const originalSettings = this.plugin.settings.myHeadings;

        // Temporarily replace with modal settings
        this.plugin.settings.myHeadings = this.settings;

        // Apply numbering
        this.plugin.headingsManager.updateNumbering(true, true);

        // Restore original settings
        this.plugin.settings.myHeadings = originalSettings;

        new Notice(t('Numbering applied (one-time)'));
    }

    async saveAndApply() {
        await saveSettingsToFrontMatter(this.app, this.file, this.settings);

        // Force cache refresh
        await new Promise(resolve => setTimeout(resolve, 100));

        // Apply with frontmatter settings
        this.plugin.headingsManager.updateNumbering(true, true);

        new Notice(t('Settings saved to frontmatter and applied'));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
