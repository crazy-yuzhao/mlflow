import { describe, expect, it } from '@jest/globals';
import { createHash } from 'crypto';
import messages from '../lang/zh-CN.supplement.json';

const messageId = (defaultMessage: string, description: string) =>
  createHash('sha512').update(`${defaultMessage}#${description}`).digest('base64').slice(0, 6);

describe('zh-CN supplement', () => {
  it('translates shared chrome that the synced catalog does not cover yet', () => {
    const catalog = messages as Record<string, string>;
    expect(catalog[messageId('Logout', 'Sidebar logout menu item')]).toBe('退出登录');
    expect(catalog[messageId('Account', 'Sidebar account menu item')]).toBe('账户');
    expect(catalog[messageId('AI Registry', 'Sidebar link for the AI Registry section')]).toBe('AI 注册表');
    expect(catalog[messageId('General', 'Sidebar link: Settings > General')]).toBe('常规');
    expect(catalog[messageId('Language', 'Accessible label for the language switcher')]).toBe('语言');
    expect(catalog[messageId('Endpoints', 'Sidebar link for gateway endpoints')]).toBe('端点');
  });

  it('translates the admin create role and create user dialogs', () => {
    const catalog = messages as Record<string, string>;
    expect(
      catalog[
        messageId(
          'Add one or more permissions to this role. You can add more later from the role detail page.',
          'Help text in the create role dialog permissions section',
        )
      ],
    ).toBe('为此角色添加一项或多项权限。之后还可以在角色详情页继续添加。');
    expect(
      catalog[
        messageId(
          'Assign one or more users to this role. You can assign more later from the role detail page.',
          'Help text in the create role dialog user assignment section',
        )
      ],
    ).toBe('为此角色分配一名或多名用户。之后还可以在角色详情页继续分配。');
    expect(catalog[messageId('Create role', 'Button that submits the create role dialog')]).toBe('创建角色');
    expect(catalog[messageId('Cancel', 'Button that closes the dialog without saving')]).toBe('取消');
    expect(
      catalog[
        messageId(
          'Assign one or more existing roles to give this user reusable bundles of permissions.',
          'Help text in the create user dialog role assignment section',
        )
      ],
    ).toBe('为此用户分配一个或多个现有角色，以授予可复用的权限组合。');
    expect(
      catalog[
        messageId(
          'Grant one or more one-off permissions on specific resources.',
          'Help text in the create user dialog direct permissions section',
        )
      ],
    ).toBe('为特定资源授予一项或多项一次性权限。');
    expect(
      catalog[
        messageId(
          "Grants land on the user's per-workspace direct-grant role. Pick a workspace other than your active one to grant access there.",
          "Help text for choosing which workspace a new user's direct permissions apply to",
        )
      ],
    ).toBe('授权会记在该用户于各工作区的直接授权角色上。选择当前活动工作区以外的工作区，即可在该工作区授予访问权限。');
    expect(catalog[messageId('Create user', 'Button that submits the create user dialog')]).toBe('创建用户');
    expect(catalog[messageId('Experiment', 'Admin permission picker label for the experiment resource type')]).toBe(
      '实验',
    );
    expect(
      catalog[messageId('Specific {resource}', 'Radio option for a permission scoped to one resource of this type')],
    ).toBe('指定{resource}');
    expect(
      catalog[messageId('All {resource}s', 'Radio option for a permission scoped to every resource of this type')],
    ).toBe('所有{resource}');
    expect(catalog[messageId('Select {resource}', 'Placeholder for choosing one resource of the given type')]).toBe(
      '选择{resource}',
    );
    expect(catalog[messageId('Add', 'Button that stages a permission on a role or user')]).toBe('添加');
    expect(catalog[messageId('READ', 'Admin permission picker label for the READ permission level')]).toBe('读取');
    expect(catalog[messageId('USE', 'Admin permission picker label for the USE permission level')]).toBe('使用');
    expect(catalog[messageId('EDIT', 'Admin permission picker label for the EDIT permission level')]).toBe('编辑');
    expect(catalog[messageId('MANAGE', 'Admin permission picker label for the MANAGE permission level')]).toBe('管理');
    expect(catalog[messageId('DENY', 'Admin permission picker label for the DENY permission level')]).toBe('拒绝');
  });
});
