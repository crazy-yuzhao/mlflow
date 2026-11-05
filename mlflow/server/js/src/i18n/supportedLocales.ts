/**
 * Locales offered by the in-product language switcher.
 * Native names stay untranslated so either language remains recognizable.
 */
export const UI_LOCALES = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
] as const;

export type UiLocale = (typeof UI_LOCALES)[number]['value'];

export const LOCALE_STORAGE_KEY = 'locale';

export function isChineseLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith('zh');
}

export function isEnglishLocale(locale: string): boolean {
  const normalized = locale.toLowerCase();
  return normalized === 'en' || normalized.startsWith('en-');
}
