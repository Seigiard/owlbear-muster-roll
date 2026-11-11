import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { VersionedRecord } from '@/core/records';
import { ok } from '@/core/result';
import type { LinkPickerTiming } from '@/core/timing';
import type { Command, SyncState } from '@/core/ui-messages';
import type { NotificationVariant } from '@/platform/ports';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';

import { LinkPicker } from './link-picker';

// React warns about updates outside `act` unless the environment says it is a test.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const TOKEN = 't1';

const GM_LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
};

const SHEETS: readonly VersionedRecord[] = [
  { k: 'sheet:arag', d: { kind: 'pc', name: 'Арагорн', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:gob', d: { kind: 'npc', name: 'Гоблин', order: 0 }, c: 1, a: 'seed' },
];

// What the picker did, in order, with what the test did between: the picked link arriving.
type Step =
  | { kind: 'send'; command: Command }
  | { kind: 'arrived' }
  | { kind: 'read' }
  | { kind: 'write'; label: string }
  | { kind: 'notify'; message: string; variant: NotificationVariant | undefined }
  | { kind: 'close' };

type LabelAnswer = { label: string | null } | { fails: true } | { hangs: true };

// How a port call the test controls answers.
type PortAnswer = 'resolves' | 'rejects' | 'hangs';

// Waits short enough for a test to sit through.
const SHORT: LinkPickerTiming = {
  pickTimeoutMs: 80,
  labelReadTimeoutMs: 30,
  labelWriteTimeoutMs: 30,
};

type Harness = {
  store: ProjectionStore;
  steps: Step[];
  container: HTMLElement;
};

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
  }

  document.body.innerHTML = '';
});

describe('link picker label offer', () => {
  test('a token with no label: the box is checked and the hint says there is no label', async () => {
    // #given
    const picker = await openPicker({ read: { label: '  ' } });

    // #then
    expect(offer(picker)).toEqual({ checked: true, disabled: false, hint: 'Сейчас подписи нет' });
  });

  test('a token with a label: the box is unchecked and the hint shows the label', async () => {
    // #given
    const picker = await openPicker({ read: { label: 'Гоблин 2' } });

    // #then
    expect(offer(picker)).toEqual({
      checked: false,
      disabled: false,
      hint: 'Сейчас: «Гоблин 2»',
    });
  });

  // A rejected read may be a passing fault, so the GM can still try; an item with no label text
  // cannot take one.
  test.each<[string, LabelAnswer, boolean]>([
    ['the read rejects', { fails: true }, false],
    ['the item is missing or has no label text', { label: null }, true],
  ])(
    'when %s: the box is unchecked, no hint, and a pick still links',
    async (_name, read, disabled) => {
      // #given
      const picker = await openPicker({ read });

      // #when
      const before = offer(picker);

      await pick(picker, 'Арагорн');
      await arrive(picker, 'arag');

      // #then
      expect({ before, steps: picker.steps }).toEqual({
        before: { checked: false, disabled, hint: null },
        steps: [
          { kind: 'read' },
          { kind: 'send', command: linkSet('arag') },
          { kind: 'arrived' },
          { kind: 'close' },
        ],
      });
    },
  );

  test('a pick with the box checked links first, then labels the token, then closes', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' } });

    // #when
    await pick(picker, 'Арагорн');

    const beforeArrival = [...picker.steps];
    const afterPick = offer(picker);

    await arrive(picker, 'arag');

    // #then
    expect({ beforeArrival, afterPick, steps: picker.steps }).toEqual({
      beforeArrival: [{ kind: 'read' }, { kind: 'send', command: linkSet('arag') }],
      afterPick: { checked: true, disabled: true, hint: 'Сейчас подписи нет' },
      steps: [
        { kind: 'read' },
        { kind: 'send', command: linkSet('arag') },
        { kind: 'arrived' },
        { kind: 'write', label: 'Арагорн' },
        { kind: 'close' },
      ],
    });
  });

  test('a pick with the box unchecked links and leaves the label as it is', async () => {
    // #given
    const picker = await openPicker({ read: { label: 'Гоблин 2' } });

    // #when
    await pick(picker, 'Гоблин');
    await arrive(picker, 'gob');

    // #then
    expect(picker.steps).toEqual([
      { kind: 'read' },
      { kind: 'send', command: linkSet('gob') },
      { kind: 'arrived' },
      { kind: 'close' },
    ]);
  });

  test('the GM can decline the offer on a token with no label, and accept it on a labelled one', async () => {
    // #given
    const declined = await openPicker({ read: { label: '' } });
    const accepted = await openPicker({ read: { label: 'Гоблин 2' } });

    // #when
    await toggle(declined);
    await pick(declined, 'Арагорн');
    await arrive(declined, 'arag');
    await toggle(accepted);
    await pick(accepted, 'Гоблин');
    await arrive(accepted, 'gob');

    // #then
    expect({
      declined: declined.steps.filter((step) => step.kind === 'write'),
      accepted: accepted.steps.filter((step) => step.kind === 'write'),
    }).toEqual({ declined: [], accepted: [{ kind: 'write', label: 'Гоблин' }] });
  });

  test('a failed label write keeps the link, shows an error notification, and closes', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' }, write: 'rejects' });

    // #when
    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');

    // #then
    expect(picker.steps).toEqual([
      { kind: 'read' },
      { kind: 'send', command: linkSet('arag') },
      { kind: 'arrived' },
      { kind: 'write', label: 'Арагорн' },
      { kind: 'notify', message: 'Не удалось подписать токен', variant: 'ERROR' },
      { kind: 'close' },
    ]);
  });

  test('while the label read is pending the box and the sheets are disabled, and after its timeout a pick links with no label', async () => {
    // #given
    const picker = await openPicker({ read: { hangs: true }, timing: SHORT });

    const pending = { offer: offer(picker), sheetsDisabled: sheetsDisabled(picker) };

    // #when
    await wait(SHORT.labelReadTimeoutMs + 20);

    const timedOut = { offer: offer(picker), sheetsDisabled: sheetsDisabled(picker) };

    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');

    // #then
    expect({ pending, timedOut, steps: picker.steps }).toEqual({
      pending: { offer: { checked: false, disabled: true, hint: null }, sheetsDisabled: true },
      timedOut: { offer: { checked: false, disabled: false, hint: null }, sheetsDisabled: false },
      steps: [
        { kind: 'read' },
        { kind: 'send', command: linkSet('arag') },
        { kind: 'arrived' },
        { kind: 'close' },
      ],
    });
  });

  test('a label write with no answer counts as failed: the notification shows, then the picker closes', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' }, write: 'hangs', timing: SHORT });

    // #when
    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');
    await wait(SHORT.labelWriteTimeoutMs + 20);

    // #then
    expect(picker.steps).toEqual([
      { kind: 'read' },
      { kind: 'send', command: linkSet('arag') },
      { kind: 'arrived' },
      { kind: 'write', label: 'Арагорн' },
      { kind: 'notify', message: 'Не удалось подписать токен', variant: 'ERROR' },
      { kind: 'close' },
    ]);
  });

  test.each<[string, PortAnswer]>([
    ['rejects', 'rejects'],
    ['never answers', 'hangs'],
  ])('a failure notification that %s still lets the picker close', async (_name, notify) => {
    // #given
    const picker = await openPicker({
      read: { label: '' },
      write: 'rejects',
      notify,
      timing: SHORT,
    });

    // #when
    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');
    await wait(SHORT.labelWriteTimeoutMs + 20);

    // #then
    expect(picker.steps.slice(-2)).toEqual([
      { kind: 'notify', message: 'Не удалось подписать токен', variant: 'ERROR' },
      { kind: 'close' },
    ]);
  });

  test('a popover that does not close lets the GM pick again', async () => {
    // #given
    const picker = await openPicker({ read: { label: 'Гоблин 2' }, close: 'rejects' });

    // #when
    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');

    // #then
    expect({ steps: picker.steps, sheetsDisabled: sheetsDisabled(picker) }).toEqual({
      steps: [
        { kind: 'read' },
        { kind: 'send', command: linkSet('arag') },
        { kind: 'arrived' },
        { kind: 'close' },
      ],
      sheetsDisabled: false,
    });
  });

  test('once the link is in, the pick never times out, even when another GM relinks during a slow label write', async () => {
    // #given
    const picker = await openPicker({
      read: { label: '' },
      write: 'hangs',
      timing: { pickTimeoutMs: 40, labelReadTimeoutMs: 1000, labelWriteTimeoutMs: 1000 },
    });

    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');

    // #when
    await act(async () => {
      picker.store.applyDelta(
        [{ k: `link:${TOKEN}`, d: 'gob', c: 2, a: 'gm-b' }],
        [],
        [],
        [],
        GM_LIVE,
      );
    });
    await wait(100);

    // #then
    expect({ failure: failureText(picker), sheetsDisabled: sheetsDisabled(picker) }).toEqual({
      failure: '',
      sheetsDisabled: true,
    });
  });

  test('a client that stopped being GM before the link arrived writes no label', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' } });

    await pick(picker, 'Арагорн');

    // #when
    await act(async () => {
      picker.steps.push({ kind: 'arrived' });
      picker.store.applyDelta([{ k: `link:${TOKEN}`, d: 'arag', c: 1, a: 'gm' }], [], [], [], {
        ...GM_LIVE,
        role: 'PLAYER',
      });
    });
    await settle();

    // #then
    expect(picker.steps).toEqual([
      { kind: 'read' },
      { kind: 'send', command: linkSet('arag') },
      { kind: 'arrived' },
      { kind: 'close' },
    ]);
  });

  test('a refused link writes no label and shows the refusal in the picker', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' } });

    // #when
    await pick(picker, 'Арагорн');
    await act(async () => {
      picker.store.setRejection({ t: 'command-rejected', id: 'cmd-1', reason: 'deleted-sheet' });
    });
    await settle();

    // #then
    expect({
      steps: picker.steps,
      message: failureText(picker),
    }).toEqual({
      steps: [{ kind: 'read' }, { kind: 'send', command: linkSet('arag') }],
      message: 'Не удалось привязать. Попробуйте ещё раз.',
    });
  });

  test('a sheet renamed after the link changes no label', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' } });

    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');

    // #when
    await act(async () => {
      picker.store.applyDelta(
        [{ k: 'sheet:arag', d: { kind: 'pc', name: 'Странник', order: 0 }, c: 2, a: 'gm' }],
        [],
        [],
        [],
        GM_LIVE,
      );
    });
    await settle();

    // #then
    expect(picker.steps.filter((step) => step.kind === 'write')).toEqual([
      { kind: 'write', label: 'Арагорн' },
    ]);
  });

  test('a player client neither reads nor writes a label and shows no offer', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' }, sync: { ...GM_LIVE, role: 'PLAYER' } });

    // #then
    expect({ steps: picker.steps, boxes: checkboxes(picker).length }).toEqual({
      steps: [],
      boxes: 0,
    });
  });

  test('the label is read only once the first catch-up has ended', async () => {
    // #given
    const picker = await openPicker({
      read: { label: '' },
      sync: { ...GM_LIVE, state: 'catching-up', firstCatchUpDone: false },
    });

    const before = [...picker.steps];

    // #when
    await act(async () => {
      picker.store.applyDelta([], [], [], [], GM_LIVE);
    });
    await settle();

    // #then
    expect({ before, after: picker.steps }).toEqual({ before: [], after: [{ kind: 'read' }] });
  });
});

type OfferView = { checked: boolean; disabled: boolean; hint: string | null };

type PickerOptions = {
  read: LabelAnswer;
  write?: PortAnswer;
  notify?: PortAnswer;
  close?: Exclude<PortAnswer, 'hangs'>;
  sync?: SyncState;
  timing?: LinkPickerTiming;
};

async function openPicker(options: PickerOptions): Promise<Harness> {
  const store = createProjectionStore();
  const steps: Step[] = [];
  const container = document.createElement('div');
  const root = createRoot(container);
  let commands = 0;

  document.body.append(container);
  mounted.push(root);
  store.replaceAll(SHEETS, [], [], options.sync ?? GM_LIVE);

  const scene = {
    getItemLabel: (itemId: string): Promise<string | null> => {
      expect(itemId).toBe(TOKEN);
      steps.push({ kind: 'read' });

      if ('hangs' in options.read) {
        return never();
      }

      return 'fails' in options.read
        ? Promise.reject(new Error('label read failed'))
        : Promise.resolve(options.read.label);
    },
    setItemLabel: (itemId: string, label: string): Promise<void> => {
      expect(itemId).toBe(TOKEN);
      steps.push({ kind: 'write', label });

      return answer(options.write, undefined);
    },
  };

  const notification = {
    show: (message: string, variant?: NotificationVariant): Promise<string> => {
      steps.push({ kind: 'notify', message, variant });

      return answer(options.notify, 'notification');
    },
  };

  // Async, so the label read the first render starts resolves inside it.
  await act(async () => {
    root.render(
      <LinkPicker
        tokenId={TOKEN}
        store={store}
        sendCommand={(command) => {
          commands += 1;
          steps.push({ kind: 'send', command });

          return ok(`cmd-${commands}`);
        }}
        scene={scene}
        notification={notification}
        onLinked={() => {
          steps.push({ kind: 'close' });

          return answer(options.close, undefined);
        }}
        timing={options.timing}
      />,
    );
  });
  await settle();

  return { store, steps, container };
}

function answer<Value>(how: PortAnswer = 'resolves', value: Value): Promise<Value> {
  if (how === 'hangs') {
    return never();
  }

  return how === 'rejects'
    ? Promise.reject(new Error(`the port call failed`))
    : Promise.resolve(value);
}

// A port call that never answers.
function never<Value>(): Promise<Value> {
  return new Promise<Value>(() => undefined);
}

function linkSet(sheetId: string): Command {
  return { type: 'link-set', tokenId: TOKEN, sheetId };
}

// The link of the last pick arrives in the replica, as the engine's delta brings it.
async function arrive(picker: Harness, sheetId: string): Promise<void> {
  await act(async () => {
    picker.steps.push({ kind: 'arrived' });
    picker.store.applyDelta(
      [{ k: `link:${TOKEN}`, d: sheetId, c: 1, a: 'gm' }],
      [],
      [],
      [],
      GM_LIVE,
    );
  });
  await settle();
}

async function pick(picker: Harness, name: string): Promise<void> {
  const button = [...picker.container.querySelectorAll('button')].find((one) =>
    one.textContent.startsWith(name),
  );

  if (button === undefined) {
    throw new Error(`the picker lists no "${name}"`);
  }

  await act(async () => {
    button.click();
  });
  await settle();
}

async function toggle(picker: Harness): Promise<void> {
  const [box] = checkboxes(picker);

  if (box === undefined) {
    throw new Error('the picker shows no label offer');
  }

  await act(async () => {
    box.click();
  });
  await settle();
}

// True when every sheet button is disabled, false when every one is enabled.
function sheetsDisabled(picker: Harness): boolean | 'mixed' {
  const states = new Set(
    [...picker.container.querySelectorAll('button')].map((button) => button.disabled),
  );

  return states.size === 1 ? [...states][0] === true : 'mixed';
}

// The message under the list: a failed link, or "" for none.
function failureText(picker: Harness): string | undefined {
  return picker.container.querySelector('[aria-live]')?.textContent;
}

async function wait(ms: number): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
  );
}

function checkboxes(picker: Harness): HTMLInputElement[] {
  return [...picker.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

// The offer as the GM sees it: the box, and the hint its accessible description points to.
function offer(picker: Harness): OfferView {
  const [box] = checkboxes(picker);

  if (box === undefined) {
    throw new Error('the picker shows no label offer');
  }

  const hintId = box.getAttribute('aria-describedby');
  const hint = hintId === null ? null : document.getElementById(hintId);

  return {
    checked: box.checked,
    disabled: box.disabled,
    hint: hint?.textContent ?? null,
  };
}

// Lets the port promises and the effects they start run to the end.
async function settle(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}
