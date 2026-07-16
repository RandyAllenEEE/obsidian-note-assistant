import { describe, expect, it } from 'vitest';
import { planHeadingReconcile } from '../src/headings/reconcile';
import { DEFAULT_MY_HEADINGS_SETTINGS, ManagedNumberRecord, MyHeadingsSettings } from '../src/settings';
import { applyEditsToText, fingerprintText } from '../src/utils/reconcile';

function settings(overrides: Partial<MyHeadingsSettings> = {}): MyHeadingsSettings {
    return {
        ...DEFAULT_MY_HEADINGS_SETTINGS,
        firstLevel: 1,
        maxLevel: 6,
        headingStyles: ['1', '1', '1', '1', '1', '1'],
        headingSeparators: ['', '.', '.', '.', '.', '.'],
        headingStartValues: ['1', '1', '1', '1', '1', '1'],
        ...overrides,
    };
}

describe('heading reconcile', () => {
    it('inserts, adopts, clears and remains idempotent through one planner', () => {
        const original = '# Installation\n## Details';
        const numbered = applyEditsToText(original, planHeadingReconcile(original, settings(), 'number').edits);
        expect(numbered).toBe('# 1 Installation\n## 1.1 Details');
        expect(planHeadingReconcile(numbered, settings(), 'number').edits).toEqual([]);
        const cleared = applyEditsToText(numbered, planHeadingReconcile(numbered, settings(), 'clear').edits);
        expect(cleared).toBe(original);
        expect(planHeadingReconcile(cleared, settings(), 'clear').edits).toEqual([]);
    });

    it('preserves wrong numeric prefixes and ordinary title text', () => {
        for (const source of ['# 7 Installation', '# 2026 Roadmap']) {
            const plan = planHeadingReconcile(source, settings(), 'clear');
            expect(plan.edits).toEqual([]);
            expect(plan.ambiguousLines).toEqual([1]);
        }
        expect(applyEditsToText('# Introduction to plugin', planHeadingReconcile('# Introduction to plugin', settings(), 'number').edits))
            .toBe('# 1 Introduction to plugin');
        expect(applyEditsToText('# 第一章 介绍', planHeadingReconcile('# 第一章 介绍', settings(), 'number').edits))
            .toBe('# 1 第一章 介绍');
    });

    it('updates a uniquely owned old token but never relies on a broad regex', () => {
        const source = '# 7 Installation';
        const record: ManagedNumberRecord = {
            elementHash: fingerprintText('Installation'),
            token: '7',
            configSignature: 'old',
            level: 1,
        };
        const plan = planHeadingReconcile(source, settings(), 'number', [record]);
        expect(applyEditsToText(source, plan.edits)).toBe('# 1 Installation');
    });

    it('ignores fenced code and supports Roman generation', () => {
        const source = '```md\n# Example\n```\n# Real\n# Next';
        const roman = settings({ headingStyles: ['I', '1', '1', '1', '1', '1'] });
        expect(applyEditsToText(source, planHeadingReconcile(source, roman, 'number').edits))
            .toBe('```md\n# Example\n```\n# I Real\n# II Next');
    });
});
