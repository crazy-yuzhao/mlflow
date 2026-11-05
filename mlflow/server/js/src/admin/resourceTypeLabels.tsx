import { useCallback } from 'react';
import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import type { PERMISSIONS, RESOURCE_TYPES } from './types';

/**
 * English labels match ``RESOURCE_TYPE_LABELS``. The picker renders these
 * through react-intl so zh-CN can translate the user-facing names while
 * permission codes (READ, MANAGE) stay technical tokens.
 */
export const RESOURCE_TYPE_LABEL_MESSAGES = {
  experiment: defineMessage({
    defaultMessage: 'Experiment',
    description: 'Admin permission picker label for the experiment resource type',
  }),
  run: defineMessage({
    defaultMessage: 'Run',
    description: 'Admin permission picker label for the run resource type',
  }),
  trace: defineMessage({
    defaultMessage: 'Trace',
    description: 'Admin permission picker label for the trace resource type',
  }),
  assessment: defineMessage({
    defaultMessage: 'Assessment',
    description: 'Admin permission picker label for the assessment resource type',
  }),
  logged_model: defineMessage({
    defaultMessage: 'Logged model',
    description: 'Admin permission picker label for the logged model resource type',
  }),
  review_queue: defineMessage({
    defaultMessage: 'Review queue',
    description: 'Admin permission picker label for the review queue resource type',
  }),
  registered_model: defineMessage({
    defaultMessage: 'Registered model',
    description: 'Admin permission picker label for the registered model resource type',
  }),
  registered_model_version: defineMessage({
    defaultMessage: 'Model version',
    description: 'Admin permission picker label for the model version resource type',
  }),
  prompt: defineMessage({
    defaultMessage: 'Prompt',
    description: 'Admin permission picker label for the prompt resource type',
  }),
  prompt_version: defineMessage({
    defaultMessage: 'Prompt version',
    description: 'Admin permission picker label for the prompt version resource type',
  }),
  scorer: defineMessage({
    defaultMessage: 'Scorer',
    description: 'Admin permission picker label for the scorer resource type',
  }),
  scorer_version: defineMessage({
    defaultMessage: 'Scorer version',
    description: 'Admin permission picker label for the scorer version resource type',
  }),
  gateway_secret: defineMessage({
    defaultMessage: 'LLM connection',
    description: 'Admin permission picker label for the LLM connection resource type',
  }),
  gateway_endpoint: defineMessage({
    defaultMessage: 'LLM endpoint',
    description: 'Admin permission picker label for the LLM endpoint resource type',
  }),
  mcp_server: defineMessage({
    defaultMessage: 'MCP server',
    description: 'Admin permission picker label for the MCP server resource type',
  }),
  mcp_server_version: defineMessage({
    defaultMessage: 'MCP server version',
    description: 'Admin permission picker label for the MCP server version resource type',
  }),
  skill: defineMessage({
    defaultMessage: 'Skill',
    description: 'Admin permission picker label for the skill resource type',
  }),
  workspace: defineMessage({
    defaultMessage: 'Workspace',
    description: 'Admin permission picker label for the workspace resource type',
  }),
} satisfies Record<(typeof RESOURCE_TYPES)[number], MessageDescriptor>;

const SPECIFIC_RESOURCE_SCOPE = defineMessage({
  defaultMessage: 'Specific {resource}',
  description: 'Radio option for a permission scoped to one resource of this type',
});

const ALL_RESOURCES_SCOPE = defineMessage({
  defaultMessage: 'All {resource}s',
  description: 'Radio option for a permission scoped to every resource of this type',
});

const SELECT_RESOURCE_PLACEHOLDER = defineMessage({
  defaultMessage: 'Select {resource}',
  description: 'Placeholder for choosing one resource of the given type',
});

const FAILED_TO_LOAD_RESOURCES = defineMessage({
  defaultMessage: 'Failed to load {resource}s',
  description: 'Error shown when the resource picker cannot load options',
});

const NO_MATCHING_RESULTS = defineMessage({
  defaultMessage: 'No matching results',
  description: 'Empty state when a resource search has no matches',
});

const NO_RESOURCES_FOUND = defineMessage({
  defaultMessage: 'No resources found',
  description: 'Empty state when a resource type has nothing to pick',
});

/**
 * Display labels for permission levels. The select value and the API payload
 * stay the English code (`READ`, `EDIT`, `MANAGE`, `DENY`, `USE`).
 */
export const PERMISSION_LABEL_MESSAGES = {
  READ: defineMessage({
    defaultMessage: 'READ',
    description: 'Admin permission picker label for the READ permission level',
  }),
  USE: defineMessage({
    defaultMessage: 'USE',
    description: 'Admin permission picker label for the USE permission level',
  }),
  EDIT: defineMessage({
    defaultMessage: 'EDIT',
    description: 'Admin permission picker label for the EDIT permission level',
  }),
  MANAGE: defineMessage({
    defaultMessage: 'MANAGE',
    description: 'Admin permission picker label for the MANAGE permission level',
  }),
  DENY: defineMessage({
    defaultMessage: 'DENY',
    description: 'Admin permission picker label for the DENY permission level',
  }),
} satisfies Record<(typeof PERMISSIONS)[number], MessageDescriptor>;

export function usePermissionLabel() {
  const intl = useIntl();
  return useCallback(
    (permission: string) => {
      const descriptor = PERMISSION_LABEL_MESSAGES[permission as (typeof PERMISSIONS)[number]];
      return descriptor ? intl.formatMessage(descriptor) : permission;
    },
    [intl],
  );
}

export function useResourceTypeLabel() {
  const intl = useIntl();
  return useCallback(
    (resourceType: string) => {
      const descriptor = RESOURCE_TYPE_LABEL_MESSAGES[resourceType as (typeof RESOURCE_TYPES)[number]];
      return descriptor ? intl.formatMessage(descriptor) : resourceType;
    },
    [intl],
  );
}

/** Scope radios, placeholder, and empty states that embed the resource label. */
export function useResourcePickerMessages(typeLabel: string) {
  const intl = useIntl();
  const resource = typeLabel.toLowerCase();
  return {
    specificScope: intl.formatMessage(SPECIFIC_RESOURCE_SCOPE, { resource }),
    allScope: intl.formatMessage(ALL_RESOURCES_SCOPE, { resource }),
    selectPlaceholder: intl.formatMessage(SELECT_RESOURCE_PLACEHOLDER, { resource }),
    failedToLoad: intl.formatMessage(FAILED_TO_LOAD_RESOURCES, { resource }),
    noMatchingResults: intl.formatMessage(NO_MATCHING_RESULTS),
    noResourcesFound: intl.formatMessage(NO_RESOURCES_FOUND),
  };
}

export function WildcardOnlyHint({ resourceLabel }: { resourceLabel: string }) {
  return (
    <FormattedMessage
      defaultMessage="{resourceLabel} grants are workspace-wide — they cannot target one {resource}."
      description="Hint that this resource type can only be granted across the whole workspace"
      values={{
        resourceLabel,
        resource: resourceLabel.toLowerCase(),
      }}
    />
  );
}

export function ResourceRequiredError({ resourceLabel }: { resourceLabel: string }) {
  return (
    <FormattedMessage
      defaultMessage="Select a specific {resource} or switch the scope to <strong>All {resource}s</strong> before submitting."
      description="Error shown when a specific resource has not been chosen for a permission"
      values={{
        resource: resourceLabel.toLowerCase(),
        strong: (chunks) => <strong>{chunks}</strong>,
      }}
    />
  );
}
