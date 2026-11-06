import { describe, expect, it } from '@jest/globals';

import { productNameForLocale } from './useDocumentTitle';

describe('productNameForLocale', () => {
  it('uses 衡鉴 for Chinese locales and Hengjian otherwise', () => {
    expect(productNameForLocale('zh-CN')).toBe('衡鉴');
    expect(productNameForLocale('zh')).toBe('衡鉴');
    expect(productNameForLocale('ZH-tw')).toBe('衡鉴');
    expect(productNameForLocale('en')).toBe('Hengjian');
    expect(productNameForLocale('en-US')).toBe('Hengjian');
    expect(productNameForLocale('de-DE')).toBe('Hengjian');
    expect(productNameForLocale(undefined)).toBe('Hengjian');
  });
});
