import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const languageState = vi.hoisted(() => ({
    value: 'en' as string,
    shouldThrow: false,
}));

vi.mock('obsidian', () => ({
    getLanguage: () => {
        if (languageState.shouldThrow) throw new Error('language API unavailable');
        return languageState.value;
    },
    parseFrontMatterEntry: (frontmatter: Record<string, unknown>, key: string) => frontmatter[key],
}));

import { formatFrontMatterDiagnostic, formatSaveError } from '../src/i18n/diagnostics';
import {
    getCurrentLocale,
    interpolateTranslation,
    normalizeLocale,
    t,
} from '../src/i18n/helpers';
import en from '../src/i18n/locales/en';
import zh from '../src/i18n/locales/zh';
import { FrontMatterDiagnostic, FrontMatterValidationError } from '../src/utils/frontmatter';

describe('i18n', () => {
    const originalGetItem = window.localStorage.getItem;

    beforeEach(() => {
        languageState.value = 'en';
        languageState.shouldThrow = false;
        window.localStorage.getItem = originalGetItem;
    });

    afterEach(() => {
        window.localStorage.getItem = originalGetItem;
    });

    it.each([
        ['zh', 'zh'],
        ['ZH', 'zh'],
        ['zh-CN', 'zh'],
        ['zh_TW', 'zh'],
        ['zh-HK', 'zh'],
        ['en', 'en'],
        ['en-US', 'en'],
        ['de', 'en'],
        ['', 'en'],
        [undefined, 'en'],
    ] as const)('normalizes %s to %s', (input, expected) => {
        expect(normalizeLocale(input)).toBe(expected);
    });

    it('resolves the Obsidian language for every translation call instead of caching it', () => {
        languageState.value = 'en';
        expect(t('settings.global')).toBe('Global Settings');

        languageState.value = 'zh_CN';
        expect(t('settings.global')).toBe('全局设置');
        expect(getCurrentLocale()).toBe('zh');
    });

    it('falls back to the current language preference when the optional API is unavailable', () => {
        languageState.shouldThrow = true;
        window.localStorage.getItem = () => 'zh-TW';
        expect(t('settings.modules')).toBe('模块');

        window.localStorage.getItem = () => {
            throw new Error('storage unavailable');
        };
        expect(t('settings.modules')).toBe('Modules');
    });

    it('keeps the English and Chinese dictionaries in exact key parity', () => {
        expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    });

    it('interpolates declared parameters and leaves missing placeholders visible', () => {
        expect(interpolateTranslation('{count} {module} {missing}', { count: 2, module: 'heading' }))
            .toBe('2 heading {missing}');
    });

    it('translates structured diagnostics and validation failures', () => {
        languageState.value = 'en';
        expect(formatFrontMatterDiagnostic({
            code: 'unsupportedHeadingTokens',
            params: { tokens: 'future-mode' },
        })).toBe('Unsupported heading tokens: future-mode');

        languageState.value = 'zh-CN';
        expect(formatFrontMatterDiagnostic({ code: 'formulaPropertyMustBeText' }))
            .toBe('公式编号属性必须是文本');
        expect(formatSaveError(
            'notice.unableToSaveHeadings',
            new FrontMatterValidationError({ code: 'headingSkipContainsComma' }),
        )).toBe('紧凑 frontmatter 中的跳过文本不能包含逗号');
    });

    it('formats every frontmatter diagnostic in both supported languages', () => {
        const diagnostics: FrontMatterDiagnostic[] = [
            { code: 'conflictingPolicies' },
            { code: 'headingPropertyMustBeText' },
            { code: 'headingPropertyEmpty' },
            { code: 'headingRangeAscending' },
            { code: 'unsupportedHeadingTokens', params: { tokens: 'future-heading' } },
            { code: 'formulaPropertyMustBeText' },
            { code: 'formulaPropertyEmpty' },
            { code: 'unsupportedFormulaTokens', params: { tokens: 'future-formula' } },
            { code: 'headingRangeInvalid' },
            { code: 'headingStylesInvalid' },
            { code: 'headingSeparatorsInvalid' },
            { code: 'headingStartValuesInvalid' },
            { code: 'headingSkipContainsComma' },
        ];

        for (const language of ['en', 'zh-CN']) {
            languageState.value = language;
            for (const diagnostic of diagnostics) {
                const message = formatFrontMatterDiagnostic(diagnostic);
                expect(message).not.toBe(diagnostic.code);
                expect(message).not.toMatch(/\{[A-Za-z][A-Za-z0-9_]*\}/);
            }
        }
    });

    it('uses a localized summary while retaining external error details', () => {
        languageState.value = 'zh';
        expect(formatSaveError('notice.unableToSaveFormulas', new Error('permission denied')))
            .toBe('无法保存公式设置: permission denied');
    });

    it('explains in both languages that A/a changes numbering only', () => {
        languageState.value = 'en';
        expect(t('headings.stylesCaseNote')).toContain('heading text is never changed');
        languageState.value = 'zh-TW';
        expect(t('headings.stylesCaseNote')).toContain('不会修改标题文字');
    });
});
