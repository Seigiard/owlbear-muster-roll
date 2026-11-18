import { describe, expect, test } from 'bun:test';
import { TestFileAccessFake } from '../../tests/support/file-access';
import { createBrowserFileAccess } from '../builder/file-access';

describe('file-access port fake', () => {
  test('returns queued open and read results without consulting browser globals', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', '{"v":3}');
    access.queueOpen(file);
    // #when
    const opened = await access.open({ mode: 'open' });
    const read = opened.ok && opened.value !== null ? await access.read(opened.value) : null;
    // #then
    expect({ opened, read, requests: access.openRequests }).toEqual({
      opened: { ok: true, value: { id: 'preset', name: 'crew.json' } },
      read: {
        ok: true,
        value: {
          text: '{"v":3}',
          modifiedAt: new Date('2026-11-16T18:06:00.000Z'),
        },
      },
      requests: [{ mode: 'open' }],
    });
  });
  test('records writes and delivers independent external follow results', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('snapshot', 'crew-snapshot.json', 'before');
    const followed: unknown[] = [];

    const stop = access.follow(file, (result) => {
      followed.push(result);
    });

    // #when
    const write = await access.write(file, 'from-page');
    access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
    access.externalWrite(file, 'from-disk');
    stop();
    access.externalWrite(file, 'after-stop');
    // #then
    expect({
      write,
      writes: access.writeRequests,
      follows: access.followRequests,
      followed,
    }).toEqual({
      write: {
        ok: true,
        value: {
          text: 'from-page',
          modifiedAt: new Date('2026-11-16T18:06:00.000Z'),
        },
      },
      writes: [
        {
          file: { id: 'snapshot', name: 'crew-snapshot.json' },
          text: 'from-page',
        },
      ],
      follows: [{ id: 'snapshot', name: 'crew-snapshot.json' }],
      followed: [
        {
          ok: true,
          value: {
            text: 'from-disk',
            modifiedAt: new Date('2026-11-16T18:07:00.000Z'),
          },
        },
      ],
    });
  });
  test('reports missing files and injected follow failures as explicit results', async () => {
    // #given
    const access = new TestFileAccessFake();
    const missing = { id: 'missing', name: 'missing.json' };
    const followed: unknown[] = [];
    access.follow(missing, (result) => {
      followed.push(result);
    });
    // #when
    const read = await access.read(missing);
    const write = await access.write(missing, 'content');
    access.externalFailure(missing, 'permission denied');
    // #then
    expect({ read, write, followed }).toEqual({
      read: { ok: false, error: { reason: 'No fake file missing' } },
      write: { ok: false, error: { reason: 'No fake file missing' } },
      followed: [{ ok: false, error: { reason: 'permission denied' } }],
    });
  });
});

describe('browser file-access adapter', () => {
  test('maps a native AbortError picker cancellation to a null result', async () => {
    // #given
    const restore = installPickers(() => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });

    // #when
    const result = await createBrowserFileAccess().open({ mode: 'open' });
    restore();
    // #then
    expect(result).toEqual({ ok: true, value: null });
  });
  test('keeps a non-Abort picker failure as an error result', async () => {
    // #given
    const restore = installPickers(() => {
      throw new Error('permission denied');
    });

    // #when
    const result = await createBrowserFileAccess().open({ mode: 'open' });
    restore();
    // #then
    expect(result).toEqual({ ok: false, error: { reason: 'permission denied' } });
  });
});

function installPickers(open: () => never): () => void {
  // SAFETY: the test installs only the two optional picker properties declared by the adapter.
  const browser = window as Window & {
    showOpenFilePicker?: () => Promise<never>;
    showSaveFilePicker?: () => Promise<never>;
  };

  const previousOpen = browser.showOpenFilePicker;
  const previousSave = browser.showSaveFilePicker;
  browser.showOpenFilePicker = async () => open();
  browser.showSaveFilePicker = async () => open();

  return () => {
    browser.showOpenFilePicker = previousOpen;
    browser.showSaveFilePicker = previousSave;
  };
}
