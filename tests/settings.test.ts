import { describe, expect, it } from 'vitest';
import { DEFAULT_MY_HEADINGS_SETTINGS, normalizeSettings } from '../src/settings';

describe('settings normalization', () => {
    it('loads empty, partial, null and malformed data without sharing defaults', () => {
        const empty = normalizeSettings(null);
        const partial = normalizeSettings({
            myHeadings: {
                firstLevel: 6,
                maxLevel: 1,
                headingStyles: null,
                styleToRemove: { beginning: null },
            },
            myFormulas: null,
            refreshInterval: -1,
        });
        expect(empty.myHeadings.headingStyles).toEqual(DEFAULT_MY_HEADINGS_SETTINGS.headingStyles);
        expect(partial.myHeadings.firstLevel).toBe(6);
        expect(partial.myHeadings.maxLevel).toBe(6);
        expect(partial.refreshInterval).toBe(1000);
        empty.myHeadings.headingStyles[0] = 'I';
        expect(DEFAULT_MY_HEADINGS_SETTINGS.headingStyles[0]).toBe('1');
    });

    it('drops corrupt ownership records while preserving valid fingerprints', () => {
        const settings = normalizeSettings({
            ownership: {
                headings: {
                    'note.md': [
                        { elementHash: 'hash', token: '1', configSignature: 'config', level: 1 },
                        { token: 'missing hash' },
                    ],
                },
            },
        });
        expect(settings.ownership.headings['note.md']).toHaveLength(1);
        expect(settings.ownership.formulas).toEqual({});
    });

    it('ignores the removed legacy tab-size setting and upgrades normalized data', () => {
        const settings = normalizeSettings({
            dataVersion: 1,
            myHeadings: { editor: { tabSize: 8 } },
        });
        expect(settings.dataVersion).toBe(2);
        expect(settings.myHeadings).not.toHaveProperty('editor');
    });
});
