import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FieldError, Input, Label, TextField } from 'react-aria-components';

import type { Command } from '@/core/ui-messages';
import { DUPLICATE_COUNT_MIN, parseDuplicateCount } from '@/core/repeat-block-duplicate';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { CommandOutcomePromise } from '@/ui/replica-client';

type DuplicateCountProps = {
  // The repeat block to duplicate.
  sheetId: string;
  sectionId: string;
  instanceId: string;
  sendCommand: (
    command: Extract<Command, { type: 'repeat-block-duplicate' }>,
  ) => CommandOutcomePromise<undefined>;
  // Grows each time the GM picks "Дублировать…", so the field takes the focus again.
  focusRequest: number;
  // The copies arrived, as records or as the pending view.
  onDone: () => void;
  onCancel: () => void;
};

// A duplicate closes only when its own command answers. Records from another client are unrelated.
type Sent = { outcome: CommandOutcomePromise<undefined> };

type Problem = 'invalid' | 'failed' | null;

// CAP-30, UX-DR20: the count of copies, asked inline under the repeat block, never in a browser
// dialog. A bad count stays in the field with its message, and nothing is sent. A sent count keeps
// the block open until its own command answers, so a failure can still show under the field.
export function DuplicateCount({
  sheetId,
  sectionId,
  instanceId,
  sendCommand,
  focusRequest,
  onDone,
  onCancel,
}: DuplicateCountProps): ReactNode {
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(String(DUPLICATE_COUNT_MIN));
  const [problem, setProblem] = useState<Problem>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    if (sent === null) {
      return;
    }

    let active = true;

    void sent.outcome
      .then((outcome) => {
        if (!active) {
          return;
        }

        setSent(null);

        if (outcome.kind === 'answered') {
          onDone();
        } else {
          setProblem('failed');
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a duplicate', error);
      });

    return () => {
      active = false;
    };
  }, [sent, onDone]);

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

    setSent({
      outcome: sendCommand({
        type: 'repeat-block-duplicate',
        sheetId,
        sectionId,
        instanceId,
        count: count.value,
      }),
    });
    setProblem(null);
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
