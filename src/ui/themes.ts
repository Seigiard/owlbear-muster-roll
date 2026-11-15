import type { Theme } from '@/platform/ports';

export type PreviewThemeName = 'dark' | 'light';

// The two themes of a live Owlbear room. The mock room (`src/platform/mock/index.ts`) and the
// browser tests (`tests/support/colors.ts`) hold their own copies, and this page may not import them.
export const PREVIEW_THEMES: Readonly<Record<PreviewThemeName, Theme>> = {
  dark: {
    mode: 'DARK',
    primary: { main: '#bb99ff', contrastText: 'rgba(0, 0, 0, 0.87)' },
    background: { default: '#1e2231', paper: '#222639' },
    text: { primary: '#fff', secondary: 'rgba(255, 255, 255, 0.7)' },
  },
  light: {
    mode: 'LIGHT',
    primary: { main: '#9966ff', contrastText: '#fff' },
    background: { default: '#dde1ee', paper: '#f1f3f9' },
    text: { primary: 'rgba(0, 0, 0, 0.87)', secondary: 'rgba(0, 0, 0, 0.6)' },
  },
};
