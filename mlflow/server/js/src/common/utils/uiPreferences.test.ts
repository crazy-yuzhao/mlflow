import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  loginLangToLocale,
  localeToLoginLang,
  publishLoginLanguage,
  publishTheme,
  readCookie,
  readExplicitTheme,
} from './uiPreferences';

function clearPrefCookies() {
  document.cookie = 'mlflow_ui_lang=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = 'mlflow_ui_theme=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

describe('ui preference bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    clearPrefCookies();
  });

  it('maps login languages onto the signed-in locales', () => {
    expect(loginLangToLocale('zh')).toBe('zh-CN');
    expect(loginLangToLocale('zh-CN')).toBe('zh-CN');
    expect(loginLangToLocale('ZH_cn')).toBe('zh-CN');
    expect(loginLangToLocale('en')).toBe('en');
    expect(loginLangToLocale('en-US')).toBe('en');
    expect(loginLangToLocale('en_GB')).toBe('en');
    expect(loginLangToLocale('fr')).toBeNull();
    expect(localeToLoginLang('zh-CN')).toBe('zh');
    expect(localeToLoginLang('en-GB')).toBe('en');
    expect(localeToLoginLang('de-DE')).toBeNull();
  });

  it('writes the login language cookie as zh or en', () => {
    publishLoginLanguage('zh-CN');
    expect(readCookie('mlflow_ui_lang')).toBe('zh');
    expect(localStorage.getItem('mlflow_ui_lang')).toBe('zh');

    publishLoginLanguage('en-US');
    expect(readCookie('mlflow_ui_lang')).toBe('en');
    expect(localStorage.getItem('mlflow_ui_lang')).toBe('en');

    publishLoginLanguage('de-DE');
    expect(readCookie('mlflow_ui_lang')).toBe('en');
  });

  it('writes theme cookie light/dark and the signed-in keys', () => {
    publishTheme('dark');
    expect(readCookie('mlflow_ui_theme')).toBe('dark');
    expect(localStorage.getItem('mlflow_ui_theme')).toBe('dark');
    expect(localStorage.getItem('_mlflow_dark_mode_toggle_enabled')).toBe('true');
    expect(localStorage.getItem('databricks-dark-mode-pref')).toBe('dark');
    expect(readExplicitTheme()).toBe('dark');

    publishTheme('light');
    expect(readCookie('mlflow_ui_theme')).toBe('light');
    expect(localStorage.getItem('_mlflow_dark_mode_toggle_enabled')).toBe('false');
    expect(localStorage.getItem('databricks-dark-mode-pref')).toBe('light');
  });

  it('prefers the theme cookie over a stale boolean flag', () => {
    localStorage.setItem('_mlflow_dark_mode_toggle_enabled', 'true');
    localStorage.setItem('databricks-dark-mode-pref', 'dark');
    document.cookie = 'mlflow_ui_theme=light; Path=/';
    expect(readExplicitTheme()).toBe('light');
  });
});
