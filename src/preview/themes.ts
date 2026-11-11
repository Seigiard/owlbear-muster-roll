import type { Theme } from '@/platform/ports';

export type PreviewThemeName = 'dark' | 'light';

// The mock room's dark theme (`src/platform/mock/index.ts`) and the light theme the browser tests
// set (`tests/support/colors.ts`). The mock keeps its own private, and the page may not import it.
export const PREVIEW_THEMES: Readonly<Record<PreviewThemeName, Theme>> = {
  dark: {
    mode: 'DARK',
    primary: { main: '#D9B36C', contrastText: '#222222' },
    background: { default: '#2A2A2A', paper: '#333333' },
    text: { primary: '#DDDDDD', secondary: '#AAAAAA' },
  },
  light: {
    mode: 'LIGHT',
    primary: { main: '#0055AA', contrastText: '#FFFFFF' },
    background: { default: '#C8C8C8', paper: '#FAFAFA' },
    text: { primary: '#0A0A0A', secondary: '#555555' },
  },
};
