import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import type { JsonValue } from '@/core/json';
import type { VersionedRecord } from '@/core/records';

const CHANNEL = 'app.muster-roll/ui';
const STORAGE_PREFIX = 'mr1:mock-room:0::';
const LOCAL_SAVE_FAILED = 'Не удалось сохранить в браузере. Скачайте снимок.';

type Projection = { records: VersionedRecord[]; notices: string[] };

type WireMessage = {
  t: string;
  nonce?: string;
  i?: number;
  n?: number;
  records?: VersionedRecord[];
  notices?: string[];
};

declare global {
  interface Window {
    recordedWire: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('the window leaves the loading text once its own client has the projection', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await seedStorage(page, 'sheet:bad', '{not json');

  // #when
  await openBackground(context);
  // Only the projection delivered to the window's own client can raise this banner.
  await expect(page.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);

  // #then: a room with no preset shows the GM the upload instead.
  await expect(page.getByRole('button', { name: 'Загрузить пресет' })).toBeVisible();
  await expect(page.getByText('Загрузка…')).toHaveCount(0);
});

test('a GM start puts the persisted records in the projection', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await seedStorage(page, 'sheet:saved', JSON.stringify(sheet('saved')));
  await openBackground(context);

  // #when
  const projection = await requestProjection(page, 'load');

  // #then
  expect(projection).toEqual({ records: [sheet('saved')], notices: [] });
});

test('a corrupt stored record is skipped and shows the banner', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await seedStorage(page, 'sheet:bad', '{not json');
  await openBackground(context);

  // #when
  const projection = await requestProjection(page, 'corrupt');

  // #then
  expect(projection).toEqual({ records: [], notices: ['local-save-failed'] });
  await expect(page.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);
});

test('a player client persists nothing after a command', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context, '/background.html?mock-role=PLAYER');

  // #when
  await sendCommand(page, 'player-command', 'Брок');
  await expect.poll(() => projectedNames(page, 'player-check')).toEqual(['Брок']);

  // #then
  expect(await storedKeys(page)).toEqual([]);
});

test('a command becomes a record in storage and a delta on the wire', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context);
  await requestProjection(page, 'before-command');
  await startRecordingWire(page);

  // #when
  await sendCommand(page, 'first-command', 'Брок');
  await expect.poll(() => recordedTypes(page)).toContain('delta');

  // #then
  expect(await storedKeys(page)).toHaveLength(1);
});

test('a window that loads before the background page still gets its projection', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await startRecordingWire(page);
  await expect.poll(() => countRecorded(page, 'projection-request')).toBeGreaterThanOrEqual(2);

  // #when
  await openBackground(context);

  // #then
  await expect.poll(() => countRecorded(page, 'projection')).toBeGreaterThanOrEqual(1);
});

test('a whole record in a command has no effect', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context);
  await requestProjection(page, 'before-whole');

  // #when
  await postMessage(page, {
    t: 'command',
    id: 'whole',
    command: { type: 'sheet-create', kind: 'pc', name: 'x', k: 'sheet:z', d: null, c: 9, a: 'x' },
  });
  await page.waitForTimeout(200);

  // #then
  expect(await requestProjection(page, 'after-whole')).toEqual({ records: [], notices: [] });
});

test('a command delivered twice has one effect', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context);
  await requestProjection(page, 'before-echo');

  // #when
  await sendCommand(page, 'echoed', 'Брок');
  await sendCommand(page, 'echoed', 'Брок');
  await expect.poll(() => projectedNames(page, 'echo-check')).toEqual(['Брок']);
  await page.waitForTimeout(200);

  // #then
  expect(await projectedNames(page, 'echo-final')).toEqual(['Брок']);
});

test('a window closed and opened again shows the same records', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context);
  await sendCommand(page, 'reopen', 'Брок');
  await expect.poll(() => projectedNames(page, 'reopen-check')).toEqual(['Брок']);
  await page.close();

  // #when
  const reopened = await context.newPage();

  await reopened.goto('/index.html');

  // #then
  expect(await projectedNames(reopened, 'reopen-final')).toEqual(['Брок']);
});

test('a background restart over the same storage shows the same records', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');

  const background = await openBackground(context);

  await sendCommand(page, 'restart', 'Брок');
  await expect.poll(() => projectedNames(page, 'restart-check')).toEqual(['Брок']);

  // #when
  await background.reload();

  // #then
  expect(await projectedNames(page, 'restart-final')).toEqual(['Брок']);
});

test('a failed write keeps the value and shows the banner at full width as a live region', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');

  const background = await openBackground(context);

  await requestProjection(page, 'before-failure');
  await background.evaluate(() => {
    window.mockPlatform.setFailingStorageOperations(['write']);
  });

  // #when
  await sendCommand(page, 'failed-write', 'Брок');
  await expect(page.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);

  // #then
  expect({
    names: await projectedNames(page, 'after-failure'),
    width: (await page.getByRole('status').boundingBox())?.width,
  }).toEqual({ names: ['Брок'], width: 600 });
});

test('the banner goes when the notices clear', async ({ page }) => {
  // #given
  await page.goto('/index.html');
  await expect(page.getByRole('tabpanel')).toBeVisible();

  const nonce = await firstRequestNonce(page);

  await postMessage(page, {
    t: 'projection',
    nonce,
    engine: 'stub',
    seq: 0,
    i: 1,
    n: 1,
    records: [],
    notices: ['local-save-failed'],
  });
  await expect(page.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);

  // #when
  await postMessage(page, { t: 'delta', engine: 'stub', seq: 1, records: [], notices: [] });

  // #then
  await expect(page.getByRole('status')).toBeEmpty();
});

test('the window and background load with no console error', async ({ page, context }) => {
  // #given
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  // #when
  await page.goto('/index.html');
  await openBackground(context);
  await requestProjection(page, 'no-errors');

  // #then
  expect(errors).toEqual([]);
});

function sheet(id: string): VersionedRecord {
  return {
    k: `sheet:${id}`,
    d: { kind: 'pc', name: id, order: 0 },
    c: 1,
    a: 'mock-connection',
  };
}

async function openBackground(context: BrowserContext, path = '/background.html'): Promise<Page> {
  const background = await context.newPage();

  await background.goto(path, { waitUntil: 'networkidle' });

  return background;
}

async function seedStorage(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(
    ([storageKey, text]) => {
      localStorage.setItem(storageKey ?? '', text ?? '');
    },
    [`${STORAGE_PREFIX}${key}`, value],
  );
}

async function storedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('mr1:')));
}

async function postMessage(page: Page, message: JsonValue): Promise<void> {
  await page.evaluate(
    ([channel, text]) => {
      // SAFETY: the text is the JSON.stringify of a JsonValue, one line below.
      const data = JSON.parse(text) as JsonValue;

      void window.mockPlatform.broadcast.sendMessage(channel, data, { destination: 'LOCAL' });
    },
    [CHANNEL, JSON.stringify(message)] as const,
  );
}

async function sendCommand(page: Page, id: string, name: string): Promise<void> {
  await postMessage(page, {
    t: 'command',
    id,
    command: { type: 'sheet-create', kind: 'pc', name },
  });
}

// Repeats like a window does, because the background page may still be starting.
async function requestProjection(page: Page, nonce: string): Promise<Projection> {
  return page.evaluate(
    ([channel, requestNonce]) =>
      new Promise<Projection>((resolve) => {
        const parts = new Map<number, WireMessage>();
        const platform = window.mockPlatform;

        const send = (): void => {
          void platform.broadcast.sendMessage(
            channel,
            { t: 'projection-request', nonce: requestNonce },
            { destination: 'LOCAL' },
          );
        };

        const timer = setInterval(send, 50);

        const unsubscribe = platform.broadcast.onMessage(channel, (event) => {
          // SAFETY: the test reads only projection fields it filters for below.
          const message = event.data as WireMessage;

          if (message.t !== 'projection' || message.nonce !== requestNonce) {
            return;
          }

          parts.set(message.i ?? 0, message);

          if (parts.size === message.n) {
            clearInterval(timer);
            unsubscribe();
            resolve({
              records: [...parts.values()].flatMap((part) => part.records ?? []),
              notices: message.notices ?? [],
            });
          }
        });

        send();
      }),
    [CHANNEL, nonce] as const,
  );
}

let projectionCounter = 0;

async function projectedNames(page: Page, nonce: string): Promise<string[]> {
  projectionCounter += 1;

  const projection = await requestProjection(page, `${nonce}-${projectionCounter}`);

  return projection.records.map((record) => {
    const data = record.d;

    return data !== null && !Array.isArray(data) && Object.hasOwn(Object(data), 'name')
      ? String(Object(data).name)
      : '';
  });
}

async function startRecordingWire(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.recordedWire = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      // SAFETY: the test reads only the type tag of each message.
      window.recordedWire.push((event.data as WireMessage).t);
    });
  }, CHANNEL);
}

async function recordedTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => window.recordedWire);
}

async function countRecorded(page: Page, type: string): Promise<number> {
  const types = await recordedTypes(page);

  return types.filter((recorded) => recorded === type).length;
}

async function firstRequestNonce(page: Page): Promise<string> {
  return page.evaluate(
    (channel) =>
      new Promise<string>((resolve) => {
        const unsubscribe = window.mockPlatform.broadcast.onMessage(channel, (event) => {
          // SAFETY: the test reads only the fields of the request it filters for.
          const message = event.data as WireMessage;

          if (message.t === 'projection-request') {
            unsubscribe();
            resolve(message.nonce ?? '');
          }
        });
      }),
    CHANNEL,
  );
}
