import { Result } from 'better-result';
import { NotificationFailure } from '@/platform/ports';
import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { blockAddress, sheetRootAddress } from '@/core/block-address';
import { PRESET_FORMAT_VERSION as FORMAT_VERSION } from '@/core/format-version';
import { linkDataOf, type LinkTarget } from '@/core/link-target';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type BlockData, type VersionedRecord } from '@/core/records';
import type { LinkPickerTiming } from '@/core/timing';
import type { Command, SyncState } from '@/core/ui-messages';
import { copy } from '@/copy';
import type { Bounds, NotificationVariant } from '@/platform/ports';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { createRoomRig } from '../../../tests/support/room-rig';
import { LinkPicker, TokenCellPicker } from './link-picker';

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

      title: 'Персонажи',
      repeat: { nameField: 'name' },

      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'token' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      title: 'NPC',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              title: 'Противники',
              repeat: { id: 'npc_name', nameField: 'npc_name' },

              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'npc_name' },
                    { kind: 'token', id: 'token' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'number', id: 'hp' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const SHEETS: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'blk:arag', d: { set: 'pc', order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
  {
    k: 'blk:arag',
    d: { order: 0, cells: { name: ['Арагорн', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  },
  {
    k: 'blk:npc:npc_name:gob',
    d: { order: 0, cells: { npc_name: ['Гоблин', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  },
];

// The targets a test picks: the sheet "Арагорн", and the repeat block "Гоблин" of the NPC sheet.
function linkTarget(sheetId: string, path: readonly string[], cellId: string): LinkTarget {
  const block = blockAddress(sheetId, path);

  if (block === null) throw new Error('fixture must be a block address');

  return { block, cellId };
}

const TARGETS = {
  arag: linkTarget('arag', [], 'token'),
  gob: linkTarget('npc', ['npc_name', 'gob'], 'token'),
} satisfies Record<string, LinkTarget>;

type TargetName = keyof typeof TARGETS;

// What the picker did, in order, with what the test did between: the picked link arriving.
type Step =
  | {
      kind: 'send';
      command: Command;
    }
  | {
      kind: 'arrived';
    }
  | {
      kind: 'read';
    }
  | {
      kind: 'write';
      label: string;
    }
  | {
      kind: 'notify';
      message: string;
      variant: NotificationVariant | undefined;
    }
  | {
      kind: 'close';
    };

type LabelAnswer =
  | {
      label: string | null;
    }
  | {
      fails: true;
    }
  | {
      hangs: true;
    };

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
  | {
      kind: 'answered';
      answer: undefined;
    }
  | {
      kind: 'refused';
      rejection: {
        t: 'command-rejected';
        id: string;
        reason: 'deleted-sheet';
      };
    }
  | {
      kind: 'timed-out';
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
        {
          k: 'blk:npc:npc_name:orc',
          d: { order: 1, cells: { npc_name: ['Орк', 1, 'seed'] } },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: 'link:t9',
          d: { s: 'npc', path: ['npc_name', 'gob'], c: 'token' },
          c: 1,
          a: 'seed',
        },
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
        { k: 'blk:arag', d: null, c: 2, a: 'seed', l: [1, 'seed'] },
        { k: 'blk:npc:npc_name:gob', d: null, c: 2, a: 'seed', l: [1, 'seed'] },
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
        [{ k: `link:${TOKEN}`, d: { s: 'arag', c: 'token' }, c: 1, a: 'gm' }],
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
        [
          {
            k: 'blk:arag',
            d: { order: 0, cells: { name: ['Странник', 2, 'gm'] } },
            c: 2,
            a: 'gm',
            l: [1, 'seed'],
          },
        ],
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

type OfferView = {
  checked: boolean;
  disabled: boolean;
  hint: string | null;
};

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
    show: (message: string, variant?: NotificationVariant) => {
      steps.push({ kind: 'notify', message, variant });

      return Result.tryPromise({
        try: () => answer(options.notify, 'notification'),
        catch: (error) => new NotificationFailure({ reason: String(error) }),
      });
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
  const target = TARGETS[name];

  const command: Extract<Command, { type: 'link-set' }> = {
    type: 'link-set',
    tokenId: TOKEN,
    sheetId: target.block.sheetId,
    block: target.block,
    cellId: target.cellId ?? '',
  };

  return command;
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
function groupsOf(picker: Harness): {
  heading: string;
  targets: (string | null)[];
}[] {
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

describe('ported reverse-picker and command outcome contracts', () => {
  const LIVE: SyncState = {
    state: 'live',
    firstCatchUpDone: true,
    gmAnswered: true,
    gmLink: 'online',
    role: 'GM',
  };

  const PRESET: Preset = {
    v: 4,
    templates: [
      {
        id: 'crew',
        title: 'Персонажи',
        repeat: { nameField: 'name' },
        tabs: [
          {
            sections: [
              {
                title: 'Персонаж',
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'name' },
                      { kind: 'token', id: 'portrait' },
                      { kind: 'token', id: 'mount' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const RECORDS: VersionedRecord[] = [
    { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
    {
      k: 'blk:brok',
      d: { set: 'crew', order: 0, cells: { name: ['Брок', 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    },
  ];

  const mounted: Root[] = [];
  const outcomeRig = createRoomRig({ seeded: RECORDS, until: 'live' });
  const timeoutRig = createRoomRig({ timing: { commandTimeoutMs: 5, linkSetTimeoutMs: 5 } });

  type ReverseSend = ComponentProps<typeof TokenCellPicker>['sendCommand'];

  function rootTarget(sheetId: string, cellId: string): LinkTarget {
    return { block: sheetRootAddress(sheetId), cellId };
  }

  afterEach(() => {
    for (const root of mounted.splice(0)) {
      act(() => root.unmount());
    }

    document.body.innerHTML = '';
  });

  test('distinguishes equal forward-picker groups by token cell without changing the offered label', async () => {
    // #given
    const container = document.createElement('div');
    const root = createRoot(container);
    const store = createProjectionStore();
    store.replaceAll(RECORDS, [], [], LIVE);
    document.body.append(container);
    mounted.push(root);

    // #when
    await act(async () => {
      root.render(
        <LinkPicker
          tokenId="token"
          store={store}
          sendCommand={async () => ({ kind: 'answered', answer: undefined })}
          scene={{ getItemLabel: async () => '', setItemLabel: async () => undefined }}
          notification={{ show: async () => Result.ok('notice') }}
          onLinked={async () => undefined}
        />,
      );
    });
    await settle();

    const groups = [...container.querySelectorAll('section')].map((section) => ({
      name: section.getAttribute('aria-label'),
      choice: section.querySelector('button')?.textContent?.trim(),
      accessibleChoice: section.querySelector('button')?.getAttribute('aria-label'),
    }));

    // #then
    expect(groups).toEqual([
      { name: 'Персонаж — portrait', choice: 'Брок', accessibleChoice: 'Брок, portrait' },
      { name: 'Персонаж — mount', choice: 'Брок', accessibleChoice: 'Брок, mount' },
    ]);
  });

  test('keeps the reverse picker open and announces a refused real command batch', async () => {
    // #given
    const room = outcomeRig.openRoom();
    const gm = await outcomeRig.startClient(room, 'gm-a');
    const closed: string[] = [];

    const picker = await renderReversePicker({
      target: rootTarget('brok', 'removed-cell'),
      store: gm.store,
      sendCommand: gm.window.sendCommand,
      ids: ['free', 'second-free'],
      onLinked: async () => {
        closed.push('closed');
      },
    });

    await choose(picker, 'free');
    await choose(picker, 'second-free');

    // #when
    await press(picker, copy.command.linkSheet);
    await settle(20);

    // #then
    expect({
      closed,
      live: picker.querySelector('[aria-live]')?.textContent,
      selected: [...picker.querySelectorAll<HTMLInputElement>('input:checked')].length,
    }).toEqual({ closed: [], live: copy.linkFailed, selected: 2 });
  });

  test('keeps the reverse picker open and announces a timed-out real command', async () => {
    // #given
    const room = timeoutRig.openRoom();
    const orphan = timeoutRig.createClient(room, 'gm-timeout');
    orphan.openWindow();
    const store = createProjectionStore();
    store.replaceAll(RECORDS, [], [], LIVE);
    const closed: string[] = [];

    const picker = await renderReversePicker({
      target: rootTarget('brok', 'portrait'),
      store,
      sendCommand: orphan.window.sendCommand,
      ids: ['free'],
      onLinked: async () => {
        closed.push('closed');
      },
    });

    await choose(picker, 'free');

    // #when
    await press(picker, copy.command.linkSheet);
    await settle(20);

    // #then
    expect({
      closed,
      live: picker.querySelector('[aria-live]')?.textContent,
      selected: [...picker.querySelectorAll<HTMLInputElement>('input:checked')].length,
    }).toEqual({ closed: [], live: copy.linkFailed, selected: 1 });
  });

  test('marks current-cell and elsewhere links separately and unlinks only current-cell selections', async () => {
    // #given
    const commands: Command[] = [];

    const picker = await reversePicker(async (command) => {
      commands.push(command);

      return { kind: 'answered', answer: undefined };
    });

    // #when
    await choose(picker, 'current');
    await choose(picker, 'elsewhere');
    await press(picker, copy.command.unlinkSheet);

    const statuses = Object.fromEntries(
      [...picker.querySelectorAll('li label')].map((label) => [
        label.querySelector('span')?.textContent,
        label.querySelector('span:last-child')?.textContent,
      ]),
    );

    // #then
    expect({ statuses, commands }).toEqual({
      statuses: {
        current: 'Привязан к этой ячейке',
        elsewhere: 'Привязан к другой ячейке',
        free: 'free',
      },
      commands: [{ type: 'link-clear', tokenId: 'current' }],
    });
  });

  test('keeps the reverse picker open when a real unlink becomes stale and is refused', async () => {
    // #given
    const room = outcomeRig.openRoom();

    const link: VersionedRecord = {
      k: 'link:current',
      d: { s: 'brok', c: 'portrait' },
      c: 1,
      a: 'seed',
    };

    const gm = await outcomeRig.startClient(room, 'gm-unlink', { seeded: [...RECORDS, link] });
    const closed: string[] = [];

    // SAFETY: both command variants have the same `undefined` answer in the real client.
    const staleUnlink = (async (command: Extract<Command, { type: 'link-set' | 'link-clear' }>) => {
      if (command.type === 'link-clear') {
        await gm.window.sendCommand(command);
      }

      return gm.window.sendCommand(command);
    }) as ReverseSend;

    const picker = await renderReversePicker({
      target: rootTarget('brok', 'portrait'),
      store: gm.store,
      sendCommand: staleUnlink,
      ids: ['current'],
      onLinked: async () => {
        closed.push('closed');
      },
    });

    await choose(picker, 'current');

    // #when
    await press(picker, copy.command.unlinkSheet);

    // #then
    expect({
      closed,
      live: picker.querySelector('[aria-live]')?.textContent,
      selected: [...picker.querySelectorAll<HTMLInputElement>('input:checked')].length,
    }).toEqual({ closed: [], live: copy.linkFailed, selected: 1 });
  });

  async function reversePicker(
    sendCommand: ReverseSend,
    onLinked: () => Promise<void> = async () => undefined,
  ): Promise<HTMLElement> {
    const store = createProjectionStore();

    const records: VersionedRecord[] = [
      ...RECORDS,
      { k: 'link:current', d: { s: 'brok', c: 'portrait' }, c: 1, a: 'seed' },
      { k: 'link:elsewhere', d: { s: 'brok', c: 'mount' }, c: 1, a: 'seed' },
    ];

    store.replaceAll(records, [], [], LIVE);

    return renderReversePicker({
      target: rootTarget('brok', 'portrait'),
      store,
      sendCommand,
      ids: ['current', 'elsewhere', 'free'],
      onLinked,
    });
  }

  async function renderReversePicker({
    target,
    store,
    sendCommand,
    ids,
    onLinked,
  }: {
    target: LinkTarget;
    store: ReturnType<typeof createProjectionStore>;
    sendCommand: ReverseSend;
    ids: string[];
    onLinked: () => Promise<void>;
  }): Promise<HTMLElement> {
    const container = document.createElement('div');
    const root = createRoot(container);
    document.body.append(container);
    mounted.push(root);

    await act(async () => {
      root.render(
        <TokenCellPicker
          target={target}
          store={store}
          sendCommand={sendCommand}
          scene={{
            getItemIds: async () => ids,
            getItemBounds: async () => new Map(ids.map((id, index) => [id, bounds(index + 1)])),
          }}
          viewport={{ getBounds: async () => bounds(0, 10) }}
          onLinked={onLinked}
        />,
      );
    });
    await settle();

    return container;
  }

  function bounds(minimum: number, maximum = minimum + 1): Bounds {
    return {
      min: { x: minimum, y: minimum },
      max: { x: maximum, y: maximum },
      width: maximum - minimum,
      height: maximum - minimum,
      center: { x: (minimum + maximum) / 2, y: (minimum + maximum) / 2 },
    };
  }

  async function choose(container: HTMLElement, name: string): Promise<void> {
    const label = [...container.querySelectorAll('label')].find((node) =>
      node.textContent.includes(name),
    );

    const input = label?.querySelector('input');

    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`No token choice ${name}`);
    }

    await act(async () => input.click());
  }

  async function press(container: HTMLElement, name: string): Promise<void> {
    const button = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === name,
    );

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`No button ${name}`);
    }

    await act(async () => button.click());
    await settle();
  }

  async function settle(milliseconds = 0): Promise<void> {
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, milliseconds);
        }),
    );
  }
});

describe('ported reverse-picker ordering and link command contracts', () => {
  const TARGET = { block: sheetRootAddress('shared'), cellId: 'portrait' };

  const SYNC: SyncState = {
    state: 'live',
    firstCatchUpDone: true,
    gmAnswered: true,
    gmLink: 'online',
    role: 'GM',
  };

  const PRESET: Preset = {
    v: 4,
    templates: [
      {
        id: 'shared',
        title: 'Общий лист',
        tabs: [
          {
            sections: [
              {
                rows: [
                  {
                    cells: [
                      { kind: 'token', id: 'portrait' },
                      { kind: 'token', id: 'camp' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const mounted: Root[] = [];

  afterEach(() => {
    for (const root of mounted.splice(0)) {
      act(() => root.unmount());
    }

    document.body.innerHTML = '';
  });

  test('orders scene tokens by viewport first and linked state second', async () => {
    // #given
    const picker = await openPicker();

    // #when
    const choices = listedChoices(picker.container);

    // #then
    expect(choices).toEqual([
      { name: 'near-free', linked: false },
      { name: 'far-free', linked: false },
      { name: 'near-linked', linked: true },
      { name: 'near-other-linked', linked: true },
      { name: 'far-linked', linked: true },
    ]);
  });

  test('keeps the latest token order when superseded scene bounds arrive last', async () => {
    // #given
    const staleBounds = Promise.withResolvers<Map<string, Bounds>>();
    const picker = await openPicker(() => staleBounds.promise);

    // #when
    await picker.render();
    const beforeStaleAnswer = listedChoices(picker.container).map(({ name }) => name);
    await act(async () => {
      staleBounds.resolve(sceneItemBounds({ nearFree: 100, farFree: 1 }));
    });

    // #then
    const latestOrder = ['near-free', 'far-free', 'near-linked', 'near-other-linked', 'far-linked'];
    expect({
      beforeStaleAnswer,
      afterStaleAnswer: listedChoices(picker.container).map(({ name }) => name),
    }).toEqual({
      beforeStaleAnswer: latestOrder,
      afterStaleAnswer: latestOrder,
    });
  });

  test('reassigns selected tokens and selectively unlinks only selected links to this cell', async () => {
    // #given
    const picker = await openPicker();

    // #when
    await choose(picker.container, 'near-other-linked');
    await choose(picker.container, 'near-linked');
    await press(picker.container, 'Привязать лист…');

    const linkedCommands = [...picker.commands];
    picker.commands.length = 0;

    await press(picker.container, 'Отвязать лист');

    // #then
    expect({ linkedCommands, unlinkedCommands: picker.commands }).toEqual({
      linkedCommands: [
        {
          type: 'link-set',
          tokenId: 'near-other-linked',
          sheetId: 'shared',
          block: TARGET.block,
          cellId: 'portrait',
        },
        {
          type: 'link-set',
          tokenId: 'near-linked',
          sheetId: 'shared',
          block: TARGET.block,
          cellId: 'portrait',
        },
      ],
      unlinkedCommands: [{ type: 'link-clear', tokenId: 'near-linked' }],
    });
  });

  function sceneItemBounds({ nearFree = 1, farFree = 100 } = {}): Map<string, Bounds> {
    return new Map([
      ['near-free', bounds(nearFree)],
      ['near-linked', bounds(2)],
      ['near-other-linked', bounds(3)],
      ['far-free', bounds(farFree)],
      ['far-linked', bounds(101)],
    ]);
  }

  const defaultItemBounds = async () => sceneItemBounds();

  async function openPicker(initialItemBounds = defaultItemBounds) {
    const store = createProjectionStore();
    const commands: Command[] = [];
    const container = document.createElement('div');
    const root = createRoot(container);

    const records: VersionedRecord[] = [
      { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
      { k: 'link:near-linked', d: { s: 'shared', c: 'portrait' }, c: 1, a: 'seed' },
      { k: 'link:far-linked', d: { s: 'shared', c: 'portrait' }, c: 1, a: 'seed' },
      { k: 'link:near-other-linked', d: { s: 'shared', c: 'camp' }, c: 1, a: 'seed' },
    ];

    document.body.append(container);
    mounted.push(root);
    store.replaceAll(records, [], [], SYNC);

    const viewport = { getBounds: async () => bounds(0, 10) };

    const sendCommand: ComponentProps<typeof TokenCellPicker>['sendCommand'] = async (command) => {
      commands.push(command);

      return { kind: 'answered', answer: undefined };
    };

    async function render(getItemBounds = defaultItemBounds): Promise<void> {
      await act(async () => {
        root.render(
          <TokenCellPicker
            target={TARGET}
            store={store}
            sendCommand={sendCommand}
            scene={{
              getItemIds: async () => [
                'far-linked',
                'near-free',
                'near-linked',
                'far-free',
                'near-other-linked',
              ],
              getItemBounds,
            }}
            viewport={viewport}
            onLinked={async () => undefined}
          />,
        );
      });
      await settle();
    }

    await render(initialItemBounds);

    return { container, commands, render };
  }

  function bounds(minimum: number, maximum = minimum + 1): Bounds {
    return {
      min: { x: minimum, y: minimum },
      max: { x: maximum, y: maximum },
      width: maximum - minimum,
      height: maximum - minimum,
      center: { x: (minimum + maximum) / 2, y: (minimum + maximum) / 2 },
    };
  }

  function listedChoices(container: HTMLElement): { name: string; linked: boolean }[] {
    return [...container.querySelectorAll('li label')].map((label) => ({
      name: label.querySelector('span:first-of-type')?.textContent ?? '',
      linked: label.textContent.includes('Привязан к '),
    }));
  }

  async function choose(container: HTMLElement, name: string): Promise<void> {
    const label = [...container.querySelectorAll('label')].find((node) =>
      node.textContent.includes(name),
    );

    const input = label?.querySelector('input');

    if (input === null || input === undefined) {
      throw new Error(`No token choice ${name}`);
    }

    await act(async () => input.click());
  }

  async function press(container: HTMLElement, name: string): Promise<void> {
    const button = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === name,
    );

    if (button === undefined) {
      throw new Error(`No button ${name}`);
    }

    await act(async () => button.click());
    await settle();
  }

  async function settle(): Promise<void> {
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        }),
    );
  }
});

describe('ported linked-target naming contracts', () => {
  const SYNC: SyncState = {
    state: 'live',
    firstCatchUpDone: true,
    gmAnswered: true,
    gmLink: 'online',
    role: 'GM',
  };

  const mounted: Root[] = [];

  afterEach(() => {
    for (const root of mounted.splice(0)) {
      act(() => root.unmount());
    }

    document.body.innerHTML = '';
  });

  test('labels a token by the nearest nonblank block, section, sheet or template name', async () => {
    // #given
    const cases = [
      blockCase('Удар', 'Атаки'),
      blockCase('', 'Атаки'),
      rootSetCase('Ада'),
      rootSingleCase(),
    ];

    // #when
    const labels: string[] = [];

    for (const fixture of cases) {
      // oxlint-disable-next-line no-await-in-loop
      labels.push(await linkedLabel(fixture));
    }

    // #then
    expect(labels).toEqual(['Удар', 'Атаки', 'Ада', 'Инвентарь']);
  });

  type PickerFixture = {
    preset: Preset;
    records: VersionedRecord[];
  };

  function blockCase(blockName: string, sectionTitle: string): PickerFixture {
    return {
      preset: {
        v: 4,
        templates: [
          {
            id: 'bestiary',
            title: 'Бестиарий',
            tabs: [
              {
                sections: [
                  {
                    title: sectionTitle,
                    repeat: { id: 'attacks', nameField: 'name' },
                    rows: [
                      {
                        cells: [
                          { kind: 'field', type: 'text', id: 'name' },
                          { kind: 'token', id: 'portrait' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      records: [
        blockRecord('blk:bestiary', { order: 0, cells: {} }),
        blockRecord('blk:bestiary:attacks:a1', {
          order: 0,
          cells: blockName === '' ? {} : { name: [blockName, 1, 'seed'] },
        }),
      ],
    };
  }

  function rootSetCase(sheetName: string): PickerFixture {
    return {
      preset: {
        v: 4,
        templates: [
          {
            id: 'heroes',
            title: 'Герои',
            repeat: { nameField: 'sheet_name' },
            tabs: [
              {
                sections: [
                  {
                    rows: [
                      {
                        cells: [
                          { kind: 'field', type: 'text', id: 'sheet_name' },
                          { kind: 'token', id: 'portrait' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      records: [
        blockRecord('blk:h1', {
          set: 'heroes',
          order: 0,
          cells: { sheet_name: [sheetName, 1, 'seed'] },
        }),
      ],
    };
  }

  function rootSingleCase(): PickerFixture {
    return {
      preset: {
        v: 4,
        templates: [
          {
            id: 'inventory',
            title: 'Инвентарь',
            tabs: [
              {
                sections: [{ rows: [{ cells: [{ kind: 'token', id: 'portrait' }] }] }],
              },
            ],
          },
        ],
      },
      records: [blockRecord('blk:inventory', { order: 0, cells: {} })],
    };
  }

  async function linkedLabel(fixture: PickerFixture): Promise<string> {
    const store = createProjectionStore();
    const container = document.createElement('div');
    const root = createRoot(container);
    const writes: string[] = [];

    document.body.append(container);
    mounted.push(root);
    store.replaceAll(
      [record('preset', encodePreset(fixture.preset)), ...fixture.records],
      [],
      [],
      SYNC,
    );

    await act(async () => {
      root.render(
        <LinkPicker
          tokenId="token"
          store={store}
          sendCommand={async () => ({ kind: 'answered', answer: undefined })}
          scene={{
            getItemLabel: async () => '',
            setItemLabel: async (_id, label) => {
              writes.push(label);
            },
          }}
          notification={{ show: async () => Result.ok('notice') }}
          onLinked={async () => undefined}
        />,
      );
    });
    await settle();

    const button = container.querySelector('section button');

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('the picker rendered no target');
    }

    await act(async () => button.click());
    const commandTarget = targetOf(fixture);

    await act(async () => {
      store.applyDelta([record('link:token', commandTarget)], [], [], [], SYNC);
    });
    await settle();

    return writes[0] ?? '(no label)';
  }

  function targetOf(fixture: PickerFixture) {
    const repeated = fixture.records.find((item) => item.k.includes(':attacks:'));

    return repeated === undefined
      ? {
          s: fixture.preset.templates[0]?.repeat === undefined ? 'inventory' : 'h1',
          c: 'portrait',
        }
      : { s: 'bestiary', path: ['attacks', 'a1'], c: 'portrait' };
  }

  function record(k: string, d: VersionedRecord['d']): VersionedRecord {
    return recordSchema.parse({ k, d, c: 1, a: 'seed' });
  }

  function blockRecord(k: string, d: BlockData): VersionedRecord {
    // SAFETY: every caller supplies a blk key and block data with its required lifecycle.
    return { k, d, c: 1, a: 'seed', l: [1, 'seed'] };
  }

  async function settle(): Promise<void> {
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        }),
    );
  }
});

describe('ported viewport fallback contract', () => {
  const PRESET: Preset = {
    v: 4,
    templates: [
      {
        id: 'shared',
        title: 'Общий лист',
        tabs: [
          {
            sections: [{ rows: [{ cells: [{ kind: 'token', id: 'portrait' }] }] }],
          },
        ],
      },
    ],
  };

  const SYNC: SyncState = {
    state: 'live',
    firstCatchUpDone: true,
    gmAnswered: true,
    gmLink: 'online',
    role: 'GM',
  };

  const mounted: Root[] = [];

  afterEach(() => {
    for (const root of mounted.splice(0)) {
      act(() => root.unmount());
    }
  });

  test('a failed viewport read still lists every scene token with globally unlinked tokens first', async () => {
    // #given
    const store = createProjectionStore();
    const container = document.createElement('div');
    const root = createRoot(container);

    const records: VersionedRecord[] = [
      record('preset', encodePreset(PRESET)),
      record('link:linked-b', { s: 'shared', c: 'portrait' }),
      record('link:linked-a', { s: 'shared', c: 'portrait' }),
    ];

    mounted.push(root);
    store.replaceAll(records, [], [], SYNC);

    // #when
    await act(async () => {
      root.render(
        <TokenCellPicker
          target={{ block: sheetRootAddress('shared'), cellId: 'portrait' }}
          store={store}
          sendCommand={async () => ({ kind: 'answered', answer: undefined })}
          scene={{
            getItemIds: async () => ['linked-b', 'free-a', 'linked-a', 'free-b'],
            getItemBounds: async () => new Map(),
          }}
          viewport={{ getBounds: async () => Promise.reject(new Error('viewport unavailable')) }}
          onLinked={async () => undefined}
        />,
      );
    });
    await settle();

    // #then
    expect(listed(container)).toEqual([
      { name: 'free-a', linked: false },
      { name: 'free-b', linked: false },
      { name: 'linked-b', linked: true },
      { name: 'linked-a', linked: true },
    ]);
  });

  function listed(container: HTMLElement): { name: string; linked: boolean }[] {
    return [...container.querySelectorAll('li label')].map((label) => ({
      name: label.querySelector('span:first-of-type')?.textContent ?? '',
      linked: label.textContent.includes('Привязан к этой ячейке'),
    }));
  }

  function record(k: string, d: VersionedRecord['d']): VersionedRecord {
    return recordSchema.parse({ k, d, c: 1, a: 'seed' });
  }

  async function settle(): Promise<void> {
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        }),
    );
  }
});
