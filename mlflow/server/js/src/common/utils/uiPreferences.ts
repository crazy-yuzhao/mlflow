/**
 * Language and theme preferences shared by the signed-out auth pages and the
 * signed-in React UI.
 *
 * The auth page is server-rendered, so its source of truth is the cookies
 * `mlflow_ui_lang` (`zh` | `en`) and `mlflow_ui_theme` (`light` | `dark`).
 * The signed-in UI keeps its own localStorage keys (`locale`, the dark-mode
 * flag, and `databricks-dark-mode-pref`). Both sides write every key they
 * understand.
 *
 * Keep the cookie names and storage keys aligned with the `REACT_*` constants
 * in `mlflow/server/auth/login_ui.py`.
 */
import { LOCALE_STORAGE_KEY } from '../../i18n/supportedLocales';

export const UI_LANG_COOKIE = 'mlflow_ui_lang';
export const UI_THEME_COOKIE = 'mlflow_ui_theme';

/** Boolean flag read by `useMLflowDarkTheme`. `'true'` is dark, `'false'` is light. */
export const REACT_DARK_MODE_STORAGE_KEY = '_mlflow_dark_mode_toggle_enabled';
/**
 * Named theme read by the bundled design-system bootstrap.
 * Values are `dark` and `light`, same as the login cookie.
 */
export const REACT_NAMED_THEME_STORAGE_KEY = 'databricks-dark-mode-pref';

const PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type LoginLang = 'zh' | 'en';
export type LoginTheme = 'light' | 'dark';
export type SignedInLocale = 'zh-CN' | 'en';

function normalizedToken(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/_/g, '-');
}

/** Map either UI's language value onto the login cookie's `zh` / `en`. */
export function localeToLoginLang(locale: string | null | undefined): LoginLang | null {
  const token = normalizedToken(locale);
  if (!token) {
    return null;
  }
  if (token === 'zh' || token.startsWith('zh-') || token === 'cn' || token === 'chinese') {
    return 'zh';
  }
  if (token === 'en' || token.startsWith('en-') || token === 'english') {
    return 'en';
  }
  return null;
}

/** Map a login cookie (or the same aliases) onto the locale catalog the app loads. */
export function loginLangToLocale(value: string | null | undefined): SignedInLocale | null {
  const lang = localeToLoginLang(value);
  if (lang === 'zh') {
    return 'zh-CN';
  }
  if (lang === 'en') {
    return 'en';
  }
  return null;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) {
      continue;
    }
    const raw = trimmed.slice(prefix.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PREFERENCE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Write the login language cookie. Locales other than Chinese and English are ignored. */
export function publishLoginLanguage(locale: string | null | undefined): void {
  const lang = localeToLoginLang(locale);
  if (!lang) {
    return;
  }
  writeCookie(UI_LANG_COOKIE, lang);
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  window.localStorage.setItem(UI_LANG_COOKIE, lang);
}

/**
 * Login cookie wins when it selects the other of the two supported languages,
 * or when the signed-in UI has no locale yet. A more specific value in the
 * same family (`en-US` with cookie `en`) is kept. Catalogs the login page
 * cannot represent (`de-DE`) are left alone.
 *
 * Returns the locale the app should use, or null when the stored locale stands.
 */
export function localeOverriddenByLoginCookie(): string | null {
  const cookieLocale = loginLangToLocale(readCookie(UI_LANG_COOKIE));
  if (!cookieLocale) {
    return null;
  }
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (!stored) {
    // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
    window.localStorage.setItem(LOCALE_STORAGE_KEY, cookieLocale);
    return cookieLocale;
  }
  const storedLang = localeToLoginLang(stored);
  const cookieLang = localeToLoginLang(cookieLocale);
  if (storedLang && cookieLang && storedLang !== cookieLang) {
    // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
    window.localStorage.setItem(LOCALE_STORAGE_KEY, cookieLocale);
    return cookieLocale;
  }
  return null;
}

/**
 * Explicit theme, if either page has saved one.
 * Cookie first, then the auth-page localStorage key, then the signed-in keys.
 * `null` means nothing was chosen and the caller may follow the system theme.
 */
export function readExplicitTheme(): LoginTheme | null {
  const cookie = readCookie(UI_THEME_COOKIE);
  if (cookie === 'light' || cookie === 'dark') {
    return cookie;
  }
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  const storedLogin = window.localStorage.getItem(UI_THEME_COOKIE);
  if (storedLogin === 'light' || storedLogin === 'dark') {
    return storedLogin;
  }
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  const flag = window.localStorage.getItem(REACT_DARK_MODE_STORAGE_KEY);
  if (flag === 'true') {
    return 'dark';
  }
  if (flag === 'false') {
    return 'light';
  }
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  const named = window.localStorage.getItem(REACT_NAMED_THEME_STORAGE_KEY);
  if (named === 'light' || named === 'dark') {
    return named;
  }
  return null;
}

/** Persist a light/dark choice where both the auth page and the signed-in UI will read it. */
export function publishTheme(theme: LoginTheme): void {
  writeCookie(UI_THEME_COOKIE, theme);
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  window.localStorage.setItem(UI_THEME_COOKIE, theme);
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  window.localStorage.setItem(REACT_DARK_MODE_STORAGE_KEY, theme === 'dark' ? 'true' : 'false');
  // eslint-disable-next-line @databricks/no-direct-storage -- shared with the auth page
  window.localStorage.setItem(REACT_NAMED_THEME_STORAGE_KEY, theme);
}
