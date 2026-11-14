import { useStore } from '@nanostores/react';
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';

import { accessRows, canEdit, shownName, type AccessRow } from '@/core/access';
import { ownersBySheet } from '@/core/merge';
import { copy } from '@/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { CommandOutcome, CommandOutcomePromise, ReplicaClient } from '@/ui/replica-client';

type AccessPanelProps = {
  // The id the "Доступ" chip names in `aria-controls`.
  id: string;
  sheetId: string;
  // This client's own player id, which gets no row.
  ownPlayerId: string;
  store: Pick<ProjectionStore, '$records' | '$party'>;
  sendCommand: ReplicaClient['sendCommand'];
  // `Esc` in the panel. The header closes it and gives the focus back to the chip.
  onClose: () => void;
};

// The latest change sent for one player. Its outcome settles this change.
type SentChange = { on: boolean; outcome: CommandOutcomePromise<undefined> };

// The latest owner pick sent, `null` for "Никто". Its outcome settles this pick.
type SentOwner = { playerId: string | null; outcome: CommandOutcomePromise<undefined> };

// What the panel sent and has no answer for yet, and whether the last change failed.
type PanelState = {
  acl: ReadonlyMap<string, SentChange>;
  owner: SentOwner | null;
  failed: boolean;
};

// Each change of the state goes through the reducer, so records and outcomes settle only their own
// sent change.
type PanelAction =
  | { t: 'acl-sent'; playerId: string; change: SentChange }
  | { t: 'owner-sent'; owner: SentOwner }
  | { t: 'records-settled'; playerIds: readonly string[]; owner: boolean }
  | { t: 'outcome'; target: SentChange | SentOwner; outcome: CommandOutcome<undefined> };

// One option of the radio group "Его лист".
type OwnerOption = { playerId: string | null; label: string };

const INITIAL_STATE: PanelState = { acl: new Map(), owner: null, failed: false };

// UX-DR12: inline under the header of a sheet of a sheet set. The radio group "Его лист" with
// "Никто" and one option per player, then one row per player id with "Может править". A change goes
// at once. The guest note always shows.
export function AccessPanel({
  id,
  sheetId,
  ownPlayerId,
  store,
  sendCommand,
  onClose,
}: AccessPanelProps): ReactNode {
  const records = useStore(store.$records);
  const party = useStore(store.$party);
  const [state, dispatch] = useReducer(reducePanel, INITIAL_STATE);

  const rows = useMemo(
    () => accessRows(party, records.values(), sheetId, ownPlayerId),
    [party, records, sheetId, ownPlayerId],
  );

  // FR19: the live `plink:` with the highest `(c, a)`, as on every client.
  const owner = useMemo(
    () => ownersBySheet(records.values()).get(sheetId) ?? null,
    [records, sheetId],
  );

  useEffect(() => {
    const pending = [...state.acl.values(), ...(state.owner === null ? [] : [state.owner])];
    let active = true;

    for (const change of pending) {
      void change.outcome
        .then((outcome) => {
          if (active) {
            dispatch({ t: 'outcome', target: change, outcome });
          }
        })
        .catch((error) => {
          console.error('Muster Roll could not settle an access change', error);
        });
    }

    return () => {
      active = false;
    };
  }, [state.acl, state.owner]);

  useEffect(() => {
    const playerIds = [...state.acl].flatMap(([playerId, change]) =>
      canEdit(records, sheetId, playerId) === change.on ? [playerId] : [],
    );

    const ownerSettled = state.owner !== null && owner === state.owner.playerId;

    if (playerIds.length > 0 || ownerSettled) {
      dispatch({ t: 'records-settled', playerIds, owner: ownerSettled });
    }
  }, [records, sheetId, state.acl, state.owner, owner]);

  function change(row: AccessRow, on: boolean): void {
    const outcome = sendCommand({
      type: 'acl-set',
      sheetId,
      playerId: row.playerId,
      // An unknown name is stored as "", never as the id.
      name: row.name ?? '',
      on,
    });

    dispatch({
      t: 'acl-sent',
      playerId: row.playerId,
      change: { on, outcome },
    });
  }

  function pickOwner(playerId: string | null): void {
    const row = rows.find((candidate) => candidate.playerId === playerId);

    const outcome = sendCommand({
      type: 'owner-set',
      sheetId,
      playerId,
      // An unknown name is stored as "", never as the id.
      name: row?.name ?? '',
    });

    dispatch({
      t: 'owner-sent',
      owner: { playerId, outcome },
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  const shownOwner = state.owner === null ? owner : state.owner.playerId;

  const options: OwnerOption[] = [
    { playerId: null, label: copy.label.noOwner },
    ...rows.map((row) => ({ playerId: row.playerId, label: shownName(row) })),
  ];

  return (
    <section
      id={id}
      aria-label={copy.place.access}
      className="mb-3 flex flex-col gap-2 rounded-lg border border-hairline bg-surface-raised p-2 text-body text-text"
      onKeyDown={handleKeyDown}
    >
      {rows.length === 0 ? (
        <p>{copy.noPlayers}</p>
      ) : (
        <>
          <OwnerGroup options={options} checked={shownOwner} onPick={pickOwner} />
          <ul className="flex flex-col">
            {rows.map((row) => (
              <AccessRowItem
                key={row.playerId}
                row={row}
                checked={
                  state.acl.get(row.playerId)?.on ??
                  (state.owner?.playerId === row.playerId || row.canEdit)
                }
                onChange={(on) => {
                  change(row, on);
                }}
              />
            ))}
          </ul>
        </>
      )}
      <p role="status" className="text-label-sm text-danger-text">
        {state.failed ? copy.aclFailed : ''}
      </p>
      <p className="text-label-sm text-text-muted">{copy.guestNote}</p>
    </section>
  );
}

function reducePanel(state: PanelState, action: PanelAction): PanelState {
  switch (action.t) {
    case 'acl-sent':
      return {
        ...state,
        acl: new Map(state.acl).set(action.playerId, action.change),
        failed: false,
      };
    case 'owner-sent': {
      // The pick turns the player's editing on in the same batch, so a change of their access still
      // waiting would wait for a state the batch overrides. It is dropped.
      const acl = new Map(state.acl);

      if (action.owner.playerId !== null) {
        acl.delete(action.owner.playerId);
      }

      return { acl, owner: action.owner, failed: false };
    }

    case 'records-settled': {
      const acl = new Map(state.acl);

      for (const playerId of action.playerIds) {
        acl.delete(playerId);
      }

      const owner = action.owner ? null : state.owner;

      return acl.size !== state.acl.size || owner !== state.owner
        ? { ...state, acl, owner }
        : state;
    }

    case 'outcome':
      return settleTarget(
        state,
        action.target,
        action.outcome.kind === 'timed-out' ||
          (action.outcome.kind === 'refused' && action.outcome.rejection.reason !== 'unchanged'),
      );
    default:
      return unknownAction(action);
  }
}

function settleTarget(
  state: PanelState,
  target: SentChange | SentOwner,
  failed: boolean,
): PanelState {
  const acl = new Map(state.acl);

  for (const [playerId, change] of acl) {
    if (change === target) {
      acl.delete(playerId);

      return { acl, owner: state.owner, failed: state.failed || failed };
    }
  }

  return state.owner === target ? { acl, owner: null, failed: state.failed || failed } : state;
}

// `tsc` fails here when an action has no case above.
function unknownAction(action: never): never {
  throw new Error(`Muster Roll has no case for the panel action ${JSON.stringify(action)}`);
}

type OwnerGroupProps = {
  options: readonly OwnerOption[];
  checked: string | null;
  onPick: (playerId: string | null) => void;
};

// FR19: one radio group "Его лист". The arrow keys, "Home" and "End" move the focus only, so
// passing a player picks nothing. "Space", "Enter" or a click picks the focused option. One option
// takes the Tab key: the focused one, else the checked one.
function OwnerGroup({ options, checked, onPick }: OwnerGroupProps): ReactNode {
  const labelId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const checkedIndex = options.findIndex((option) => option.playerId === checked);

  const tabStop =
    focused !== null && focused < options.length ? focused : Math.max(0, checkedIndex);

  function moveFocus(index: number): void {
    const next = (index + options.length) % options.length;

    setFocused(next);
    buttons.current[next]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const target =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : null;

    if (target !== null) {
      event.preventDefault();
      moveFocus(target);
    }
  }

  // Focus that leaves the group gives the Tab key back to the checked option.
  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (
      !(event.relatedTarget instanceof Node) ||
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      setFocused(null);
    }
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col" onBlur={handleBlur}>
      <span id={labelId} className="text-label-sm text-text-muted">
        {copy.label.owner}
      </span>
      {options.map((option, index) => {
        const isChecked = option.playerId === checked;

        return (
          <button
            key={option.playerId ?? ''}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={isChecked}
            tabIndex={index === tabStop ? 0 : -1}
            className="touch-target inline-flex items-center gap-2 self-start text-left"
            onFocus={() => {
              setFocused(index);
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index);
            }}
            onClick={() => {
              if (!isChecked) {
                onPick(option.playerId);
              }
            }}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong"
            >
              {isChecked ? <span className="size-2 rounded-full bg-accent" /> : null}
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type AccessRowItemProps = { row: AccessRow; checked: boolean; onChange: (on: boolean) => void };

// The group and the checkbox both take the player's name, so each "Может править" says whose it is.
function AccessRowItem({ row, checked, onChange }: AccessRowItemProps): ReactNode {
  const nameId = useId();
  const name = shownName(row);

  return (
    <li>
      <div
        role="group"
        aria-labelledby={nameId}
        className="flex flex-wrap items-center justify-between gap-x-3"
      >
        <span id={nameId} className="min-w-0 [overflow-wrap:anywhere]">
          {name}
        </span>
        <label className="touch-target inline-flex shrink-0 items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            aria-label={copy.label.mayEditFor(name)}
            checked={checked}
            onChange={(event) => {
              onChange(event.target.checked);
            }}
          />
          {copy.label.mayEdit}
        </label>
      </div>
    </li>
  );
}
