import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Alert,
  Button,
  Input,
  Modal,
  SimpleSelect,
  SimpleSelectOption,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FieldLabel } from './FieldLabel';
import { LongFormSection } from '../../common/components/long-form/LongFormSection';
import { ConfirmationModal } from '../ConfirmationModal';
import { AdminApi } from '../api';
import { useCreateRole } from '../hooks';
import { useWorkspaces } from '../../workspaces/hooks/useWorkspaces';
import { useWorkspacesEnabled } from '../../experiment-tracking/hooks/useServerInfo';
import {
  ALL_RESOURCE_PATTERN_LABEL,
  DEFAULT_WORKSPACE_NAME,
  formatResourcePattern,
  parseResourcePattern,
  type CreateRoleRequest,
} from '../types';
import { RolePermissionsSection, type StagedRolePermission } from './RolePermissionsSection';
import { RoleUsersSection } from './RoleUsersSection';

export interface CreateRoleModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Single-page modal with three vertical sections (role details + staged
 * permissions + staged user assignments). On submit:
 *   1. Create the role.
 *   2. For each staged permission, addPermission(roleId, ...).
 *   3. For each staged user, assignRole(roleId, username).
 * Best-effort: partial failures are surfaced inline; the role itself
 * always lands first. Mirrors ``CreateUserModal``'s vertical-section
 * shape.
 */
export const CreateRoleModal = ({ open, onClose }: CreateRoleModalProps) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const createRole = useCreateRole();
  const { workspacesEnabled } = useWorkspacesEnabled();
  const { workspaces } = useWorkspaces(workspacesEnabled);

  const [name, setName] = useState('');
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE_NAME);
  // In single-tenant mode there is no workspace dimension — pass ``undefined``
  // to the resource picker so the ``X-MLFLOW-WORKSPACE`` header is omitted
  // (the server rejects any workspace header, including ``default``, when
  // workspaces are disabled). The create request keeps the explicit
  // ``workspace`` body field, which the backend requires in both modes.
  const resourcePickerWorkspace = workspacesEnabled ? workspace : undefined;
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<StagedRolePermission[]>([]);
  const [usernames, setUsernames] = useState<string[]>([]);
  // Reported by ``RolePermissionsSection`` whenever the in-progress draft is
  // dirty. Drives a discard-confirm dialog on ``Create role`` so the admin
  // can't silently abandon a partially-filled permission.
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set after the role lands; lets retries skip ``createRole`` and
  // just re-run the failed best-effort follow-ups.
  const [createdRoleId, setCreatedRoleId] = useState<number | null>(null);

  const workspaceOptions = useMemo(() => {
    const others = new Set<string>();
    for (const w of workspaces) {
      if (w.name !== DEFAULT_WORKSPACE_NAME) others.add(w.name);
    }
    return [DEFAULT_WORKSPACE_NAME, ...Array.from(others).sort()];
  }, [workspaces]);

  useEffect(() => {
    if (open) {
      setName('');
      setWorkspace(DEFAULT_WORKSPACE_NAME);
      setDescription('');
      setPermissions([]);
      setUsernames([]);
      // ``hasUnsavedDraft`` isn't reset here — the ``key={String(open)}`` on
      // ``RolePermissionsSection`` below remounts the section on every open
      // and its first commit-time effect fires ``false`` from the default
      // draft state.
      setShowDiscardConfirm(false);
      setSubmitting(false);
      setError(null);
      setCreatedRoleId(null);
    }
  }, [open]);

  // Retry mode skips the name guard (the field is also disabled).
  const canSubmit = createdRoleId !== null || name.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    // No ``setError(null)`` upfront — would hide/show flicker as the
    // async path resets it. Every branch below replaces or closes.
    const trimmedName = name.trim();
    if (createdRoleId === null && !trimmedName) {
      setError('Role name cannot be empty');
      return;
    }

    setSubmitting(true);

    let roleId = createdRoleId;
    if (roleId === null) {
      try {
        const request: CreateRoleRequest = {
          name: trimmedName,
          workspace,
          description: description || undefined,
        };
        const created = await createRole.mutateAsync(request);
        roleId = created.role.id;
        setCreatedRoleId(roleId);
      } catch (e: any) {
        setError(e?.message || 'Failed to create role');
        setSubmitting(false);
        return;
      }
    }

    // Best-effort: partial failures are surfaced, but the role itself
    // already exists by this point.
    const permFailures: string[] = [];
    for (const p of permissions) {
      try {
        await AdminApi.addPermission({
          role_id: roleId,
          resource_type: p.resourceType,
          resource_pattern: parseResourcePattern(p.resourcePattern),
          permission: p.permission,
        });
      } catch (e: any) {
        permFailures.push(
          `${p.resourceType}:${formatResourcePattern(p.resourcePattern)} → ${p.permission} (${e?.message ?? 'unknown'})`,
        );
      }
    }
    const userFailures: string[] = [];
    for (const u of usernames) {
      try {
        await AdminApi.assignRole(u, roleId);
      } catch (e: any) {
        userFailures.push(`${u} (${e?.message ?? 'unknown'})`);
      }
    }

    if (permFailures.length === 0 && userFailures.length === 0) {
      onClose();
      return;
    }
    setError(
      `Role "${trimmedName}" created, but some follow-ups failed:\n` +
        (permFailures.length > 0 ? `Permissions: ${permFailures.join('; ')}\n` : '') +
        (userFailures.length > 0 ? `Users: ${userFailures.join('; ')}` : '') +
        `\nFinish wiring up the role from the role detail page.`,
    );
    setSubmitting(false);
  }, [name, workspace, description, permissions, usernames, createdRoleId, createRole, onClose]);

  return (
    <Modal
      componentId="admin.create_role_modal"
      title={
        <FormattedMessage defaultMessage="Create Role" description="Title of the dialog that creates an admin role" />
      }
      visible={open}
      onCancel={onClose}
      size="wide"
      footer={
        <div css={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button componentId="admin.create_role_modal.cancel" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            componentId="admin.create_role_modal.submit"
            type="primary"
            // Submit isn't blocked on an unsaved draft — instead we gate on
            // it via a discard-confirm dialog so the admin can either go
            // back and click Add, or knowingly drop the draft and proceed.
            onClick={() => (hasUnsavedDraft ? setShowDiscardConfirm(true) : handleSubmit())}
            loading={submitting}
            disabled={!canSubmit}
          >
            {createdRoleId !== null ? 'Retry failed grants' : 'Create role'}
          </Button>
        </div>
      }
    >
      {error && (
        // Sticky so partial-failure errors stay visible during scroll.
        <Alert
          componentId="admin.create_role_modal.error"
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
          css={{
            marginBottom: theme.spacing.md,
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        />
      )}
      <LongFormSection
        title={
          <FormattedMessage defaultMessage="Role details" description="Section title for role name and description" />
        }
      >
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <div>
            <FieldLabel>
              <FormattedMessage defaultMessage="Name" description="Label for a name field" />
            </FieldLabel>
            <Input
              componentId="admin.create_role_modal.name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter role name',
                description: 'Placeholder for the role name field',
              })}
              autoFocus
              disabled={submitting || createdRoleId !== null}
            />
          </div>
          {workspacesEnabled && (
            <div>
              <FieldLabel>
                <FormattedMessage defaultMessage="Workspace" description="Label for a workspace field" />
              </FieldLabel>
              <SimpleSelect
                id="admin-create-role-modal-workspace"
                componentId="admin.create_role_modal.workspace"
                value={workspace}
                onChange={({ target }) => setWorkspace(target.value)}
                disabled={submitting || createdRoleId !== null}
              >
                {workspaceOptions.map((w) => (
                  <SimpleSelectOption key={w} value={w}>
                    {w}
                  </SimpleSelectOption>
                ))}
              </SimpleSelect>
            </div>
          )}
          <div>
            <FieldLabel>
              <FormattedMessage defaultMessage="Description" description="Label for a description field" />
            </FieldLabel>
            <Input
              componentId="admin.create_role_modal.description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter description (optional)',
                description: 'Placeholder for an optional description field',
              })}
              disabled={submitting || createdRoleId !== null}
            />
          </div>
          <Typography.Paragraph css={{ color: theme.colors.textSecondary, marginTop: theme.spacing.sm }}>
            <FormattedMessage
              defaultMessage="To make this a workspace manager role, add a permission with resource type <strong>workspace</strong>, resource pattern <strong>{pattern}</strong>, and permission <strong>MANAGE</strong> in the next section."
              description="Hint for creating a workspace manager role. workspace and MANAGE are permission identifiers."
              values={{
                pattern: ALL_RESOURCE_PATTERN_LABEL,
                strong: (chunks) => <strong>{chunks}</strong>,
              }}
            />
          </Typography.Paragraph>
        </div>
      </LongFormSection>
      <LongFormSection
        title={<FormattedMessage defaultMessage="Permissions" description="Section title for a list of permissions" />}
        collapsible
        defaultCollapsed
      >
        <Typography.Text color="secondary" css={{ display: 'block', marginBottom: theme.spacing.sm }}>
          Add one or more permissions to this role. You can add more later from the role detail page.
        </Typography.Text>
        {/* ``key={String(open)}`` forces a fresh mount on every reopen so
            the section's internal ``draft`` can't bleed across close →
            reopen. */}
        <RolePermissionsSection
          key={String(open)}
          value={permissions}
          onChange={setPermissions}
          workspace={resourcePickerWorkspace}
          disabled={submitting}
          onUnsavedDraftChange={setHasUnsavedDraft}
        />
      </LongFormSection>
      <LongFormSection
        title={
          <FormattedMessage defaultMessage="Assign users" description="Section title for assigning users to a role" />
        }
        hideDivider
        collapsible
        defaultCollapsed
      >
        <Typography.Text color="secondary" css={{ display: 'block', marginBottom: theme.spacing.sm }}>
          Assign one or more users to this role. You can assign more later from the role detail page.
        </Typography.Text>
        <RoleUsersSection
          value={usernames}
          onChange={setUsernames}
          disabled={submitting}
          workspace={resourcePickerWorkspace}
        />
      </LongFormSection>
      {/* Discard-confirm gate: only intercepts when ``hasUnsavedDraft`` is
          true (any field touched in the permission picker without a
          subsequent ``Add`` or ``Clear``). The dialog is the warning
          surface; submit itself stays enabled so the admin can always
          click through. */}
      <ConfirmationModal
        componentId="admin.create_role_modal.discard_unsaved_draft"
        title={intl.formatMessage({
          defaultMessage: 'Discard unsaved role permission?',
          description: 'Title of the dialog that warns an unsaved role permission will be discarded',
        })}
        visible={showDiscardConfirm}
        message={intl.formatMessage({
          defaultMessage:
            "You started adding a permission to this role but didn't click Add. Continuing will discard it. Go back to either click Add to stage it, or Clear to drop the draft on the spot.",
          description: 'Body of the dialog that warns an unsaved role permission draft will be discarded',
        })}
        okText={intl.formatMessage({
          defaultMessage: 'Continue',
          description: 'Button that continues to the next step',
        })}
        cancelText={intl.formatMessage({
          defaultMessage: 'Back',
          description: 'Button that returns to the previous step',
        })}
        // ``danger=false`` — the OK verb is neutral, destructive intent is
        // in the title's question.
        danger={false}
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          handleSubmit();
        }}
      />
    </Modal>
  );
};
