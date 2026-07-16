import { describe, expect, it } from 'vitest';
import { DEFAULT_MY_FORMULAS_SETTINGS, DEFAULT_MY_HEADINGS_SETTINGS } from '../src/settings';
import {
    parseFormulasFrontMatterValue,
    parseHeadingsFrontMatterValue,
    replaceFrontMatterPolicy,
    resolveReconcileIntent,
    serializeFormulasFrontMatter,
    serializeHeadingsFrontMatter,
} from '../src/utils/frontmatter';

describe('compact frontmatter', () => {
    it('parses legacy heading values and the new none/off policies', () => {
        const auto = parseHeadingsFrontMatterValue('auto, 1-6, 111111, ....., 111111', DEFAULT_MY_HEADINGS_SETTINGS);
        expect(auto.policy).toBe('auto');
        expect(auto.settings.headingStyles).toEqual(['1', '1', '1', '1', '1', '1']);
        expect(auto.settings.headingSeparators.slice(1)).toEqual(['.', '.', '.', '.', '.']);
        expect(auto.settings.headingStartValues).toEqual(['1', '1', '1', '1', '1', '1']);

        const none = parseHeadingsFrontMatterValue('none, 1-6, 111111, ....., 111111', DEFAULT_MY_HEADINGS_SETTINGS);
        expect(none.policy).toBe('none');
        expect(none.settings.enabled).toBe(true);

        const off = parseHeadingsFrontMatterValue('off', DEFAULT_MY_HEADINGS_SETTINGS);
        expect(off.policy).toBe('off');
        expect(off.settings.enabled).toBe(true);
    });

    it('treats an existing value without a state token as manual', () => {
        const globalAuto = { ...DEFAULT_MY_HEADINGS_SETTINGS, auto: true };
        expect(parseHeadingsFrontMatterValue('1-6, 111111, ....., 111111', globalAuto).policy).toBe('manual');
        expect(parseFormulasFrontMatterValue('continuous', { ...DEFAULT_MY_FORMULAS_SETTINGS, auto: true }).policy).toBe('manual');
    });

    it('fails closed for conflicts, malformed ranges, unknown tokens and non-text values', () => {
        expect(parseHeadingsFrontMatterValue('auto, none, 1-6', DEFAULT_MY_HEADINGS_SETTINGS).policy).toBe('invalid');
        expect(parseHeadingsFrontMatterValue('6-1, 111111, ....., 111111', DEFAULT_MY_HEADINGS_SETTINGS).policy).toBe('invalid');
        const future = parseHeadingsFrontMatterValue('auto, future-mode', DEFAULT_MY_HEADINGS_SETTINGS);
        expect(future.policy).toBe('invalid');
        expect(future.errors).toEqual([{
            code: 'unsupportedHeadingTokens',
            params: { tokens: 'future-mode' },
        }]);
        expect(serializeHeadingsFrontMatter(future.settings, 'off', future.unsupportedTokens)).toContain('future-mode');
        const nonTextFormula = parseFormulasFrontMatterValue(false, DEFAULT_MY_FORMULAS_SETTINGS);
        expect(nonTextFormula.policy).toBe('invalid');
        expect(nonTextFormula.errors).toEqual([{ code: 'formulaPropertyMustBeText' }]);
    });

    it('round trips the supported scalar form without a migration', () => {
        const parsed = parseHeadingsFrontMatterValue('none, 1-6, 111111, ....., 111111', DEFAULT_MY_HEADINGS_SETTINGS);
        expect(serializeHeadingsFrontMatter(parsed.settings, 'none')).toBe('none, 1-6, 111111, ....., 111111');
        expect(serializeFormulasFrontMatter(DEFAULT_MY_FORMULAS_SETTINGS, 'none')).toBe('none, continuous');
        expect(replaceFrontMatterPolicy('auto, 1-6, 111111, ....., 111111', 'none'))
            .toBe('none, 1-6, 111111, ....., 111111');
        expect(replaceFrontMatterPolicy('1-6, 111111, ....., 111111', 'none'))
            .toBe('none, 1-6, 111111, ....., 111111');
    });

    it('gives the global switch absolute precedence', () => {
        expect(resolveReconcileIntent(false, 'auto')).toBeUndefined();
        expect(resolveReconcileIntent(false, 'none')).toBeUndefined();
        expect(resolveReconcileIntent(false, 'manual', 'number')).toBeUndefined();
        expect(resolveReconcileIntent(true, 'off', 'clear')).toBeUndefined();
        expect(resolveReconcileIntent(true, 'none')).toBe('clear');
    });
});
