
import { Setting } from 'obsidian';
import { HeadingsManager } from './manager';
import { t } from '../i18n/helpers';
import { snapshotHeadingNumberingConfig } from '../utils/reconcile-context';

export function renderHeadingsSettings(containerEl: HTMLElement, manager: HeadingsManager) {
    const settings = manager.plugin.settings.myHeadings;

    // === Auto Numbering Section ===
    const autoNumberingDetails = containerEl.createEl('details');
    autoNumberingDetails.open = false;
    autoNumberingDetails.style.marginBottom = '10px';
    autoNumberingDetails.style.border = '1px solid var(--background-modifier-border)';
    autoNumberingDetails.style.borderRadius = '5px';
    autoNumberingDetails.style.padding = '0.5em';

    const autoNumberingSummary = autoNumberingDetails.createEl('summary');
    autoNumberingSummary.setText(t('headings.autoNumbering'));
    autoNumberingSummary.style.fontWeight = 'bold';
    autoNumberingSummary.style.cursor = 'pointer';
    autoNumberingSummary.style.outline = 'none';

    const autoNumberingContent = autoNumberingDetails.createEl('div');
    autoNumberingContent.style.marginTop = '10px';
    autoNumberingContent.style.paddingLeft = '5px';
    autoNumberingContent.style.borderLeft = '2px solid var(--background-modifier-border)';

    new Setting(autoNumberingContent)
        .setName(t('headings.autoNumber'))
        .setDesc(t('headings.autoNumberDescription'))
        .addToggle(toggle => toggle
            .setValue(settings.auto)
            .onChange(async (value) => {
                const previous = snapshotHeadingNumberingConfig(settings);
                settings.auto = value;
                await manager.plugin.saveSettings();
                manager.plugin.autoNumberingController.headingConfigurationChanged(previous);
            }));

    new Setting(autoNumberingContent)
        .setName(t('headings.firstLevel'))
        .addSlider(slider => slider
            .setLimits(1, 6, 1)
            .setValue(settings.firstLevel)
            .setDynamicTooltip()
            .onChange(async (value) => {
                const previous = snapshotHeadingNumberingConfig(settings);
                settings.firstLevel = value;
                if (settings.maxLevel < value) settings.maxLevel = value;
                await manager.plugin.saveSettings();
                manager.plugin.autoNumberingController.headingConfigurationChanged(previous);
            }));

    new Setting(autoNumberingContent)
        .setName(t('headings.maxLevel'))
        .addSlider(slider => slider
            .setLimits(1, 6, 1)
            .setValue(settings.maxLevel)
            .setDynamicTooltip()
            .onChange(async (value) => {
                const previous = snapshotHeadingNumberingConfig(settings);
                settings.maxLevel = value;
                if (settings.firstLevel > value) settings.firstLevel = value;
                await manager.plugin.saveSettings();
                manager.plugin.autoNumberingController.headingConfigurationChanged(previous);
            }));

    // Style Grid
    autoNumberingContent.createEl('h3', { text: t('headings.styles') });
    autoNumberingContent.createEl('p', { text: t('headings.stylesCaseNote') });
    const stylesContainer = autoNumberingContent.createEl('div');
    stylesContainer.style.display = 'grid';
    stylesContainer.style.gridTemplateColumns = '0.5fr 1fr 1fr 1fr';
    stylesContainer.style.gap = '10px';
    stylesContainer.style.marginBottom = '20px';

    // Headers
    stylesContainer.createEl('div', { text: t('common.level'), attr: { style: 'font-weight: bold;' } });
    stylesContainer.createEl('div', { text: t('common.style'), attr: { style: 'font-weight: bold;' } });
    stylesContainer.createEl('div', { text: t('common.separator'), attr: { style: 'font-weight: bold;' } });
    stylesContainer.createEl('div', { text: t('common.startAt'), attr: { style: 'font-weight: bold;' } });

    const styleOptions = { '1': '1, 2, 3', 'a': 'a, b, c', 'A': 'A, B, C', 'I': 'I, II, III', '一': '一, 二, 三', '①': '①, ②, ③' };
    const separatorOptions = { '': t('common.none'), '.': '.', '-': '-', ':': ':', '—': '—' };

    for (let i = 0; i < 6; i++) {
        stylesContainer.createEl('div', { text: `H${i + 1}`, attr: { style: 'align-self: center;' } });

        // Style Dropdown
        const styleSelect = stylesContainer.createEl('select');
        Object.entries(styleOptions).forEach(([key, label]) => {
            styleSelect.createEl('option', { value: key, text: label });
        });
        styleSelect.value = settings.headingStyles[i];
        styleSelect.onchange = async () => {
            const previous = snapshotHeadingNumberingConfig(settings);
            settings.headingStyles[i] = styleSelect.value;
            await manager.plugin.saveSettings();
            manager.plugin.autoNumberingController.headingConfigurationChanged(previous);
        };

        // Separator Dropdown
        const sepSelect = stylesContainer.createEl('select');
        Object.entries(separatorOptions).forEach(([key, label]) => {
            sepSelect.createEl('option', { value: key, text: label });
        });
        sepSelect.value = settings.headingSeparators[i];
        sepSelect.onchange = async () => {
            const previous = snapshotHeadingNumberingConfig(settings);
            settings.headingSeparators[i] = sepSelect.value;
            await manager.plugin.saveSettings();
            manager.plugin.autoNumberingController.headingConfigurationChanged(previous);
        };

        // Start Value Input
        const startInput = stylesContainer.createEl('input', { type: 'text' });
        startInput.style.width = '100%';
        startInput.value = settings.headingStartValues[i];
        startInput.onchange = async () => {
            const previous = snapshotHeadingNumberingConfig(settings);
            settings.headingStartValues[i] = startInput.value;
            await manager.plugin.saveSettings();
            manager.plugin.autoNumberingController.headingConfigurationChanged(previous);
        };
    }

    containerEl.createEl('br');

    // === Heading Shifter Section ===
    const shifterDetails = containerEl.createEl('details');
    shifterDetails.open = false;
    shifterDetails.style.marginBottom = '10px';
    shifterDetails.style.border = '1px solid var(--background-modifier-border)';
    shifterDetails.style.borderRadius = '5px';
    shifterDetails.style.padding = '0.5em';

    const shifterSummary = shifterDetails.createEl('summary');
    shifterSummary.setText(t('shifter.title'));
    shifterSummary.style.fontWeight = 'bold';
    shifterSummary.style.cursor = 'pointer';
    shifterSummary.style.outline = 'none';

    const shifterContent = shifterDetails.createEl('div');
    shifterContent.style.marginTop = '10px';
    shifterContent.style.paddingLeft = '5px';
    shifterContent.style.borderLeft = '2px solid var(--background-modifier-border)';

    new Setting(shifterContent)
        .setName(t('shifter.lowerLimit'))
        .setDesc(t('shifter.lowerLimitDescription'))
        .addDropdown((dropdown) => {
            const headingOptions: Record<string, string> = {};
            [0, 1, 2, 3, 4, 5, 6].forEach(h => headingOptions[String(h)] = String(h));
            dropdown
                .addOptions(headingOptions)
                .setValue(String(settings.limitHeadingFrom))
                .onChange(async (value) => {
                    settings.limitHeadingFrom = Number(value);
                    await manager.plugin.saveSettings();
                });
        });

    new Setting(shifterContent)
        .setName(t('shifter.overrideTab'))
        .setDesc(t('shifter.overrideTabDescription'))
        .addToggle((toggle) =>
            toggle
                .setValue(settings.overrideTab)
                .onChange(async (value) => {
                    settings.overrideTab = value;
                    await manager.plugin.saveSettings();
                }),
        );

    // Style to remove
    shifterContent.createEl('h3', { text: t('shifter.styleToRemove') });
    shifterContent.createEl('p', { text: t('shifter.styleToRemoveDescription') });

    shifterContent.createEl('b', { text: t('shifter.beginning') });
    new Setting(shifterContent)
        .setName(t('shifter.unorderedList'))
        .setDesc(t('shifter.unorderedListExample'))
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.beginning?.ul)
                .onChange(async (value) => {
                    settings.styleToRemove.beginning.ul = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t('shifter.orderedList'))
        .setDesc(t('shifter.orderedListExample'))
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.beginning?.ol)
                .onChange(async (value) => {
                    settings.styleToRemove.beginning.ol = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t('shifter.userDefined'))
        .setDesc(t('shifter.regexDescription'))
        .addTextArea((str) => {
            str
                .setValue(settings.styleToRemove.beginning?.userDefined?.join("\n"))
                .onChange(async (str) => {
                    settings.styleToRemove.beginning.userDefined = str.split("\n");
                    await manager.plugin.saveSettings();
                });
        });

    shifterContent.createEl('b', { text: t('shifter.surrounding') });
    new Setting(shifterContent)
        .setName(t('shifter.bold'))
        .setDesc(t('shifter.boldExample'))
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.surrounding?.bold)
                .onChange(async (value) => {
                    settings.styleToRemove.surrounding.bold = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t('shifter.italic'))
        .setDesc(t('shifter.italicExample'))
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.surrounding?.italic)
                .onChange(async (value) => {
                    settings.styleToRemove.surrounding.italic = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t('shifter.userDefined'))
        .setDesc(t('shifter.regexDescription'))
        .addTextArea((str) => {
            str
                .setValue(settings.styleToRemove?.surrounding?.userDefined?.join("\n"))
                .onChange(async (str) => {
                    settings.styleToRemove.surrounding.userDefined = str.split("\n");
                    await manager.plugin.saveSettings();
                });
        });

    shifterContent.createEl('h3', { text: t('shifter.list') });
    new Setting(shifterContent)
        .setName(t('shifter.childrenBehavior'))
        .addDropdown((dropdown) => {
            dropdown
                .addOption("outdent to zero", t('shifter.outdentToZero'))
                .addOption("sync with headings", t('shifter.syncWithHeadings'))
                .addOption("noting", t('shifter.nothing'))
                .setValue(settings.list.childrenBehavior)
                .onChange((v: any) => {
                    settings.list.childrenBehavior = v;
                    manager.plugin.saveSettings();
                });
        });

}
