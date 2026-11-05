/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

/**
 * This file separates message loading from locale selection so tests can mock it.
 * English has no catalog: react-intl renders each call's `defaultMessage`.
 * Other locales load `src/lang/<locale>.json` and, when present, a generated
 * supplement of strings that are not in that synced catalog yet.
 * The supplement lives next to the other catalogs, outside `src/i18n/`,
 * because the FormatJS compile loader rewrites every JSON file under `src/i18n/`.
 */
import { compileMessageCatalog } from './compileMessages';

export const DEFAULT_LOCALE = 'en';

async function loadLocaleCatalog(locale: string): Promise<unknown> {
  if (locale === 'zh-CN') {
    return (await import('../lang/zh-CN.json')).default;
  }
  return null;
}

async function loadLocaleSupplement(locale: string): Promise<unknown> {
  if (locale === 'zh-CN') {
    return (await import('../lang/zh-CN.supplement.json')).default;
  }
  return null;
}

export async function loadMessages(locale: string): Promise<Record<string, string>> {
  // No compiled messages for the default locale — react-intl renders the
  // inline `defaultMessage` from each <FormattedMessage> / formatMessage call.
  if (locale === DEFAULT_LOCALE) {
    return {};
  }

  try {
    const catalog = await loadLocaleCatalog(locale);
    if (!catalog) {
      return {};
    }
    const compiled = compileMessageCatalog(catalog);
    const supplement = await loadLocaleSupplement(locale);
    if (supplement) {
      // Generated supplement fills ids missing from the synced catalog and may
      // replace a few synced strings that were left in English (for example
      // the sidebar "Endpoints" label).
      Object.assign(compiled, compileMessageCatalog(supplement));
    }
    return compiled;
  } catch (e) {
    return {};
  }
}
