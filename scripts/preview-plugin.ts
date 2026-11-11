import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { Plugin } from 'vite';

import {
  PRESET_LIST_PATH,
  PRESETS_CHANGED_EVENT,
  type PresetListEntry,
} from '../src/preview/protocol.ts';

// TASK-40: the preset files the preview page lists, relative to the repository root.
const EXAMPLE_PRESET = 'docs/example-preset.json';
const PRESET_FOLDERS = ['tests/fixtures/presets', 'presets'];

const PRESET_EXTENSION = '.json';

const BYTE_ORDER_MARK = '\uFEFF';

// One listed file. `path` is absolute.
export type PresetFile = { key: string; label: string; path: string; launch: boolean };

// The repository files in a fixed order, then none twice. The launch file comes first and is
// marked. A launch file that is one of the repository files takes that entry's place.
export function listPresetFiles(root: string, launchPath: string | null): PresetFile[] {
  const repository = repositoryPresetFiles(root);

  if (launchPath === null) {
    return repository;
  }

  const path = resolve(root, launchPath);
  const launch: PresetFile = { ...fileAt(root, path), launch: true };

  return [launch, ...repository.filter((file) => file.path !== path)];
}

// A file that cannot be read, as one deleted after the list was made, has no text.
export function readPresetList(files: readonly PresetFile[]): PresetListEntry[] {
  return files.map((file) => ({
    key: file.key,
    label: file.label,
    launch: file.launch,
    text: readText(file.path),
  }));
}

// True for a path whose change can change the list or a listed text: the example, the launch file
// or a `.json` file right in one of the folders, also one that was just added or removed.
export function isPresetPath(root: string, launchPath: string | null, path: string): boolean {
  const absolute = resolve(root, path);

  if (absolute === resolve(root, EXAMPLE_PRESET)) {
    return true;
  }

  if (launchPath !== null && absolute === resolve(root, launchPath)) {
    return true;
  }

  return (
    absolute.endsWith(PRESET_EXTENSION) &&
    PRESET_FOLDERS.some((folder) => dirname(absolute) === resolve(root, folder))
  );
}

// Dev server only: `vite build` never applies it, so the build keeps its three pages.
export function presetPreview(root: string, launchPath: string | null): Plugin {
  return {
    name: 'muster-roll-preset-preview',
    apply: 'serve',
    configureServer(server) {
      // A launch file outside the root is not watched by default.
      if (launchPath !== null) {
        server.watcher.add(resolve(root, launchPath));
      }

      const notify = (path: string): void => {
        if (isPresetPath(root, launchPath, path)) {
          server.ws.send({ type: 'custom', event: PRESETS_CHANGED_EVENT });
        }
      };

      server.watcher.on('add', notify);
      server.watcher.on('change', notify);
      server.watcher.on('unlink', notify);

      server.middlewares.use(PRESET_LIST_PATH, (request, response, next) => {
        if (request.method !== 'GET') {
          next();

          return;
        }

        const list = readPresetList(listPresetFiles(root, launchPath));

        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(list));
      });
    },
  };
}

function repositoryPresetFiles(root: string): PresetFile[] {
  const files: PresetFile[] = [];
  const example = resolve(root, EXAMPLE_PRESET);

  if (existsSync(example)) {
    files.push(fileAt(root, example));
  }

  for (const folder of PRESET_FOLDERS) {
    files.push(...folderPresetFiles(root, resolve(root, folder)));
  }

  return files;
}

// Ties compare by code unit, so every machine lists the files in the same order.
function folderPresetFiles(root: string, folder: string): PresetFile[] {
  if (!existsSync(folder)) {
    return [];
  }

  const names = readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isFile() && entry.name.endsWith(PRESET_EXTENSION) ? [entry.name] : [],
    )
    .sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));

  return names.map((name) => fileAt(root, join(folder, name)));
}

// A file inside the root is named by its path from the root, with "/", and any other file by its
// absolute path.
function fileAt(root: string, path: string): PresetFile {
  const fromRoot = relative(root, path);

  const inside =
    fromRoot !== '' &&
    fromRoot !== '..' &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot);

  const key = inside ? fromRoot.split(sep).join('/') : path;

  return { key, label: key, path, launch: false };
}

// One leading byte order mark is dropped, as `File.text()` drops it on an upload, so a file saved
// with one parses here as it does there.
function readText(path: string): string | null {
  try {
    const text = readFileSync(path, 'utf8');

    return text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  } catch {
    return null;
  }
}
