import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// With `.ts` extensions, Vite loads its config with no `configLoader: 'native'` warning.
import { presetPreview } from './scripts/preview-plugin.ts';
import { LAUNCH_FILE_VARIABLE } from './src/preview/protocol.ts';

export default defineConfig(({ mode }) => {
  const adapter = mode === 'mock' ? 'mock' : 'obr';
  const launchFile = process.env[LAUNCH_FILE_VARIABLE];

  return {
    // TASK-40: `preview.html` reads its preset list from this dev-server-only plugin, in the mock
    // mode only, so a dev server that Owlbear reaches through a tunnel never serves preset files.
    plugins: [
      react(),
      tailwindcss(),
      mode === 'mock'
        ? presetPreview(
            fromRoot('.'),
            launchFile === undefined || launchFile === '' ? null : launchFile,
          )
        : null,
    ],
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
        input: {
          index: fromRoot('index.html'),
          background: fromRoot('background.html'),
          picker: fromRoot('picker.html'),
          // AD-20: the preset builder, a top-level page with no Owlbear.
          builder: fromRoot('builder.html'),
        },
        output: {
          // A stable chunk for the SDK and adapter, instead of a name that follows shared code. The
          // core and its libraries go first into a chunk of their own: the `obr` group takes its
          // modules' dependencies too, and the builder page (AD-20) must load the core without the
          // SDK.
          advancedChunks: {
            groups: [
              {
                name: 'core',
                test: /src\/core\/|node_modules\/(?:zod|fflate)\//,
                priority: 2,
              },
              { name: 'obr', test: /platform\/obr|@owlbear-rodeo\/sdk/, priority: 1 },
            ],
          },
        },
      },
    },
  };
});

function fromRoot(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}
