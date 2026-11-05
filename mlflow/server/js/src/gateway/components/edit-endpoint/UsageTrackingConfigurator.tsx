import { Switch, Typography, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

type ComponentIds = 'mlflow.gateway.edit-endpoint.usage-tracking' | 'mlflow.gateway.create-endpoint.usage-tracking';

export interface UsageTrackingConfiguratorProps {
  value: boolean;
  onChange: (value: boolean) => void;
  componentId?: ComponentIds;
}

export const UsageTrackingConfigurator = ({
  value,
  onChange,
  componentId = 'mlflow.gateway.edit-endpoint.usage-tracking',
}: UsageTrackingConfiguratorProps) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <Switch
          componentId={`${componentId}.toggle`}
          checked={value}
          onChange={(checked) => onChange(checked)}
          aria-label={intl.formatMessage({
            defaultMessage: 'Enable usage tracking',
            description: 'Switch that turns endpoint usage tracking on or off',
          })}
        />
        <Typography.Text>
          <FormattedMessage defaultMessage="Enable usage tracking" description="Label for usage tracking toggle" />
        </Typography.Text>
      </div>

      <Typography.Text color="secondary" css={{ fontSize: theme.typography.fontSizeSm }}>
        <FormattedMessage
          defaultMessage="When enabled, all requests to this endpoint will be logged as traces. This allows you to monitor usage, debug issues, and analyze performance."
          description="Usage tracking description"
        />
      </Typography.Text>
    </div>
  );
};
