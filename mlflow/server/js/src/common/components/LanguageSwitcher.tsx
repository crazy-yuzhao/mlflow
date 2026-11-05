import { Button, Tooltip, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';
import { I18nUtils } from '../../i18n/I18nUtils';
import { isChineseLocale, isEnglishLocale, type UiLocale } from '../../i18n/supportedLocales';

/**
 * Sidebar control for zh-CN / English. Choosing a language persists it and
 * reloads the page so the message catalog is loaded once at startup.
 * Language names stay in their own script so the control is recognizable
 * in either language.
 */
export function LanguageSwitcher({ collapsed }: { collapsed: boolean }) {
  const intl = useIntl();
  const { theme } = useDesignSystemTheme();
  const isChinese = isChineseLocale(intl.locale);
  const isEnglish = isEnglishLocale(intl.locale);
  const languageLabel = intl.formatMessage({
    defaultMessage: 'Language',
    description: 'Accessible label for the language switcher',
  });

  const selectLocale = (locale: UiLocale) => {
    if (locale === 'zh-CN' && isChinese) {
      return;
    }
    if (locale === 'en' && isEnglish) {
      return;
    }
    I18nUtils.setCurrentLocale(locale);
  };

  if (collapsed) {
    return (
      <Tooltip
        componentId="mlflow.sidebar.language.tooltip"
        content={isChinese ? '中文' : 'English'}
        side="right"
        delayDuration={0}
      >
        <Button
          componentId="mlflow.sidebar.language.toggle"
          size="small"
          type="tertiary"
          aria-label={languageLabel}
          onClick={() => selectLocale(isChinese ? 'en' : 'zh-CN')}
          css={{ width: '100%' }}
        >
          {isChinese ? '文' : 'EN'}
        </Button>
      </Tooltip>
    );
  }

  return (
    <div
      role="group"
      aria-label={languageLabel}
      css={{ display: 'flex', gap: theme.spacing.xs, width: '100%', paddingInline: theme.spacing.xs }}
    >
      <Button
        componentId="mlflow.sidebar.language.zh-CN"
        size="small"
        type={isChinese ? 'primary' : 'tertiary'}
        aria-pressed={isChinese}
        onClick={() => selectLocale('zh-CN')}
        css={{ flex: 1, justifyContent: 'center' }}
      >
        中文
      </Button>
      <Button
        componentId="mlflow.sidebar.language.en"
        size="small"
        type={isEnglish ? 'primary' : 'tertiary'}
        aria-pressed={isEnglish}
        onClick={() => selectLocale('en')}
        css={{ flex: 1, justifyContent: 'center' }}
      >
        English
      </Button>
    </div>
  );
}
