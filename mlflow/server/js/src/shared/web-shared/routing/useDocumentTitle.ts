import { useEffect } from 'react';
import { useIntl } from 'react-intl';

interface UseDocumentTitleProps {
  /** title to be displayed as browser title */
  title?: string;
  /** skip updating the title */
  skip?: boolean;
}

/**
 * Short product name for the browser tab.
 * Chinese locales use 衡鉴; English and every other locale use Hengjian.
 */
export function productNameForLocale(locale: string | undefined): string {
  if (locale && locale.toLowerCase().startsWith('zh')) {
    return '衡鉴';
  }
  return 'Hengjian';
}

export const useDocumentTitle = ({ skip, title }: UseDocumentTitleProps) => {
  const { locale } = useIntl();
  const productName = productNameForLocale(locale);

  useEffect(() => {
    if (skip) {
      return;
    }
    if (document) {
      document.title = title ? `${title} - ${productName}` : productName;
    }

    return () => {
      if (document) {
        document.title = productName;
      }
    };
  }, [productName, skip, title]);
};
