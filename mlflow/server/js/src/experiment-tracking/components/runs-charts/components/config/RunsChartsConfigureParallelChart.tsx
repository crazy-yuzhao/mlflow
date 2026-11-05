import { LegacySelect } from '@databricks/design-system';
import { useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { RunsChartsCardConfig, RunsChartsParallelCardConfig } from '../../runs-charts.types';
import { RunsChartsConfigureField } from './RunsChartsConfigure.common';

/**
 * Form containing configuration controls for runs compare charts.
 */
export const RunsChartsConfigureParallelChart = ({
  state,
  onStateChange,
  metricKeyList,
  paramKeyList,
}: {
  metricKeyList: string[];
  paramKeyList: string[];
  state: Partial<RunsChartsParallelCardConfig>;
  onStateChange: (setter: (current: RunsChartsCardConfig) => RunsChartsParallelCardConfig) => void;
}) => {
  /**
   * Callback for updating selected metrics and params
   */

  const updateSelectedParams = useCallback(
    (selectedParams: string[]) => {
      onStateChange((current) => ({
        ...(current as RunsChartsParallelCardConfig),
        selectedParams,
      }));
    },
    [onStateChange],
  );

  const updateSelectedMetrics = useCallback(
    (selectedMetrics: string[]) => {
      onStateChange((current) => ({
        ...(current as RunsChartsParallelCardConfig),
        selectedMetrics,
      }));
    },
    [onStateChange],
  );

  const intl = useIntl();
  const emptyMetricsList = metricKeyList.length === 0;
  const emptyParamsList = paramKeyList.length === 0;

  return (
    <>
      <RunsChartsConfigureField
        title={
          <FormattedMessage
            defaultMessage="Params"
            description="Label for parameters shown on a parallel coordinates chart"
          />
        }
      >
        <LegacySelect
          mode={emptyParamsList ? undefined : 'multiple'}
          onChange={updateSelectedParams}
          style={{
            width: 275,
          }}
          value={
            emptyParamsList
              ? (intl.formatMessage({
                  defaultMessage: 'No parameters available',
                  description: 'Text shown when a parallel coordinates chart has no parameters to select',
                }) as any)
              : state.selectedParams
          }
          disabled={emptyParamsList}
        >
          {paramKeyList.map((param) => (
            <LegacySelect.Option value={param} key={param}>
              {param}
            </LegacySelect.Option>
          ))}
        </LegacySelect>
      </RunsChartsConfigureField>
      <RunsChartsConfigureField
        title={
          <FormattedMessage
            defaultMessage="Metrics"
            description="Label for metrics shown on a parallel coordinates chart"
          />
        }
      >
        <LegacySelect
          mode={emptyMetricsList ? undefined : 'multiple'}
          onChange={updateSelectedMetrics}
          style={{
            width: 275,
          }}
          value={
            emptyMetricsList
              ? (intl.formatMessage({
                  defaultMessage: 'No metrics available',
                  description: 'Text shown in a disabled multi-selector when there are no selectable metrics.',
                }) as any)
              : state.selectedMetrics
          }
          disabled={emptyMetricsList}
        >
          {metricKeyList.map((metric) => (
            <LegacySelect.Option value={metric} key={metric}>
              {metric}
            </LegacySelect.Option>
          ))}
        </LegacySelect>
      </RunsChartsConfigureField>
    </>
  );
};
