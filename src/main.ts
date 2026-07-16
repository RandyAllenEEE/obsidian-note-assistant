import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import {
    ManagedNumberRecord,
    normalizeSettings,
    NoteAssistantSettings,
    NumberingModule,
} from './settings';
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
    private saveQueue: Promise<void> = Promise.resolve();

    async onload() {
        console.log('Loading Note Assistant...');
        console.log('Loading Settings...');
        await this.loadSettings();

        // Initialize Managers
        this.headingsManager = new HeadingsManager(this.app, this);
        this.formulasManager = new FormulasManager(this.app, this);

        // Initialize Auto Controller
        this.autoNumberingController = new AutoNumberingController(this.app, this, this.headingsManager, this.formulasManager);

        // Managers and listeners are registered once. Runtime gates enforce module switches.
        await this.headingsManager.onload();
        await this.formulasManager.onload();
        this.autoNumberingController.onload();

        this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
            await this.moveOwnership(oldPath, file.path);
        }));
        this.registerEvent(this.app.vault.on('delete', async file => {
            await this.removeOwnership(file.path);
        }));

        // --- Centralized Command Registration ---

        // Headings
        this.addCommand({
            id: 'configure-headings',
            name: t('command.configureHeadings'),
            callback: () => {
                if (this.settings.myHeadings.enabled) this.headingsManager.openControlModal();
            },
        });

        // Formulas
        this.addCommand({
            id: 'configure-formulas',
            name: t('command.configureFormulas'),
            callback: () => {
                if (this.settings.myFormulas.enabled) this.formulasManager.openControlModal();
            },
        });

        this.addSettingTab(new NoteAssistantSettingsTab(this.app, this));
    }

    onunload() {
        console.log('Unloading Note Assistant...');
        this.headingsManager?.onunload();
        this.formulasManager?.onunload();
        this.autoNumberingController?.onunload();
    }

    async loadSettings() {
        this.settings = normalizeSettings(await this.loadData());
        try {
            await this.saveSettings();
        } catch (error) {
            console.error('Note Assistant could not persist normalized settings', error);
        }
    }

    async saveSettings() {
        this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.saveData(this.settings));
        await this.saveQueue;
    }

    getOwnershipRecords(module: NumberingModule, filePath: string): ManagedNumberRecord[] {
        return [...(this.settings.ownership[module][filePath] ?? [])];
    }

    async setOwnershipRecords(module: NumberingModule, filePath: string, records: ManagedNumberRecord[]): Promise<void> {
        const current = this.settings.ownership[module][filePath] ?? [];
        if (JSON.stringify(current) === JSON.stringify(records)) return;
        if (records.length === 0) delete this.settings.ownership[module][filePath];
        else this.settings.ownership[module][filePath] = records;
        await this.saveSettings();
    }

    private async moveOwnership(oldPath: string, newPath: string): Promise<void> {
        let changed = false;
        for (const module of ['headings', 'formulas'] as NumberingModule[]) {
            for (const path of Object.keys(this.settings.ownership[module])) {
                if (path !== oldPath && !path.startsWith(`${oldPath}/`)) continue;
                const destination = `${newPath}${path.slice(oldPath.length)}`;
                this.settings.ownership[module][destination] = this.settings.ownership[module][path];
                delete this.settings.ownership[module][path];
                changed = true;
            }
        }
        if (changed) await this.saveSettings();
    }

    private async removeOwnership(path: string): Promise<void> {
        let changed = false;
        for (const module of ['headings', 'formulas'] as NumberingModule[]) {
            for (const ownedPath of Object.keys(this.settings.ownership[module])) {
                if (ownedPath !== path && !ownedPath.startsWith(`${path}/`)) continue;
                delete this.settings.ownership[module][ownedPath];
                changed = true;
            }
        }
        if (changed) await this.saveSettings();
    }
}

class NoteAssistantSettingsTab extends PluginSettingTab {
    plugin: NoteAssistantPlugin;

    constructor(app: App, plugin: NoteAssistantPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: t('settings.title') });

        // Global Settings Section
        containerEl.createEl('h3', { text: t('settings.global') });

        new Setting(containerEl)
            .setName(t('settings.refreshInterval'))
            .setDesc(t('settings.refreshIntervalDescription'))
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
        containerEl.createEl('h3', { text: t('settings.modules') });


        // MyHeadings Section
        this.addPluginSection(
            containerEl,
            t('module.headings'),
            this.plugin.settings.myHeadings.enabled,
            async (value) => {
                this.plugin.settings.myHeadings.enabled = value;
                await this.plugin.saveSettings();

                this.plugin.autoNumberingController.settingsChanged();
                this.display();
            },
            (el) => {
                renderHeadingsSettings(el, this.plugin.headingsManager);
            }
        );

        // MyFormulas Section
        this.addPluginSection(
            containerEl,
            t('module.formulas'),
            this.plugin.settings.myFormulas.enabled,
            async (value) => {
                this.plugin.settings.myFormulas.enabled = value;
                await this.plugin.saveSettings();

                this.plugin.autoNumberingController.settingsChanged();
                this.display();
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
            content.createEl('i', { text: t('settings.moduleDisabled') });
        }
    }
}
