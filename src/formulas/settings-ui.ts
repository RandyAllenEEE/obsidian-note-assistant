
import { Setting } from 'obsidian';
import { FormulasManager } from './manager';
import { t } from '../i18n/helpers';
import { snapshotFormulaNumberingConfig } from '../utils/reconcile-context';

export function renderFormulasSettings(containerEl: HTMLElement, manager: FormulasManager) {
    const settings = manager.plugin.settings.myFormulas;

    new Setting(containerEl)
        .setName(t('formulas.autoNumber'))
        .setDesc(t('formulas.autoNumberDescription'))
        .addToggle(toggle => toggle
            .setValue(settings.auto)
            .onChange(async (value) => {
                const previous = snapshotFormulaNumberingConfig(settings);
                settings.auto = value;
                await manager.plugin.saveSettings();
                manager.plugin.autoNumberingController.formulaConfigurationChanged(previous);
            }));

    new Setting(containerEl)
        .setName(t('formulas.mode'))
        .setDesc(t('formulas.modeDescription'))
        .addDropdown(dropdown => dropdown
            .addOption('continuous', t('formulas.continuous'))
            .addOption('heading-based', t('formulas.headingBased'))
            .setValue(settings.mode)
            .onChange(async (value: 'continuous' | 'heading-based') => {
                const previous = snapshotFormulaNumberingConfig(settings);
                settings.mode = value;
                await manager.plugin.saveSettings();
                manager.plugin.autoNumberingController.formulaConfigurationChanged(previous);
                updateVisibility();
            }));

    const depthSetting = new Setting(containerEl)
        .setName(t('formulas.maxHeadingDepth'))
        .setDesc(t('formulas.maxHeadingDepthSettingsDescription'))
        .addSlider(slider => slider
            .setLimits(1, 6, 1)
            .setValue(settings.maxDepth)
            .setDynamicTooltip()
            .onChange(async (value) => {
                const previous = snapshotFormulaNumberingConfig(settings);
                settings.maxDepth = value;
                await manager.plugin.saveSettings();
                manager.plugin.autoNumberingController.formulaConfigurationChanged(previous);
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
