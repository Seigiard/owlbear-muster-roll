import type { PreviewThemeName } from '@/ui/themes';

// The builder follows the system colour scheme until the GM flips "Светлая тема". The browser keeps
// that choice under this key.
export const THEME_STORAGE_KEY = 'muster-roll-builder-theme';

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function readThemeChoice(): PreviewThemeName {
  let stored: string | null = null;

  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia(LIGHT_SCHEME_QUERY).matches ? 'light' : 'dark';
}

export function saveThemeChoice(theme: PreviewThemeName): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A browser that keeps nothing still shows the theme until the page closes.
  }
}
