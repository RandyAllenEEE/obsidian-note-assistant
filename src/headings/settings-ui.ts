
import { Setting } from 'obsidian';
import { HeadingsManager } from './manager';
import { t } from '../i18n/helpers';

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
    autoNumberingSummary.setText(t('Auto Numbering'));
    autoNumberingSummary.style.fontWeight = 'bold';
    autoNumberingSummary.style.cursor = 'pointer';
    autoNumberingSummary.style.outline = 'none';

    const autoNumberingContent = autoNumberingDetails.createEl('div');
    autoNumberingContent.style.marginTop = '10px';
    autoNumberingContent.style.paddingLeft = '5px';
    autoNumberingContent.style.borderLeft = '2px solid var(--background-modifier-border)';

    new Setting(autoNumberingContent)
        .setName(t('Auto Number Headings'))
        .setDesc(t('Create numbers automatically on blur'))
        .addToggle(toggle => toggle
            .setValue(settings.auto)
            .onChange(async (value) => {
                settings.auto = value;
                await manager.plugin.saveSettings();
            }));

    new Setting(autoNumberingContent)
        .setName(t('First Level'))
        .addSlider(slider => slider
            .setLimits(1, 6, 1)
            .setValue(settings.firstLevel)
            .setDynamicTooltip()
            .onChange(async (value) => {
                settings.firstLevel = value;
                await manager.plugin.saveSettings();
            }));

    new Setting(autoNumberingContent)
        .setName(t('Max Level'))
        .addSlider(slider => slider
            .setLimits(1, 6, 1)
            .setValue(settings.maxLevel)
            .setDynamicTooltip()
            .onChange(async (value) => {
                settings.maxLevel = value;
                await manager.plugin.saveSettings();
            }));

    // Style Grid
    autoNumberingContent.createEl('h3', { text: t('Heading Styles') });
    const stylesContainer = autoNumberingContent.createEl('div');
    stylesContainer.style.display = 'grid';
    stylesContainer.style.gridTemplateColumns = '0.5fr 1fr 1fr 1fr';
    stylesContainer.style.gap = '10px';
    stylesContainer.style.marginBottom = '20px';

    // Headers
    stylesContainer.createEl('div', { text: t('Level'), attr: { style: 'font-weight: bold;' } });
    stylesContainer.createEl('div', { text: t('Style'), attr: { style: 'font-weight: bold;' } });
    stylesContainer.createEl('div', { text: t('Separator'), attr: { style: 'font-weight: bold;' } });
    stylesContainer.createEl('div', { text: t('Start At'), attr: { style: 'font-weight: bold;' } });

    const styleOptions = { '1': '1, 2, 3', 'a': 'a, b, c', 'A': 'A, B, C', 'I': 'I, II, III', '一': '一, 二, 三', '①': '①, ②, ③' };
    const separatorOptions = { '': 'None', '.': '.', '-': '-', ':': ':', '—': '—' };

    for (let i = 0; i < 6; i++) {
        stylesContainer.createEl('div', { text: `H${i + 1}`, attr: { style: 'align-self: center;' } });

        // Style Dropdown
        const styleSelect = stylesContainer.createEl('select');
        Object.entries(styleOptions).forEach(([key, label]) => {
            styleSelect.createEl('option', { value: key, text: label });
        });
        styleSelect.value = settings.headingStyles[i];
        styleSelect.onchange = async () => {
            settings.headingStyles[i] = styleSelect.value;
            await manager.plugin.saveSettings();
        };

        // Separator Dropdown
        const sepSelect = stylesContainer.createEl('select');
        Object.entries(separatorOptions).forEach(([key, label]) => {
            sepSelect.createEl('option', { value: key, text: label });
        });
        sepSelect.value = settings.headingSeparators[i];
        sepSelect.onchange = async () => {
            settings.headingSeparators[i] = sepSelect.value;
            await manager.plugin.saveSettings();
        };

        // Start Value Input
        const startInput = stylesContainer.createEl('input', { type: 'text' });
        startInput.style.width = '100%';
        startInput.value = settings.headingStartValues[i];
        startInput.onchange = async () => {
            settings.headingStartValues[i] = startInput.value;
            await manager.plugin.saveSettings();
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
    shifterSummary.setText(t('Heading Shifter'));
    shifterSummary.style.fontWeight = 'bold';
    shifterSummary.style.cursor = 'pointer';
    shifterSummary.style.outline = 'none';

    const shifterContent = shifterDetails.createEl('div');
    shifterContent.style.marginTop = '10px';
    shifterContent.style.paddingLeft = '5px';
    shifterContent.style.borderLeft = '2px solid var(--background-modifier-border)';

    new Setting(shifterContent)
        .setName(t('Lower limit of Heading'))
        .setDesc(t('The lower Heading Size that will be decreased by the Heading Shift'))
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
        .setName(t('Enable override tab behavior'))
        .setDesc(t('Tab execute "Increase Headings" and Shift-Tab execute "Decrease Headings"'))
        .addToggle((toggle) =>
            toggle
                .setValue(settings.overrideTab)
                .onChange(async (value) => {
                    settings.overrideTab = value;
                    await manager.plugin.saveSettings();
                }),
        );

    // Style to remove
    shifterContent.createEl('h3', { text: t("Style to remove") });
    shifterContent.createEl('p', { text: t("If this style is at the position of a line, remove it") });

    shifterContent.createEl("b", { text: t("Beginning") });
    new Setting(shifterContent)
        .setName(t("Unordered list"))
        .setDesc("-")
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.beginning?.ul)
                .onChange(async (value) => {
                    settings.styleToRemove.beginning.ul = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t("Ordered list"))
        .setDesc("1., 2. ,3. ,...")
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.beginning?.ol)
                .onChange(async (value) => {
                    settings.styleToRemove.beginning.ol = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t("User defined"))
        .setDesc(t("Arbitrary string (regular expression)"))
        .addTextArea((str) => {
            str
                .setValue(settings.styleToRemove.beginning?.userDefined?.join("\n"))
                .onChange(async (str) => {
                    settings.styleToRemove.beginning.userDefined = str.split("\n");
                    await manager.plugin.saveSettings();
                });
        });

    shifterContent.createEl("b", { text: t("Surrounding") });
    new Setting(shifterContent)
        .setName(t("Bold"))
        .setDesc("**|__")
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.surrounding?.bold)
                .onChange(async (value) => {
                    settings.styleToRemove.surrounding.bold = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t("Italic"))
        .setDesc("*|_")
        .addToggle((toggle) =>
            toggle
                .setValue(settings.styleToRemove?.surrounding?.italic)
                .onChange(async (value) => {
                    settings.styleToRemove.surrounding.italic = value;
                    await manager.plugin.saveSettings();
                }),
        );
    new Setting(shifterContent)
        .setName(t("User defined"))
        .setDesc(t("Arbitrary string (regular expression)"))
        .addTextArea((str) => {
            str
                .setValue(settings.styleToRemove?.surrounding?.userDefined?.join("\n"))
                .onChange(async (str) => {
                    settings.styleToRemove.surrounding.userDefined = str.split("\n");
                    await manager.plugin.saveSettings();
                });
        });

    shifterContent.createEl("h3", { text: t("List") });
    new Setting(shifterContent)
        .setName(t("Children behavior"))
        .addDropdown((dropdown) => {
            dropdown
                .addOption("outdent to zero", t("Outdent to 0"))
                .addOption("sync with headings", t("Sync with headings"))
                .addOption("noting", t("Noting"))
                .setValue(settings.list.childrenBehavior)
                .onChange((v: any) => {
                    settings.list.childrenBehavior = v;
                    manager.plugin.saveSettings();
                });
        });

    shifterContent.createEl("h3", { text: t("Editor") });
    new Setting(shifterContent).setName(t("Tab size")).addSlider((cb) => {
        cb.setDynamicTooltip()
            .setLimits(2, 8, 2)
            .setValue(settings.editor.tabSize)
            .onChange((v) => {
                settings.editor.tabSize = v;
                manager.plugin.saveSettings();
            });
    });
}
