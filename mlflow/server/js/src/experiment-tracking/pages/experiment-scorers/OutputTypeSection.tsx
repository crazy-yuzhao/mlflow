import React, { useMemo } from 'react';
import type { Control } from 'react-hook-form';
import { Controller, useWatch } from 'react-hook-form';
import {
  useDesignSystemTheme,
  FormUI,
  Input,
  DialogCombobox,
  DialogComboboxContent,
  DialogComboboxOptionList,
  DialogComboboxOptionListSelectItem,
  DialogComboboxHintRow,
  DialogComboboxTrigger,
  Typography,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from '@databricks/i18n';
import { type ScorerFormMode, SCORER_FORM_MODE } from './constants';
import type { LLMScorerFormData } from './LLMScorerFormRenderer';
import type { JudgeOutputTypeKind, JudgePrimitiveOutputType } from './types';

export interface OutputTypeSectionProps {
  mode: ScorerFormMode;
  control: Control<LLMScorerFormData>;
}

// Sample payloads shown beside the type name. They are not labels: categorical choices,
// dictionary keys, and list items are stored as the user typed them.
const CATEGORICAL_OUTPUT_EXAMPLE = 'good/bad/neutral';
const DICTIONARY_OUTPUT_EXAMPLE = '{"clarity": 4, "accuracy": 5}';
const LIST_OUTPUT_EXAMPLE = '["issue1", "issue2"]';

type OutputTypeKindOption = {
  value: JudgeOutputTypeKind;
  label: string;
  hint: string;
};

type PrimitiveTypeOption = {
  value: JudgePrimitiveOutputType;
  label: string;
};

/**
 * Labels and hints only. `value` stays the output-type enum the form submits.
 */
function useOutputTypeOptions(): {
  kindOptions: OutputTypeKindOption[];
  primitiveOptions: PrimitiveTypeOption[];
  kindDisplayMap: Record<string, string>;
  primitiveDisplayMap: Record<string, string>;
} {
  const intl = useIntl();

  return useMemo(() => {
    const primitiveLabels: Record<JudgePrimitiveOutputType, string> = {
      bool: intl.formatMessage({
        defaultMessage: 'Boolean',
        description: 'Label for the boolean judge output type',
      }),
      int: intl.formatMessage({
        defaultMessage: 'Integer',
        description: 'Label for the integer judge output type',
      }),
      float: intl.formatMessage({
        defaultMessage: 'Float',
        description: 'Label for the float judge output type',
      }),
      str: intl.formatMessage({
        defaultMessage: 'String',
        description: 'Label for the string judge output type',
      }),
    };

    const kindOptions: OutputTypeKindOption[] = [
      {
        value: 'default',
        label: intl.formatMessage({
          defaultMessage: 'Default',
          description: 'Label for the automatic judge output type',
        }),
        hint: intl.formatMessage({
          defaultMessage: 'Let the judge determine the output type automatically',
          description: 'Hint for the automatic judge output type',
        }),
      },
      {
        value: 'bool',
        label: primitiveLabels.bool,
        hint: intl.formatMessage({
          defaultMessage: 'Yes/no evaluations (pass/fail)',
          description: 'Hint for the boolean judge output type',
        }),
      },
      {
        value: 'int',
        label: primitiveLabels.int,
        hint: intl.formatMessage({
          defaultMessage: 'Integer ratings (e.g., 1-5 scale)',
          description: 'Hint for the integer judge output type',
        }),
      },
      {
        value: 'float',
        label: primitiveLabels.float,
        hint: intl.formatMessage({
          defaultMessage: 'Floating point scores (e.g., 0.0-1.0)',
          description: 'Hint for the float judge output type',
        }),
      },
      {
        value: 'str',
        label: primitiveLabels.str,
        hint: intl.formatMessage({
          defaultMessage: 'Text responses',
          description: 'Hint for the string judge output type',
        }),
      },
      {
        value: 'categorical',
        label: intl.formatMessage({
          defaultMessage: 'Categorical',
          description: 'Label for the categorical judge output type',
        }),
        hint: intl.formatMessage(
          {
            defaultMessage: 'Fixed set of choices (e.g., {example})',
            description: 'Hint for the categorical judge output type',
          },
          { example: CATEGORICAL_OUTPUT_EXAMPLE },
        ),
      },
      {
        value: 'dict',
        label: intl.formatMessage({
          defaultMessage: 'Dictionary',
          description: 'Label for the dictionary judge output type',
        }),
        hint: intl.formatMessage(
          {
            defaultMessage: 'Key-value pairs (e.g., {example})',
            description: 'Hint for the dictionary judge output type',
          },
          { example: DICTIONARY_OUTPUT_EXAMPLE },
        ),
      },
      {
        value: 'list',
        label: intl.formatMessage({
          defaultMessage: 'List',
          description: 'Label for the list judge output type',
        }),
        hint: intl.formatMessage(
          {
            defaultMessage: 'List of values (e.g., {example})',
            description: 'Hint for the list judge output type',
          },
          { example: LIST_OUTPUT_EXAMPLE },
        ),
      },
    ];

    const primitiveOptions: PrimitiveTypeOption[] = [
      { value: 'bool', label: primitiveLabels.bool },
      { value: 'int', label: primitiveLabels.int },
      { value: 'float', label: primitiveLabels.float },
      { value: 'str', label: primitiveLabels.str },
    ];

    return {
      kindOptions,
      primitiveOptions,
      kindDisplayMap: Object.fromEntries(kindOptions.map((option) => [option.value, option.label])),
      primitiveDisplayMap: Object.fromEntries(primitiveOptions.map((option) => [option.value, option.label])),
    };
  }, [intl]);
}

const OutputTypeSection: React.FC<OutputTypeSectionProps> = ({ mode, control }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const { kindOptions, primitiveOptions, kindDisplayMap, primitiveDisplayMap } = useOutputTypeOptions();
  const outputTypeKind = useWatch({ control, name: 'outputTypeKind' }) ?? 'default';

  const stopPropagationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const isReadOnly = mode === SCORER_FORM_MODE.DISPLAY;
  const showPrimitiveSelector = outputTypeKind === 'dict' || outputTypeKind === 'list';

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {/* Main output type selector with inline primitive type for dict/list */}
      <div css={{ display: 'flex', flexDirection: 'column' }}>
        <FormUI.Label htmlFor="mlflow-experiment-scorers-output-type">
          <FormattedMessage defaultMessage="Output type" description="Section header for judge output type selection" />
        </FormUI.Label>
        <FormUI.Hint>
          <FormattedMessage
            defaultMessage="The type of value the judge will return. Ensure this matches the output format specified in your instructions."
            description="Hint text for output type selection with alignment warning"
          />
        </FormUI.Hint>
        <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <Controller
            name="outputTypeKind"
            control={control}
            render={({ field }) => (
              <div css={{ flex: showPrimitiveSelector ? undefined : 1 }} onClick={stopPropagationClick}>
                <DialogCombobox
                  componentId="mlflow.experiment-scorers.output-type-select"
                  id="mlflow-experiment-scorers-output-type"
                  value={[field.value ?? 'default']}
                >
                  <DialogComboboxTrigger
                    withInlineLabel={false}
                    allowClear={false}
                    disabled={isReadOnly}
                    placeholder={intl.formatMessage({
                      defaultMessage: 'Select output type',
                      description: 'Placeholder for output type selection',
                    })}
                    renderDisplayedValue={(value) => kindDisplayMap[value] || value}
                  />
                  {!isReadOnly && (
                    <DialogComboboxContent maxHeight={350}>
                      <DialogComboboxOptionList>
                        {kindOptions.map((option) => (
                          <DialogComboboxOptionListSelectItem
                            key={option.value}
                            value={option.value}
                            onChange={() => field.onChange(option.value)}
                            checked={
                              field.value === option.value || (field.value === undefined && option.value === 'default')
                            }
                          >
                            {option.label}
                            <DialogComboboxHintRow>{option.hint}</DialogComboboxHintRow>
                          </DialogComboboxOptionListSelectItem>
                        ))}
                      </DialogComboboxOptionList>
                    </DialogComboboxContent>
                  )}
                </DialogCombobox>
              </div>
            )}
          />

          {outputTypeKind === 'dict' && (
            <>
              <Typography.Text color="secondary">
                <FormattedMessage defaultMessage="of" description="Connector between dict and value type" />
              </Typography.Text>
              <Controller
                name="dictValueType"
                control={control}
                render={({ field }) => (
                  <div onClick={stopPropagationClick}>
                    <DialogCombobox
                      componentId="mlflow.experiment-scorers.dict-value-type-select"
                      id="mlflow-experiment-scorers-dict-value-type"
                      value={field.value ? [field.value] : ['int']}
                    >
                      <DialogComboboxTrigger
                        withInlineLabel={false}
                        allowClear={false}
                        disabled={isReadOnly}
                        placeholder={intl.formatMessage({
                          defaultMessage: 'Select value type',
                          description: 'Placeholder for dict value type',
                        })}
                        renderDisplayedValue={(value) => primitiveDisplayMap[value] || value}
                      />
                      {!isReadOnly && (
                        <DialogComboboxContent maxHeight={200}>
                          <DialogComboboxOptionList>
                            {primitiveOptions.map((option) => (
                              <DialogComboboxOptionListSelectItem
                                key={option.value}
                                value={option.value}
                                onChange={() => field.onChange(option.value)}
                                checked={field.value === option.value || (!field.value && option.value === 'int')}
                              >
                                {option.label}
                              </DialogComboboxOptionListSelectItem>
                            ))}
                          </DialogComboboxOptionList>
                        </DialogComboboxContent>
                      )}
                    </DialogCombobox>
                  </div>
                )}
              />
            </>
          )}

          {outputTypeKind === 'list' && (
            <>
              <Typography.Text color="secondary">
                <FormattedMessage defaultMessage="of" description="Connector between list and element type" />
              </Typography.Text>
              <Controller
                name="listElementType"
                control={control}
                render={({ field }) => (
                  <div onClick={stopPropagationClick}>
                    <DialogCombobox
                      componentId="mlflow.experiment-scorers.list-element-type-select"
                      id="mlflow-experiment-scorers-list-element-type"
                      value={field.value ? [field.value] : ['str']}
                    >
                      <DialogComboboxTrigger
                        withInlineLabel={false}
                        allowClear={false}
                        disabled={isReadOnly}
                        placeholder={intl.formatMessage({
                          defaultMessage: 'Select element type',
                          description: 'Placeholder for list element type',
                        })}
                        renderDisplayedValue={(value) => primitiveDisplayMap[value] || value}
                      />
                      {!isReadOnly && (
                        <DialogComboboxContent maxHeight={200}>
                          <DialogComboboxOptionList>
                            {primitiveOptions.map((option) => (
                              <DialogComboboxOptionListSelectItem
                                key={option.value}
                                value={option.value}
                                onChange={() => field.onChange(option.value)}
                                checked={field.value === option.value || (!field.value && option.value === 'str')}
                              >
                                {option.label}
                              </DialogComboboxOptionListSelectItem>
                            ))}
                          </DialogComboboxOptionList>
                        </DialogComboboxContent>
                      )}
                    </DialogCombobox>
                  </div>
                )}
              />
            </>
          )}
        </div>
      </div>

      {/* Categorical options input */}
      {outputTypeKind === 'categorical' && (
        <div css={{ display: 'flex', flexDirection: 'column' }}>
          <FormUI.Label htmlFor="mlflow-experiment-scorers-categorical-options" required>
            <FormattedMessage defaultMessage="Options" description="Label for categorical options input" />
          </FormUI.Label>
          <FormUI.Hint>
            <FormattedMessage
              defaultMessage="Enter the allowed values, one per line."
              description="Hint for categorical options"
            />
          </FormUI.Hint>
          <Controller
            name="categoricalOptions"
            control={control}
            rules={{ required: outputTypeKind === 'categorical' }}
            render={({ field, fieldState }) => (
              <>
                <Input.TextArea
                  {...field}
                  componentId="mlflow.experiment-scorers.categorical-options-input"
                  id="mlflow-experiment-scorers-categorical-options"
                  readOnly={isReadOnly}
                  rows={3}
                  placeholder={'good\nbad\nneutral'}
                  css={{ resize: 'vertical' }}
                  onClick={stopPropagationClick}
                />
                {fieldState.error && <FormUI.Message type="error" message={fieldState.error.message} />}
              </>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default OutputTypeSection;
