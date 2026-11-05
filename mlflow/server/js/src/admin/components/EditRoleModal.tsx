import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Alert,
  Button,
  ChevronLeftIcon,
  Input,
  Modal,
  Spinner,
  Tag,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FieldLabel } from './FieldLabel';
import { LongFormSection } from '../../common/components/long-form/LongFormSection';
import { ConfirmationModal } from '../ConfirmationModal';
import {
  useAddPermission,
  useAssignRole,
  useRemovePermission,
  useRoleDetailQuery,
  useRoleUsersQuery,
  useUnassignRole,
  useUpdateRole,
  useUsersQuery,
} from '../hooks';
import { useWorkspacesEnabled } from '../../experiment-tracking/hooks/useServerInfo';
import { formatResourcePattern, parseResourcePattern } from '../types';
import { RolePermissionsSection, type StagedRolePermission } from './RolePermissionsSection';
import { RoleUsersSection } from './RoleUsersSection';

export interface EditRoleModalProps {
  open: boolean;
  onClose: () => void;
  roleId: number;
}

const permTripleKey = (p: { resourceType: string; resourcePattern: string; permission: string }) =>
  `${p.resourceType}::${p.resourcePattern}::${p.permission}`;

interface RoleDiff {
  nameChange: string | null;
  descriptionChange: string | null;
  permissionsToAdd: StagedRolePermission[];
  permissionIdsToRemove: number[];
  usersToAssign: string[];
  usersToUnassign: string[];
}

/**
 * Edit-style modal for managing one role end-to-end. Pre-fills name,
 * description, current permissions, and current user assignments;
 * compute a diff on submit; surface every add/remove in the Review
 * step before applying. Mirrors ``EditAccessModal``'s shape.
 *
 * Workspace is *not* editable on existing roles — the backend
 * ``UpdateRoleRequest`` only accepts ``name`` and ``description`` — so
 * the workspace renders read-only with a hint.
 */
export const EditRoleModal = ({ open, onClose, roleId }: EditRoleModalProps) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const updateRole = useUpdateRole(roleId);
  const addPermission = useAddPermission(roleId);
  const removePermission = useRemovePermission(roleId);
  const assignRole = useAssignRole(roleId);
  const unassignRole = useUnassignRole(roleId);

  // --- Current state from backend ---
  const { data: roleData, isLoading: roleLoading } = useRoleDetailQuery(roleId);
  const { data: assignmentsData, isLoading: assignmentsLoading } = useRoleUsersQuery(roleId);
  const { workspacesEnabled } = useWorkspacesEnabled();
  const { data: usersData, isLoading: usersLoading } = useUsersQuery(
    workspacesEnabled ? roleData?.role?.workspace : undefined,
  );

  const userIdToUsername = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of usersData?.users ?? []) m.set(u.id, u.username);
    return m;
  }, [usersData]);

  const currentName = roleData?.role?.name ?? '';
  const currentDescription = roleData?.role?.description ?? '';
  const currentWorkspace = roleData?.role?.workspace ?? '';
  // In single-tenant mode there is no workspace dimension — pass ``undefined``
  // to the resource picker so the ``X-MLFLOW-WORKSPACE`` header is omitted
  // (the server rejects any workspace header, including ``default``, when
  // workspaces are disabled).
  const resourcePickerWorkspace = workspacesEnabled ? currentWorkspace : undefined;

  const currentPermissions = useMemo<StagedRolePermission[]>(() => {
    return (roleData?.role?.permissions ?? []).map((p) => ({
      id: p.id,
      resourceType: p.resource_type,
      // Display the user-facing "all" label so dedup against newly-typed
      // entries (which also carry the label) lines up.
      resourcePattern: formatResourcePattern(p.resource_pattern),
      permission: p.permission,
    }));
  }, [roleData]);

  const currentUsernames = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const a of assignmentsData?.assignments ?? []) {
      const u = userIdToUsername.get(a.user_id);
      if (u) set.add(u);
    }
    return Array.from(set).sort();
  }, [assignmentsData, userIdToUsername]);

  // --- Editable state ---
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<StagedRolePermission[]>([]);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reported by ``RolePermissionsSection`` whenever the in-progress draft
  // is dirty. Drives a discard-confirm dialog on ``Review changes`` so the
  // admin can't silently abandon a partially-filled permission.
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const stateLoaded = !roleLoading && !assignmentsLoading && !usersLoading;

  // ``prefilledRef`` gates the data-fill effect against background
  // refetches that would clobber in-progress edits.
  const prefilledRef = useRef(false);

  // Reset transient UI state only on open — refetches must not bounce
  // the user back to edit or wipe a partial-failure error.
  useEffect(() => {
    if (!open) {
      return;
    }
    setStep('edit');
    setSubmitting(false);
    setError(null);
    // ``hasUnsavedDraft`` isn't reset here — the ``key={String(open)}`` on
    // ``RolePermissionsSection`` below remounts the section on every open.
    setShowDiscardConfirm(false);
    prefilledRef.current = false;
  }, [open]);

  // Pre-fill editable fields once per open, after backing queries resolve.
  useEffect(() => {
    if (!open) {
      prefilledRef.current = false;
      return;
    }
    if (prefilledRef.current || !stateLoaded) {
      return;
    }
    setName(currentName);
    setDescription(currentDescription);
    setPermissions([...currentPermissions]);
    setUsernames([...currentUsernames]);
    prefilledRef.current = true;
  }, [open, stateLoaded, currentName, currentDescription, currentPermissions, currentUsernames]);

  // --- Diff ---
  const diff = useMemo<RoleDiff>(() => {
    const trimmedName = name.trim();
    const nameChange = trimmedName !== currentName.trim() && trimmedName.length > 0 ? trimmedName : null;
    // Empty description is meaningful (clears it); only ``null`` means "no change".
    const descriptionChange = description !== currentDescription ? description : null;

    const desiredKeys = new Set(permissions.map(permTripleKey));
    const permissionsToAdd = permissions.filter((p) => p.id == null);
    const permissionIdsToRemove = currentPermissions
      .filter((p) => p.id != null && !desiredKeys.has(permTripleKey(p)))
      .map((p) => p.id as number);

    const desiredUsernameSet = new Set(usernames);
    const currentUsernameSet = new Set(currentUsernames);
    const usersToAssign = usernames.filter((u) => !currentUsernameSet.has(u));
    const usersToUnassign = currentUsernames.filter((u) => !desiredUsernameSet.has(u));

    return { nameChange, descriptionChange, permissionsToAdd, permissionIdsToRemove, usersToAssign, usersToUnassign };
  }, [
    name,
    description,
    permissions,
    usernames,
    currentName,
    currentDescription,
    currentPermissions,
    currentUsernames,
  ]);

  const hasAnyChange =
    diff.nameChange !== null ||
    diff.descriptionChange !== null ||
    diff.permissionsToAdd.length > 0 ||
    diff.permissionIdsToRemove.length > 0 ||
    diff.usersToAssign.length > 0 ||
    diff.usersToUnassign.length > 0;

  // Map permissionId → (type, pattern, permission) for the Review step's
  // human label of removals. (We can't read it directly off ``diff``
  // because the diff carries only the id.)
  const permissionByIdLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of currentPermissions) {
      if (p.id != null) {
        m.set(p.id, `${p.resourceType}:${p.resourcePattern} → ${p.permission}`);
      }
    }
    return m;
  }, [currentPermissions]);

  const handleConfirm = useCallback(async () => {
    // ``error`` is already cleared by the "Review changes" transition;
    // skipping a redundant reset here also avoids the flicker.
    setSubmitting(true);
    const failures: string[] = [];

    // 1. Role details (single PATCH).
    if (diff.nameChange !== null || diff.descriptionChange !== null) {
      try {
        await updateRole.mutateAsync({
          role_id: roleId,
          ...(diff.nameChange !== null ? { name: diff.nameChange } : {}),
          // Send the raw description (including ``""``) so the user can
          // explicitly clear it. Skip the field entirely on no-change so
          // the backend doesn't see an empty PATCH.
          ...(diff.descriptionChange !== null ? { description: diff.descriptionChange } : {}),
        });
      } catch (e: any) {
        failures.push(`Updating role details failed: ${e?.message ?? 'unknown error'}`);
      }
    }

    // 2. Permissions add.
    for (const p of diff.permissionsToAdd) {
      try {
        await addPermission.mutateAsync({
          role_id: roleId,
          resource_type: p.resourceType,
          resource_pattern: parseResourcePattern(p.resourcePattern),
          permission: p.permission,
        });
      } catch (e: any) {
        failures.push(
          `Adding ${p.resourceType}:${p.resourcePattern} → ${p.permission} failed: ${e?.message ?? 'unknown error'}`,
        );
      }
    }
    // 3. Permissions remove.
    for (const id of diff.permissionIdsToRemove) {
      try {
        await removePermission.mutateAsync(id);
      } catch (e: any) {
        const label = permissionByIdLabel.get(id) ?? `permission #${id}`;
        failures.push(`Removing ${label} failed: ${e?.message ?? 'unknown error'}`);
      }
    }

    // 4. Users assign.
    for (const u of diff.usersToAssign) {
      try {
        await assignRole.mutateAsync(u);
      } catch (e: any) {
        failures.push(`Assigning ${u} failed: ${e?.message ?? 'unknown error'}`);
      }
    }
    // 5. Users unassign.
    for (const u of diff.usersToUnassign) {
      try {
        await unassignRole.mutateAsync(u);
      } catch (e: any) {
        failures.push(`Unassigning ${u} failed: ${e?.message ?? 'unknown error'}`);
      }
    }

    if (failures.length === 0) {
      onClose();
      return;
    }
    setError(failures.join('\n'));
    setStep('edit');
    setSubmitting(false);
  }, [
    diff,
    roleId,
    updateRole,
    addPermission,
    removePermission,
    assignRole,
    unassignRole,
    onClose,
    permissionByIdLabel,
  ]);

  return (
    <Modal
      componentId="admin.edit_role_modal"
      title={`Edit role${currentName ? ` — ${currentName}` : ''}`}
      visible={open}
      onCancel={onClose}
      size="wide"
      footer={
        step === 'edit' ? (
          <div css={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button componentId="admin.edit_role_modal.cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              componentId="admin.edit_role_modal.review"
              type="primary"
              // Submit isn't blocked on an unsaved draft — instead we gate
              // on it via a discard-confirm dialog so the admin can either
              // go back and click Add, or knowingly drop the draft and
              // proceed to the review step.
              onClick={() => {
                if (hasUnsavedDraft) {
                  setShowDiscardConfirm(true);
                  return;
                }
                setError(null);
                setStep('review');
              }}
              disabled={!hasAnyChange || !stateLoaded || !name.trim()}
            >
              <FormattedMessage
                defaultMessage="Review changes"
                description="Button that opens a summary of pending admin changes"
              />
            </Button>
          </div>
        ) : (
          <div css={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button
              componentId="admin.edit_role_modal.back"
              type="tertiary"
              icon={<ChevronLeftIcon />}
              onClick={() => setStep('edit')}
              disabled={submitting}
            >
              <FormattedMessage defaultMessage="Back" description="Button that returns to the previous step" />
            </Button>
            <Button
              componentId="admin.edit_role_modal.confirm"
              type="primary"
              onClick={handleConfirm}
              loading={submitting}
            >
              <FormattedMessage
                defaultMessage="Apply changes"
                description="Button that saves the reviewed admin changes"
              />
            </Button>
          </div>
        )
      }
    >
      {error && (
        // Sticky so partial-failure errors stay visible during scroll.
        <Alert
          componentId="admin.edit_role_modal.error"
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

      {step === 'edit' ? (
        <>
          <Typography.Text color="secondary" css={{ display: 'block', marginBottom: theme.spacing.md }}>
            Update name, description, permissions, and assigned users. Changes are previewed before they're applied.
          </Typography.Text>
          {!stateLoaded ? (
            <div
              css={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: theme.spacing.lg,
                minHeight: 200,
              }}
            >
              <Spinner size="small" />
            </div>
          ) : (
            <>
              <LongFormSection
                title={
                  <FormattedMessage
                    defaultMessage="Role details"
                    description="Section title for role name and description"
                  />
                }
              >
                <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                  <div>
                    <FieldLabel>
                      <FormattedMessage defaultMessage="Name" description="Label for a name field" />
                    </FieldLabel>
                    <Input
                      componentId="admin.edit_role_modal.name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={intl.formatMessage({
                        defaultMessage: 'Enter role name',
                        description: 'Placeholder for the role name field',
                      })}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      <FormattedMessage defaultMessage="Description" description="Label for a description field" />
                    </FieldLabel>
                    <Input
                      componentId="admin.edit_role_modal.description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={intl.formatMessage({
                        defaultMessage: 'Enter description (optional)',
                        description: 'Placeholder for an optional description field',
                      })}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      <FormattedMessage defaultMessage="Workspace" description="Label for a workspace field" />
                    </FieldLabel>
                    <Typography.Text color="secondary">
                      {currentWorkspace || 'default'}{' '}
                      <Typography.Text color="secondary" size="sm">
                        (workspace is set at creation and can't be changed)
                      </Typography.Text>
                    </Typography.Text>
                  </div>
                </div>
              </LongFormSection>
              <LongFormSection
                title={
                  <FormattedMessage
                    defaultMessage="Permissions"
                    description="Section title for a list of permissions"
                  />
                }
              >
                <Typography.Text color="secondary" css={{ display: 'block', marginBottom: theme.spacing.sm }}>
                  Current permissions are pre-filled. Remove a row to revoke; use the form below to add more.
                </Typography.Text>
                {/* ``key={String(open)}`` forces a fresh mount on every
                    reopen so the section's internal ``draft`` can't bleed
                    across close → reopen. */}
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
                  <FormattedMessage
                    defaultMessage="Assigned users"
                    description="Section title for users assigned to a role"
                  />
                }
                hideDivider
              >
                <Typography.Text color="secondary" css={{ display: 'block', marginBottom: theme.spacing.sm }}>
                  <FormattedMessage
                    defaultMessage="Currently assigned users are pre-filled. Remove a user to unassign; use the form below to assign more."
                    description="Help text above the users assigned to a role"
                  />
                </Typography.Text>
                <RoleUsersSection
                  value={usernames}
                  onChange={setUsernames}
                  disabled={submitting}
                  workspace={resourcePickerWorkspace}
                />
              </LongFormSection>
            </>
          )}
        </>
      ) : (
        <ReviewSummary diff={diff} permissionByIdLabel={permissionByIdLabel} />
      )}
      <ConfirmationModal
        componentId="admin.edit_role_modal.discard_unsaved_draft"
        title={intl.formatMessage({
          defaultMessage: 'Discard unsaved role permission?',
          description: 'Title of the dialog that warns an unsaved role permission will be discarded',
        })}
        visible={showDiscardConfirm}
        message={intl.formatMessage({
          defaultMessage:
            "You started adding a permission to this role but didn't click Add. Continuing to Review changes will discard it. Go back to either click Add to stage it, or Clear to drop the draft on the spot.",
          description: 'Body of the dialog that warns an unsaved role permission will be discarded',
        })}
        okText={intl.formatMessage({
          defaultMessage: 'Continue',
          description: 'Button that continues to the next step',
        })}
        cancelText={intl.formatMessage({
          defaultMessage: 'Back',
          description: 'Button that returns to the previous step',
        })}
        danger={false}
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setError(null);
          setStep('review');
        }}
      />
    </Modal>
  );
};

const ReviewSummary = ({ diff, permissionByIdLabel }: { diff: RoleDiff; permissionByIdLabel: Map<number, string> }) => {
  const { theme } = useDesignSystemTheme();
  const renderPerm = (p: StagedRolePermission) => `${p.resourceType}:${p.resourcePattern} → ${p.permission}`;
  const renderRemovedPermId = (id: number) => permissionByIdLabel.get(id) ?? `permission #${id}`;

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <Typography.Text color="secondary">
        <FormattedMessage
          defaultMessage="Review the net changes. Click <strong>Apply changes</strong> to commit them, or <strong>Back</strong> to keep editing."
          description="Instructions above the summary of pending role changes"
          values={{ strong: (chunks) => <strong>{chunks}</strong> }}
        />
      </Typography.Text>

      {diff.nameChange !== null ? (
        <DiffGroup
          title={<FormattedMessage defaultMessage="Name" description="Label for a name field" />}
          items={[
            <FormattedMessage
              key="rename"
              defaultMessage="Rename to {name}"
              description="Summary line when a role is renamed"
              values={{ name: diff.nameChange }}
            />,
          ]}
          addColor
        />
      ) : (
        <DiffGroup
          title={<FormattedMessage defaultMessage="Name" description="Label for a name field" />}
          items={[]}
          emptyLabel={
            <FormattedMessage
              defaultMessage="No change to name."
              description="Empty state when a role name is unchanged"
            />
          }
        />
      )}
      {diff.descriptionChange !== null ? (
        <DiffGroup
          title={<FormattedMessage defaultMessage="Description" description="Label for a description field" />}
          items={[
            diff.descriptionChange ? (
              <FormattedMessage
                key="set-description"
                defaultMessage='Set to "{description}"'
                description="Summary line when a role description is replaced"
                values={{ description: diff.descriptionChange }}
              />
            ) : (
              <FormattedMessage
                key="clear-description"
                defaultMessage="Clear description"
                description="Summary line when a role description is cleared"
              />
            ),
          ]}
          addColor
        />
      ) : (
        <DiffGroup
          title={<FormattedMessage defaultMessage="Description" description="Label for a description field" />}
          items={[]}
          emptyLabel={
            <FormattedMessage
              defaultMessage="No change to description."
              description="Empty state when a role description is unchanged"
            />
          }
        />
      )}
      <DiffGroup
        title={
          <FormattedMessage
            defaultMessage="Permissions to add"
            description="Heading for permissions that will be added to a role"
          />
        }
        items={diff.permissionsToAdd.map(renderPerm)}
        emptyLabel={
          <FormattedMessage
            defaultMessage="No new permissions."
            description="Empty state when no permissions will be added"
          />
        }
        addColor
      />
      <DiffGroup
        title={
          <FormattedMessage
            defaultMessage="Permissions to remove"
            description="Heading for permissions that will be removed from a role"
          />
        }
        items={diff.permissionIdsToRemove.map(renderRemovedPermId)}
        emptyLabel={
          <FormattedMessage
            defaultMessage="No permissions to remove."
            description="Empty state when no permissions will be removed"
          />
        }
      />
      <DiffGroup
        title={
          <FormattedMessage
            defaultMessage="Users to assign"
            description="Heading for users that will be assigned to a role"
          />
        }
        items={diff.usersToAssign}
        emptyLabel={
          <FormattedMessage
            defaultMessage="No new user assignments."
            description="Empty state when no users will be assigned"
          />
        }
        addColor
      />
      <DiffGroup
        title={
          <FormattedMessage
            defaultMessage="Users to unassign"
            description="Heading for users that will be unassigned from a role"
          />
        }
        items={diff.usersToUnassign}
        emptyLabel={
          <FormattedMessage
            defaultMessage="No user unassignments."
            description="Empty state when no users will be unassigned"
          />
        }
      />
    </div>
  );
};

const DiffGroup = ({
  title,
  items,
  emptyLabel,
  addColor,
}: {
  title: React.ReactNode;
  items: React.ReactNode[];
  emptyLabel?: React.ReactNode;
  addColor?: boolean;
}) => {
  const { theme } = useDesignSystemTheme();
  return (
    <div>
      <Typography.Text bold css={{ display: 'block', marginBottom: theme.spacing.xs }}>
        {title}
      </Typography.Text>
      {items.length === 0 ? (
        <Typography.Text color="secondary" size="sm">
          {emptyLabel}
        </Typography.Text>
      ) : (
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          {items.map((s, index) => (
            <Tag
              key={index}
              componentId="admin.edit_role_modal.diff_tag"
              color={addColor ? 'lime' : 'lemon'}
              css={{ alignSelf: 'flex-start' }}
            >
              {s}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
};
