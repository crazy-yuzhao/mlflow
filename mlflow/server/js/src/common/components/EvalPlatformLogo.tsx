import { Typography, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';
import { isChineseLocale } from '../../i18n/supportedLocales';

// Open score gauge: 270° track with the gap at the bottom, filled to a high score.
const GAUGE_RADIUS = 9.6;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const TRACK_DASH = GAUGE_CIRCUMFERENCE * 0.75;
const TRACK_GAP = GAUGE_CIRCUMFERENCE * 0.25;
const SCORE_SWEEP_DEGREES = 211;
const SCORE_DASH = GAUGE_CIRCUMFERENCE * (SCORE_SWEEP_DEGREES / 360);

/**
 * Compact mark for the evaluation platform: a score gauge, a check, and a short wordmark.
 * Replaces the MLflow wordmark in the sidebar header.
 */
export function EvalPlatformLogo() {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const isDark = theme.isDarkMode;
  const tile = isDark ? theme.colors.green800 : theme.colors.green100;
  const track = isDark ? theme.colors.green700 : theme.colors.green200;
  const score = isDark ? theme.colors.green300 : theme.colors.green700;
  const marker = isDark ? theme.colors.yellow300 : theme.colors.yellow500;
  const label = intl.formatMessage({
    defaultMessage: 'Evaluation platform',
    description: 'Accessible name for the evaluation platform logo in the sidebar',
  });
  const wordmark = isChineseLocale(intl.locale) ? '评测' : 'Eval';

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
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" fill={tile} />
        <g fill="none" strokeLinecap="round" transform="rotate(135 16 16)">
          <circle
            cx="16"
            cy="16"
            r={GAUGE_RADIUS}
            stroke={track}
            strokeWidth="2.6"
            strokeDasharray={`${TRACK_DASH} ${TRACK_GAP}`}
          />
          <circle
            cx="16"
            cy="16"
            r={GAUGE_RADIUS}
            stroke={score}
            strokeWidth="2.6"
            strokeDasharray={`${SCORE_DASH} ${GAUGE_CIRCUMFERENCE}`}
          />
        </g>
        {/* Tip of the score arc, just above the right side of the gauge. */}
        <circle cx="25.31" cy="13.68" r="1.7" fill={marker} />
        <path
          d="M12.47 16.17 L15.16 18.62 L19.86 13.24"
          fill="none"
          stroke={score}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <Typography.Text
        bold
        css={{
          fontSize: theme.typography.fontSizeLg,
          lineHeight: `${theme.typography.fontSizeLg}px`,
          color: theme.colors.textPrimary,
        }}
      >
        {wordmark}
      </Typography.Text>
    </span>
  );
}
