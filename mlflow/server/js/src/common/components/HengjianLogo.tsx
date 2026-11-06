import { Typography, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';
import { isChineseLocale } from '../../i18n/supportedLocales';

// Geometry is the hexagon mark from the 衡鉴 brand SVG (bars, check, accent, arc).
// Strokes use non-scaling pixels so the outline stays readable at the 32px sidebar size.
// The wide wordmark and "AGENT EVALUATION PLATFORM" subtitle are omitted on purpose.
const MARK_VIEW_BOX = '4 1 66 76';

// The source greens (#38574B / #142320) disappear on a dark sidebar. Light mode keeps
// the brand colors; dark mode uses the same hues lifted toward the light text color.
const BRAND_COLORS = {
  light: {
    structure: '#38574B',
    check: '#142320',
    accent: '#EF8664',
    arc: '#BDD84E',
  },
  dark: {
    structure: '#D5E3DB',
    check: '#F4F7F5',
    accent: '#F4A07E',
    arc: '#D4E86A',
  },
} as const;

/**
 * Compact 衡鉴 mark and short wordmark for the signed-in sidebar header.
 */
export function HengjianLogo() {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const colors = theme.isDarkMode ? BRAND_COLORS.dark : BRAND_COLORS.light;
  const label = intl.formatMessage({
    defaultMessage: 'Hengjian',
    description: 'Accessible name for the Hengjian logo in the sidebar',
  });
  const wordmark = isChineseLocale(intl.locale) ? '衡鉴' : 'Hengjian';

  return (
    <span
      role="img"
      aria-label={label}
      css={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minWidth: 0,
        color: theme.colors.textPrimary,
      }}
    >
      <svg width="28" height="32" viewBox={MARK_VIEW_BOX} aria-hidden="true" focusable="false">
        <path
          d="M37 2.8 68.2 20.8v36.4L37 75.2 5.8 57.2V20.8L37 2.8Z"
          fill="none"
          stroke={colors.structure}
          strokeWidth="1.35"
          vectorEffect="non-scaling-stroke"
        />
        <path d="M20 44.5h8v9h-8zm13-14h8v23h-8zm13-11h8v34h-8" fill={colors.structure} />
        <path
          d="m17 27 8 7.5 13-12"
          fill="none"
          stroke={colors.check}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="58.5" cy="17" r="3.3" fill={colors.accent} />
        <path
          d="M55 58.5 37 69 19 58.5"
          fill="none"
          stroke={colors.arc}
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Typography.Text
        bold
        css={{
          fontSize: theme.typography.fontSizeLg,
          lineHeight: `${theme.typography.fontSizeLg}px`,
          color: theme.colors.textPrimary,
          whiteSpace: 'nowrap',
        }}
      >
        {wordmark}
      </Typography.Text>
    </span>
  );
}
