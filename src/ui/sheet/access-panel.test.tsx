import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import { copy } from '@/copy';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import type { CommandOutcome } from '@/ui/replica-client';

import { AccessPanel } from './access-panel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
};

const ACCESS: VersionedRecord = {
  k: 'acl:hero:player',
  d: { name: 'Player' },
  c: 1,
  a: 'gm',
};

type Harness = {
  store: ProjectionStore;
  container: HTMLElement;
  answer: (outcome: AccessOutcome) => void;
};

type AccessOutcome = Exclude<CommandOutcome<never>, { kind: 'answered' }>;

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

describe('access panel outcomes', () => {
  test('an unchanged refusal keeps the wanted state with no failure', async () => {
    // #given
    const panel = await openPanel([ACCESS]);

    // #when
    await clickAccess(panel);
    await applyAccess(panel, { ...ACCESS, d: null, c: 2 });
    await answer(panel, {
      kind: 'refused',
      rejection: { t: 'command-rejected', id: 'access-1', reason: 'unchanged' },
    });

    // #then
    expect(viewOf(panel)).toEqual({ checked: false, failure: '' });
  });

  test('the record settling a change prevents a later timeout failure', async () => {
    // #given
    const panel = await openPanel([]);

    // #when
    await clickAccess(panel);
    await applyAccess(panel, ACCESS);
    await answer(panel, { kind: 'timed-out' });

    // #then
    expect(viewOf(panel)).toEqual({ checked: true, failure: '' });
  });

  test('an ordinary refusal restores the records and shows the failure', async () => {
    // #given
    const panel = await openPanel([ACCESS]);

    // #when
    await clickAccess(panel);
    await answer(panel, {
      kind: 'refused',
      rejection: { t: 'command-rejected', id: 'access-1', reason: 'not-allowed' },
    });

    // #then
    expect(viewOf(panel)).toEqual({ checked: true, failure: copy.aclFailed });
  });
});

async function openPanel(records: readonly VersionedRecord[]): Promise<Harness> {
  const store = createProjectionStore();
  const container = document.createElement('div');
  const root = createRoot(container);
  let resolveOutcome: ((outcome: CommandOutcome<never>) => void) | undefined;

  document.body.append(container);
  mounted.push(root);
  store.replaceAll(records, [], [], LIVE);
  store.setParty([{ id: 'player', name: 'Player', role: 'PLAYER' }]);

  await act(async () => {
    root.render(
      <AccessPanel
        id="access"
        sheetId="hero"
        ownPlayerId="gm"
        store={store}
        sendCommand={() =>
          new Promise<CommandOutcome<never>>((resolve) => {
            resolveOutcome = resolve;
          })
        }
        onClose={() => undefined}
      />,
    );
  });

  return {
    store,
    container,
    answer: (outcome) => {
      if (resolveOutcome === undefined) {
        throw new Error('the panel has no access change waiting for an outcome');
      }

      resolveOutcome(outcome);
    },
  };
}

async function clickAccess(panel: Harness): Promise<void> {
  await act(async () => {
    checkboxOf(panel).click();
  });
}

async function applyAccess(panel: Harness, record: VersionedRecord): Promise<void> {
  await act(async () => {
    panel.store.applyDelta([record], [], [], [], LIVE);
  });
}

async function answer(panel: Harness, outcome: AccessOutcome): Promise<void> {
  await act(async () => {
    panel.answer(outcome);
  });
}

function viewOf(panel: Harness) {
  return {
    checked: checkboxOf(panel).checked,
    failure: panel.container.querySelector('[role="status"]')?.textContent ?? null,
  };
}

function checkboxOf(panel: Harness): HTMLInputElement {
  const checkbox = panel.container.querySelector<HTMLInputElement>('input[type="checkbox"]');

  if (checkbox === null) {
    throw new Error('the access panel shows no access checkbox');
  }

  return checkbox;
}
