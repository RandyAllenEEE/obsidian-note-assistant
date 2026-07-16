import { describe, expect, it } from 'vitest';
import { HeadingsManager } from '../src/headings/manager';
import { FormulasManager } from '../src/formulas/manager';
import { normalizeSettings } from '../src/settings';

function plugin(enabledHeadings: boolean, enabledFormulas: boolean): any {
    const settings = normalizeSettings(null);
    settings.myHeadings.enabled = enabledHeadings;
    settings.myFormulas.enabled = enabledFormulas;
    return {
        settings,
        getOwnershipRecords: () => [],
        setOwnershipRecords: async () => undefined,
    };
}

describe('manager safety gates', () => {
    it('does not even resolve an editor when the corresponding global module is disabled', async () => {
        let workspaceAccesses = 0;
        const app = {
            workspace: {
                getActiveViewOfType: () => {
                    workspaceAccesses++;
                    return undefined;
                },
            },
        } as any;
        const fakePlugin = plugin(false, false);
        const headingResult = await new HeadingsManager(app, fakePlugin).applySettingsToFile(
            { path: 'A.md' } as any,
            fakePlugin.settings.myHeadings,
            'clear',
        );
        const formulaResult = await new FormulasManager(app, fakePlugin).applySettingsToFile(
            { path: 'A.md' } as any,
            fakePlugin.settings.myFormulas,
            'clear',
        );
        expect(headingResult.skipped).toBe(true);
        expect(formulaResult.skipped).toBe(true);
        expect(workspaceAccesses).toBe(0);
    });

    it('never applies a modal action to a different active file', async () => {
        let transactions = 0;
        const app = {
            workspace: {
                getActiveViewOfType: () => ({
                    file: { path: 'B.md' },
                    editor: { transaction: () => transactions++ },
                }),
            },
        } as any;
        const fakePlugin = plugin(true, true);
        const result = await new HeadingsManager(app, fakePlugin).applySettingsToFile(
            { path: 'A.md' } as any,
            fakePlugin.settings.myHeadings,
            'number',
        );
        expect(result.skipped).toBe(true);
        expect(transactions).toBe(0);
    });
});
