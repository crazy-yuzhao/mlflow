/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import React from 'react';
import { createIntl } from 'react-intl';
import { detectBrowserLocale, I18nUtils, useI18nInit } from './I18nUtils';
import { renderHook, waitFor } from '@mlflow/mlflow/src/common/utils/TestUtils.react18';

// see mock for ./loadMessages in setupTests.js

describe('I18nUtils', () => {
  let oldLocation: any;
  const originalLanguages = navigator.languages;
  const originalLanguage = navigator.language;
  const clearPrefCookies = () => {
    document.cookie = 'mlflow_ui_lang=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'mlflow_ui_theme=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  };

  beforeEach(() => {
    oldLocation = window.location;
    localStorage.clear();
    clearPrefCookies();
  });

  afterEach(() => {
    localStorage.clear();
    clearPrefCookies();
    window.location = oldLocation;
    Object.defineProperty(window.navigator, 'languages', { value: originalLanguages, configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: originalLanguage, configurable: true });
  });

  const setQueryLocale = (locale: any) => {
    oldLocation = window.location;
    // @ts-expect-error TS(2790): The operand of a 'delete' operator must be optiona... Remove this comment to see the full error message
    delete window.location;
    // @ts-expect-error TS(2322): Type '{ search: string; }' is not assignable to ty... Remove this comment to see the full error message
    window.location = { search: `?l=${locale}` };
  };

  const setLocalStorageLocale = (locale: any) => {
    localStorage.setItem('locale', locale);
  };

  const setNavigatorLanguages = (languages: string[]) => {
    Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: languages[0] ?? '', configurable: true });
  };

  describe('getCurrentLocale', () => {
    it('should return DEFAULT_LOCALE', () => {
      expect(I18nUtils.getCurrentLocale()).toBe('en');
    });

    it('should prefer locale in l query param over local storage', () => {
      setQueryLocale('fr-CA');
      setLocalStorageLocale('en-US');
      expect(I18nUtils.getCurrentLocale()).toBe('fr-CA');
    });

    it('should not fail for invalid languages', () => {
      const badLocale = 'en_US';
      // example of how it breaks normally
      expect(() => {
        createIntl({ locale: badLocale, defaultLocale: 'en' });
      }).toThrow();

      // we prevent badLocale from getting to creatIntl
      localStorage.setItem('locale', badLocale);
      const locale = I18nUtils.getCurrentLocale();
      expect(locale).toBe('en');
      expect(() => createIntl({ locale, defaultLocale: 'en' })).not.toThrow();
    });

    it('should set locale from query into localStorage', () => {
      setQueryLocale('test-locale');
      expect(I18nUtils.getCurrentLocale()).toBe('test-locale');
    });
    it('should prefer locale from localStorage', () => {
      setLocalStorageLocale('test-locale');
      const locale = I18nUtils.getCurrentLocale();
      expect(locale).toBe('test-locale');
    });

    it('defaults to zh-CN when the browser prefers Chinese and nothing is stored', () => {
      setNavigatorLanguages(['zh-CN', 'en-US']);
      expect(detectBrowserLocale()).toBe('zh-CN');
      expect(I18nUtils.getCurrentLocale()).toBe('zh-CN');
    });

    it('keeps English when the browser prefers English', () => {
      setNavigatorLanguages(['en-US', 'zh-CN']);
      expect(detectBrowserLocale()).toBeNull();
      expect(I18nUtils.getCurrentLocale()).toBe('en');
    });

    it('lets a stored English choice override a Chinese browser', () => {
      setNavigatorLanguages(['zh-CN']);
      setLocalStorageLocale('en');
      expect(I18nUtils.getCurrentLocale()).toBe('en');
    });

    it('treats a generic zh browser language as zh-CN', () => {
      setNavigatorLanguages(['zh']);
      expect(I18nUtils.getCurrentLocale()).toBe('zh-CN');
    });

    it('does not publish a browser language to the login cookie', () => {
      setNavigatorLanguages(['zh-CN', 'en-US']);
      expect(I18nUtils.getCurrentLocale()).toBe('zh-CN');
      expect(document.cookie).not.toContain('mlflow_ui_lang=');
    });

    it('maps a zh login cookie to zh-CN over a stale English locale', () => {
      document.cookie = 'mlflow_ui_lang=zh; Path=/';
      setLocalStorageLocale('en');
      expect(I18nUtils.getCurrentLocale()).toBe('zh-CN');
      expect(localStorage.getItem('locale')).toBe('zh-CN');
    });

    it('maps an en login cookie over a stale zh-CN locale', () => {
      document.cookie = 'mlflow_ui_lang=en; Path=/';
      setLocalStorageLocale('zh-CN');
      expect(I18nUtils.getCurrentLocale()).toBe('en');
      expect(localStorage.getItem('locale')).toBe('en');
    });

    it('publishes a stored English choice to the login cookie', () => {
      setLocalStorageLocale('en');
      expect(I18nUtils.getCurrentLocale()).toBe('en');
      expect(document.cookie).toContain('mlflow_ui_lang=en');
      expect(localStorage.getItem('mlflow_ui_lang')).toBe('en');
    });

    it('keeps en-US when the login cookie is also English', () => {
      document.cookie = 'mlflow_ui_lang=en; Path=/';
      setLocalStorageLocale('en-US');
      expect(I18nUtils.getCurrentLocale()).toBe('en-US');
    });

    it('does not replace an unsupported catalog with the login cookie', () => {
      document.cookie = 'mlflow_ui_lang=zh; Path=/';
      setLocalStorageLocale('de-DE');
      expect(I18nUtils.getCurrentLocale()).toBe('de-DE');
    });
  });

  describe('setCurrentLocale', () => {
    it('persists the locale, drops a stale l query, and reloads', () => {
      const assign = jest.fn();
      delete (window as any).location;
      (window as any).location = {
        href: 'http://localhost:5000/experiments?l=en',
        search: '?l=en',
        assign,
        reload: jest.fn(),
      };

      I18nUtils.setCurrentLocale('zh-CN');

      expect(localStorage.getItem('locale')).toBe('zh-CN');
      expect(localStorage.getItem('mlflow_ui_lang')).toBe('zh');
      expect(document.cookie).toContain('mlflow_ui_lang=zh');
      expect(assign).toHaveBeenCalledWith('http://localhost:5000/experiments');
    });
  });

  describe('loadMessages', () => {
    it('should merge values from locale, fallback locale and default locale', async () => {
      expect(await I18nUtils.loadMessages('fr-CA')).toEqual({
        'fr-CA': 'value',
        'fr-FR': 'value',
        en: 'value',
        'top-locale': 'fr-CA',
      });
      expect(await I18nUtils.loadMessages('pt-BR')).toEqual({
        'pt-BR': 'value',
        'pt-PT': 'value',
        en: 'value',
        'top-locale': 'pt-BR',
      });
      expect(await I18nUtils.loadMessages('en-GB')).toEqual({
        'en-GB': 'value',
        en: 'value',
        'top-locale': 'en-GB',
      });
    });

    it('should fallback to base language then default locale for unknown locales', async () => {
      const frResult = await I18nUtils.loadMessages('fr-unknown'); // special mocked locale
      expect(frResult).toEqual({
        'fr-FR': 'value',
        en: 'value',
        'top-locale': 'fr-FR',
      });

      // no base language falls back to default only
      const zzzResult = await I18nUtils.loadMessages('zzz-unknown'); // special mocked locale
      expect(zzzResult).toEqual({
        en: 'value',
        'top-locale': 'en',
      });
    });
  });

  describe('initI18n', () => {
    it('should make messages available to getIntlProviderParams', async () => {
      setLocalStorageLocale('fr-CA');
      await I18nUtils.initI18n();
      expect(I18nUtils.getIntlProviderParams().messages).toEqual({
        'fr-CA': 'value',
        'fr-FR': 'value',
        en: 'value',
        'top-locale': 'fr-CA',
      });
    });
  });

  describe('useI18nInit', () => {
    const mockLookupFn = jest.fn();

    beforeEach(() => {
      mockLookupFn.mockClear();
    });

    it('waits for loading messages', async () => {
      const { result } = renderHook(() => useI18nInit());

      // Initial call - no messages loaded yet
      expect(result.current).toBe(null);

      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({
            locale: 'en',
            messages: { en: 'value', 'top-locale': 'en' },
          }),
        ),
      );
    });

    it('falls back to the default value when necessary', async () => {
      // choose a different locale for this test
      window.localStorage.setItem('locale', 'de-DE');

      const errorThrown = new Error('failing translation load');

      const originalI18nUtils = { ...I18nUtils };
      jest.spyOn(I18nUtils, 'initI18n').mockRejectedValue(errorThrown);

      const { result } = renderHook(() => useI18nInit());

      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({
            locale: 'de-DE',
            messages: {},
          }),
        ),
      );

      I18nUtils.initI18n = originalI18nUtils.initI18n;
    });
  });
});
