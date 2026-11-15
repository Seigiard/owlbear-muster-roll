import { createRoot } from 'react-dom/client';

import '@/ui/main.css';
import { applyTheme } from '@/ui/theme';

import { readAddress } from './address';
import { RoomPage } from './room-page';
import { PREVIEW_THEMES } from '@/ui/themes';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('room.html has no #root element');
}

// Before the first paint, so the host chrome does not flash the other theme.
applyTheme(PREVIEW_THEMES[readAddress(window.location.search).theme], document.documentElement);

createRoot(container).render(<RoomPage />);
