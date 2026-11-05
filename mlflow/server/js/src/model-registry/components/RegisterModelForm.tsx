/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import React from 'react';
import { LegacyForm, Input, LegacySelect } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import './RegisterModelForm.css';

const { Option, OptGroup } = LegacySelect;

const ModelNameInput = () => {
  const intl = useIntl();
  return (
    <Input
      componentId="codegen_mlflow_app_src_model-registry_components_registermodelform.tsx_132"
      placeholder={intl.formatMessage({
        defaultMessage: 'Input a model name',
        description: 'Placeholder for the new registered model name',
      })}
    />
  );
};

const CREATE_NEW_MODEL_LABEL = 'Create New Model';
// Include 'CREATE_NEW_MODEL_LABEL' as part of the value for filtering to work properly. Also added
// prefix and postfix to avoid value conflict with actual model names.
export const CREATE_NEW_MODEL_OPTION_VALUE = `$$$__${CREATE_NEW_MODEL_LABEL}__$$$`;
export const SELECTED_MODEL_FIELD = 'selectedModel';
export const MODEL_NAME_FIELD = 'modelName';
const DESCRIPTION_FIELD = 'description';

type Props = {
  modelByName?: any;
  isCopy?: boolean;
  onSearchRegisteredModels: (...args: any[]) => any;
  innerRef: any;
};

type State = any;

export class RegisterModelForm extends React.Component<Props, State> {
  state = {
    selectedModel: null,
  };

  handleModelSelectChange = (selectedModel: any) => {
    this.setState({ selectedModel });
  };

  modelNameValidator = (rule: any, value: any, callback: any) => {
    const { modelByName } = this.props;
    callback(modelByName[value] ? `Model "${value}" already exists.` : undefined);
  };

  handleFilterOption = (input: any, option: any) => {
    const value = (option && option.value) || '';
    return value.toLowerCase().indexOf(input.toLowerCase()) !== -1;
  };

  renderExplanatoryText() {
    const { isCopy } = this.props;
    const { selectedModel } = this.state;
    const creatingNewModel = selectedModel === CREATE_NEW_MODEL_OPTION_VALUE;

    if (!selectedModel || creatingNewModel) {
      return null;
    }

    const explanation = isCopy ? (
      <FormattedMessage
        defaultMessage="The model version will be copied to {selectedModel} as a new version."
        description="Model registry > OSS Promote model modal > copy explanatory text"
        values={{ selectedModel: selectedModel }}
      />
    ) : (
      <FormattedMessage
        defaultMessage="The model will be registered as a new version of {selectedModel}."
        description="Explantory text for registering a model"
        values={{ selectedModel: selectedModel }}
      />
    );

    return (
      <p className="modal-explanatory-text" css={(theme) => ({ color: theme.colors.textSecondary })}>
        {explanation}
      </p>
    );
  }

  renderModel(model: any) {
    return (
      <Option value={model.name} key={model.name}>
        {model.name}
      </Option>
    );
  }
  render() {
    const { modelByName, innerRef, isCopy } = this.props;
    const { selectedModel } = this.state;
    const creatingNewModel = selectedModel === CREATE_NEW_MODEL_OPTION_VALUE;
    return (
      // @ts-expect-error TS(2322): Type '{ children: (Element | null)[]; ref: any; la... Remove this comment to see the full error message
      <LegacyForm ref={innerRef} layout="vertical" className="mlflow-register-model-form">
        {/* "+ Create new model" OR "Select existing model" */}
        <LegacyForm.Item
          label={
            isCopy ? (
              <b>
                <FormattedMessage
                  defaultMessage="Copy to model"
                  description="Label for copying a model into another registered model"
                />
              </b>
            ) : (
              <FormattedMessage defaultMessage="Model" description="Label for selecting a registered model" />
            )
          }
          name={SELECTED_MODEL_FIELD}
          rules={[
            {
              required: true,
              message: (
                <FormattedMessage
                  defaultMessage="Please select a model or create a new one."
                  description="Validation message when no registered model is selected"
                />
              ),
            },
          ]}
        >
          <LegacySelect
            dropdownClassName="mlflow-model-select-dropdown"
            onChange={this.handleModelSelectChange}
            placeholder={
              <FormattedMessage
                defaultMessage="Select a model"
                description="Placeholder for the registered model dropdown"
              />
            }
            filterOption={this.handleFilterOption}
            onSearch={this.props.onSearchRegisteredModels}
            // @ts-expect-error TS(2769): No overload matches this call.
            showSearch
          >
            <Option value={CREATE_NEW_MODEL_OPTION_VALUE} className="mlflow-create-new-model-option">
              <i className="fa fa-plus fa-fw" style={{ fontSize: 13 }} />{' '}
              <FormattedMessage
                defaultMessage="Create New Model"
                description="Dropdown option that starts creating a new registered model"
              />
            </Option>
            <OptGroup
              label={
                <FormattedMessage defaultMessage="Models" description="Group label for existing registered models" />
              }
            >
              {Object.values(modelByName).map((model) => this.renderModel(model))}
            </OptGroup>
          </LegacySelect>
        </LegacyForm.Item>

        {/* Name the new model when "+ Create new model" is selected */}
        {creatingNewModel ? (
          <LegacyForm.Item
            label={
              <FormattedMessage
                defaultMessage="Model Name"
                description="Label for the new registered model name field"
              />
            }
            name={MODEL_NAME_FIELD}
            rules={[
              {
                required: true,
                message: (
                  <FormattedMessage
                    defaultMessage="Please input a name for the new model."
                    description="Validation message when a new registered model has no name"
                  />
                ),
              },
              { validator: this.modelNameValidator },
            ]}
          >
            <ModelNameInput />
          </LegacyForm.Item>
        ) : null}

        {/* Explanatory text shown when existing model is selected */}
        {this.renderExplanatoryText()}
      </LegacyForm>
    );
  }
}
