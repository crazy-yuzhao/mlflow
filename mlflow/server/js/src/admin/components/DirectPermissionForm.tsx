import { useMemo, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import {
  DialogCombobox,
  DialogComboboxContent,
  DialogComboboxOptionList,
  DialogComboboxOptionListSearch,
  DialogComboboxOptionListSelectItem,
  DialogComboboxTrigger,
  Radio,
  SimpleSelect,
  SimpleSelectOption,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FieldLabel } from './FieldLabel';
import { useResourceOptionsQuery } from '../hooks';
import {
  ResourceRequiredError,
  usePermissionLabel,
  useResourcePickerMessages,
  useResourceTypeLabel,
  WildcardOnlyHint,
} from '../resourceTypeLabels';
import { PERMISSIONS, getGrantablePermissions, isWildcardOnlyResourceType } from '../types';

// Resource types eligible for per-user direct grants. ``workspace`` is excluded
// because the backend's ``grant_user_resource_permission`` rejects it (workspace
// grants are role-only by design — see ``_reject_workspace_resource_type``).
// ``workspace`` is absent by design: the per-user convenience APIs reject it
// (``_reject_workspace_resource_type``) and route workspace-wide grants through
// set_workspace_permission instead. The wildcard-only sub-resource tiers below are
// accepted by those APIs and are granted across the workspace, never per row.
export const DIRECT_GRANT_RESOURCE_TYPES = [
  'experiment',
  'run',
  'trace',
  'assessment',
  'logged_model',
  'review_queue',
  'registered_model',
  'registered_model_version',
  'prompt',
  'prompt_version',
  'scorer',
  'scorer_version',
  'gateway_secret',
  'gateway_endpoint',
  'skill',
] as const;

export type DirectGrantResourceType = (typeof DIRECT_GRANT_RESOURCE_TYPES)[number];

export type DirectPermissionScope = 'specific' | 'all';

export interface DirectPermissionValue {
  resourceType: DirectGrantResourceType;
  scope: DirectPermissionScope;
  resourceId: string;
  permission: string;
}

export interface DirectPermissionFormProps {
  value: DirectPermissionValue;
  onChange: (value: DirectPermissionValue) => void;
  /** Target workspace for the picker query. Lets a platform admin grant in a
   * different workspace than their session-active one. ``undefined`` falls
   * back to the active-workspace header. */
  workspace?: string;
  disabled?: boolean;
  /** Render an inline reminder next to the resource picker. The parent
   * passes ``true`` when the draft has been touched but isn't submittable
   * yet (e.g. resource type changed but no specific resource picked) so
   * the user sees why the section is blocking modal submit. */
  showResourceRequiredError?: boolean;
}

export const DIRECT_PERMISSION_DEFAULT: DirectPermissionValue = {
  resourceType: 'experiment',
  scope: 'specific',
  resourceId: '',
  permission: PERMISSIONS[0],
};

/** Submit when ``scope === 'all'``, or when ``scope === 'specific'`` and the
 * picker has produced a non-empty resource id. */
export const isDirectPermissionSubmittable = (value: DirectPermissionValue): boolean =>
  isWildcardOnlyResourceType(value.resourceType) ||
  value.scope === 'all' ||
  (value.scope === 'specific' && Boolean(value.resourceId));

/**
 * Pick a per-user direct permission. ``resourceId`` only holds the user's
 * specific picked id; the wildcard pattern is derived from ``scope`` at
 * staging time so a resource literally named ``*`` can't masquerade as an
 * all-of-type grant.
 */
export const DirectPermissionForm = ({
  value,
  onChange,
  workspace,
  disabled,
  showResourceRequiredError = false,
}: DirectPermissionFormProps) => {
  const { theme } = useDesignSystemTheme();
  const labelFor = useResourceTypeLabel();
  const permissionLabel = usePermissionLabel();
  const [search, setSearch] = useState('');
  const {
    options: resourceOptions,
    isLoading: resourceOptionsLoading,
    error: resourceOptionsError,
  } = useResourceOptionsQuery(value.resourceType, workspace);

  const filteredOptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return resourceOptions;
    return resourceOptions.filter(
      (o) => o.name.toLowerCase().includes(trimmed) || o.id.toLowerCase().includes(trimmed),
    );
  }, [resourceOptions, search]);

  const selectedOption = resourceOptions.find((o) => o.id === value.resourceId);
  const renderOption = (o: { id: string; name: string }) => (o.name === o.id ? o.name : `${o.name} (${o.id})`);
  const typeLabel = labelFor(value.resourceType);
  const picker = useResourcePickerMessages(typeLabel);
  const wildcardOnly = isWildcardOnlyResourceType(value.resourceType);

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <div>
        <FieldLabel>
          <FormattedMessage defaultMessage="Resource type" description="Label for the resource type of a permission" />
        </FieldLabel>
        <SimpleSelect
          id="admin-direct-permission-resource-type"
          componentId="admin.direct_permission.resource_type"
          value={value.resourceType}
          onChange={({ target }) => {
            const next = target.value as DirectGrantResourceType;
            const nextGrantable = getGrantablePermissions(next);
            const nextPermission = nextGrantable.includes(value.permission) ? value.permission : nextGrantable[0];
            onChange({
              ...value,
              resourceType: next,
              // A wildcard-only tier has no per-row grain; the default draft scope is
              // 'specific', so coerce it or the form would sit on an unreachable scope.
              scope: isWildcardOnlyResourceType(next) ? 'all' : value.scope,
              resourceId: '',
              permission: nextPermission,
            });
          }}
          disabled={disabled}
        >
          {DIRECT_GRANT_RESOURCE_TYPES.map((rt) => (
            <SimpleSelectOption key={rt} value={rt}>
              {labelFor(rt)}
            </SimpleSelectOption>
          ))}
        </SimpleSelect>
      </div>
      <div>
        <FieldLabel>
          <FormattedMessage defaultMessage="Scope" description="Label for the scope of a permission" />
        </FieldLabel>
        <Radio.Group
          componentId="admin.direct_permission.scope"
          name="admin-direct-permission-scope"
          value={value.scope}
          onChange={(e) =>
            onChange({
              ...value,
              scope: e.target.value as DirectPermissionScope,
              resourceId: '',
            })
          }
          layout="vertical"
        >
          <Radio value="specific" disabled={wildcardOnly}>
            {picker.specificScope}
          </Radio>
          <Radio value="all">{picker.allScope}</Radio>
        </Radio.Group>
        {wildcardOnly && (
          <Typography.Text color="secondary" size="sm">
            <WildcardOnlyHint resourceLabel={typeLabel} />
          </Typography.Text>
        )}
      </div>
      {value.scope === 'specific' && !wildcardOnly && (
        <div>
          <FieldLabel>{typeLabel}</FieldLabel>
          {showResourceRequiredError && (
            <Typography.Text
              color="error"
              size="sm"
              css={{ display: 'block', marginBottom: theme.spacing.xs }}
              data-testid="admin.direct_permission.resource_required_error"
            >
              <ResourceRequiredError resourceLabel={typeLabel} />
            </Typography.Text>
          )}
          <DialogCombobox
            componentId="admin.direct_permission.resource_id"
            label={typeLabel}
            value={value.resourceId ? [value.resourceId] : []}
          >
            <DialogComboboxTrigger
              withInlineLabel={false}
              placeholder={picker.selectPlaceholder}
              renderDisplayedValue={() => (selectedOption ? renderOption(selectedOption) : value.resourceId)}
              onClear={() => onChange({ ...value, resourceId: '' })}
              width="100%"
              disabled={disabled}
            />
            <DialogComboboxContent style={{ zIndex: theme.options.zIndexBase + 100 }} loading={resourceOptionsLoading}>
              {resourceOptionsError && (
                <div css={{ padding: theme.spacing.sm, color: theme.colors.textValidationDanger }}>
                  {picker.failedToLoad}
                </div>
              )}
              <DialogComboboxOptionList>
                <DialogComboboxOptionListSearch controlledValue={search} setControlledValue={setSearch}>
                  {filteredOptions.length === 0 && !resourceOptionsLoading ? (
                    <DialogComboboxOptionListSelectItem value="" onChange={() => {}} checked={false} disabled>
                      {search ? picker.noMatchingResults : picker.noResourcesFound}
                    </DialogComboboxOptionListSelectItem>
                  ) : (
                    filteredOptions.map((option) => (
                      <DialogComboboxOptionListSelectItem
                        key={option.id}
                        value={option.id}
                        onChange={(v) => {
                          onChange({ ...value, resourceId: v });
                          setSearch('');
                        }}
                        checked={option.id === value.resourceId}
                      >
                        {renderOption(option)}
                      </DialogComboboxOptionListSelectItem>
                    ))
                  )}
                </DialogComboboxOptionListSearch>
              </DialogComboboxOptionList>
            </DialogComboboxContent>
          </DialogCombobox>
        </div>
      )}
      <div>
        <FieldLabel>
          <FormattedMessage defaultMessage="Permission" description="Label for a permission level" />
        </FieldLabel>
        <SimpleSelect
          id="admin-direct-permission-level"
          componentId="admin.direct_permission.permission_level"
          value={value.permission}
          onChange={({ target }) => onChange({ ...value, permission: target.value })}
          disabled={disabled}
        >
          {getGrantablePermissions(value.resourceType).map((p) => (
            <SimpleSelectOption key={p} value={p}>
              {permissionLabel(p)}
            </SimpleSelectOption>
          ))}
        </SimpleSelect>
      </div>
    </div>
  );
};
