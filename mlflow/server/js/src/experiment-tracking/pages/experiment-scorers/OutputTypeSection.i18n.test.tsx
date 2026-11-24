import { describe, expect, it } from '@jest/globals';
import { DesignSystemProvider } from '@databricks/design-system';
import { IntlProvider } from '@databricks/i18n';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Control } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';
import { compileMessageCatalog } from '../../../i18n/compileMessages';
import zhCatalog from '../../../lang/zh-CN.json';
import supplement from '../../../lang/zh-CN.supplement.json';
import { SCORER_FORM_MODE, type ScorerFormMode } from './constants';
import type { LLMScorerFormData } from './LLMScorerFormRenderer';
import OutputTypeSection from './OutputTypeSection';

const zhMessages = {
  ...compileMessageCatalog(zhCatalog),
  ...compileMessageCatalog(supplement),
};

const OUTPUT_TYPES = [
  {
    value: 'default',
    enLabel: 'Default',
    zhLabel: '默认',
    enHint: 'Let the judge determine the output type automatically',
    zhHint: '由裁判自动确定输出类型',
  },
  {
    value: 'bool',
    enLabel: 'Boolean',
    zhLabel: '布尔',
    enHint: 'Yes/no evaluations (pass/fail)',
    zhHint: '是/否评估（通过/失败）',
  },
  {
    value: 'int',
    enLabel: 'Integer',
    zhLabel: '整数',
    enHint: 'Integer ratings (e.g., 1-5 scale)',
    zhHint: '整数评分（例如 1-5 分）',
  },
  {
    value: 'float',
    enLabel: 'Float',
    zhLabel: '浮点数',
    enHint: 'Floating point scores (e.g., 0.0-1.0)',
    zhHint: '浮点分数（例如 0.0-1.0）',
  },
  {
    value: 'str',
    enLabel: 'String',
    zhLabel: '字符串',
    enHint: 'Text responses',
    zhHint: '文本回复',
  },
  {
    value: 'categorical',
    enLabel: 'Categorical',
    zhLabel: '分类',
    enHint: 'Fixed set of choices (e.g., good/bad/neutral)',
    zhHint: '固定选项（例如 good/bad/neutral）',
  },
  {
    value: 'dict',
    enLabel: 'Dictionary',
    zhLabel: '字典',
    enHint: 'Key-value pairs (e.g., {"clarity": 4, "accuracy": 5})',
    zhHint: '键值对（例如 {"clarity": 4, "accuracy": 5}）',
  },
  {
    value: 'list',
    enLabel: 'List',
    zhLabel: '列表',
    enHint: 'List of values (e.g., ["issue1", "issue2"])',
    zhHint: '值列表（例如 ["issue1", "issue2"]）',
  },
] as const;

const PRIMITIVES = [
  { value: 'bool', enLabel: 'Boolean', zhLabel: '布尔' },
  { value: 'int', enLabel: 'Integer', zhLabel: '整数' },
  { value: 'float', enLabel: 'Float', zhLabel: '浮点数' },
  { value: 'str', enLabel: 'String', zhLabel: '字符串' },
] as const;

type OutputTypeSnapshot = {
  outputTypeKind: string | null;
  dictValueType: string | null;
  listElementType: string | null;
  categoricalOptions: string | null;
};

const emptySnapshot = {
  outputTypeKind: null,
  dictValueType: null,
  listElementType: null,
  categoricalOptions: null,
};

function FormSnapshot({ control }: { control: Control<LLMScorerFormData> }) {
  const outputTypeKind = useWatch({ control, name: 'outputTypeKind' });
  const dictValueType = useWatch({ control, name: 'dictValueType' });
  const listElementType = useWatch({ control, name: 'listElementType' });
  const categoricalOptions = useWatch({ control, name: 'categoricalOptions' });
  const snapshot: OutputTypeSnapshot = {
    outputTypeKind: outputTypeKind ?? null,
    dictValueType: dictValueType ?? null,
    listElementType: listElementType ?? null,
    categoricalOptions: categoricalOptions ?? null,
  };
  return <div data-testid="judge-output-type-values">{JSON.stringify(snapshot)}</div>;
}

function readSnapshot(): OutputTypeSnapshot {
  return JSON.parse(screen.getByTestId('judge-output-type-values').textContent ?? '{}') as OutputTypeSnapshot;
}

function Harness({
  locale,
  messages,
  mode = SCORER_FORM_MODE.CREATE,
  defaultValues,
}: {
  locale: string;
  messages?: Record<string, string>;
  mode?: ScorerFormMode;
  defaultValues?: Partial<LLMScorerFormData>;
}) {
  const form = useForm<LLMScorerFormData>({
    defaultValues: {
      outputTypeKind: 'bool',
      ...defaultValues,
    },
  });

  return (
    <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
      <DesignSystemProvider>
        <FormSnapshot control={form.control} />
        <OutputTypeSection mode={mode} control={form.control} />
      </DesignSystemProvider>
    </IntlProvider>
  );
}

function triggerById(id: string): HTMLElement {
  const trigger = document.getElementById(id);
  if (!trigger) {
    throw new Error(`Missing output type control ${id}`);
  }
  return trigger;
}

function expectTriggerText(id: string, label: string, absent: string) {
  const trigger = triggerById(id);
  expect(trigger).toHaveTextContent(label);
  expect(trigger).not.toHaveTextContent(absent);
}

async function openList(id: string) {
  await userEvent.click(triggerById(id));
  return screen.getByRole('listbox');
}

function optionFor(listbox: HTMLElement, label: string, hint?: string): HTMLElement {
  const match = within(listbox)
    .getAllByRole('option')
    .find((option) => {
      const text = option.textContent ?? '';
      return text.includes(label) && (hint === undefined || text.includes(hint));
    });
  if (!match) {
    throw new Error(`Missing option ${label}${hint ? ` (${hint})` : ''}`);
  }
  return match;
}

async function closeList(id: string) {
  if (screen.queryByRole('listbox')) {
    await userEvent.click(triggerById(id));
  }
}

const locales = [
  {
    id: 'zh-CN',
    locale: 'zh-CN',
    messages: zhMessages,
    labelKey: 'zhLabel',
    hintKey: 'zhHint',
    otherLabelKey: 'enLabel',
    header: '输出类型',
    absentHint: 'Yes/no evaluations',
  },
  {
    id: 'en',
    locale: 'en',
    messages: undefined,
    labelKey: 'enLabel',
    hintKey: 'enHint',
    otherLabelKey: 'zhLabel',
    header: 'Output type',
    absentHint: '是/否评估',
  },
] as const;

describe('LLM judge output type labels', () => {
  it.each(locales)(
    'shows the create default and an empty value in $id',
    ({ locale, messages, labelKey, otherLabelKey, header }) => {
      const { unmount } = render(<Harness locale={locale} messages={messages} />);
      expect(screen.getByText(header)).toBeInTheDocument();
      expectTriggerText(
        'mlflow-experiment-scorers-output-type',
        OUTPUT_TYPES[1][labelKey],
        OUTPUT_TYPES[1][otherLabelKey],
      );
      expect(readSnapshot()).toEqual({ ...emptySnapshot, outputTypeKind: 'bool' });
      unmount();

      render(<Harness locale={locale} messages={messages} defaultValues={{ outputTypeKind: undefined }} />);
      expectTriggerText(
        'mlflow-experiment-scorers-output-type',
        OUTPUT_TYPES[0][labelKey],
        OUTPUT_TYPES[0][otherLabelKey],
      );
      expect(readSnapshot().outputTypeKind).toBeNull();
    },
  );

  it.each(locales)(
    'keeps enum values while showing $id labels, the selected label, and hints',
    async ({ locale, messages, labelKey, hintKey, otherLabelKey, absentHint }) => {
      for (const mode of [SCORER_FORM_MODE.CREATE, SCORER_FORM_MODE.EDIT]) {
        const { unmount } = render(<Harness locale={locale} messages={messages} mode={mode} />);
        const listbox = await openList('mlflow-experiment-scorers-output-type');

        expect(listbox).not.toHaveTextContent(absentHint);
        for (const outputType of OUTPUT_TYPES) {
          const option = optionFor(listbox, outputType[labelKey], outputType[hintKey]);
          expect(option).toHaveTextContent(outputType[hintKey]);
          expect(option).not.toHaveTextContent(outputType[otherLabelKey]);
        }
        expect(within(listbox).getByRole('option', { selected: true })).toHaveTextContent(OUTPUT_TYPES[1][labelKey]);
        await closeList('mlflow-experiment-scorers-output-type');

        for (const outputType of OUTPUT_TYPES) {
          const open = await openList('mlflow-experiment-scorers-output-type');
          await userEvent.click(optionFor(open, outputType[labelKey], outputType[hintKey]));
          expect(readSnapshot().outputTypeKind).toBe(outputType.value);
          expectTriggerText('mlflow-experiment-scorers-output-type', outputType[labelKey], outputType[otherLabelKey]);
          if (outputType.value === 'categorical') {
            expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'good\nbad\nneutral');
          }
        }

        const dictList = await openList('mlflow-experiment-scorers-output-type');
        await userEvent.click(optionFor(dictList, OUTPUT_TYPES[6][labelKey], OUTPUT_TYPES[6][hintKey]));
        expect(readSnapshot()).toMatchObject({ outputTypeKind: 'dict', dictValueType: null });
        expectTriggerText(
          'mlflow-experiment-scorers-dict-value-type',
          PRIMITIVES[1][labelKey],
          PRIMITIVES[1][otherLabelKey],
        );
        const dictOptions = await openList('mlflow-experiment-scorers-dict-value-type');
        for (const primitive of PRIMITIVES) {
          expect(optionFor(dictOptions, primitive[labelKey])).toBeInTheDocument();
          expect(optionFor(dictOptions, primitive[labelKey])).not.toHaveTextContent(primitive[otherLabelKey]);
        }
        await userEvent.click(optionFor(dictOptions, PRIMITIVES[2][labelKey]));
        expect(readSnapshot().dictValueType).toBe('float');
        expectTriggerText(
          'mlflow-experiment-scorers-dict-value-type',
          PRIMITIVES[2][labelKey],
          PRIMITIVES[2][otherLabelKey],
        );

        const listOptions = await openList('mlflow-experiment-scorers-output-type');
        await userEvent.click(optionFor(listOptions, OUTPUT_TYPES[7][labelKey], OUTPUT_TYPES[7][hintKey]));
        expect(readSnapshot()).toMatchObject({ outputTypeKind: 'list', listElementType: null });
        expectTriggerText(
          'mlflow-experiment-scorers-list-element-type',
          PRIMITIVES[3][labelKey],
          PRIMITIVES[3][otherLabelKey],
        );
        const elementOptions = await openList('mlflow-experiment-scorers-list-element-type');
        await userEvent.click(optionFor(elementOptions, PRIMITIVES[0][labelKey]));
        expect(readSnapshot()).toMatchObject({ outputTypeKind: 'list', listElementType: 'bool' });
        expect(readSnapshot().listElementType).not.toBe(PRIMITIVES[0][labelKey]);

        unmount();
      }
    },
  );

  it.each(locales)('shows the saved label in display mode for $id', ({ locale, messages, labelKey, otherLabelKey }) => {
    render(
      <Harness
        locale={locale}
        messages={messages}
        mode={SCORER_FORM_MODE.DISPLAY}
        defaultValues={{ outputTypeKind: 'float' }}
      />,
    );
    expectTriggerText(
      'mlflow-experiment-scorers-output-type',
      OUTPUT_TYPES[3][labelKey],
      OUTPUT_TYPES[3][otherLabelKey],
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(readSnapshot()).toEqual({ ...emptySnapshot, outputTypeKind: 'float' });
  });
});
