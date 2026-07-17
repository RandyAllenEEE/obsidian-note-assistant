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

    it('recognizes an owned token across heading-level changes and replaces it in place', () => {
        const original = '# Parent\n## Stability';
        const initial = planHeadingReconcile(original, settings(), 'number');
        const numbered = applyEditsToText(original, initial.edits);
        expect(numbered).toBe('# 1 Parent\n## 1.1 Stability');

        const shiftedDeeper = numbered.replace('## 1.1 Stability', '### 1.1 Stability');
        const deeperPlan = planHeadingReconcile(shiftedDeeper, settings(), 'number', initial.records);
        const deeper = applyEditsToText(shiftedDeeper, deeperPlan.edits);
        expect(deeper).toBe('# 1 Parent\n### 1.1.1 Stability');
        expect(deeperPlan.records).toContainEqual(expect.objectContaining({
            token: '1.1.1',
            level: 3,
            elementHash: fingerprintText('Stability'),
        }));

        const shiftedHigher = deeper.replace('### 1.1.1 Stability', '## 1.1.1 Stability');
        const higherPlan = planHeadingReconcile(shiftedHigher, settings(), 'number', deeperPlan.records);
        const higher = applyEditsToText(shiftedHigher, higherPlan.edits);
        expect(higher).toBe('# 1 Parent\n## 1.1 Stability');
        expect(planHeadingReconcile(higher, settings(), 'number', higherPlan.records).edits).toEqual([]);
    });

    it('never prepends a new token to an unowned configured prefix from another depth', () => {
        const shiftedWithoutOwnership = '# Parent\n### 1.1 Stability';
        const plan = planHeadingReconcile(shiftedWithoutOwnership, settings(), 'number');
        expect(applyEditsToText(shiftedWithoutOwnership, plan.edits))
            .toBe('# 1 Parent\n### 1.1 Stability');
        expect(plan.ambiguousLines).toEqual([2]);

        const shiftedShallower = '# Parent\n## 1.1.1 Stability';
        const shallowerPlan = planHeadingReconcile(shiftedShallower, settings(), 'number');
        expect(applyEditsToText(shiftedShallower, shallowerPlan.edits))
            .toBe('# 1 Parent\n## 1.1.1 Stability');
        expect(shallowerPlan.ambiguousLines).toEqual([2]);
    });

    it('updates a batch of uniquely owned headings after their levels change', () => {
        const original = '# Parent\n## Alpha\n## Beta';
        const initial = planHeadingReconcile(original, settings(), 'number');
        const numbered = applyEditsToText(original, initial.edits);
        const shifted = numbered
            .replace('## 1.1 Alpha', '### 1.1 Alpha')
            .replace('## 1.2 Beta', '### 1.2 Beta');
        const plan = planHeadingReconcile(shifted, settings(), 'number', initial.records);
        const result = applyEditsToText(shifted, plan.edits);
        expect(result).toBe('# 1 Parent\n### 1.1.1 Alpha\n### 1.1.2 Beta');
        expect(result.match(/^###\s+\S+/gm)).toEqual([
            '### 1.1.1',
            '### 1.1.2',
        ]);
        expect(planHeadingReconcile(result, settings(), 'number', plan.records).edits).toEqual([]);
    });

    it('leaves already stacked prefixes untouched instead of attempting a repair', () => {
        const source = '# Parent\n### 2.3.1 2.3.1.1 Stability';
        const plan = planHeadingReconcile(source, settings(), 'number');
        expect(applyEditsToText(source, plan.edits))
            .toBe('# 1 Parent\n### 2.3.1 2.3.1.1 Stability');
        expect(plan.ambiguousLines).toEqual([2]);
    });

    it('does not claim a record that matches more than one physical heading', () => {
        const source = '# Parent\n## 1.1 Same\n## 1.1 Same';
        const record: ManagedNumberRecord = {
            elementHash: fingerprintText('Same'),
            token: '1.1',
            configSignature: 'old',
            level: 2,
        };
        const plan = planHeadingReconcile(source, settings(), 'number', [record]);
        expect(applyEditsToText(source, plan.edits))
            .toBe('# 1 Parent\n## 1.1 Same\n## 1.1 Same');
        expect(plan.ambiguousLines).toEqual([3]);
    });

    it('preserves ordinary numeric titles during numbering as ambiguous content', () => {
        const source = '# 2026 Roadmap';
        const plan = planHeadingReconcile(source, settings(), 'number');
        expect(plan.edits).toEqual([]);
        expect(plan.ambiguousLines).toEqual([1]);
    });

    it('ignores fenced code and supports Roman generation', () => {
        const source = '```md\n# Example\n```\n# Real\n# Next';
        const roman = settings({ headingStyles: ['I', '1', '1', '1', '1', '1'] });
        expect(applyEditsToText(source, planHeadingReconcile(source, roman, 'number').edits))
            .toBe('```md\n# Example\n```\n# I Real\n# II Next');
    });
});
