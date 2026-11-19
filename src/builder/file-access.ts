import { Result } from 'better-result';

import type {
  FileAccessCapability,
  FileAccessFailure,
  FileAccessPort,
  FileAccessResult,
  FileContents,
  FileReference,
} from '@/core/file-access';

type NativeFile = {
  lastModified: number;
  text: () => Promise<string>;
};

type NativeWritable = {
  close: () => Promise<void>;
  write: (text: string) => Promise<void>;
};

type NativeHandle = {
  name: string;
  getFile: () => Promise<NativeFile>;
  createWritable: () => Promise<NativeWritable>;
};

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: { accept: Record<string, string[]> }[];
  }) => Promise<NativeHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { accept: Record<string, string[]> }[];
  }) => Promise<NativeHandle>;
};

const JSON_FILE_TYPES = [{ accept: { 'application/json': ['.json'] } }];
const FOLLOW_INTERVAL_MS = 1000;

export function createBrowserFileAccess(): FileAccessPort {
  const browser: FilePickerWindow = window;
  const handles = new Map<string, NativeHandle>();
  let nextId = 0;

  const capability: FileAccessCapability =
    browser.showOpenFilePicker !== undefined && browser.showSaveFilePicker !== undefined
      ? 'write-and-follow'
      : 'open-only';

  return {
    capability,
    open: async (request) => {
      try {
        const handle =
          request.mode === 'open'
            ? (
                await browser.showOpenFilePicker?.({
                  multiple: false,
                  types: JSON_FILE_TYPES,
                })
              )?.[0]
            : await browser.showSaveFilePicker?.({
                suggestedName: request.suggestedName,
                types: JSON_FILE_TYPES,
              });

        if (handle === undefined) {
          return Result.ok(null);
        }

        const id = `browser-file-${nextId}`;
        nextId += 1;
        handles.set(id, handle);

        return Result.ok({ id, name: handle.name });
      } catch (error) {
        if (
          (error instanceof Error || error instanceof DOMException) &&
          error.name === 'AbortError'
        ) {
          return Result.ok(null);
        }

        return Result.err(
          fileError(error instanceof Error ? error : new Error('File access failed')),
        );
      }
    },
    read: async (file) => {
      const handle = handles.get(file.id);

      if (handle === undefined) {
        return Result.err({ reason: `No browser file ${file.id}` });
      }

      try {
        const contents = await handle.getFile();

        return Result.ok({
          text: await contents.text(),
          modifiedAt: new Date(contents.lastModified),
        });
      } catch (error) {
        return Result.err(
          fileError(error instanceof Error ? error : new Error('File access failed')),
        );
      }
    },
    write: async (file, text) => {
      const handle = handles.get(file.id);

      if (handle === undefined) {
        return Result.err({ reason: `No browser file ${file.id}` });
      }

      try {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();

        const contents = await handle.getFile();

        return Result.ok({ text, modifiedAt: new Date(contents.lastModified) });
      } catch (error) {
        return Result.err(
          fileError(error instanceof Error ? error : new Error('File access failed')),
        );
      }
    },
    follow: (file, onChange) => {
      if (capability !== 'write-and-follow') {
        return () => undefined;
      }

      let previous: FileContents | null = null;
      let active = true;

      const read = async (): Promise<void> => {
        if (!active) {
          return;
        }

        const result = await readFile(handles, file);

        if (!active) {
          return;
        }

        if (result.isOk()) {
          const changed =
            previous !== null &&
            (previous.modifiedAt.getTime() !== result.value.modifiedAt.getTime() ||
              previous.text !== result.value.text);

          previous = result.value;

          if (changed) {
            onChange(result);
          }
        } else {
          onChange(result);
        }
      };

      const timer = window.setInterval(() => {
        read().catch(() => onChange(Result.err(fileError(new Error('File access failed')))));
      }, FOLLOW_INTERVAL_MS);

      read().catch(() => onChange(Result.err(fileError(new Error('File access failed')))));

      return () => {
        active = false;
        window.clearInterval(timer);
      };
    },
  };
}

async function readFile(
  handles: ReadonlyMap<string, NativeHandle>,
  file: FileReference,
): Promise<FileAccessResult<FileContents>> {
  const handle = handles.get(file.id);

  if (handle === undefined) {
    return Result.err({ reason: `No browser file ${file.id}` });
  }

  try {
    const contents = await handle.getFile();

    return Result.ok({ text: await contents.text(), modifiedAt: new Date(contents.lastModified) });
  } catch (error) {
    return Result.err(fileError(error instanceof Error ? error : new Error('File access failed')));
  }
}

function fileError(error: Error): FileAccessFailure {
  return { reason: error.message };
}
