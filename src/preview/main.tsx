import { createRoot } from 'react-dom/client';

import '@/ui/main.css';
import { applyTheme } from '@/ui/theme';

import { readAddress } from './address';
import { PreviewPage } from './preview-page';
import { PREVIEW_THEMES } from './themes';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('preview.html has no #root element');
}

// Before the first paint, so the page does not flash the other theme.
applyTheme(PREVIEW_THEMES[readAddress(window.location.search).theme], document.documentElement);

createRoot(container).render(<PreviewPage />);
