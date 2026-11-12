import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import type { Theme, ThemePort } from '@/platform/ports';

import { applyTheme, followTheme, themeTokens } from './theme';

const DARK: Theme = {
  mode: 'DARK',
  primary: { main: '#101112', contrastText: '#202122' },
  background: { default: '#303132', paper: '#404142' },
  text: { primary: '#505152', secondary: '#606162' },
};

const LIGHT: Theme = {
  mode: 'LIGHT',
  primary: { main: '#A0A1A2', contrastText: '#B0B1B2' },
  background: { default: '#C0C1C2', paper: '#D0D1D2' },
  text: { primary: '#E0E1E2', secondary: '#F0F1F2' },
};

type StubPort = {
  themePort: ThemePort;
  fireChange: (theme: Theme) => void;
};

afterEach(() => {
  mock.restore();
});

describe('themeTokens', () => {
  test('maps every token by the DESIGN.md runtime table', () => {
    // #when
    const tokens = themeTokens(DARK);

    // #then
    expect(tokens).toEqual({
      '--mr-surface': '#404142',
      '--mr-surface-bar': '#303132',
      '--mr-surface-tab': 'color-mix(in srgb, #404142 90%, #505152)',
      '--mr-surface-stripe': 'color-mix(in srgb, #404142 92%, #303132)',
      '--mr-line': 'color-mix(in srgb, #404142 80%, #505152)',
      '--mr-line-strong': 'color-mix(in srgb, #404142 50%, #505152)',
      '--mr-focus': '#101112',
      '--mr-text': '#505152',
      '--mr-text-muted': '#606162',
      '--mr-accent': '#101112',
      '--mr-accent-contrast': '#202122',
    });
  });

  test('darkens the light accent and focus with the text colour', () => {
    // #when
    const tokens = themeTokens(LIGHT);

    // #then
    expect({
      accent: tokens['--mr-accent'],
      focus: tokens['--mr-focus'],
      contrast: tokens['--mr-accent-contrast'],
    }).toEqual({
      accent: 'color-mix(in srgb, #A0A1A2 65%, #E0E1E2)',
      focus: 'color-mix(in srgb, #A0A1A2 65%, #E0E1E2)',
      contrast: '#B0B1B2',
    });
  });
});

describe('applyTheme', () => {
  test('sets the tokens and the mode on the root element', () => {
    // #given
    const root = document.createElement('div');

    // #when
    applyTheme(LIGHT, root);

    // #then
    expect({
      surface: root.style.getPropertyValue('--mr-surface'),
      mode: root.dataset['themeMode'],
    }).toEqual({ surface: '#D0D1D2', mode: 'LIGHT' });
  });
});

describe('followTheme', () => {
  test('applies the theme it reads', async () => {
    // #given
    const root = document.createElement('div');
    const port = stubPort(() => Promise.resolve(DARK));

    // #when
    await followTheme(port.themePort, root);

    // #then
    expect(root.style.getPropertyValue('--mr-surface')).toBe('#404142');
  });

  test('applies a later theme change', async () => {
    // #given
    const root = document.createElement('div');
    const port = stubPort(() => Promise.resolve(DARK));

    await followTheme(port.themePort, root);

    // #when
    port.fireChange(LIGHT);

    // #then
    expect(root.dataset['themeMode']).toBe('LIGHT');
  });

  test('keeps a change that lands while the read is in flight', async () => {
    // #given
    const root = document.createElement('div');
    let finishRead: (theme: Theme) => void = () => undefined;

    const port = stubPort(
      () =>
        new Promise<Theme>((resolve) => {
          finishRead = resolve;
        }),
    );

    const following = followTheme(port.themePort, root);

    // #when
    port.fireChange(LIGHT);
    finishRead(DARK);
    await following;

    // #then
    expect(root.dataset['themeMode']).toBe('LIGHT');
  });

  test('catches a failed read and reports it to the console', async () => {
    // #given
    const root = document.createElement('div');
    const failure = new Error('read failed');
    const consoleError = spyOn(console, 'error').mockImplementation(() => undefined);
    const port = stubPort(() => Promise.reject(failure));

    // #when
    await followTheme(port.themePort, root);

    // #then
    expect(consoleError.mock.calls).toEqual([
      ['Muster Roll could not read the Owlbear theme', failure],
    ]);
  });

  test('still follows changes after a failed read', async () => {
    // #given
    const root = document.createElement('div');
    spyOn(console, 'error').mockImplementation(() => undefined);

    const port = stubPort(() => Promise.reject(new Error('read failed')));

    await followTheme(port.themePort, root);

    // #when
    port.fireChange(LIGHT);

    // #then
    expect(root.dataset['themeMode']).toBe('LIGHT');
  });
});

function stubPort(getTheme: ThemePort['getTheme']): StubPort {
  const listeners: ((theme: Theme) => void)[] = [];

  return {
    themePort: {
      getTheme,
      onChange: (callback) => {
        listeners.push(callback);

        return () => undefined;
      },
    },
    fireChange: (theme) => {
      for (const listener of listeners) {
        listener(theme);
      }
    },
  };
}
