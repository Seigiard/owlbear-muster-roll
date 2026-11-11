import { useStore } from '@nanostores/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button as AriaButton, Checkbox } from 'react-aria-components';

import { linkTargetKey, linkTargetOf, sameLinkTarget, type LinkTarget } from '@/core/link-target';
import { decodePreset, repeatSectionId, type Preset } from '@/core/preset';
import { presetDataSchema } from '@/core/records';
import { sectionTitle } from '@/core/sheet-values';
import { LINK_PICKER_TIMING, type LinkPickerTiming } from '@/core/timing';
import {
  linkKey,
  pickerGroups,
  tokenIdSchema,
  type PickerGroup,
  type PickerTarget,
} from '@/core/token-links';
import { visibleRecordMap } from '@/core/visibility';
import type { NotificationPort, ScenePort } from '@/platform/ports';
import { copy } from '@/ui/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type LinkPickerProps = {
  tokenId: string;
  store: Pick<ProjectionStore, '$loaded' | '$records' | '$rejections' | '$replica' | '$sync'>;
  sendCommand: ReplicaClient['sendCommand'];
  // The token's label: an Owlbear item property, not a record, so the picker reads and sets it.
  scene: Pick<ScenePort, 'getItemLabel' | 'setItemLabel'>;
  notification: Pick<NotificationPort, 'show'>;
  // The link is in the replica. Rejects when the popover could not close.
  onLinked: () => Promise<void>;
  // Tests pass shorter waits.
  timing?: LinkPickerTiming;
};

// The sent pick. The command id ties a rejection to it. `label` is the text to set under the token
// once the link is in, or `null` to leave the label as it is.
type Sent = { commandId: string; target: LinkTarget; label: string | null };

// The token's label as the picker read it when it opened. `unlabelable` is an item that is missing
// or has no label text, so no write could succeed. `unreadable` is a read that failed or got no
// answer in time, so a write may still succeed.
type CurrentLabel =
  | { state: 'reading' }
  | { state: 'read'; text: string }
  | { state: 'unlabelable' }
  | { state: 'unreadable' };

// UX-DR22: the targets a token can link to, in groups in preset order: one per linkable sheet set
// or single sheet, and one per linkable repeat section. In each group the targets with no token
// come first. A pick stays on screen until its link is in the replica, so a refused one, such as
// for a sheet deleted meanwhile, shows a message here instead of closing the picker.
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
  const allRecords = useStore(store.$records);
  const replica = useStore(store.$replica);
  const rejections = useStore(store.$rejections);
  const [sent, setSent] = useState<Sent | null>(null);
  const [failed, setFailed] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<CurrentLabel>({ state: 'reading' });
  const [labelWanted, setLabelWanted] = useState(false);
  const labelReadStarted = useRef(false);
  // The command id of the pick whose label write and close have started, so they run once and its
  // timer stays off even when another GM relinks the token meanwhile.
  const finishing = useRef<string | null>(null);
  // The role when the label write starts, which may come after a role change.
  const role = useRef(sync.role);
  const labelHintId = useId();
  const validToken = tokenIdSchema.safeParse(tokenId).success;
  // Only a GM links tokens, so only a GM reads the label, and only once the room is loaded.
  const mayReadLabel = validToken && loaded && sync.firstCatchUpDone && sync.role === 'GM';
  const presetData = presetDataSchema.safeParse(allRecords.get('preset')?.d).data ?? null;
  const preset = useMemo(() => decodedPreset(presetData), [presetData]);

  const records = useMemo(
    () => visibleRecordMap(sync.role, preset, allRecords),
    [sync.role, preset, allRecords],
  );

  const groups = useMemo(() => pickerGroups(records, preset), [records, preset]);

  if (sent !== null && rejections.has(sent.commandId)) {
    setSent(null);
    setFailed(true);
  }

  // A pending view can still be refused when catch-up ends, so only the replica counts.
  const arrivedTarget = linkTargetOf(replica.get(linkKey(tokenId))?.d ?? null);

  const arrived =
    sent !== null && arrivedTarget !== null && sameLinkTarget(arrivedTarget, sent.target);

  useEffect(() => {
    role.current = sync.role;
  }, [sync.role]);

  useEffect(() => {
    if (!mayReadLabel || labelReadStarted.current) {
      return;
    }

    labelReadStarted.current = true;

    // The default never replaces a label the GM set by hand: the box starts checked only on a token
    // with no label. An answer after the timeout is dropped.
    settleWithin(scene.getItemLabel(tokenId), timing.labelReadTimeoutMs).then(
      (text) => {
        if (text === null) {
          console.error('Muster Roll found no label to read on token', tokenId);
          setCurrentLabel({ state: 'unlabelable' });

          return;
        }

        setCurrentLabel({ state: 'read', text });
        setLabelWanted(text.trim() === '');
      },
      (error) => {
        console.error('Muster Roll could not read the token label', error);
        setCurrentLabel({ state: 'unreadable' });
      },
    );
  }, [mayReadLabel, scene, tokenId, timing]);

  useEffect(() => {
    if (!arrived || finishing.current === sent.commandId) {
      return;
    }

    finishing.current = sent.commandId;

    const label = sent.label;

    // The link comes first. The label is set only once the link is in, and the picker closes once
    // the label write has settled either way.
    async function finish(): Promise<void> {
      // Only a GM labels tokens, and the role may have changed since the pick.
      if (label !== null && role.current === 'GM') {
        try {
          await settleWithin(scene.setItemLabel(tokenId, label), timing.labelWriteTimeoutMs);
        } catch (error) {
          console.error('Muster Roll could not set the token label', error);
          await settleWithin(
            notification.show(copy.linkLabelFailed, 'ERROR'),
            timing.labelWriteTimeoutMs,
          ).catch((showError) => {
            console.error('Muster Roll could not show a notification', showError);
          });
        }
      }

      try {
        await onLinked();
      } catch (error) {
        console.error('Muster Roll could not close the link picker', error);
        finishing.current = null;
        setSent(null);
      }
    }

    void finish();
  }, [arrived, sent, scene, notification, tokenId, onLinked, timing]);

  useEffect(() => {
    // A pick whose link came in no longer waits, even when the link changes while its label is set.
    if (sent === null || arrived || finishing.current === sent.commandId) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setSent(null);
      setFailed(true);
    }, timing.pickTimeoutMs);

    return () => {
      clearTimeout(timer);
    };
  }, [sent, arrived, timing]);

  function pick(choice: PickerTarget): void {
    if (sent !== null) {
      return;
    }

    const { target } = choice;

    const result = sendCommand({
      type: 'link-set',
      tokenId,
      sheetId: target.sheetId,
      instanceId: target.instanceId,
    });

    // The offered label is the target's name: a sheet's, or a repeat block's first field. An empty
    // name sets none.
    const name = choice.blockName ?? choice.sheetName;

    if (result.ok) {
      setSent({
        commandId: result.value,
        target,
        label: labelWanted && name !== '' ? name : null,
      });
      setFailed(false);
    } else {
      setFailed(true);
    }
  }

  function list(group: PickerGroup): ReactNode {
    return (
      <ul className="flex flex-col gap-1">
        {group.targets.map((choice) => (
          <li key={linkTargetKey(choice.target)}>
            <AriaButton
              isDisabled={sent !== null || currentLabel.state === 'reading'}
              onPress={() => {
                pick(choice);
              }}
              aria-label={targetAccessibleName(choice)}
              className="touch-target flex w-full items-center gap-2 rounded-sm px-3 text-left text-text data-disabled:opacity-50 data-hovered:bg-surface-tab data-pressed:bg-surface-tab"
            >
              <span className="min-w-[0] flex-1 [overflow-wrap:anywhere]">
                {shownName(choice.blockName ?? choice.sheetName)}
                {choice.blockName === null ? null : (
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
      currentLabel.state !== 'read'
        ? null
        : currentLabel.text.trim() === ''
          ? copy.linkLabelNone
          : copy.linkLabelNow(currentLabel.text);

    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-2 px-3">
        <Checkbox
          isSelected={labelWanted}
          isDisabled={
            currentLabel.state === 'reading' ||
            currentLabel.state === 'unlabelable' ||
            sent !== null
          }
          onChange={setLabelWanted}
          aria-describedby={hint === null ? undefined : labelHintId}
          className="group touch-target col-span-2 grid grid-cols-subgrid items-center text-text data-disabled:opacity-50"
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
          <p
            id={labelHintId}
            className="col-start-2 text-label-sm text-text-muted [overflow-wrap:anywhere]"
          >
            {hint}
          </p>
        )}
      </div>
    );
  }

  function content(): ReactNode {
    // No `link:` key can hold this token, so nothing could be picked for it.
    if (!validToken) {
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
      <div aria-busy={sent !== null} className="flex flex-col gap-2">
        {labelOffer()}
        {groups.map((group) => {
          const heading = groupHeading(group);

          return (
            <section
              key={`${group.template.id}:${group.section === null ? '' : (repeatSectionId(group.section) ?? '')}`}
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
        {failed || !validToken ? copy.linkFailed : null}
      </p>
    </main>
  );
}

// A sheet set or a single sheet groups by its `title`, a repeat section by its own title, and an
// untitled one by its template's.
function groupHeading(group: PickerGroup): string {
  return group.section === null
    ? group.template.title
    : (sectionTitle(group.section) ?? group.template.title);
}

// The visible parts joined by commas, so a screen reader does not run them together. Built here,
// as the computed name of separate spans adds a space before each comma.
export function targetAccessibleName(choice: PickerTarget): string {
  return [
    shownName(choice.blockName ?? choice.sheetName),
    choice.blockName === null ? null : shownName(choice.sheetName),
    choice.linked ? copy.status.tokenLinked : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
}

// The one fallback label of an empty name.
function shownName(name: string): string {
  return name === '' ? copy.unnamed : name;
}

// The engine validates before it stores, so a preset that does not decode counts as none.
function decodedPreset(data: string | null): Preset | null {
  if (data === null) {
    return null;
  }

  const decoded = decodePreset(data);

  return decoded.ok ? decoded.value : null;
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
