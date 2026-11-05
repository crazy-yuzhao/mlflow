import { SegmentedControlButton, SegmentedControlGroup } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';

import type { AssessmentValueInputFieldProps } from './types';

export const BooleanInput = ({
  value,
  valueError,
  setValue,
  setValueError,
  isSubmitting,
}: AssessmentValueInputFieldProps) => {
  return (
    <div>
      <SegmentedControlGroup
        data-testid="assessment-value-boolean-input"
        componentId="shared.model-trace-explorer.assessment-value-boolean-input"
        name="shared.model-trace-explorer.assessment-value-boolean-input"
        value={value}
        disabled={isSubmitting}
        onChange={(e) => {
          setValue(e.target.value);
          setValueError(null);
        }}
      >
        <SegmentedControlButton value>
          <FormattedMessage defaultMessage="True" description="Boolean assessment value: true" />
        </SegmentedControlButton>
        <SegmentedControlButton value={false}>
          <FormattedMessage defaultMessage="False" description="Boolean assessment value: false" />
        </SegmentedControlButton>
      </SegmentedControlGroup>
      {valueError && <div css={{ marginTop: '8px', color: 'red' }}>{valueError}</div>}
    </div>
  );
};
