import { describe, expect, it } from '@jest/globals';
import { compileMessageCatalog } from './compileMessages';

describe('compileMessageCatalog', () => {
  it('flattens FormatJS catalogs and passes through string maps', () => {
    expect(
      compileMessageCatalog({
        abc123: { defaultMessage: '主页', description: 'Sidebar link for home page' },
        def456: '实验',
        skip: { description: 'missing default message' },
      }),
    ).toEqual({
      abc123: '主页',
      def456: '实验',
    });
  });

  it('returns an empty catalog for unexpected input', () => {
    expect(compileMessageCatalog(null)).toEqual({});
    expect(compileMessageCatalog(undefined)).toEqual({});
  });
});
