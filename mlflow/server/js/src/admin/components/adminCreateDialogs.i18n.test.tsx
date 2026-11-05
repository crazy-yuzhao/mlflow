import { describe, expect, it, jest } from '@jest/globals';
import { DesignSystemProvider } from '@databricks/design-system';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { IntlProvider } from 'react-intl';
import supplement from '../../lang/zh-CN.supplement.json';
import { CreateRoleModal } from './CreateRoleModal';
import { CreateUserModal } from './CreateUserModal';
import { DirectPermissionForm, DIRECT_PERMISSION_DEFAULT } from './DirectPermissionForm';
import { RolePermissionForm, ROLE_PERMISSION_DRAFT_DEFAULT } from './RolePermissionForm';

jest.mock('../hooks', () => ({
  AdminQueryKeys: {
    users: ['admin_users'],
    roles: ['admin_roles'],
    roleUsers: (roleId: number) => ['admin_role_users', roleId],
  },
  useCreateRole: () => ({ mutateAsync: jest.fn() }),
  useCreateUser: () => ({ mutateAsync: jest.fn() }),
  useCurrentUserIsAdmin: () => true,
  useGrantUserPermission: () => ({ mutateAsync: jest.fn() }),
  useResourceOptionsQuery: () => ({ options: [], isLoading: false, error: null }),
  useRolesQuery: () => ({ data: { roles: [] }, isLoading: false, error: null }),
  useUsersQuery: () => ({ data: { users: [] }, isLoading: false, error: null }),
  useWorkspaceOptions: () => ['default'],
}));

jest.mock('../../experiment-tracking/hooks/useServerInfo', () => ({
  useWorkspacesEnabled: () => ({ workspacesEnabled: true, loading: false }),
}));

jest.mock('../../workspaces/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [{ name: 'default' }], isLoading: false }),
}));

jest.mock('../../workspaces/utils/WorkspaceUtils', () => ({
  useActiveWorkspace: () => 'default',
}));

jest.mock('@mlflow/mlflow/src/common/utils/reactQueryHooks', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const renderZh = (ui: React.ReactElement) =>
  render(
    <IntlProvider locale="zh-CN" defaultLocale="en" messages={supplement as Record<string, string>}>
      <DesignSystemProvider>{ui}</DesignSystemProvider>
    </IntlProvider>,
  );

describe('admin permission pickers in zh-CN', () => {
  it('renders the create-role scope options and resource type in Chinese', () => {
    renderZh(<RolePermissionForm value={ROLE_PERMISSION_DRAFT_DEFAULT} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: '指定实验' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '所有实验' })).toBeInTheDocument();
    expect(screen.getByText('实验')).toBeInTheDocument();
  });

  it('renders the create-user resource placeholder in Chinese', () => {
    renderZh(<DirectPermissionForm value={DIRECT_PERMISSION_DEFAULT} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: '指定实验' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '所有实验' })).toBeInTheDocument();
    expect(screen.getByText('选择实验')).toBeInTheDocument();
  });

  it('renders the create role dialog copy in Chinese and keeps permission codes', async () => {
    renderZh(<CreateRoleModal open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建角色' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '权限' }));
    expect(screen.getByText('为此角色添加一项或多项权限。之后还可以在角色详情页继续添加。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
    expect(screen.getByText('READ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '分配用户' }));
    expect(screen.getByText('为此角色分配一名或多名用户。之后还可以在角色详情页继续分配。')).toBeInTheDocument();
  });

  it('renders the create user dialog copy in Chinese', async () => {
    renderZh(<CreateUserModal open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建用户' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '角色分配' }));
    expect(screen.getByText('为此用户分配一个或多个现有角色，以授予可复用的权限组合。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '直接权限' }));
    expect(screen.getByText('为特定资源授予一项或多项一次性权限。')).toBeInTheDocument();
    expect(
      screen.getByText(
        '授权会记在该用户于各工作区的直接授权角色上。选择当前活动工作区以外的工作区，即可在该工作区授予访问权限。',
      ),
    ).toBeInTheDocument();
  });
});
