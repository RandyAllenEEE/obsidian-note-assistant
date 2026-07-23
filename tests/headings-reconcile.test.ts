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

    it('takes over every strict current-format prefix while leaving ordinary title text intact', () => {
        for (const source of ['# 7 Installation', '# 2026 Roadmap']) {
            const plan = planHeadingReconcile(source, settings(), 'clear');
            expect(applyEditsToText(source, plan.edits)).not.toMatch(/^# \d/);
            expect(plan.ambiguousLines).toEqual([]);
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
            configSignature: JSON.stringify({
                firstLevel: 1,
                maxLevel: 6,
                styles: ['1', '1', '1', '1', '1', '1'],
                separators: ['', '.', '.', '.', '.', '.'],
                starts: ['1', '1', '1', '1', '1', '1'],
                skip: '',
            }),
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

    it('updates strict configured prefixes across depth changes without ownership records', () => {
        const shiftedWithoutOwnership = '# Parent\n### 1.1 Stability';
        const plan = planHeadingReconcile(shiftedWithoutOwnership, settings(), 'number');
        expect(applyEditsToText(shiftedWithoutOwnership, plan.edits))
            .toBe('# 1 Parent\n### 1.1.1 Stability');
        expect(plan.ambiguousLines).toEqual([]);

        const shiftedShallower = '# Parent\n## 1.1.1 Stability';
        const shallowerPlan = planHeadingReconcile(shiftedShallower, settings(), 'number');
        expect(applyEditsToText(shiftedShallower, shallowerPlan.edits))
            .toBe('# 1 Parent\n## 1.1 Stability');
        expect(shallowerPlan.ambiguousLines).toEqual([]);
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

    it('renumbers safely after deleting, cutting, or reordering whole sections', () => {
        const afterCut = '# 1 Alpha\n# 3 Gamma';
        expect(applyEditsToText(afterCut, planHeadingReconcile(afterCut, settings(), 'number').edits))
            .toBe('# 1 Alpha\n# 2 Gamma');

        const reordered = '# 3 Gamma\n# 1 Alpha';
        expect(applyEditsToText(reordered, planHeadingReconcile(reordered, settings(), 'number').edits))
            .toBe('# 1 Gamma\n# 2 Alpha');
    });

    it('updates only the first prefix when historical stacked prefixes already exist', () => {
        const source = '# Parent\n### 2.3.1 2.3.1.1 Stability';
        const plan = planHeadingReconcile(source, settings(), 'number');
        expect(applyEditsToText(source, plan.edits))
            .toBe('# 1 Parent\n### 1.1.1 2.3.1.1 Stability');
        expect(plan.ambiguousLines).toEqual([]);
    });

    it('updates repeated physical headings independently without relying on fingerprints', () => {
        const source = '# Parent\n## 1.1 Same\n## 1.1 Same';
        const record: ManagedNumberRecord = {
            elementHash: fingerprintText('Same'),
            token: '1.1',
            configSignature: JSON.stringify({
                firstLevel: 1,
                maxLevel: 6,
                styles: ['1', '1', '1', '1', '1', '1'],
                separators: ['', '.', '.', '.', '.', '.'],
                starts: ['1', '1', '1', '1', '1', '1'],
                skip: '',
            }),
            level: 2,
        };
        const plan = planHeadingReconcile(source, settings(), 'number', [record]);
        expect(applyEditsToText(source, plan.edits))
            .toBe('# 1 Parent\n## 1.1 Same\n## 1.2 Same');
        expect(plan.ambiguousLines).toEqual([]);
    });

    it('explicitly takes over numeric titles that match the active numeric format', () => {
        const source = '# 2026 Roadmap';
        const plan = planHeadingReconcile(source, settings(), 'number');
        expect(applyEditsToText(source, plan.edits)).toBe('# 1 Roadmap');
        expect(plan.ambiguousLines).toEqual([]);
    });

    it('recognizes both old and new formats during a configuration transition', () => {
        const oldSettings = settings({ headingSeparators: ['', '.', '.', '.', '.', '.'] });
        const newSettings = settings({ headingSeparators: ['', '-', '-', '-', '-', '-'] });
        const source = '# 9 Parent\n## 9.7 Child';
        const plan = planHeadingReconcile(source, newSettings, 'number', [], {
            trigger: 'config-change',
            acceptedHeadingConfigs: [oldSettings],
        });
        const result = applyEditsToText(source, plan.edits);
        expect(result).toBe('# 1 Parent\n## 1-1 Child');
        expect(plan.ambiguousLines).toEqual([]);
        expect(planHeadingReconcile(result, newSettings, 'number', plan.records).edits).toEqual([]);
    });

    it('uses a valid old record signature only as compatibility evidence', () => {
        const oldSettings = settings({ headingSeparators: ['', '.', '.', '.', '.', '.'] });
        const newSettings = settings({ headingSeparators: ['', '-', '-', '-', '-', '-'] });
        const source = '# 3 Parent\n## 3.8 Child';
        const records: ManagedNumberRecord[] = [{
            elementHash: 'stale-and-irrelevant',
            token: 'unrelated',
            configSignature: JSON.stringify({
                firstLevel: oldSettings.firstLevel,
                maxLevel: oldSettings.maxLevel,
                styles: oldSettings.headingStyles,
                separators: oldSettings.headingSeparators,
                starts: oldSettings.headingStartValues,
                skip: oldSettings.skipHeadings,
            }),
            level: 6,
        }];
        const plan = planHeadingReconcile(source, newSettings, 'number', records);
        expect(applyEditsToText(source, plan.edits)).toBe('# 1 Parent\n## 1-1 Child');
    });

    it('does not let a corrupt record signature claim an unknown old format', () => {
        const newSettings = settings({ headingSeparators: ['', '-', '-', '-', '-', '-'] });
        const source = '# 3 Parent\n## 3.8 Child';
        const plan = planHeadingReconcile(source, newSettings, 'number', [{
            elementHash: fingerprintText('Child'),
            token: '3.8',
            configSignature: 'corrupt',
            level: 2,
        }]);
        expect(applyEditsToText(source, plan.edits)).toBe('# 1 Parent\n## 3.8 Child');
        expect(plan.ambiguousLines).toEqual([2]);
    });

    it('ignores fenced code and supports Roman generation', () => {
        const source = '```md\n# Example\n```\n# Real\n# Next';
        const roman = settings({ headingStyles: ['I', '1', '1', '1', '1', '1'] });
        expect(applyEditsToText(source, planHeadingReconcile(source, roman, 'number').edits))
            .toBe('```md\n# Example\n```\n# I Real\n# II Next');
    });

    it('round trips every exposed numbering style and preserves heading indentation', () => {
        const expected: Record<string, [string, string]> = {
            '1': ['1', '2'],
            a: ['a', 'b'],
            A: ['A', 'B'],
            I: ['I', 'II'],
            一: ['一', '二'],
            '①': ['①', '②'],
        };
        for (const [style, [first, second]] of Object.entries(expected)) {
            const configured = settings({
                headingStyles: [style, '1', '1', '1', '1', '1'],
            });
            const original = '  # First\n  # Second';
            const numbered = applyEditsToText(original, planHeadingReconcile(original, configured, 'number').edits);
            expect(numbered).toBe(`  # ${first} First\n  # ${second} Second`);
            expect(planHeadingReconcile(numbered, configured, 'number').edits).toEqual([]);
            expect(applyEditsToText(numbered, planHeadingReconcile(numbered, configured, 'clear').edits))
                .toBe(original);
        }
    });
});
