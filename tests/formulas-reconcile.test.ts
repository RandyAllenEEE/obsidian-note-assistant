import { describe, expect, it } from 'vitest';
import { planFormulaReconcile, scanDisplayMathBlocks } from '../src/formulas/reconcile';
import { planHeadingReconcile } from '../src/headings/reconcile';
import { DEFAULT_MY_FORMULAS_SETTINGS, DEFAULT_MY_HEADINGS_SETTINGS, ManagedNumberRecord, MyHeadingsSettings } from '../src/settings';
import { applyEditsToText, fingerprintText } from '../src/utils/reconcile';

const headingSettings: MyHeadingsSettings = {
    ...DEFAULT_MY_HEADINGS_SETTINGS,
    headingStyles: ['1', '1', '1', '1', '1', '1'],
    headingSeparators: ['', '.', '.', '.', '.', '.'],
    headingStartValues: ['1', '1', '1', '1', '1', '1'],
};

describe('formula reconcile', () => {
    it('keeps absolute-value lines inside display math and never numbers the prose between formulas', () => {
        const source = [
            '### 1.1.1 Section',
            '$$',
            '|G(j\\omega)|=1',
            '\\tag{1.1.1-28}',
            '$$',
            '',
            'Explanation between equations.',
            '',
            '$$K_i/K_p=r/L\\tag{1.1.1-29}$$',
        ].join('\n');
        const config = { ...DEFAULT_MY_FORMULAS_SETTINGS, mode: 'heading-based' as const, maxDepth: 3 };
        const plan = planFormulaReconcile(source, config, headingSettings, 'number');
        expect(scanDisplayMathBlocks(source).map(block => source.slice(block.contentStart, block.contentEnd)))
            .toEqual(['\n|G(j\\omega)|=1\n\\tag{1.1.1-28}\n', 'K_i/K_p=r/L\\tag{1.1.1-29}']);
        const result = applyEditsToText(source, plan.edits);
        expect(result).toBe(source.replace('-28}', '-1}').replace('-29}', '-2}'));
        expect(planFormulaReconcile(result, config, headingSettings, 'number', plan.records).edits).toEqual([]);
        expect(applyEditsToText(result, planFormulaReconcile(result, config, headingSettings, 'clear').edits))
            .toContain('$$\n|G(j\\omega)|=1\n\n$$\n\nExplanation between equations.\n\n$$K_i/K_p=r/L$$');
    });

    it('does not pair unclosed math across a paragraph or heading boundary', () => {
        const source = [
            '$$broken',
            '',
            'Ordinary prose.',
            '',
            '$$valid$$',
            '$$another broken',
            '# Next section',
            '$$also valid$$',
        ].join('\n');
        const plan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number');
        expect(scanDisplayMathBlocks(source).map(block => source.slice(block.contentStart, block.contentEnd)))
            .toEqual(['valid', 'also valid']);
        expect(applyEditsToText(source, plan.edits))
            .toBe(source.replace('$$valid$$', () => '$$valid \\tag{1}$$').replace('$$also valid$$', () => '$$also valid \\tag{2}$$'));
    });

    it('resynchronizes at a new equation after an adjacent unfinished opener', () => {
        const source = '$$broken\n$$valid$$\n$$\nunclosed';
        const plan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number');
        expect(plan.blocks.map(block => source.slice(block.contentStart, block.contentEnd))).toEqual(['valid']);
        expect(applyEditsToText(source, plan.edits)).toBe('$$broken\n$$valid \\tag{1}$$\n$$\nunclosed');
    });

    it.each(['\n', '\r\n'])('handles norms, empty delimiter debris, and table exclusions with %j line endings', newline => {
        const source = [
            '| Equation | Description |',
            '| --- | --- |',
            '| $$table$$ | ignored |',
            '$$',
            '\\tag{8}',
            '$$',
            '',
            '$$',
            '|x| + \\|y\\| = z',
            '$$',
            '',
            '$$next$$',
        ].join(newline);
        const plan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number');
        expect(plan.blocks).toHaveLength(2);
        expect(applyEditsToText(source, plan.edits)).toBe(
            source.replace('|x| + \\|y\\| = z' + newline + '$$', () => '|x| + \\|y\\| = z' + newline + ' \\tag{1}$$')
                .replace('$$next$$', () => '$$next \\tag{2}$$'),
        );
    });

    it('handles multiple display formulas on one line without overlapping edits', () => {
        const source = '$$x$$ text $$y$$';
        const plan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number');
        expect(scanDisplayMathBlocks(source)).toHaveLength(2);
        expect(applyEditsToText(source, plan.edits)).toBe('$$x \\tag{1}$$ text $$y \\tag{2}$$');
    });

    it('takes over numeric tags in the active format and preserves custom tags', () => {
        const exact = '$$x \\tag{1}$$';
        expect(applyEditsToText(exact, planFormulaReconcile(exact, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'clear').edits))
            .toBe('$$x $$');

        expect(applyEditsToText(
            '$$x \\tag{7}$$',
            planFormulaReconcile('$$x \\tag{7}$$', DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'clear').edits,
        )).toBe('$$x $$');

        for (const source of ['$$x \\tag{custom}$$', '$$x \\tag{\\text{custom}}$$']) {
            const plan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'clear');
            expect(plan.edits).toEqual([]);
            expect(plan.ambiguousLines).toEqual([1]);
        }
    });

    it('updates and clears a uniquely owned stale tag', () => {
        const source = '$$x \\tag{7}$$';
        const record: ManagedNumberRecord = {
            elementHash: fingerprintText('x'),
            token: '\\tag{7}',
            configSignature: JSON.stringify({ mode: 'continuous', maxDepth: 4 }),
            leadingSpace: true,
        };
        const updated = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number', [record]);
        expect(applyEditsToText(source, updated.edits)).toBe('$$x \\tag{1}$$');
        const cleared = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'clear', [record]);
        expect(applyEditsToText(source, cleared.edits)).toBe('$$x$$');
    });

    it('ignores frontmatter, code, inline code, tables, escaped and unclosed delimiters', () => {
        const source = [
            '---',
            'sample: $$x$$',
            '---',
            '```tex',
            '$$y$$',
            '```',
            '`$$z$$`',
            '| $$t$$ |',
            '\\$$escaped\\$$',
            '$$open$$$$middle$$',
            '$$unclosed',
        ].join('\n');
        expect(scanDisplayMathBlocks(source)).toEqual([]);
    });

    it('uses physical heading sections for heading-based counters', () => {
        const source = '# First\n$$a$$\n$$b$$\n# Second\n$$c$$';
        const formulaSettings = { ...DEFAULT_MY_FORMULAS_SETTINGS, mode: 'heading-based' as const, maxDepth: 4 };
        const result = applyEditsToText(source, planFormulaReconcile(source, formulaSettings, headingSettings, 'number').edits);
        expect(result).toContain('$$a \\tag{1-1}$$');
        expect(result).toContain('$$b \\tag{1-2}$$');
        expect(result).toContain('$$c \\tag{2-1}$$');
    });

    it('updates an owned heading-based tag in place after a heading-level change', () => {
        const formulaSettings = { ...DEFAULT_MY_FORMULAS_SETTINGS, mode: 'heading-based' as const, maxDepth: 4 };
        const source = '# 1 Parent\n### 1.1 Section\n$$x \\tag{1.1-1}$$';
        const record: ManagedNumberRecord = {
            elementHash: fingerprintText('x'),
            token: '\\tag{1.1-1}',
            configSignature: JSON.stringify({ mode: 'heading-based', maxDepth: 4 }),
            leadingSpace: true,
        };
        const plan = planFormulaReconcile(source, formulaSettings, headingSettings, 'number', [record]);
        const updated = applyEditsToText(source, plan.edits);
        expect(updated).toBe('# 1 Parent\n### 1.1 Section\n$$x \\tag{1.1.1-1}$$');
        expect(updated.match(/\\tag\{/g)).toHaveLength(1);
        expect(planFormulaReconcile(updated, formulaSettings, headingSettings, 'number', plan.records).edits)
            .toEqual([]);
    });

    it('updates a strict unowned tag but preserves multiple tags without adding another tag', () => {
        const formulaSettings = { ...DEFAULT_MY_FORMULAS_SETTINGS, mode: 'heading-based' as const, maxDepth: 4 };
        const single = '# 1 Parent\n### 1.1 Section\n$$x \\tag{1.1-1}$$';
        const singlePlan = planFormulaReconcile(single, formulaSettings, headingSettings, 'number');
        expect(applyEditsToText(single, singlePlan.edits))
            .toBe('# 1 Parent\n### 1.1 Section\n$$x \\tag{1.1.1-1}$$');
        expect(singlePlan.ambiguousLines).toEqual([]);

        const multiple = '# 1 Parent\n### 1.1 Section\n$$x \\tag{1.1-1} \\tag{custom}$$';
        const multiplePlan = planFormulaReconcile(multiple, formulaSettings, headingSettings, 'number');
        expect(multiplePlan.edits).toEqual([]);
        expect(multiplePlan.ambiguousLines).toEqual([3]);
    });

    it('recognizes an old heading-based tag while switching to continuous numbering', () => {
        const oldFormulaSettings = { ...DEFAULT_MY_FORMULAS_SETTINGS, mode: 'heading-based' as const, maxDepth: 4 };
        const source = '# 1 Parent\n## 1.1 Section\n$$x \\tag{1.1-7}$$';
        const plan = planFormulaReconcile(
            source,
            DEFAULT_MY_FORMULAS_SETTINGS,
            headingSettings,
            'number',
            [],
            {
                trigger: 'config-change',
                acceptedFormulaConfigs: [oldFormulaSettings],
                acceptedHeadingConfigs: [headingSettings],
            },
        );
        expect(applyEditsToText(source, plan.edits))
            .toBe('# 1 Parent\n## 1.1 Section\n$$x \\tag{1}$$');
        expect(plan.ambiguousLines).toEqual([]);
    });

    it('does not let a corrupt record signature claim a custom tag', () => {
        const source = '$$x \\tag{legacy}$$';
        const plan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number', [{
            elementHash: fingerprintText('x'),
            token: '\\tag{legacy}',
            configSignature: 'corrupt',
            leadingSpace: true,
        }]);
        expect(plan.edits).toEqual([]);
        expect(plan.ambiguousLines).toEqual([1]);
    });

    it('can merge heading and formula edits planned from the same immutable snapshot', () => {
        const source = '# First\n$$x$$';
        const headingPlan = planHeadingReconcile(source, headingSettings, 'number');
        const formulaPlan = planFormulaReconcile(source, DEFAULT_MY_FORMULAS_SETTINGS, headingSettings, 'number');
        expect(applyEditsToText(source, [...headingPlan.edits, ...formulaPlan.edits]))
            .toBe('# 1 First\n$$x \\tag{1}$$');
    });
});
