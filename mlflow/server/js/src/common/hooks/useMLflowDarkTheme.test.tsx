import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useMLflowDarkTheme } from './useMLflowDarkTheme';

function clearPrefCookies() {
  document.cookie = 'mlflow_ui_lang=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = 'mlflow_ui_theme=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

describe('useMLflowDarkTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    clearPrefCookies();
    document.body.className = '';
  });

  it('follows the login theme cookie ahead of a stale dark-mode flag', () => {
    document.cookie = 'mlflow_ui_theme=dark; Path=/';
    localStorage.setItem('_mlflow_dark_mode_toggle_enabled', 'false');
    localStorage.setItem('databricks-dark-mode-pref', 'light');

    const { result } = renderHook(() => useMLflowDarkTheme());

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('_mlflow_dark_mode_toggle_enabled')).toBe('true');
    expect(localStorage.getItem('databricks-dark-mode-pref')).toBe('dark');
    expect(localStorage.getItem('mlflow_ui_theme')).toBe('dark');
    expect(document.cookie).toContain('mlflow_ui_theme=dark');
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  it('publishes a theme toggle to the login cookie and signed-in keys', () => {
    const { result } = renderHook(() => useMLflowDarkTheme());
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('_mlflow_dark_mode_toggle_enabled')).toBe('true');
    expect(localStorage.getItem('mlflow_ui_theme')).toBe('dark');
    expect(document.cookie).toContain('mlflow_ui_theme=dark');
  });

  it('saves the system preference when nothing was chosen yet', () => {
    const { result } = renderHook(() => useMLflowDarkTheme());

    // setupTests stubs matchMedia to a light scheme.
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('_mlflow_dark_mode_toggle_enabled')).toBe('false');
    expect(localStorage.getItem('databricks-dark-mode-pref')).toBe('light');
    expect(document.cookie).toContain('mlflow_ui_theme=light');
  });
});
