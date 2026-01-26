import en from './locales/en';
import zh from './locales/zh';

const locales: { [key: string]: { [key: string]: string } } = {
    en,
    zh,
};

const locale = window.localStorage.getItem('language') || 'en';

export function t(str: string): string {
    const lang = locales[locale] || locales['en'];
    return lang[str] || str;
}
