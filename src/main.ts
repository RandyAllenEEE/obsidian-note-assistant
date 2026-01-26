import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { NoteAssistantSettings, DEFAULT_SETTINGS } from './settings';
import { t } from './i18n/helpers';

import { HeadingsManager } from './headings/manager';
import { renderHeadingsSettings } from './headings/settings-ui';
import { FormulasManager } from './formulas/manager';
import { renderFormulasSettings } from './formulas/settings-ui';
import { AutoNumberingController } from './auto-numbering';

export default class NoteAssistantPlugin extends Plugin {
    settings: NoteAssistantSettings;
    headingsManager: HeadingsManager;
    formulasManager: FormulasManager;
    autoNumberingController: AutoNumberingController;

    async onload() {
        console.log(t('Loading Note Assistant...'));
        console.log(t('Loading Settings...'));
        await this.loadSettings();

        // Initialize Managers
        this.headingsManager = new HeadingsManager(this.app, this);
        this.formulasManager = new FormulasManager(this.app, this);

        // Initialize Auto Controller
        this.autoNumberingController = new AutoNumberingController(this.app, this, this.headingsManager, this.formulasManager);

        // Load modules if enabled
        if (this.settings.myHeadings.enabled) await this.headingsManager.onload();
        if (this.settings.myFormulas.enabled) await this.formulasManager.onload();

        // Load Auto Controller if either relevant module is enabled
        if (this.settings.myHeadings.enabled || this.settings.myFormulas.enabled) {
            this.autoNumberingController.onload();
        }

        // --- Centralized Command Registration ---

        // Headings
        this.addCommand({
            id: 'configure-headings',
            name: t('Configure Headings'),
            callback: () => {
                if (this.settings.myHeadings.enabled) this.headingsManager.openControlModal();
            },
        });

        // Formulas
        this.addCommand({
            id: 'configure-formulas',
            name: t('Configure Formulas'),
            callback: () => {
                if (this.settings.myFormulas.enabled) this.formulasManager.openControlModal();
            },
        });

        this.addSettingTab(new NoteAssistantSettingsTab(this.app, this));
    }

    onunload() {
        console.log(t('Unloading Note Assistant...'));
        this.headingsManager?.onunload();
        this.formulasManager?.onunload();
        this.autoNumberingController?.onunload();
    }

    async loadSettings() {
        const loadedData = await this.loadData();

        // 1. Initial Assign for top-level keys
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

        // 2. Deep Merge for all modules
        // Headings (includes Shifter)
        if (loadedData?.myHeadings) {
            this.settings.myHeadings = Object.assign({}, DEFAULT_SETTINGS.myHeadings, loadedData.myHeadings);
            // Even deeper if needed (e.g. styleToRemove)
            if (loadedData.myHeadings.styleToRemove) {
                this.settings.myHeadings.styleToRemove = {
                    beginning: Object.assign({}, DEFAULT_SETTINGS.myHeadings.styleToRemove.beginning, loadedData.myHeadings.styleToRemove.beginning),
                    surrounding: Object.assign({}, DEFAULT_SETTINGS.myHeadings.styleToRemove.surrounding, loadedData.myHeadings.styleToRemove.surrounding),
                };
            }
        }

        // Formulas
        if (loadedData?.myFormulas) {
            this.settings.myFormulas = Object.assign({}, DEFAULT_SETTINGS.myFormulas, loadedData.myFormulas);
        }

        // Save cleaned settings to disk immediately
        await this.saveSettings();
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class NoteAssistantSettingsTab extends PluginSettingTab {
    plugin: NoteAssistantPlugin;

    constructor(app: App, plugin: NoteAssistantPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private refreshAutoNumberingController() {
        const anyActive = this.plugin.settings.myHeadings.enabled || this.plugin.settings.myFormulas.enabled;

        // Always unload to clear potential old listeners/state
        this.plugin.autoNumberingController.onunload();

        if (anyActive) {
            this.plugin.autoNumberingController.onload();
        }
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: t('Note Assistant Settings') });

        // Global Settings Section
        containerEl.createEl('h3', { text: t('Global Settings') });

        new Setting(containerEl)
            .setName(t('Auto-Numbering Refresh Interval'))
            .setDesc(t('Time in milliseconds to wait before auto-numbering triggers (after losing focus)'))
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(String(this.plugin.settings.refreshInterval))
                .onChange(async (value) => {
                    const interval = parseInt(value);
                    if (!isNaN(interval) && interval > 0) {
                        this.plugin.settings.refreshInterval = interval;
                        await this.plugin.saveSettings();
                    }
                }));

        containerEl.createEl('br');
        containerEl.createEl('h3', { text: t('Modules') });


        // MyHeadings Section
        this.addPluginSection(
            containerEl,
            t('My Headings'),
            this.plugin.settings.myHeadings.enabled,
            async (value) => {
                this.plugin.settings.myHeadings.enabled = value;
                await this.plugin.saveSettings();

                // Reload logic for Headings + Auto Controller
                if (value) {
                    await this.plugin.headingsManager.onload();
                } else {
                    this.plugin.headingsManager.onunload();
                }

                this.refreshAutoNumberingController();
            },
            (el) => {
                renderHeadingsSettings(el, this.plugin.headingsManager);
            }
        );

        // MyFormulas Section
        this.addPluginSection(
            containerEl,
            t('My Formulas'),
            this.plugin.settings.myFormulas.enabled,
            async (value) => {
                this.plugin.settings.myFormulas.enabled = value;
                await this.plugin.saveSettings();

                if (value) {
                    await this.plugin.formulasManager.onload();
                } else {
                    this.plugin.formulasManager.onunload();
                }

                this.refreshAutoNumberingController();
            },
            (el) => {
                renderFormulasSettings(el, this.plugin.formulasManager);
            }
        );
    }

    addPluginSection(
        containerEl: HTMLElement,
        title: string,
        isEnabled: boolean,
        onToggle: (val: boolean) => void,
        renderBody: (el: HTMLElement) => void
    ) {
        const details = containerEl.createEl('details');
        details.open = false;
        details.style.marginBottom = '1em';
        details.style.border = '1px solid var(--background-modifier-border)';
        details.style.borderRadius = '5px';

        const summary = details.createEl('summary');
        summary.style.display = 'flex';
        summary.style.alignItems = 'center';
        summary.style.justifyContent = 'space-between';
        summary.style.padding = '0.5em 1em';
        summary.style.cursor = 'pointer';
        summary.style.backgroundColor = 'var(--background-secondary)';
        summary.style.borderTopLeftRadius = '5px';
        summary.style.borderTopRightRadius = '5px';

        const titleContainer = summary.createEl('div', { cls: 'settings-section-title' });
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = '10px';
        titleContainer.createEl('strong', { text: title });

        // Toggle Switch Container
        const toggleContainer = summary.createEl('div');
        toggleContainer.onclick = (e) => e.preventDefault();

        const toggleSetting = new Setting(toggleContainer)
            .addToggle(toggle => toggle
                .setValue(isEnabled)
                .onChange(onToggle));
        // Remove default setting padding/border to fit in header
        toggleSetting.settingEl.style.border = 'none';
        toggleSetting.settingEl.style.padding = '0';
        toggleSetting.infoEl.remove(); // Remove empty info

        const content = details.createEl('div');
        content.style.padding = '1em';
        content.style.borderTop = '1px solid var(--background-modifier-border)';

        if (isEnabled) {
            renderBody(content);
        } else {
            content.createEl('i', { text: t('Module is disabled.') });
        }
    }
}
