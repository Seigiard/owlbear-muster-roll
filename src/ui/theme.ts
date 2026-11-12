import type { Theme, ThemePort } from '@/platform/ports';

type MappedToken =
  | '--mr-surface'
  | '--mr-surface-bar'
  | '--mr-surface-tab'
  | '--mr-surface-stripe'
  | '--mr-line'
  | '--mr-line-strong'
  | '--mr-focus'
  | '--mr-text'
  | '--mr-text-muted'
  | '--mr-accent'
  | '--mr-accent-contrast';

const LIGHT_ACCENT_SHARE = '65%';

export type ThemeTokens = Readonly<Record<MappedToken, string>>;

export function themeTokens(theme: Theme): ThemeTokens {
  const paper = theme.background.paper;
  const text = theme.text.primary;
  const accent = accentColor(theme);

  return {
    '--mr-surface': paper,
    '--mr-surface-bar': theme.background.default,
    '--mr-surface-tab': `color-mix(in srgb, ${paper} 90%, ${text})`,
    '--mr-surface-stripe': `color-mix(in srgb, ${paper} 92%, ${theme.background.default})`,
    '--mr-line': `color-mix(in srgb, ${paper} 80%, ${text})`,
    '--mr-line-strong': `color-mix(in srgb, ${paper} 50%, ${text})`,
    '--mr-focus': accent,
    '--mr-text': text,
    '--mr-text-muted': theme.text.secondary,
    '--mr-accent': accent,
    '--mr-accent-contrast': theme.primary.contrastText,
  };
}

// Owlbear's light primary is too pale for text: 3.3:1 on the paper and 3.7:1 under its contrast
// text. Mixing in the text colour darkens it past 4.5:1 on every surface it sits on.
function accentColor(theme: Theme): string {
  if (theme.mode === 'DARK') {
    return theme.primary.main;
  }

  return `color-mix(in srgb, ${theme.primary.main} ${LIGHT_ACCENT_SHARE}, ${theme.text.primary})`;
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  for (const [token, value] of Object.entries(themeTokens(theme))) {
    root.style.setProperty(token, value);
  }

  root.dataset['themeMode'] = theme.mode;
}

export async function followTheme(port: ThemePort, root: HTMLElement): Promise<void> {
  let changedDuringRead = false;

  port.onChange((theme) => {
    changedDuringRead = true;
    applyTheme(theme, root);
  });

  try {
    const theme = await port.getTheme();

    // A change that lands while the read is in flight is newer than the read.
    if (!changedDuringRead) {
      applyTheme(theme, root);
    }
  } catch (error) {
    console.error('Muster Roll could not read the Owlbear theme', error);
  }
}
