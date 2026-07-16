import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
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
    };
}

describe('auto-numbering trigger boundaries', () => {
    beforeEach(() => {
        vi.useFakeTimers();
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

        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'clear',
        );
        expect(harness.formulasManager.buildPlan).not.toHaveBeenCalled();

        harness.headingsManager.buildPlan.mockClear();
        harness.formulasManager.buildPlan.mockClear();
        harness.windowEvents.get('blur')?.();
        await vi.runAllTimersAsync();

        expect(harness.headingsManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            'clear',
        );
        expect(harness.formulasManager.buildPlan).toHaveBeenCalledWith(
            harness.file,
            '# Draft',
            expect.anything(),
            expect.anything(),
            'number',
        );
    });

    it('does not reconcile an auto policy immediately after a global settings change', async () => {
        const harness = createHarness();
        harness.controller.settingsChanged();
        await vi.runAllTimersAsync();
        expect(harness.headingsManager.buildPlan).not.toHaveBeenCalled();
    });
});
