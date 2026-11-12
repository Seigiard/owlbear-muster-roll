import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { FORMAT_VERSION } from '@/core/format-version';
import { linkDataOf, type LinkTarget } from '@/core/link-target';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
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

// A linkable sheet set, and a single sheet whose linkable repeat section holds the NPCs.
const PRESET: Preset = {
  v: FORMAT_VERSION,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [
        {
          title: 'Противники',
          repeat: true,
          tokens: true,
          rows: [
            [{ kind: 'field', type: 'text', id: 'npc_name' }],
            [{ kind: 'field', type: 'number', id: 'hp' }],
          ],
        },
      ],
    },
  ],
};

const SHEETS: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:arag', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:arag:name', d: { name: 'Арагорн' }, c: 1, a: 'seed' },
  { k: 'rep:npc:npc_name:gob', d: { order: 0, cells: { npc_name: 'Гоблин' } }, c: 1, a: 'seed' },
];

// The targets a test picks: the sheet "Арагорн", and the repeat block "Гоблин" of the NPC sheet.
const TARGETS = {
  arag: { sheetId: 'arag', instanceId: null },
  gob: { sheetId: 'npc', instanceId: 'gob' },
} as const satisfies Record<string, LinkTarget>;

type TargetName = keyof typeof TARGETS;

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
  labelReadTimeoutMs: 30,
  labelWriteTimeoutMs: 30,
};

type Harness = {
  store: ProjectionStore;
  steps: Step[];
  container: HTMLElement;
  answers: ((outcome: LinkOutcome) => void)[];
};

type LinkOutcome =
  | { kind: 'answered'; answer: undefined }
  | {
      kind: 'refused';
      rejection: { t: 'command-rejected'; id: string; reason: 'deleted-sheet' };
    }
  | { kind: 'timed-out' };

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
  }

  document.body.innerHTML = '';
});

describe('link picker targets', () => {
  test('lists one group per linkable template and repeat section, in preset order, each target named with no space before a comma', async () => {
    // #given
    const picker = await openPicker({ read: { label: '' } });

    // #then
    expect(groupsOf(picker)).toEqual([
      { heading: 'Персонажи', targets: ['Арагорн'] },
      { heading: 'Противники', targets: ['Гоблин, NPC'] },
    ]);
  });

  test('lists the targets with no token first in each group', async () => {
    // #given
    const picker = await openPicker({
      read: { label: '' },
      records: [
        { k: 'rep:npc:npc_name:orc', d: { order: 1, cells: { npc_name: 'Орк' } }, c: 1, a: 'seed' },
        { k: 'link:t9', d: { s: 'npc', i: 'gob' }, c: 1, a: 'seed' },
      ],
    });

    // #then
    expect(groupsOf(picker)[1]).toEqual({
      heading: 'Противники',
      targets: ['Орк, NPC', 'Гоблин, NPC, Токен привязан'],
    });
  });

  test('says to create a sheet when no target is linkable', async () => {
    // #given
    const picker = await openPicker({
      read: { label: '' },
      records: [
        { k: 'sheet:arag', d: null, c: 2, a: 'seed' },
        { k: 'rep:npc:npc_name:gob', d: null, c: 2, a: 'seed' },
      ],
    });

    // #then
    expect(picker.container.querySelector('main p')?.textContent).toBe('Сначала создайте лист');
  });
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
      timing: { labelReadTimeoutMs: 1000, labelWriteTimeoutMs: 1000 },
    });

    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag');

    // #when
    await act(async () => {
      picker.store.applyDelta(
        [{ k: `link:${TOKEN}`, d: linkDataOf(TARGETS.gob), c: 2, a: 'gm-b' }],
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

  test('a timed-out outcome after the link arrives does not interrupt finishing', async () => {
    // #given
    const picker = await openPicker({
      read: { label: '' },
      write: 'hangs',
      timing: { labelReadTimeoutMs: 1000, labelWriteTimeoutMs: 1000 },
    });

    await pick(picker, 'Арагорн');
    await arrive(picker, 'arag', 'pending');

    // #when
    await act(async () => {
      answerNext(picker, { kind: 'timed-out' });
    });
    await settle();

    // #then
    expect({
      finishing: picker.steps.slice(-2),
      failure: failureText(picker),
      sheetsDisabled: sheetsDisabled(picker),
    }).toEqual({
      finishing: [{ kind: 'arrived' }, { kind: 'write', label: 'Арагорн' }],
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
      picker.store.applyDelta(
        [{ k: `link:${TOKEN}`, d: { s: 'arag' }, c: 1, a: 'gm' }],
        [],
        [],
        [],
        {
          ...GM_LIVE,
          role: 'PLAYER',
        },
      );
      answerNext(picker, { kind: 'answered', answer: undefined });
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
      answerNext(picker, {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: 'cmd-1', reason: 'deleted-sheet' },
      });
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
        [{ k: 'row:arag:name', d: { name: 'Странник' }, c: 2, a: 'gm' }],
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
  // Records over the seeded ones.
  records?: readonly VersionedRecord[];
  write?: PortAnswer;
  notify?: PortAnswer;
  close?: Exclude<PortAnswer, 'hangs'>;
  sync?: SyncState;
  timing?: LinkPickerTiming;
};

async function openPicker(options: PickerOptions): Promise<Harness> {
  const store = createProjectionStore();
  const steps: Step[] = [];
  const answers: ((outcome: LinkOutcome) => void)[] = [];
  const container = document.createElement('div');
  const root = createRoot(container);
  let commands = 0;

  document.body.append(container);
  mounted.push(root);
  store.replaceAll([...SHEETS, ...(options.records ?? [])], [], [], options.sync ?? GM_LIVE);

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

          return new Promise<LinkOutcome>((resolve) => answers.push(resolve));
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

  return { store, steps, container, answers };
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

function linkSet(name: TargetName): Command {
  return { type: 'link-set', tokenId: TOKEN, ...TARGETS[name] };
}

// The link of the last pick arrives in the replica, as the engine's delta brings it.
async function arrive(
  picker: Harness,
  name: TargetName,
  outcome: LinkOutcome | 'pending' = { kind: 'answered', answer: undefined },
): Promise<void> {
  await act(async () => {
    picker.steps.push({ kind: 'arrived' });
    picker.store.applyDelta(
      [{ k: `link:${TOKEN}`, d: linkDataOf(TARGETS[name]), c: 1, a: 'gm' }],
      [],
      [],
      [],
      GM_LIVE,
    );

    if (outcome !== 'pending') {
      answerNext(picker, outcome);
    }
  });
  await settle();
}

function answerNext(picker: Harness, outcome: LinkOutcome): void {
  const resolveAnswer = picker.answers.shift();

  if (resolveAnswer === undefined) {
    throw new Error('the picker has no command waiting for an outcome');
  }

  resolveAnswer(outcome);
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

// Each group's heading and the accessible names of its targets. A target's `aria-label` overrides
// the name its text would give, so it is the name a screen reader reads.
function groupsOf(picker: Harness): { heading: string; targets: (string | null)[] }[] {
  return [...picker.container.querySelectorAll('section')].map((section) => ({
    heading: section.getAttribute('aria-label') ?? '',
    targets: [...section.querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    ),
  }));
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
