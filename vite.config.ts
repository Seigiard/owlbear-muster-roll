import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const adapter = mode === 'mock' ? 'mock' : 'obr';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@/platform/current', replacement: fromRoot(`src/platform/${adapter}/index.ts`) },
        { find: '@', replacement: fromRoot('src') },
      ],
    },
    server: {
      cors: { origin: 'https://www.owlbear.rodeo' },
      allowedHosts: ['.trycloudflare.com'],
    },
    build: {
      rolldownOptions: {
        input: { index: fromRoot('index.html'), background: fromRoot('background.html') },
        output: {
          // A stable chunk for the SDK and adapter, instead of a name that follows shared code.
          advancedChunks: { groups: [{ name: 'obr', test: /platform\/obr|@owlbear-rodeo\/sdk/ }] },
        },
      },
    },
  };
});

function fromRoot(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}
