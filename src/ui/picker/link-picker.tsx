import { useStore } from '@nanostores/react';
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button as AriaButton, Checkbox } from 'react-aria-components';

import { linkTargetKey, linkTargetOf, type LinkTarget } from '@/core/link-target';
import { repeatSectionId } from '@/core/preset';
import { LINK_PICKER_TIMING, type LinkPickerTiming } from '@/core/timing';
import {
  linkKey,
  liveLinks,
  pickerGroupHeading,
  pickerGroups,
  pickerTargetNeedsCellIdentity,
  type PickerGroup,
  type PickerTarget,
} from '@/core/token-links';
import type { Command } from '@/core/ui-messages';
import type { Bounds, NotificationPort, ScenePort, ViewportPort } from '@/platform/ports';
import { copy } from '@/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { CommandOutcomePromise } from '@/ui/replica-client';
import { useWindowView } from '@/ui/window-view';

import { canOffer, canPick, initialPickerState, pickerReducer } from './link-picker-reducer';

type LinkPickerProps = {
  tokenId: string;
  store: Pick<ProjectionStore, '$loaded' | '$records' | '$replica' | '$sync'>;
  sendCommand: (
    command: Extract<Command, { type: 'link-set' }>,
  ) => CommandOutcomePromise<undefined>;
  // The token's label: an Owlbear item property, not a record, so the picker reads and sets it.
  scene: Pick<ScenePort, 'getItemLabel' | 'setItemLabel'>;
  notification: Pick<NotificationPort, 'show'>;
  // The link is in the replica. Rejects when the popover could not close.
  onLinked: () => Promise<void>;
  // Tests pass shorter waits.
  timing?: LinkPickerTiming;
};

// UX-DR22: the token-cell targets a token can link to, in groups in preset order: one per token cell
// on a sheet set or single sheet, and one per token cell in a repeat scope. In each group the
// targets with no token come first. A pick stays on screen until its link is in the replica, so a
// refused one, such as for a sheet deleted meanwhile, shows a message here instead of closing the
// picker.
export function LinkPicker({
  tokenId,
  store,
  sendCommand,
  scene,
  notification,
  onLinked,
  timing = LINK_PICKER_TIMING,
}: LinkPickerProps): ReactNode {
  const loaded = useStore(store.$loaded);
  const sync = useStore(store.$sync);
  const replica = useStore(store.$replica);
  const view = useWindowView(store, 'PLAYER');
  const [picker, dispatch] = useReducer(pickerReducer, tokenId, initialPickerState);
  const labelReadStarted = useRef(false);
  const labelWriteStarted = useRef<number | null>(null);
  const notificationStarted = useRef<number | null>(null);
  const closeStarted = useRef<number | null>(null);
  const labelHintId = useId();

  const groups = useMemo(
    () => pickerGroups(view.records, view.preset),
    [view.records, view.preset],
  );

  // A pending view can still be refused when catch-up ends, so only the replica counts.
  const arrivedTarget = useMemo(
    () => linkTargetOf(replica.get(linkKey(tokenId))?.d ?? null),
    [replica, tokenId],
  );

  useEffect(() => {
    dispatch({
      type: 'facts',
      facts: {
        loaded,
        firstCatchUpDone: sync.firstCatchUpDone,
        role: view.role,
        arrived: arrivedTarget,
      },
    });
  }, [arrivedTarget, loaded, sync.firstCatchUpDone, view.role]);

  useEffect(() => {
    if (picker.label.kind !== 'reading' || labelReadStarted.current) {
      return;
    }

    labelReadStarted.current = true;

    // The default never replaces a label the GM set by hand: the box starts checked only on a token
    // with no label. An answer after the timeout is dropped.
    let read: Promise<string | null>;

    try {
      read = scene.getItemLabel(tokenId);
    } catch (error) {
      console.error('Muster Roll could not read the token label', error);
      dispatch({ type: 'label-read', result: { failed: true } });

      return;
    }

    void settleWithin(read, timing.labelReadTimeoutMs).then(
      (text) => {
        if (text === null) {
          console.error('Muster Roll found no label to read on token', tokenId);
          dispatch({ type: 'label-read', result: { text: null } });

          return;
        }

        dispatch({ type: 'label-read', result: { text } });
      },
      (error) => {
        console.error('Muster Roll could not read the token label', error);
        dispatch({ type: 'label-read', result: { failed: true } });
      },
    );
  }, [picker.label.kind, scene, tokenId, timing]);

  useEffect(() => {
    const waiting = picker.attempt?.phase === 'waiting' ? picker.attempt : null;

    if (waiting === null) {
      return () => undefined;
    }

    let active = true;

    void waiting.outcome
      .then((outcome) => {
        if (active) {
          dispatch({ type: 'command', id: waiting.id, outcome: outcome.kind });
        }
      })
      .catch(() => {
        if (active) {
          dispatch({ type: 'command', id: waiting.id, outcome: 'failed' });
        }
      });

    return () => {
      active = false;
    };
  }, [picker.attempt]);

  useEffect(() => {
    const writing = picker.attempt?.phase === 'writing' ? picker.attempt : null;

    if (writing === null || labelWriteStarted.current === writing.id) {
      return () => undefined;
    }

    labelWriteStarted.current = writing.id;
    let active = true;
    let write: Promise<void>;

    try {
      write = scene.setItemLabel(tokenId, writing.label);
    } catch (error) {
      console.error('Muster Roll could not set the token label', error);
      dispatch({ type: 'label-written', id: writing.id, ok: false });

      return () => undefined;
    }

    void settleWithin(write, timing.labelWriteTimeoutMs).then(
      () => {
        if (active) {
          dispatch({ type: 'label-written', id: writing.id, ok: true });
        }
      },
      (error) => {
        if (active) {
          console.error('Muster Roll could not set the token label', error);
          dispatch({ type: 'label-written', id: writing.id, ok: false });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [picker.attempt, scene, timing, tokenId]);

  useEffect(() => {
    const notifying = picker.attempt?.phase === 'notifying' ? picker.attempt : null;

    if (notifying === null || notificationStarted.current === notifying.id) {
      return () => undefined;
    }

    notificationStarted.current = notifying.id;
    let active = true;
    let shown: Promise<string>;

    try {
      shown = notification.show(copy.linkLabelFailed, 'ERROR');
    } catch (error) {
      console.error('Muster Roll could not show a notification', error);
      dispatch({ type: 'notified', id: notifying.id });

      return () => undefined;
    }

    void settleWithin(shown, timing.labelWriteTimeoutMs).then(
      () => {
        if (active) {
          dispatch({ type: 'notified', id: notifying.id });
        }
      },
      (error) => {
        if (active) {
          console.error('Muster Roll could not show a notification', error);
          dispatch({ type: 'notified', id: notifying.id });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [notification, picker.attempt, timing]);

  useEffect(() => {
    const closing = picker.attempt?.phase === 'closing' ? picker.attempt : null;

    if (closing === null || closeStarted.current === closing.id) {
      return () => undefined;
    }

    closeStarted.current = closing.id;
    let active = true;
    let close: Promise<void>;

    try {
      close = onLinked();
    } catch (error) {
      console.error('Muster Roll could not close the link picker', error);
      dispatch({ type: 'closed', id: closing.id, ok: false });

      return () => undefined;
    }

    void close.then(
      () => {
        if (active) {
          dispatch({ type: 'closed', id: closing.id, ok: true });
        }
      },
      (error) => {
        if (active) {
          console.error('Muster Roll could not close the link picker', error);
          dispatch({ type: 'closed', id: closing.id, ok: false });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [onLinked, picker.attempt]);

  function pick(choice: PickerTarget): void {
    if (!canPick(picker)) {
      return;
    }

    const { target } = choice;

    const command =
      target.path === undefined || target.path === null
        ? {
            type: 'link-set' as const,
            tokenId,
            sheetId: target.sheetId,
            cellId: target.cellId ?? choice.cellId,
          }
        : {
            type: 'link-set' as const,
            tokenId,
            sheetId: target.sheetId,
            path: target.path,
            cellId: target.cellId ?? choice.cellId,
          };

    const outcome = sendCommand(command);

    // The offered label is the target's name: a sheet's, or a repeat block's configured nameField.
    // An empty name sets none.
    const name = choice.label;

    dispatch({
      type: 'pick',
      outcome,
      target,
      name,
    });
  }

  function list(group: PickerGroup): ReactNode {
    return (
      <ul className="flex flex-col gap-1">
        {group.targets.map((choice) => (
          <li key={linkTargetKey(choice.target)}>
            <AriaButton
              isDisabled={!canPick(picker)}
              onPress={() => {
                pick(choice);
              }}
              aria-label={targetAccessibleName(choice)}
              className="flex touch-target w-full items-center gap-2 rounded-sm px-3 text-left text-text data-disabled:opacity-50 data-hovered:bg-fill data-pressed:bg-fill-strong"
            >
              <span className="min-w-0 flex-1 wrap-anywhere">
                {shownName(targetIdentity(choice))}
                {choice.blockName === null || choice.blockName === '' ? null : (
                  <span className="ml-2 text-label-sm text-text-muted">
                    {shownName(choice.sheetName)}
                  </span>
                )}
              </span>
              {choice.linked ? (
                <span className="shrink-0 text-label-sm text-text-muted">
                  {copy.status.tokenLinked}
                </span>
              ) : null}
            </AriaButton>
          </li>
        ))}
      </ul>
    );
  }

  // The offer to label the token, with the label it has now. A label that was not read shows no
  // hint, and an item with no label text cannot take one. The hint sits in the text's grid column,
  // so it lines up with the label whatever the box size.
  function labelOffer(): ReactNode {
    const hint =
      picker.label.kind !== 'read'
        ? null
        : picker.label.text.trim() === ''
          ? copy.linkLabelNone
          : copy.linkLabelNow(picker.label.text);

    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-2 px-3">
        <Checkbox
          isSelected={picker.wanted}
          isDisabled={!canOffer(picker)}
          onChange={(wanted) => {
            dispatch({ type: 'offer', wanted });
          }}
          aria-describedby={hint === null ? undefined : labelHintId}
          className="group col-span-2 grid touch-target grid-cols-subgrid items-center text-text data-disabled:opacity-50"
        >
          {({ isSelected }) => (
            <>
              <span
                aria-hidden="true"
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong text-accent-contrast group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-1 group-data-focus-visible:outline-focus group-data-selected:border-accent group-data-selected:bg-accent"
              >
                {isSelected ? '✓' : null}
              </span>
              {copy.linkLabel}
            </>
          )}
        </Checkbox>
        {hint === null ? null : (
          <p id={labelHintId} className="col-start-2 text-label-sm wrap-anywhere text-text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  }

  function content(): ReactNode {
    // No `link:` key can hold this token, so nothing could be picked for it.
    if (!picker.validToken) {
      return null;
    }

    // AD-7: until the first catch-up ends, no list counts as the room's.
    if (!loaded || !sync.firstCatchUpDone) {
      return <p>{copy.loading}</p>;
    }

    // Only a GM links tokens (UX-DR21).
    if (sync.role !== 'GM') {
      return null;
    }

    if (groups.length === 0) {
      return <p>{copy.noSheetsToLink}</p>;
    }

    return (
      <div aria-busy={picker.attempt !== null} className="flex flex-col gap-2">
        {labelOffer()}
        {groups.map((group) => {
          const heading = pickerGroupHeading(group);

          return (
            <section
              key={`${group.template.id}:${group.section === null ? '' : (repeatSectionId(group.section) ?? '')}:${group.targets[0]?.cellId ?? ''}`}
              aria-label={heading}
              className="flex flex-col gap-1"
            >
              <h2 className="px-3 text-label-sm text-text-muted">{heading}</h2>
              {list(group)}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <main className="flex h-dvh flex-col gap-2 overflow-auto rounded-lg bg-surface p-2 text-body text-text">
      {content()}
      <p aria-live="polite" className="text-label-sm text-danger-text empty:hidden">
        {picker.failed || !picker.validToken ? copy.linkFailed : null}
      </p>
    </main>
  );
}

type TokenCellPickerProps = {
  target: LinkTarget;
  store: Pick<ProjectionStore, '$loaded' | '$records' | '$replica' | '$sync'>;
  sendCommand: (
    command: Extract<Command, { type: 'link-set' | 'link-clear' }>,
  ) => CommandOutcomePromise<undefined>;
  scene: Pick<ScenePort, 'getItemIds' | 'getItemBounds'> &
    Partial<Pick<ScenePort, 'getTokenIds' | 'getItemLabel'>>;
  viewport: Pick<ViewportPort, 'getBounds'>;
  onLinked: () => Promise<void>;
};

// Reverse picker for a token cell. It deliberately uses the scene list as its boundary: a GM may
// reassign any token currently in the scene, while existing links remain visible through the
// checked state. The command path remains the authority for live-target validation.
export function TokenCellPicker({
  target,
  store,
  sendCommand,
  scene,
  viewport,
  onLinked,
}: TokenCellPickerProps): ReactNode {
  const loaded = useStore(store.$loaded);
  const sync = useStore(store.$sync);
  const view = useWindowView(store, 'GM');
  const [itemIds, setItemIds] = useState<string[] | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const targetKey = linkTargetKey(target);
  const links = useMemo(() => liveLinks(view.records, view.preset), [view.records, view.preset]);

  const linked = useMemo(() => new Set(links.keys()), [links]);

  const linkedToTarget = useMemo(
    () =>
      new Set(
        [...links].flatMap(([tokenId, live]) =>
          linkTargetKey(live.target) === targetKey ? [tokenId] : [],
        ),
      ),
    [links, targetKey],
  );

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loaded || !sync.firstCatchUpDone) {
      return;
    }

    const getTokenIds = scene.getTokenIds ?? scene.getItemIds;

    void getTokenIds()
      .then(async (ids) => {
        setNames(await readTokenNames(scene.getItemLabel, ids));

        try {
          const [itemBounds, viewportBounds] = await Promise.all([
            scene.getItemBounds(ids),
            viewport.getBounds(),
          ]);

          const visible = new Set(
            ids.filter((id) => isInViewport(itemBounds.get(id), viewportBounds)),
          );

          setItemIds(orderReversePickerIds(ids, visible, linked));
        } catch (error) {
          console.error('Muster Roll could not rank scene tokens by viewport', error);
          setItemIds(orderReversePickerIds(ids, new Set(), linked));
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not read scene tokens', error);
        setItemIds([]);
      });
  }, [linked, loaded, scene, sync.firstCatchUpDone, viewport]);

  const tokens = itemIds ?? [];

  async function apply(): Promise<void> {
    if (busy || selected.size === 0) {
      return;
    }

    setBusy(true);

    try {
      const outcomes = await Promise.all(
        [...selected].map((tokenId) =>
          sendCommand({
            type: 'link-set',
            tokenId,
            sheetId: target.sheetId,
            path: target.path ?? undefined,
            cellId: target.cellId ?? '',
          }),
        ),
      );

      if (!outcomes.every((outcome) => outcome.kind === 'answered')) {
        setFailed(true);

        return;
      }

      try {
        await onLinked();
      } catch {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 text-text">
      <h1 className="text-section-heading">{copy.command.linkSheet}</h1>
      <p className="text-label-sm text-text-muted">{copy.status.tokenCellPicker}</p>
      {tokens.length === 0 ? (
        <p className="text-text-muted">{copy.status.noSceneTokens}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tokens.map((tokenId) => {
            const isLinked = linked.has(tokenId);
            const checked = selected.has(tokenId);

            return (
              <li key={tokenId}>
                <label className="flex touch-target items-center gap-2 rounded-sm px-2 text-text hover:bg-fill">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelected((current) => {
                        const next = new Set(current);

                        if (next.has(tokenId)) {
                          next.delete(tokenId);
                        } else {
                          next.add(tokenId);
                        }

                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1 wrap-anywhere">
                    {names.get(tokenId) || tokenId}
                  </span>
                  {isLinked ? (
                    <span className="text-label-sm text-text-muted">
                      {linkedToTarget.has(tokenId)
                        ? copy.status.tokenLinkedCurrent
                        : copy.status.tokenLinkedElsewhere}
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto flex gap-2">
        <AriaButton
          isDisabled={busy || selected.size === 0}
          onPress={() => {
            void apply();
          }}
          className="touch-target rounded-sm bg-accent px-3 text-accent-contrast data-disabled:opacity-50"
        >
          {copy.command.linkSheet}
        </AriaButton>
        <AriaButton
          isDisabled={
            busy || selected.size === 0 || ![...selected].some((id) => linkedToTarget.has(id))
          }
          onPress={() => {
            setBusy(true);
            void Promise.all(
              [...selected].flatMap((tokenId) =>
                linkedToTarget.has(tokenId) ? [sendCommand({ type: 'link-clear', tokenId })] : [],
              ),
            )
              .then(async (outcomes) => {
                if (!outcomes.every((outcome) => outcome.kind === 'answered')) {
                  setFailed(true);

                  return;
                }

                try {
                  await onLinked();
                } catch {
                  setFailed(true);
                }
              })
              .catch(() => {
                setFailed(true);
              })
              .finally(() => {
                setBusy(false);
              });
          }}
          className="touch-target rounded-sm border border-line-strong px-3 text-text data-disabled:opacity-50"
        >
          {copy.command.unlinkSheet}
        </AriaButton>
      </div>
      <p aria-live="polite" className="text-label-sm text-danger-text empty:hidden">
        {failed ? copy.linkFailed : null}
      </p>
    </div>
  );
}

function isInViewport(bounds: Bounds | undefined, viewport: Bounds): boolean {
  return (
    bounds !== undefined &&
    bounds.max.x >= viewport.min.x &&
    bounds.min.x <= viewport.max.x &&
    bounds.max.y >= viewport.min.y &&
    bounds.min.y <= viewport.max.y
  );
}

async function readTokenNames(
  getItemLabel: ((itemId: string) => Promise<string | null>) | undefined,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (getItemLabel === undefined) {
    return new Map();
  }

  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, (await getItemLabel(id)) ?? ''] as const;
      } catch (error) {
        console.error('Muster Roll could not read a scene token name', error);

        return [id, ''] as const;
      }
    }),
  );

  return new Map(entries);
}

function orderReversePickerIds(
  ids: readonly string[],
  visible: ReadonlySet<string>,
  linked: ReadonlySet<string>,
): string[] {
  const ordered: string[] = [];

  for (let rank = 0; rank < 4; rank += 1) {
    for (const id of ids) {
      const idRank = (visible.has(id) ? 0 : 1) + (linked.has(id) ? 2 : 0);

      if (idRank === rank) {
        ordered.push(id);
      }
    }
  }

  return ordered;
}

// The visible parts joined by commas, so a screen reader does not run them together. Built here,
// as the computed name of separate spans adds a space before each comma.
export function targetAccessibleName(choice: PickerTarget): string {
  return [
    shownName(targetIdentity(choice)),
    pickerTargetNeedsCellIdentity(choice) ? choice.cellId : null,
    choice.blockName === null || choice.blockName === '' ? null : shownName(choice.sheetName),
    choice.linked ? copy.status.tokenLinked : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
}

// The one fallback label of an empty name.
function shownName(name: string): string {
  return name === '' ? copy.unnamed : name;
}

function targetIdentity(choice: PickerTarget): string {
  return choice.blockName === null ? choice.sheetName : choice.blockName;
}

// Rejects when `work` has not settled after `ms`, so a port call that never answers cannot hold the
// picker. A later answer is dropped.
function settleWithin<Value>(work: Promise<Value>, ms: number): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no answer within ${ms} ms`));
    }, ms);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
