import { beforeEach, describe, expect, it, vi } from 'vitest';

const uiState = vi.hoisted(() => ({
    language: 'en',
    strings: [] as string[],
}));

vi.mock('obsidian', () => {
    const component = new Proxy({}, {
        get: () => (...args: unknown[]) => {
            const label = args[1];
            if (typeof label === 'string') uiState.strings.push(label);
            return component;
        },
    });

    class Setting {
        settingEl = { style: {}, appendChild: () => undefined };
        infoEl = { remove: () => undefined };

        constructor(_container?: unknown) {}
        setName(value: string): this { uiState.strings.push(value); return this; }
        setDesc(value: string): this { uiState.strings.push(value); return this; }
        setClass(): this { return this; }
        addToggle(callback: (value: unknown) => void): this { callback(component); return this; }
        addButton(callback: (value: unknown) => void): this { callback(component); return this; }
        addDropdown(callback: (value: unknown) => void): this { callback(component); return this; }
        addSlider(callback: (value: unknown) => void): this { callback(component); return this; }
        addTextArea(callback: (value: unknown) => void): this { callback(component); return this; }
    }

    return {
        Setting,
        getLanguage: () => uiState.language,
        parseFrontMatterEntry: (frontmatter: Record<string, unknown>, key: string) => frontmatter[key],
    };
});

import { renderFormulasSettings } from '../src/formulas/settings-ui';
import { renderHeadingsSettings } from '../src/headings/settings-ui';
import { DEFAULT_MY_FORMULAS_SETTINGS, DEFAULT_MY_HEADINGS_SETTINGS } from '../src/settings';

class FakeElement {
    style: Record<string, string> = {};
    open = false;
    value = '';
    onchange: (() => void) | null = null;

    createEl(_tag: string, options?: { text?: string }): FakeElement {
        if (options?.text) uiState.strings.push(options.text);
        return new FakeElement();
    }

    createDiv(options?: { text?: string }): FakeElement {
        return this.createEl('div', options);
    }

    setText(value: string): void {
        uiState.strings.push(value);
    }
}

function renderSettings(language: string): string[] {
    uiState.language = language;
    uiState.strings = [];
    const headingsManager = {
        plugin: {
            settings: { myHeadings: DEFAULT_MY_HEADINGS_SETTINGS },
            saveSettings: vi.fn(),
        },
    };
    const formulasManager = {
        plugin: {
            settings: { myFormulas: DEFAULT_MY_FORMULAS_SETTINGS },
            saveSettings: vi.fn(),
        },
    };
    renderHeadingsSettings(new FakeElement() as unknown as HTMLElement, headingsManager as never);
    renderFormulasSettings(new FakeElement() as unknown as HTMLElement, formulasManager as never);
    return [...uiState.strings];
}

describe('localized settings rendering', () => {
    beforeEach(() => {
        uiState.strings = [];
        uiState.language = 'en';
    });

    it('renders the English settings surface and the heading case clarification', () => {
        const strings = renderSettings('en');
        expect(strings).toContain('Auto Number Headings');
        expect(strings).toContain('Auto Number Formulas');
        expect(strings).toContain('Editor');
        expect(strings).toContain('Letter case affects numbering only (A, B, C / a, b, c); heading text is never changed.');
    });

    it('renders the Chinese settings surface without stale English labels', () => {
        const strings = renderSettings('zh-TW');
        expect(strings).toContain('自动标题编号');
        expect(strings).toContain('自动公式编号');
        expect(strings).toContain('编辑器');
        expect(strings).toContain('大小写仅影响编号（A、B、C / a、b、c），不会修改标题文字。');
        expect(strings).not.toContain('Auto Number Headings');
        expect(strings).not.toContain('Heading Shifter');
        expect(strings).not.toContain('None');
    });
});
