import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { DesignSystemProvider } from '@databricks/design-system';
import { I18nUtils } from '../../i18n/I18nUtils';
import { renderWithDesignSystem, renderWithIntl } from '../utils/TestUtils.react18';
import { LanguageSwitcher } from './LanguageSwitcher';

jest.mock('../../i18n/I18nUtils', () => {
  const actual = jest.requireActual<typeof import('../../i18n/I18nUtils')>('../../i18n/I18nUtils');
  return {
    ...actual,
    I18nUtils: {
      ...actual.I18nUtils,
      setCurrentLocale: jest.fn(),
    },
  };
});

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    jest.mocked(I18nUtils.setCurrentLocale).mockClear();
  });

  test('offers Chinese and English and stores the selection', async () => {
    renderWithDesignSystem(<LanguageSwitcher collapsed={false} />);

    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '中文' }));
    expect(I18nUtils.setCurrentLocale).toHaveBeenCalledWith('zh-CN');

    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    // English is already the active locale, so choosing it again does not reload.
    expect(I18nUtils.setCurrentLocale).toHaveBeenCalledTimes(1);
  });

  test('shows the active language from the current locale', async () => {
    renderWithIntl(
      <DesignSystemProvider>
        <LanguageSwitcher collapsed={false} />
      </DesignSystemProvider>,
      {},
      { locale: 'zh-CN', messages: { YqXBoN: '语言' } },
    );

    expect(screen.getByRole('button', { name: '中文' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(I18nUtils.setCurrentLocale).toHaveBeenCalledWith('en');
  });

  test('collapsed control toggles to the other language', async () => {
    renderWithDesignSystem(<LanguageSwitcher collapsed />);

    await userEvent.click(screen.getByRole('button', { name: 'Language' }));
    expect(I18nUtils.setCurrentLocale).toHaveBeenCalledWith('zh-CN');
  });
});
