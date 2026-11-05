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
});
