import { Global } from '@emotion/react';
import { useEffect, useState } from 'react';
import { publishTheme, readExplicitTheme } from '../utils/uiPreferences';

const darkModeBodyClassName = 'dark-mode';

// CSS attributes to be applied when dark mode is enabled. Affects inputs and other form elements.
const darkModeCSSStyles = { body: { [`&.${darkModeBodyClassName}`]: { colorScheme: 'dark' } } };
// This component is used to set the global CSS.
const DarkModeStylesComponent = () => <Global styles={darkModeCSSStyles} />;

/**
 * Toggle dark mode for the open-source app.
 *
 * An explicit light/dark choice — the auth-page cookie, or a value already
 * stored by either page — wins over the system color scheme. When nothing is
 * stored, the system preference (`prefers-color-scheme`) is used once and then
 * saved. The auth page has no system option, so that saved value becomes the
 * shared light/dark preference and later system changes do not override it.
 * Returns the current state, a setter, and a component to render at the app root.
 */
export const useMLflowDarkTheme = (): [
  boolean,
  React.Dispatch<React.SetStateAction<boolean>>,
  React.ComponentType<React.PropsWithChildren<unknown>>,
] => {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const explicit = readExplicitTheme();
    if (explicit) {
      return explicit === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches || false;
  });

  useEffect(() => {
    document.body.classList.toggle(darkModeBodyClassName, isDarkTheme);
    publishTheme(isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  return [isDarkTheme, setIsDarkTheme, DarkModeStylesComponent];
};
