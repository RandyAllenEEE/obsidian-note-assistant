import * as Obsidian from 'obsidian';
import en from './locales/en';
import zh from './locales/zh';

export type SupportedLocale = 'en' | 'zh';
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;

const locales: Record<SupportedLocale, Record<TranslationKey, string>> = { en, zh };

type ObsidianLanguageApi = typeof Obsidian & { getLanguage?: () => string };

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
    const normalized = value?.trim().replace(/_/g, '-').toLowerCase();
    return normalized === 'zh' || normalized?.startsWith('zh-') ? 'zh' : 'en';
}

export function readObsidianLanguage(): string | undefined {
    try {
        const getLanguage = (Obsidian as ObsidianLanguageApi).getLanguage;
        if (typeof getLanguage === 'function') {
            const language = getLanguage();
            if (typeof language === 'string' && language.trim()) return language;
        }
    } catch {
        // Older and newer Obsidian builds may not expose this optional API.
    }

    try {
        return window.localStorage?.getItem('language') ?? undefined;
    } catch {
        return undefined;
    }
}

export function getCurrentLocale(): SupportedLocale {
    return normalizeLocale(readObsidianLanguage());
}

export function interpolateTranslation(template: string, params: TranslationParams = {}): string {
    return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, key: string) => {
        const value = params[key];
        return value === undefined ? placeholder : String(value);
    });
}

export function t(key: TranslationKey, params?: TranslationParams): string {
    const locale = getCurrentLocale();
    const template = locales[locale][key] ?? en[key];
    return interpolateTranslation(template, params);
}
