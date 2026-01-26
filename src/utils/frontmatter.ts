
import { FrontMatterCache, parseFrontMatterEntry, TFile, App } from 'obsidian';
import { MyHeadingsSettings, MyFormulasSettings, DEFAULT_MY_HEADINGS_SETTINGS, DEFAULT_MY_FORMULAS_SETTINGS } from '../settings';

// ====================================================================================
// Headings FrontMatter Logic
// ====================================================================================

export function parseHeadingsFrontMatter(fm: FrontMatterCache | undefined, defaultSettings: MyHeadingsSettings): MyHeadingsSettings {
    const settings = Object.assign({}, defaultSettings);
    if (!fm) return settings;

    const entry = parseFrontMatterEntry(fm, 'number headings');
    if (entry) {
        const parts = String(entry).split(',').map(p => p.trim()).filter(p => p.length > 0);

        // Regex patterns matching source logic
        const rangeRegex = /^\d-\d$/;
        const stylesRegex = /^[0-9a-zA-Z\u4e00-\u9fa5\u2460-\u2473&⓪]{6}$/;
        const startValuesRegex = /^\d{6}$/;
        const separatorsRegex = /^[-:.—]{5}$/;

        let rangeFound = false;
        let stylesFound = false;
        let separatorsFound = false;
        let startValuesFound = false;

        for (const part of parts) {
            if (part === 'auto') settings.auto = true;
            else if (part === 'off') settings.enabled = false;
            else if (part.startsWith('first-level')) {
                const n = parseInt(part.substring('first-level'.length + 1));
                if (!isNaN(n) && n >= 1 && n <= 6) settings.firstLevel = n;
            }
            else if (part.startsWith('max')) {
                const n = parseInt(part.substring('max'.length + 1));
                if (!isNaN(n) && n >= 1 && n <= 6) settings.maxLevel = n;
            }
            else if (!rangeFound && rangeRegex.test(part)) {
                const [min, max] = part.split('-').map(Number);
                if (!isNaN(min) && !isNaN(max)) {
                    settings.firstLevel = min;
                    settings.maxLevel = max;
                    rangeFound = true;
                }
            }
            else if (!stylesFound && stylesRegex.test(part)) {
                settings.headingStyles = part.split('');
                stylesFound = true;
            }
            else if (!startValuesFound && startValuesRegex.test(part)) {
                settings.headingStartValues = part.split('');
                startValuesFound = true;
            }
            else if (!separatorsFound && separatorsRegex.test(part)) {
                // Source maps 5 chars to indices 1-5. Index 0 is typically empty provided by default or not in compact string.
                // We keep index 0 as it is (usually empty) or reset it? 
                // Source: settings.headingSeparators = ['', seps[0], ... seps[4]]
                const seps = part.split('');
                settings.headingSeparators = ['', seps[0], seps[1], seps[2], seps[3], seps[4]];
                separatorsFound = true;
            }
            else if (part.startsWith('skip')) {
                // Not fully detailed in the snippet but `skipHeadings` handling might be simple string or logic
                // Source snippet shows 'skipHeadings' property but not explicit parsing logic in the loop 
                // (except for `skip` causing it to skip levels? No, `skipTopLevel` is internal)
                // Let's assume generic skip logic if any.
            }
        }
    }
    return settings;
}

export function serializeHeadingsFrontMatter(settings: MyHeadingsSettings): string {
    if (!settings.enabled) return 'off';

    const parts: string[] = [];
    if (settings.auto) parts.push('auto');

    // Range
    if (settings.firstLevel !== 1 || settings.maxLevel !== 6) {
        parts.push(`${settings.firstLevel}-${settings.maxLevel}`);
    } else {
        parts.push('1-6');
    }

    // Styles
    if (settings.headingStyles && settings.headingStyles.length >= 6) {
        parts.push(settings.headingStyles.join(''));
    } else {
        parts.push('1aA一①1');
    }

    // Separators (Slice 1-6)
    if (settings.headingSeparators && settings.headingSeparators.length >= 6) {
        parts.push(settings.headingSeparators.slice(1, 6).join(''));
    } else {
        parts.push(DEFAULT_MY_HEADINGS_SETTINGS.headingSeparators.slice(1, 6).join(''));
    }

    // Start Values
    if (settings.headingStartValues && settings.headingStartValues.length >= 6) {
        parts.push(settings.headingStartValues.join(''));
    } else {
        parts.push('011111');
    }

    return parts.join(', ');
}

// ====================================================================================
// Formulas FrontMatter Logic
// ====================================================================================

export function parseFormulasFrontMatter(fm: FrontMatterCache | undefined, defaultSettings: MyFormulasSettings): MyFormulasSettings {
    const settings = Object.assign({}, defaultSettings);
    if (!fm) return settings;

    const entry = parseFrontMatterEntry(fm, 'number formulas');
    if (entry) {
        const parts = String(entry).split(',').map(p => p.trim());
        for (const part of parts) {
            if (part === 'auto') settings.auto = true;
            else if (part === 'off') settings.enabled = false;
            else if (part === 'continuous') settings.mode = 'continuous';
            else if (part.startsWith('heading-based')) {
                settings.mode = 'heading-based';
                const match = part.match(/heading-based\((\d+)\)/);
                if (match && match[1]) {
                    const depth = parseInt(match[1]);
                    if (!isNaN(depth) && depth >= 1 && depth <= 6) {
                        settings.maxDepth = depth;
                    }
                }
            }
        }
    }
    return settings;
}

export function serializeFormulasFrontMatter(settings: MyFormulasSettings): string {
    if (!settings.enabled) return 'off';

    const parts: string[] = [];
    if (settings.auto) parts.push('auto');

    if (settings.mode === 'heading-based') {
        const depth = settings.maxDepth || 4;
        parts.push(`heading-based(${depth})`);
    } else {
        parts.push('continuous');
    }

    return parts.join(', ');
}

export async function saveSettingsToFrontMatter(app: App, file: TFile, headingsSettings?: MyHeadingsSettings, formulasSettings?: MyFormulasSettings) {
    await app.fileManager.processFrontMatter(file, (fm) => {
        if (headingsSettings) {
            fm['number headings'] = serializeHeadingsFrontMatter(headingsSettings);
        }
        if (formulasSettings) {
            fm['number formulas'] = serializeFormulasFrontMatter(formulasSettings);
        }
    });
}
