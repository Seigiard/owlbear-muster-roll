import { useStore } from '@nanostores/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FieldError, Input, Label, TextField } from 'react-aria-components';

import { DUPLICATE_COUNT_MIN, parseDuplicateCount } from '@/core/npc-duplicate';
import type { VersionedRecord } from '@/core/records';
import { liveSheets, sheetKey } from '@/core/sheets';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type DuplicateCountProps = {
  sheetId: string;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections' | '$records'>;
  // Grows each time the GM picks "Дублировать…", so the field takes the focus again.
  focusRequest: number;
  // The copies arrived, as records or as the pending view.
  onDone: () => void;
  onCancel: () => void;
};

// A sent command, with the NPCs that were there when it went, so a new one shows it took effect.
type Sent = { commandId: string; npcSheets: ReadonlySet<string> };

type Problem = 'invalid' | 'failed' | null;

// UX-DR20: the count of copies, asked inline in the NPC block, never in a browser dialog. A bad
// count stays in the field with its message, and nothing is sent. A sent count keeps the block open
// until the copies arrive, so a failure can still show under the field.
export function DuplicateCount({
  sheetId,
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

  const arrived = sent !== null && hasNewNpc(records, sent.npcSheets);

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

    const result = sendCommand({ type: 'sheet-duplicate', sheetId, count: count.value });

    if (result.ok) {
      setSent({ commandId: result.value, npcSheets: npcSheetKeys(records) });
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

function npcSheetKeys(records: ReadonlyMap<string, VersionedRecord>): ReadonlySet<string> {
  return new Set(liveSheets(records.values(), 'npc').map((sheet) => sheetKey(sheet.sheetId)));
}

function hasNewNpc(
  records: ReadonlyMap<string, VersionedRecord>,
  before: ReadonlySet<string>,
): boolean {
  return [...npcSheetKeys(records)].some((key) => !before.has(key));
}
