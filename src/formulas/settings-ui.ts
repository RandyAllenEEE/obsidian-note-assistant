
import { Setting } from 'obsidian';
import { FormulasManager } from './manager';
import { t } from '../i18n/helpers';

export function renderFormulasSettings(containerEl: HTMLElement, manager: FormulasManager) {
    const settings = manager.plugin.settings.myFormulas;

    new Setting(containerEl)
        .setName(t('Auto Number Formulas'))
        .setDesc(t('Automatically number formulas (triggers on blur if enabled)'))
        .addToggle(toggle => toggle
            .setValue(settings.auto)
            .onChange(async (value) => {
                settings.auto = value;
                await manager.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName(t('Numbering Mode'))
        .setDesc(t('Continuous (1, 2, 3) or Heading-based (1.1-1, 1.1-2)'))
        .addDropdown(dropdown => dropdown
            .addOption('continuous', t('Continuous'))
            .addOption('heading-based', t('Heading-based'))
            .setValue(settings.mode)
            .onChange(async (value: 'continuous' | 'heading-based') => {
                settings.mode = value;
                await manager.plugin.saveSettings();
            }));

    const depthSetting = new Setting(containerEl)
        .setName(t('Max Heading Depth'))
        .setDesc(t('For Heading-based mode: max depth of heading to use as prefix (e.g. 4 means use H4 at most)'))
        .addSlider(slider => slider
            .setLimits(1, 6, 1)
            .setValue(settings.maxDepth)
            .setDynamicTooltip()
            .onChange(async (value) => {
                settings.maxDepth = value;
                await manager.plugin.saveSettings();
            }));

    // Visibility logic
    const updateVisibility = () => {
        if (settings.mode === 'heading-based') {
            depthSetting.settingEl.style.display = '';
        } else {
            depthSetting.settingEl.style.display = 'none';
        }
    };

    // Initial state
    updateVisibility();
}
