import { useStore } from '@nanostores/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FieldError, Input, Label, TextField } from 'react-aria-components';
import { z } from 'zod';

import type { FieldValue } from '@/core/records';
import { DUPLICATE_COUNT_MIN, parseDuplicateCount } from '@/core/repeat-block-duplicate';
import { repeatBlocks, type FieldValues, type RepeatBlock } from '@/core/sheet-values';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type DuplicateCountProps = {
  // The repeat block to duplicate.
  sheetId: string;
  sectionId: string;
  instanceId: string;
  // The fields of the section, the first one, the numbered name, first.
  fieldIds: readonly string[];
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections' | '$records'>;
  // Grows each time the GM picks "Дублировать…", so the field takes the focus again.
  focusRequest: number;
  // The copies arrived, as records or as the pending view.
  onDone: () => void;
  onCancel: () => void;
};

// A sent command: the section's repeat blocks that were there when it went, and what its copies
// hold, so only its own copies show it took effect.
type Sent = { commandId: string; before: ReadonlySet<string>; copy: ExpectedCopies };

// What every copy of one duplicate holds: the source's values of the section's fields, and a name
// in the first field when the source has one, as the engine numbers it (CAP-30).
export type ExpectedCopies = {
  firstFieldId: string | null;
  named: boolean;
  values: ReadonlyMap<string, FieldValue | undefined>;
  count: number;
};

type Problem = 'invalid' | 'failed' | null;

// A name the engine numbers in a copy: a text value that is not empty.
const NAME_SCHEMA = z.string().min(1);

// CAP-30, UX-DR20: the count of copies, asked inline under the repeat block, never in a browser
// dialog. A bad count stays in the field with its message, and nothing is sent. A sent count keeps
// the block open until the copies arrive, so a failure can still show under the field.
export function DuplicateCount({
  sheetId,
  sectionId,
  instanceId,
  fieldIds,
  sendCommand,
  store,
  focusRequest,
  onDone,
  onCancel,
}: DuplicateCountProps): ReactNode {
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const records = useStore(store.$records);
  const rejections = useStore(store.$rejections);
  const [text, setText] = useState(String(DUPLICATE_COUNT_MIN));
  const [problem, setProblem] = useState<Problem>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  if (sent !== null && rejections.has(sent.commandId)) {
    setSent(null);
    setProblem('failed');
  }

  // No message answers a duplicate that took effect, so its copies do: a repeat block that another
  // client adds meanwhile holds other values and does not close the block.
  const arrived =
    sent !== null &&
    copiesArrived(repeatBlocks(records, sheetId, sectionId), sent.before, sent.copy);

  useEffect(() => {
    if (arrived) {
      onDone();
    }
  }, [arrived, onDone]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusRequest]);

  function confirm(): void {
    if (sent !== null) {
      return;
    }

    const count = parseDuplicateCount(text);

    if (!count.ok) {
      setProblem('invalid');

      return;
    }

    const result = sendCommand({
      type: 'repeat-block-duplicate',
      sheetId,
      sectionId,
      instanceId,
      count: count.value,
    });

    if (result.ok) {
      const blocks = repeatBlocks(records, sheetId, sectionId);
      const source = blocks.find((block) => block.instanceId === instanceId);

      setSent({
        commandId: result.value,
        before: new Set(blocks.map((block) => block.instanceId)),
        copy: expectedCopies(source?.values ?? new Map(), fieldIds, count.value),
      });
      setProblem(null);
    } else {
      setProblem('failed');
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      className="mb-3 rounded-md border border-line bg-surface-bar p-2"
    >
      <TextField
        autoFocus
        className="flex flex-col gap-1"
        value={text}
        isInvalid={problem === 'invalid'}
        onChange={(typed) => {
          setText(typed);
          setProblem(null);
        }}
      >
        <Label id={labelId} className="text-label-sm text-text-muted">
          {copy.label.duplicateCount}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={inputRef}
            inputMode="numeric"
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                confirm();
              }
            }}
            className="touch-target w-20 border-b border-dotted border-line-strong bg-transparent px-1 text-text"
          />
          <Button variant="primary" onPress={confirm}>
            {copy.command.confirmDuplicate}
          </Button>
          <Button onPress={onCancel}>{copy.command.cancel}</Button>
        </div>
        <FieldError className="text-label-sm text-danger-text">{copy.badDuplicateCount}</FieldError>
        <span aria-live="polite" className="text-label-sm text-danger-text empty:hidden">
          {problem === 'failed' ? copy.duplicateFailed : null}
        </span>
      </TextField>
    </div>
  );
}

// What `count` copies of a repeat block holding `source` hold.
export function expectedCopies(
  source: FieldValues,
  fieldIds: readonly string[],
  count: number,
): ExpectedCopies {
  const [firstFieldId = null] = fieldIds;
  const first = firstFieldId === null ? undefined : source.get(firstFieldId);
  const named = NAME_SCHEMA.safeParse(first).success;

  return {
    firstFieldId,
    named,
    values: new Map(
      fieldIds.flatMap((id) =>
        named && id === firstFieldId ? [] : [[id, source.get(id)] as const],
      ),
    ),
    count,
  };
}

// True once `copy.count` repeat blocks that were not there before hold the copy's values.
export function copiesArrived(
  blocks: readonly RepeatBlock[],
  before: ReadonlySet<string>,
  copy: ExpectedCopies,
): boolean {
  const copies = blocks.filter(
    (block) => !before.has(block.instanceId) && holdsCopy(block.values, copy),
  );

  return copies.length >= copy.count;
}

function holdsCopy(values: FieldValues, copy: ExpectedCopies): boolean {
  if (copy.named && copy.firstFieldId !== null) {
    if (!NAME_SCHEMA.safeParse(values.get(copy.firstFieldId)).success) {
      return false;
    }
  }

  return [...copy.values].every(([id, value]) => values.get(id) === value);
}
