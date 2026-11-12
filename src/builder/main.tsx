import { createRoot } from 'react-dom/client';

import '@/ui/main.css';
import { PREVIEW_THEMES } from '@/preview/themes';
import { applyTheme } from '@/ui/theme';

import { BuilderPage } from './builder-page';
import { createBuilderStore, type DraftStorage } from './builder-store';
import { readThemeChoice } from './theme-choice';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('builder.html has no #root element');
}

// Before the first paint, so the page does not flash the other theme.
applyTheme(PREVIEW_THEMES[readThemeChoice()], document.documentElement);

const store = createBuilderStore(pageStorage());

createRoot(container).render(<BuilderPage store={store} />);

// A browser that blocks site data throws on the first read of `localStorage`.
function pageStorage(): DraftStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
