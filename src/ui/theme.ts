import type { Theme, ThemePort } from '@/platform/ports';

type MappedToken =
  | '--mr-surface'
  | '--mr-surface-bar'
  | '--mr-surface-raised'
  | '--mr-surface-tab'
  | '--mr-surface-stripe'
  | '--mr-fill'
  | '--mr-fill-strong'
  | '--mr-line'
  | '--mr-hairline'
  | '--mr-line-strong'
  | '--mr-focus'
  | '--mr-text'
  | '--mr-text-muted'
  | '--mr-accent'
  | '--mr-accent-soft'
  | '--mr-accent-ink'
  | '--mr-accent-contrast';

const LIGHT_ACCENT_SHARE = '65%';

// A raised surface, such as a section card, is the paper lifted toward white: a little in the dark
// theme, most of the way in the light one, where the paper is already pale.
const RAISED_PAPER_SHARE = { DARK: '94%', LIGHT: '35%' } as const;

// The tonal accent under a selected entry or a dice button. The light accent is darker, so less of
// it reads as the same tint.
const ACCENT_SOFT_SHARE = { DARK: '18%', LIGHT: '12%' } as const;

export type ThemeTokens = Readonly<Record<MappedToken, string>>;

export function themeTokens(theme: Theme): ThemeTokens {
  const paper = theme.background.paper;
  const text = theme.text.primary;
  const accent = accentColor(theme);
  const raised = `color-mix(in srgb, ${paper} ${RAISED_PAPER_SHARE[theme.mode]}, #fff)`;

  return {
    '--mr-surface': paper,
    '--mr-surface-bar': theme.background.default,
    '--mr-surface-raised': raised,
    '--mr-surface-tab': `color-mix(in srgb, ${paper} 90%, ${text})`,
    '--mr-surface-stripe': `color-mix(in srgb, ${raised} 96%, ${text})`,
    // Fills are translucent, so one control reads the same on the paper, a card and a stripe.
    '--mr-fill': `color-mix(in srgb, ${text} 8%, transparent)`,
    '--mr-fill-strong': `color-mix(in srgb, ${text} 14%, transparent)`,
    '--mr-line': `color-mix(in srgb, ${paper} 80%, ${text})`,
    // A hairline divides without drawing attention: section rules, separators, chip edges.
    '--mr-hairline': `color-mix(in srgb, ${text} 10%, transparent)`,
    '--mr-line-strong': `color-mix(in srgb, ${paper} 50%, ${text})`,
    '--mr-focus': accent,
    '--mr-text': text,
    '--mr-text-muted': theme.text.secondary,
    '--mr-accent': accent,
    '--mr-accent-soft': `color-mix(in srgb, ${accent} ${ACCENT_SOFT_SHARE[theme.mode]}, transparent)`,
    '--mr-accent-ink': accentInk(theme, accent),
    '--mr-accent-contrast': theme.primary.contrastText,
  };
}

// Owlbear's light primary is too pale for text: 3.3:1 on the paper and 3.7:1 under its contrast
// text. Mixing in the text colour darkens it past 4.5:1 on every surface it sits on. That text
// colour is 87% opaque, so the mix is about 95% opaque and the surface under it shows a little.
function accentColor(theme: Theme): string {
  if (theme.mode === 'DARK') {
    return theme.primary.main;
  }

  return `color-mix(in srgb, ${theme.primary.main} ${LIGHT_ACCENT_SHARE}, ${theme.text.primary})`;
}

// Accent text sits on the tonal accent as well as on plain surfaces. Owlbear's dark primary gives
// 3.9:1 on its own tint over a striped row, so the ink lifts it toward white; the light ink darkens it toward the text.
function accentInk(theme: Theme, accent: string): string {
  if (theme.mode === 'DARK') {
    return `color-mix(in srgb, ${accent} 65%, #fff)`;
  }

  return `color-mix(in srgb, ${accent} 80%, ${theme.text.primary})`;
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
