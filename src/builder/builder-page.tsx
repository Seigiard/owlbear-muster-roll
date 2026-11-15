import clsx from 'clsx';
import { useStore } from '@nanostores/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import { FORMAT_VERSION } from '@/core/format-version';
import {
  parsePresetFile,
  PRESET_FILE_BYTE_LIMIT,
  type Preset,
  type PresetFailure,
} from '@/core/preset';
import { encodePreset } from '@/core/preset';
import { err, type Result } from '@/core/result';
import {
  importSnapshot,
  parseSnapshotFile,
  SNAPSHOT_FILE_BYTE_LIMIT,
  type SnapshotImportFailure,
} from '@/core/snapshot-import';
import { encodeSnapshotFile, formatSnapshotFile, snapshotFileName } from '@/core/snapshot-file';
import { PREVIEW_THEMES, type PreviewThemeName } from '@/ui/themes';
import { copy } from '@/copy';
import { downloadJsonFile } from '@/ui/download';
import { presetFailureMessage } from '@/ui/preset-errors';
import { fileFailureText } from '@/ui/settings/snapshot-text';
import { Banner, type BannerMessage } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { applyTheme } from '@/ui/theme';

import { BLANK_NAME, type BuilderStore } from './builder-store';
import { isEmptyDocument, toPreset } from './document';
import { BUILDER_EXAMPLES } from './examples';
import { downloadFileName, nameFromFile } from './file-name';
import { ItemForm } from './item-form';
import { PreviewPane } from './preview-pane';
import { builderProblems, downloadText } from './problems';
import { StructureTree, type FocusRequest } from './structure-tree';
import { readThemeChoice, saveThemeChoice } from './theme-choice';

// A preset waiting for the GM to confirm that it replaces the draft.
type OpenRequest = { preset: Preset; origin: Preset | null; name: string; label: string };

const EMPTY_PRESET: Preset = { v: FORMAT_VERSION, templates: [] };

const OPEN_EMPTY = 'empty';
const OPEN_FILE = 'file';

const MENU_ITEM_CLASS =
  'touch-target flex cursor-default items-center rounded-sm px-3 data-focused:bg-surface-tab';

const TOP_BUTTON_CLASS =
  'touch-target inline-flex items-center justify-center rounded-sm border border-line px-3 text-text data-disabled:opacity-50';

// CAP-20 to CAP-28: the preset builder page, layout B. The top bar spans the page. Under it, the
// structure tree and the form of its selected item on the left, and the preview on the right.
export function BuilderPage({ store }: { store: BuilderStore }): ReactNode {
  const state = useStore(store.$state);
  const document = state.step.document;
  const problems = useMemo(() => builderProblems(document), [document]);
  const download = useMemo(() => downloadText(document), [document]);
  const [theme, setTheme] = useState<PreviewThemeName>(readThemeChoice);
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const [fileMessage, setFileMessage] = useState<BannerMessage | undefined>(undefined);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const structureHeadingId = useId();

  useEffect(() => {
    applyTheme(PREVIEW_THEMES[theme], window.document.documentElement);
  }, [theme]);

  useUndoKeys(store);

  function open(next: OpenRequest): void {
    store.open(next.preset, next.origin, next.name);
    setRequest(null);
    setFileMessage(undefined);
  }

  // The one confirmation, skipped while the draft is still the empty preset.
  function requestOpen(next: OpenRequest): void {
    setFileMessage(undefined);

    if (isEmptyDocument(store.$state.get().step.document)) {
      open(next);
    } else {
      setRequest(next);
    }
  }

  async function openFile(file: File): Promise<void> {
    // A file far over the limit is refused before it is read.
    const parsed: Result<Preset, PresetFailure> =
      file.size > PRESET_FILE_BYTE_LIMIT
        ? err({ code: 'too-large' })
        : parsePresetFile(await file.text());

    if (!parsed.ok) {
      setRequest(null);
      setFileMessage({ variant: 'danger', text: presetFailureMessage(parsed.error) });

      return;
    }

    requestOpen({
      preset: parsed.value,
      origin: parsed.value,
      name: nameFromFile(file.name),
      label: file.name,
    });
  }

  async function openSnapshotFile(file: File): Promise<void> {
    const parsed =
      file.size > SNAPSHOT_FILE_BYTE_LIMIT
        ? err<'too-large'>('too-large')
        : parseSnapshotFile(await file.text());

    if (!parsed.ok) {
      setFileMessage({ variant: 'danger', text: fileFailureText(parsed.error) });

      return;
    }

    const step = store.$state.get().step;
    const preset = toPreset(step.document);

    const imported = importSnapshot(
      parsed.value,
      { preset, data: encodePreset(preset) },
      'builder',
    );

    if (!imported.ok) {
      setFileMessage({ variant: 'danger', text: snapshotImportFailureText(imported.error) });

      return;
    }

    store.setSnapshot(imported.value.records);
    setFileMessage(undefined);
  }

  function openExample(key: string): void {
    const example = BUILDER_EXAMPLES.find((item) => item.key === key);
    const parsed = example === undefined ? null : parsePresetFile(example.text);

    if (example !== undefined && parsed?.ok === true) {
      requestOpen({ preset: parsed.value, origin: null, name: example.name, label: example.label });
    }
  }

  const first = problems[0];

  return (
    <main className="flex min-h-dvh flex-col bg-surface-bar text-body text-text">
      <TopBar
        store={store}
        problemCount={problems.length}
        onFirstProblem={() => {
          if (first !== undefined) {
            store.select(first.uid);
            setFocusRequest((current) => ({ uid: first.uid, count: (current?.count ?? 0) + 1 }));
          }
        }}
        download={download}
        theme={theme}
        onTheme={(next) => {
          setTheme(next);
          saveThemeChoice(next);
        }}
        onOpenEmpty={() => {
          requestOpen({
            preset: EMPTY_PRESET,
            origin: null,
            name: BLANK_NAME,
            label: copy.builder.openEmpty,
          });
        }}
        onOpenExample={openExample}
        onOpenFile={(file) => {
          void openFile(file);
        }}
        onOpenSnapshotFile={(file) => {
          openSnapshotFile(file).catch(() => {
            console.error('Muster Roll could not load a snapshot');
          });
        }}
      />
      {request === null ? null : (
        <OpenConfirmation
          // A new request moves the focus to "Отменить" again.
          key={request.label}
          label={request.label}
          onConfirm={() => {
            open(request);
          }}
          onCancel={() => {
            setRequest(null);
          }}
        />
      )}
      <Banner message={fileMessage} />
      <div className="grid flex-1 grid-cols-[minmax(300px,380px)_minmax(0,1fr)] items-start gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby={structureHeadingId}
            className="flex flex-col gap-2 rounded-md bg-surface p-2"
          >
            <h2 id={structureHeadingId} className="text-section-heading">
              {copy.builder.structure}
            </h2>
            <StructureTree
              store={store}
              document={document}
              selection={state.selection}
              problems={problems}
              focusRequest={focusRequest}
            />
          </section>
          <ItemForm
            store={store}
            document={document}
            origin={state.step.origin}
            selection={state.selection}
            problems={problems}
          />
        </div>
        <PreviewPane
          store={store}
          document={document}
          records={state.step.records}
          selection={state.selection}
          problems={problems}
        />
      </div>
    </main>
  );
}

function snapshotImportFailureText(failure: SnapshotImportFailure): string {
  return copy.badFile(
    failure === 'too-large' ? copy.badFileReason.tooLarge : copy.badFileReason.invalidStructure,
  );
}

type TopBarProps = {
  store: BuilderStore;
  problemCount: number;
  onFirstProblem: () => void;
  download: string | null;
  theme: PreviewThemeName;
  onTheme: (theme: PreviewThemeName) => void;
  onOpenEmpty: () => void;
  onOpenExample: (key: string) => void;
  onOpenFile: (file: File) => void;
  onOpenSnapshotFile: (file: File) => void;
};

function TopBar({
  store,
  problemCount,
  onFirstProblem,
  download,
  theme,
  onTheme,
  onOpenEmpty,
  onOpenExample,
  onOpenFile,
  onOpenSnapshotFile,
}: TopBarProps): ReactNode {
  const state = useStore(store.$state);
  const fileInput = useRef<HTMLInputElement>(null);
  const snapshotFileInput = useRef<HTMLInputElement>(null);

  const snapshot = useMemo(
    () =>
      problemCount === 0
        ? formatSnapshotFile(
            encodeSnapshotFile(
              new Map(state.step.records.map((record) => [record.k, record])),
              toPreset(state.step.document),
            ),
          )
        : null,
    [problemCount, state.step.document, state.step.records],
  );

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <h1 className="text-sheet-title">{copy.builder.pageName}</h1>
      <span role="status" className="text-label-sm text-text-muted">
        {state.draft === 'saved' ? copy.builder.draftSaved : copy.builder.draftNotSaved}
      </span>
      <div className="flex gap-2">
        <AriaButton
          className={TOP_BUTTON_CLASS}
          isDisabled={state.undo.length === 0}
          onPress={store.undo}
        >
          {copy.builder.undo}
        </AriaButton>
        <AriaButton
          className={TOP_BUTTON_CLASS}
          isDisabled={state.redo.length === 0}
          onPress={store.redo}
        >
          {copy.builder.redo}
        </AriaButton>
      </div>
      {problemCount === 0 ? (
        <span className="text-label-sm text-text-muted" data-problem-count="0">
          {copy.builder.noProblems}
        </span>
      ) : (
        <AriaButton
          className={clsx(TOP_BUTTON_CLASS, 'text-danger-text')}
          aria-label={copy.builder.problemsName(problemCount)}
          onPress={onFirstProblem}
          data-problem-count={problemCount}
        >
          {copy.builder.problems(problemCount)}
        </AriaButton>
      )}
      <MenuTrigger>
        <AriaButton className={TOP_BUTTON_CLASS}>{copy.builder.open}</AriaButton>
        <Popover
          placement="bottom start"
          className="rounded-md border border-line bg-surface-bar p-1 text-body text-text"
        >
          <Menu
            onAction={(key) => {
              const action = String(key);

              if (action === OPEN_EMPTY) {
                onOpenEmpty();
              } else if (action === OPEN_FILE) {
                fileInput.current?.click();
              } else {
                onOpenExample(action);
              }
            }}
          >
            <MenuItem id={OPEN_EMPTY} className={MENU_ITEM_CLASS}>
              {copy.builder.openEmpty}
            </MenuItem>
            {BUILDER_EXAMPLES.map((example) => (
              <MenuItem key={example.key} id={example.key} className={MENU_ITEM_CLASS}>
                {example.label}
              </MenuItem>
            ))}
            <MenuItem id={OPEN_FILE} className={MENU_ITEM_CLASS}>
              {copy.builder.openFile}
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label={copy.builder.openFile}
        data-builder-file-input
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];

          // The same file can be opened again.
          event.target.value = '';

          if (file !== undefined) {
            onOpenFile(file);
          }
        }}
      />
      <Button
        disabledReason={isEmptyDocument(state.step.document) ? copy.presetRequired : undefined}
        onPress={() => {
          snapshotFileInput.current?.click();
        }}
      >
        {copy.command.loadSnapshot}
      </Button>
      <input
        ref={snapshotFileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label={copy.command.loadSnapshot}
        data-builder-snapshot-file-input
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];

          event.target.value = '';

          if (file !== undefined) {
            onOpenSnapshotFile(file);
          }
        }}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          role="switch"
          className="accent-accent"
          checked={theme === 'light'}
          onChange={(event) => {
            onTheme(event.target.checked ? 'light' : 'dark');
          }}
        />
        {copy.builder.lightTheme}
      </label>
      <div className="ml-auto">
        <Button
          variant="primary"
          disabledReason={snapshot === null ? copy.builder.downloadDisabled : undefined}
          onPress={() => {
            if (snapshot !== null) {
              downloadJsonFile(snapshotFileName(new Date()), snapshot);
            }
          }}
        >
          {copy.command.downloadSnapshot}
        </Button>
        <Button
          variant="primary"
          disabledReason={download === null ? copy.builder.downloadDisabled : undefined}
          onPress={() => {
            const text = downloadText(store.$state.get().step.document);

            if (text !== null) {
              downloadJsonFile(downloadFileName(store.$state.get().step.name, new Date()), text);
            }
          }}
        >
          {copy.command.downloadPreset}
        </Button>
      </div>
    </header>
  );
}

type OpenConfirmationProps = { label: string; onConfirm: () => void; onCancel: () => void };

// The one confirmation before the draft is replaced. The focus starts on "Отменить".
function OpenConfirmation({ label, onConfirm, onCancel }: OpenConfirmationProps): ReactNode {
  const textId = useId();

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={textId}
      onKeyDown={handleKeyDown}
      className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2"
    >
      <p id={textId} className="min-w-0 flex-1 text-text">
        {copy.builder.replaceDraft(label)}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onConfirm}>
          {copy.builder.confirmOpen}
        </Button>
        <Button autoFocus onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </div>
  );
}

// `Ctrl`/`Cmd`+`Z` undoes; `Shift`+`Ctrl`/`Cmd`+`Z` and `Ctrl`/`Cmd`+`Y` redo. Outside text inputs
// only, where the keys edit the text.
function useUndoKeys(store: BuilderStore): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // The key's place, not its letter, so a Russian layout undoes too.
      const undo = event.code === 'KeyZ' && !event.shiftKey;

      const redo =
        (event.code === 'KeyZ' && event.shiftKey) || (event.code === 'KeyY' && !event.shiftKey);

      if (!(event.ctrlKey || event.metaKey) || event.altKey || !(undo || redo)) {
        return;
      }

      if (isTextInput(event.target)) {
        return;
      }

      event.preventDefault();

      if (redo) {
        store.redo();
      } else {
        store.undo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [store]);
}

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
]);

function isTextInput(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }

  return target instanceof HTMLElement && target.isContentEditable;
}
