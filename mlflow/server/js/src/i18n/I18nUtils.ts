/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import type { IntlShape } from 'react-intl';
import { createIntlCache, createIntl } from 'react-intl';
import { DEFAULT_LOCALE, loadMessages } from './loadMessages';
import { useEffect, useState } from 'react';
import { LOCALE_STORAGE_KEY } from './supportedLocales';

// eslint-disable-next-line @databricks/no-const-object-record-string -- TODO(FEINF-2058)
const FALLBACK_LOCALES: Record<string, string> = {
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-PT',
  ja: 'ja-JP',
  kr: 'kr-KR',
  it: 'it-IT',
  de: 'de-DE',
  zh: 'zh-CN',
};

const loadedMessages: Record<string, any> = {};

const cache = createIntlCache();

function handleIntlError(error: { code: string }) {
  // Missing keys render `defaultMessage` (English). Don't flood the console
  // for the parts of the UI that are not translated yet.
  if (error.code === 'MISSING_TRANSLATION') {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(error);
}

/**
 * Use the browser language only when the user has not chosen a locale.
 * Chinese browsers default to zh-CN. Every other language stays on English
 * so existing English-only sessions are unchanged.
 */
export function detectBrowserLocale(): string | null {
  if (typeof navigator === 'undefined') {
    return null;
  }
  const candidates = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    if (normalized === 'zh' || normalized.startsWith('zh-')) {
      return 'zh-CN';
    }
    // The first language we can actually offer wins. English stops the search
    // so a later Chinese entry does not override an English preference.
    if (normalized === 'en' || normalized.startsWith('en-')) {
      return null;
    }
  }
  return null;
}

export const I18nUtils = {
  async initI18n() {
    const locale = I18nUtils.getCurrentLocale();
    await I18nUtils.loadMessages(locale);
    return I18nUtils.createIntlWithLocale();
  },

  getIntlProviderParams() {
    const locale = I18nUtils.getCurrentLocale();
    return {
      locale,
      messages: loadedMessages[locale] || {},
    };
  },

  /**
   * When intl object is used entirely outside of React (e.g., Backbone Views) then
   * this method can be used to get the intl object.
   */
  createIntlWithLocale() {
    const params = I18nUtils.getIntlProviderParams();
    const intl = createIntl(
      {
        locale: params.locale,
        defaultLocale: DEFAULT_LOCALE,
        messages: params.messages,
        onError: handleIntlError,
      },
      cache,
    );

    return intl;
  },

  getCurrentLocale() {
    const queryParams = new URLSearchParams(window.location.search);
    const getLocale = () => {
      const langFromQuery = queryParams.get('l');
      if (langFromQuery) {
        // eslint-disable-next-line @databricks/no-direct-storage -- go/no-direct-storage
        window.localStorage.setItem(LOCALE_STORAGE_KEY, langFromQuery);
      }
      // An explicit choice (including English) wins over the browser language.
      // eslint-disable-next-line @databricks/no-direct-storage -- go/no-direct-storage
      return window.localStorage.getItem(LOCALE_STORAGE_KEY) || detectBrowserLocale() || DEFAULT_LOCALE;
    };
    const locale = getLocale();

    // _ in the locale causes createIntl to throw, so convert to default locale
    if (locale.includes('_')) {
      return DEFAULT_LOCALE;
    }
    return locale;
  },

  /**
   * Persist a locale and reload. Reloading is required because message catalogs
   * are loaded once at startup. A stale `?l=` query is removed so it cannot
   * override the choice on the next load.
   */
  setCurrentLocale(locale: string) {
    // eslint-disable-next-line @databricks/no-direct-storage -- go/no-direct-storage
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    const url = new URL(window.location.href);
    url.searchParams.delete('l');
    const next = url.toString();
    if (next === window.location.href) {
      window.location.reload();
      return;
    }
    window.location.assign(next);
  },

  /* Gets the locale to fall back on if messages are missing */
  getFallbackLocale(locale: string) {
    const lang = locale.split('-')[0];
    const fallback = FALLBACK_LOCALES[lang];
    return fallback === lang ? undefined : fallback;
  },

  async loadMessages(locale: string) {
    const locales = [
      locale === DEFAULT_LOCALE ? undefined : DEFAULT_LOCALE,
      I18nUtils.getFallbackLocale(locale),
      locale,
    ].filter((value): value is string => Boolean(value));
    const results = await Promise.all(locales.map((localeToLoad) => loadMessages(localeToLoad)));
    loadedMessages[locale] = Object.assign({}, ...results);
    return loadedMessages[locale];
  },
};

/**
 * Ensure initialization of i18n subsystem and return
 * an object with current locale and messages storage.
 *
 * The returned value will be null before initialization.
 *
 * This hook is intended to be used once in the top-level components.
 */
export const useI18nInit = () => {
  const [intl, setIntl] = useState<IntlShape | null>(null);
  useEffect(() => {
    I18nUtils.initI18n()
      .then((initializedIntlState) => {
        setIntl(initializedIntlState);
      })
      .catch((error) => {
        // Fall back to the defaults if loading translation fails
        setIntl(I18nUtils.createIntlWithLocale());
      });
  }, []);

  return intl;
};
