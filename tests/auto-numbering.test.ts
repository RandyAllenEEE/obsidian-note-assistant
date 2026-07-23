import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView, noticeMessages } from 'obsidian';
import { AutoNumberingController } from '../src/auto-numbering';
import { DEFAULT_MY_FORMULAS_SETTINGS, DEFAULT_MY_HEADINGS_SETTINGS } from '../src/settings';

type EventCallback = (...args: any[]) => void;

interface HarnessOptions {
    frontmatter?: Record<string, unknown>;
    headingsAuto?: boolean;
    formulasAuto?: boolean;
    formulasEnabled?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
    const workspaceEvents = new Map<string, EventCallback>();
    const metadataEvents = new Map<string, EventCallback>();
    const windowEvents = new Map<string, EventCallback>();
    const file = { path: 'Note.md' };
    const editor = {
        getValue: vi.fn(() => '# Draft'),
        offsetToPos: vi.fn((offset: number) => ({ line: 0, ch: offset })),
        transaction: vi.fn(),
        hasFocus: vi.fn(() => false),
    };
    const view = Object.assign(new MarkdownView(), { file, editor });
    const frontmatter = options.frontmatter ?? {};
    const app = {
        workspace: {
            on: vi.fn((event: string, callback: EventCallback) => {
                workspaceEvents.set(event, callback);
                return { event };
            }),
            offref: vi.fn(),
            getActiveViewOfType: vi.fn(() => view),
            onLayoutReady: vi.fn(),
        },
        metadataCache: {
            on: vi.fn((event: string, callback: EventCallback) => {
                metadataEvents.set(event, callback);
                return { event };
            }),
            offref: vi.fn(),
            getFileCache: vi.fn(() => ({ frontmatter })),
        },
    };
    const plugin = {
        settings: {
            refreshInterval: 100,
            myHeadings: {
                ...structuredClone(DEFAULT_MY_HEADINGS_SETTINGS),
                enabled: true,
                auto: options.headingsAuto ?? true,
            },
            myFormulas: {
                ...structuredClone(DEFAULT_MY_FORMULAS_SETTINGS),
                enabled: options.formulasEnabled ?? false,
                auto: options.formulasAuto ?? false,
            },
        },
    };
    const headingsManager = {
        buildPlan: vi.fn(() => ({ edits: [], ambiguousLines: [] })),
        commitPlan: vi.fn(async () => undefined),
    };
    const formulasManager = {
        buildPlan: vi.fn(() => ({ edits: [], ambiguousLines: [] })),
        commitPlan: vi.fn(async () => undefined),
    };

    window.addEventListener = vi.fn((event: string, callback: EventCallback) => {
        windowEvents.set(event, callback);
    }) as typeof window.addEventListener;
    window.removeEventListener = vi.fn() as typeof window.removeEventListener;
    window.setTimeout = globalThis.setTimeout as typeof window.setTimeout;
    window.clearTimeout = globalThis.clearTimeout as typeof window.clearTimeout;

    const controller = new AutoNumberingController(
        app as never,
        plugin as never,
        headingsManager as never,
        formulasManager as never,
    );
    controller.onload();

    return {
        controller,
        editor,
        file,
        view,
        workspaceEvents,
        metadataEvents,
        windowEvents,
        headingsManager,
        formulasManager,
        plugin,
    };
}

describe('auto-numbering trigger boundaries', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        noticeMessages.length = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('never runs auto numbering from editor or metadata changes before blur', async () => {
        const harness = createHarness();

        harness.workspaceEvents.get('editor-change')?.(harness.editor, harness.view);
        await vi.runAllTimersAsync();
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();

        harness.metadataEvents.get('changed')?.(harness.file);
        await vi.runAllTimersAsync();
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();

        harness.windowEvents.get('blur')?.();
        await vi.advanceTimersByTimeAsync(99);
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'number',
            { trigger: 'auto-blur' },
        );
    });

    it('does not let a none cleanup task run another module auto policy while editing', async () => {
        const harness = createHarness({
            frontmatter: {
                'number headings': 'none, 1-6, 1aA一①1, -:.—-, 011111',
            },
            headingsAuto: false,
            formulasEnabled: true,
            formulasAuto: true,
        });

        harness.workspaceEvents.get('editor-change')?.(harness.editor, harness.view);
        await vi.runAllTimersAsync();
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();
        expect(harness.formulasManager.buildPlan).not.toHaveBeenCalled();

        harness.windowEvents.get('blur')?.();
        await vi.runAllTimersAsync();

        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'clear',
            { trigger: 'auto-blur' },
        );
        expect(harness.formulasManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            expect.anything(),
            'number',
            { trigger: 'auto-blur' },
        );
    });

    it('debounces an enabled auto policy after a global settings change', async () => {
        const harness = createHarness();
        harness.controller.settingsChanged();
        await vi.advanceTimersByTimeAsync(99);
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'number',
            { trigger: 'config-change' },
        );
    });

    it('passes the previous heading format only to the debounced configuration reconcile', async () => {
        const harness = createHarness();
        const previous = {
            firstLevel: harness.plugin.settings.myHeadings.firstLevel,
            maxLevel: harness.plugin.settings.myHeadings.maxLevel,
            headingStyles: [...harness.plugin.settings.myHeadings.headingStyles],
            headingSeparators: [...harness.plugin.settings.myHeadings.headingSeparators],
            headingStartValues: [...harness.plugin.settings.myHeadings.headingStartValues],
            skipHeadings: harness.plugin.settings.myHeadings.skipHeadings,
        };
        harness.plugin.settings.myHeadings.headingSeparators[1] = ':';
        harness.controller.headingConfigurationChanged(previous);

        await vi.advanceTimersByTimeAsync(99);
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'number',
            {
                trigger: 'config-change',
                acceptedHeadingConfigs: [previous],
                acceptedFormulaConfigs: [],
            },
        );
    });

    it('waits for blur when a focused editor changes frontmatter configuration', async () => {
        const frontmatter = {
            'number headings': 'auto, 1-6, 111111, ....., 111111',
        };
        const harness = createHarness({ frontmatter });
        harness.editor.hasFocus.mockReturnValue(true);
        harness.workspaceEvents.get('file-open')?.(harness.file);
        frontmatter['number headings'] = 'auto, 1-6, 111111, :::::, 111111';
        harness.metadataEvents.get('changed')?.(harness.file);
        await vi.runAllTimersAsync();
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();

        harness.editor.hasFocus.mockReturnValue(false);
        harness.windowEvents.get('blur')?.();
        await vi.runAllTimersAsync();
        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'number',
            expect.objectContaining({ trigger: 'config-change' }),
        );
    });

    it('reports all ambiguity in one notice per note and plugin session', () => {
        const harness = createHarness();
        harness.controller.reportAmbiguousOnce('Note.md', [2, 4], [4, 8]);
        harness.controller.reportAmbiguousOnce('Note.md', [10], [12]);
        harness.controller.reportAmbiguousOnce('Other.md', [1], []);
        expect(noticeMessages).toHaveLength(2);
        expect(noticeMessages[0]).toContain('3');
    });
});
