import { createRoot } from 'react-dom/client';

import { platform } from '@/platform/current';

import './main.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('index.html has no #root element');
}

const root = createRoot(container);

platform.onReady(() => {
  root.render(<main />);
});
