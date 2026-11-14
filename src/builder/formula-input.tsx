import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { copy } from '@/ui/copy';

type FormulaInputProps = {
  id: string;
  value: string;
  // The field ids the formula can read, in the order the list offers them.
  fieldIds: readonly string[];
  describedBy: string | undefined;
  invalid: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

// The word at the caret: the name characters before it, when they start a name.
type CaretWord = { start: number; end: number; word: string };

const NAME_CHARACTER = /[A-Za-z0-9_]/;

const NAME_START = /[A-Za-z_]/;

export const INPUT_CLASS =
  'touch-target w-full border-b border-dotted border-line-strong bg-transparent px-1 text-text';

// CAP-24: a formula input that offers field ids as completions. The list filters by the word at the
// caret. Arrow keys move in it, `Enter` or `Tab` inserts the id, `Esc` closes it.
export function FormulaInput({
  id,
  value,
  fieldIds,
  describedBy,
  invalid,
  onChange,
  onBlur,
}: FormulaInputProps): ReactNode {
  const listId = useId();
  const optionPrefix = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [word, setWord] = useState<CaretWord | null>(null);
  const caret = useRef<number | null>(null);

  // A list opens once a name is begun, so `Tab` after an operator still leaves the input.
  const matches =
    word === null || word.word === ''
      ? []
      : fieldIds.filter((fieldId) => fieldId.startsWith(word.word) && fieldId !== word.word);

  const shown = open && matches.length > 0;
  const activeIndex = Math.min(active, matches.length - 1);

  // The caret goes after an inserted id once the new value is in the input.
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  function readWord(): void {
    const element = input.current;

    if (element !== null) {
      setWord(caretWord(element.value, element.selectionStart ?? element.value.length));
    }
  }

  function insert(fieldId: string): void {
    if (word === null) {
      return;
    }

    const next = `${value.slice(0, word.start)}${fieldId}${value.slice(word.end)}`;

    caret.current = word.start + fieldId.length;
    setOpen(false);
    onChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    if (!shown) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      const step = event.key === 'ArrowDown' ? 1 : -1;

      setActive((activeIndex + step + matches.length) % matches.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const chosen = matches[activeIndex];

      if (chosen !== undefined) {
        event.preventDefault();
        insert(chosen);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown ? `${optionPrefix}-${activeIndex}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        className={`${INPUT_CLASS} font-[ui-monospace,monospace]`}
        value={value}
        onChange={(event) => {
          setOpen(true);
          setActive(0);
          setWord(caretWord(event.target.value, event.target.selectionStart ?? 0));
          onChange(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            readWord();
          }
        }}
        onClick={readWord}
        // Home, End and a mouse selection move the caret too.
        onSelect={readWord}
        onBlur={() => {
          setOpen(false);
          onBlur();
        }}
      />
      {shown ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={copy.builder.form.completions}
          className="absolute top-full left-0 z-10 mt-1 max-h-[200px] min-w-[160px] overflow-auto rounded-md border border-line bg-surface-bar p-1"
        >
          {matches.map((fieldId, index) => (
            <li
              key={fieldId}
              id={`${optionPrefix}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`touch-target flex cursor-default items-center rounded-sm px-2 font-[ui-monospace,monospace] ${index === activeIndex ? 'bg-surface-tab' : ''}`}
              // The input keeps the focus, so the list stays open until the id is in.
              onMouseDown={(event) => {
                event.preventDefault();
                insert(fieldId);
              }}
            >
              {fieldId}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// The name being typed at `caret`, or `null` when the caret is not at the end of a name.
function caretWord(text: string, caret: number): CaretWord | null {
  let start = caret;

  while (start > 0 && NAME_CHARACTER.test(text[start - 1] ?? '')) {
    start -= 1;
  }

  let end = caret;

  while (end < text.length && NAME_CHARACTER.test(text[end] ?? '')) {
    end += 1;
  }

  const word = text.slice(start, caret);

  // `1d2` is a dice term, not a name.
  if (word !== '' && !NAME_START.test(word[0] ?? '')) {
    return null;
  }

  return { start, end, word };
}
