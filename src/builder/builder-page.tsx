import clsx from 'clsx';
import { useStore } from '@nanostores/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';

import { PRESET_FORMAT_VERSION as FORMAT_VERSION } from '@/core/format-version';
import {
  parsePresetFile,
  PRESET_FILE_BYTE_LIMIT,
  formatPresetFile,
  type Preset,
  type PresetFailure,
} from '@/core/preset';
import { encodePreset } from '@/core/preset';
import { Result } from 'better-result';
import {
  importSnapshot,
  parseSnapshotFile,
  SNAPSHOT_FILE_BYTE_LIMIT,
  type SnapshotImportFailure,
} from '@/core/snapshot-import';
import type { VersionedRecord } from '@/core/records';
import { encodeSnapshotFile, formatSnapshotFile, snapshotFileName } from '@/core/snapshot-file';
import { PREVIEW_THEMES, type PreviewThemeName } from '@/ui/themes';
import { copy } from '@/copy';
import { downloadJsonFile } from '@/ui/download';
import { presetFailureMessage } from '@/ui/preset-errors';
import { fileFailureText } from '@/ui/settings/snapshot-text';
import { Banner, type BannerMessage } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { applyTheme } from '@/ui/theme';
import type {
  FileAccessPort,
  FileAccessResult,
  FileContents,
  FileReference,
} from '@/core/file-access';

import { type BuilderStore } from './builder-store';
import {
  attachedFilesReducer,
  emptyAttachedFilesState,
  type AttachedFile,
  type AttachedFilesState,
} from './attached-files';
import { isEmptyDocument, toPreset, type BuilderDocument } from './document';
import { BUILDER_EXAMPLES } from './examples';
import { FileBlock, type FileBlockKind } from './file-block';
import { downloadFileName, nameFromFile } from './file-name';
import { ItemForm } from './item-form';
import { PreviewPane } from './preview-pane';
import { builderProblems, downloadText } from './problems';
import { StructureTree, type FocusRequest } from './structure-tree';
import { readThemeChoice, saveThemeChoice } from './theme-choice';

// A file waiting for the GM to confirm that it replaces the draft.
type OpenRequest = {
  preset: Preset;
  origin: Preset | null;
  name: string;
  label: string;
  fileName: string | null;
  fileReference?: FileReference;
  fileContents?: FileContents;
};

type ClearRequest = { kind: FileBlockKind; fileName: string };

type AttachedText =
  | { ok: true; kind: 'preset'; preset: Preset; canonicalText: string }
  | {
      ok: true;
      kind: 'snapshot';
      records: readonly VersionedRecord[];
      file: ReturnType<typeof encodeSnapshotFile>;
      canonicalText: string;
    };

type AttachedTextResult = AttachedText | { ok: false; message: string };

type PendingAttachedWrite = {
  file: AttachedFile;
  text: string;
  canonicalDocumentText: string;
};

type AttachedWriteQueue = {
  active: PendingAttachedWrite | null;
  queued: PendingAttachedWrite | null;
};

const EMPTY_PRESET: Preset = { v: FORMAT_VERSION, templates: [] };

const TOP_BUTTON_CLASS =
  'touch-target inline-flex items-center justify-center rounded-sm border border-line px-3 text-text data-disabled:opacity-50';

// CAP-20 to CAP-28: the preset builder page, layout B. The top bar spans the page. Under it, the
// structure tree and the form of its selected item on the left, and the preview on the right.
export function BuilderPage({
  store,
  fileAccess,
}: {
  store: BuilderStore;
  fileAccess: FileAccessPort;
}): ReactNode {
  const state = useStore(store.$state);
  const document = state.step.document;

  const problems = useMemo(() => builderProblems(document), [document]);
  const download = useMemo(() => downloadText(document), [document]);

  const generatedSnapshot = useMemo(
    () =>
      problems.length === 0
        ? formatSnapshotFile(
            encodeSnapshotFile(
              new Map(state.step.records.map((record) => [record.k, record])),
              toPreset(document),
            ),
          )
        : null,
    [document, problems.length, state.step.records],
  );

  const presetText = useMemo(() => formatPresetFile(toPreset(document)), [document]);

  const [theme, setTheme] = useState<PreviewThemeName>(readThemeChoice);
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const [fileMessage, setFileMessage] = useState<BannerMessage | undefined>(undefined);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  const [files, dispatchFiles] = useReducer(
    attachedFilesReducer,
    undefined,
    emptyAttachedFilesState,
  );

  const [clearRequest, setClearRequest] = useState<ClearRequest | null>(null);
  const structureHeadingId = useId();
  const filesRef = useRef<AttachedFilesState>(files);

  const writeQueues = useRef<Record<FileBlockKind, AttachedWriteQueue>>({
    preset: { active: null, queued: null },
    snapshot: { active: null, queued: null },
  });

  const drainWriteQueueRef = useRef<((kind: FileBlockKind) => Promise<void>) | null>(null);

  const enqueueWrite = useCallback(
    (
      kind: FileBlockKind,
      file: AttachedFile,
      text: string,
      canonicalDocumentText: string,
    ): void => {
      const queue = writeQueues.current[kind];
      const pending = { file, text, canonicalDocumentText };
      const active = queue.active;
      const queued = queue.queued;

      if (
        active !== null &&
        active.file.reference?.id === file.reference?.id &&
        active.text === text &&
        active.canonicalDocumentText === canonicalDocumentText
      ) {
        return;
      }

      if (
        queued !== null &&
        queued.file.reference?.id === file.reference?.id &&
        queued.text === text &&
        queued.canonicalDocumentText === canonicalDocumentText
      ) {
        if (active === null) {
          void drainWriteQueueRef.current?.(kind);
        }

        return;
      }

      queue.queued = pending;

      if (queue.active === null) {
        void drainWriteQueueRef.current?.(kind);
      }
    },
    [writeQueues],
  );

  useLayoutEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    applyTheme(PREVIEW_THEMES[theme], window.document.documentElement);
  }, [theme]);

  useUndoKeys(store);

  const presetFile = files.preset.file;
  const snapshotFile = files.snapshot.file;

  function open(next: OpenRequest): void {
    const currentPresetText = formatPresetFile(toPreset(store.$state.get().step.document));
    const nextPresetText = formatPresetFile(next.preset);
    const samePreset = currentPresetText === nextPresetText;

    if (!samePreset) {
      store.open(next.preset, next.origin, next.name);
      dispatchFiles({ type: 'detach', kind: 'snapshot' });
    }

    if (next.fileName === null) {
      dispatchFiles({ type: 'detach', kind: 'preset' });
    } else {
      const canonicalText = formatPresetFile(next.preset);

      dispatchFiles({
        type: 'attach',
        kind: 'preset',
        reference: next.fileReference ?? null,
        name: next.fileName,
        contents: next.fileContents ?? { text: canonicalText, modifiedAt: new Date() },
        canonicalText,
      });
    }

    setRequest(null);
    setFileMessage(undefined);
  }

  function clear(kind: FileBlockKind): void {
    const current = store.$state.get().step;

    const text =
      kind === 'preset' ? formatPresetFile(EMPTY_PRESET) : snapshotTextFor([], current.document);

    dispatchFiles({ type: 'prepare-clear', kind, documentText: text });

    if (kind === 'preset') {
      store.open(EMPTY_PRESET, current.origin === null ? null : EMPTY_PRESET, current.name);
    } else {
      store.setSnapshot([]);
    }

    const file = attachedFile(kind);

    if (file?.reference !== null && file?.reference !== undefined) {
      // oxlint-disable-next-line react/immutability -- This hoisted queue helper is called by the clear event handler.
      enqueueWrite(kind, file, text, text);
    }

    setClearRequest(null);
  }

  function requestClear(kind: FileBlockKind): void {
    const file = kind === 'preset' ? presetFile : snapshotFile;

    if (file === null) {
      clear(kind);
    } else {
      setClearRequest({ kind, fileName: file.name });
    }
  }

  // The one confirmation, skipped while the draft is still the empty preset.
  function requestOpen(next: OpenRequest): void {
    setFileMessage(undefined);

    if (
      isEmptyDocument(store.$state.get().step.document) ||
      JSON.stringify(toPreset(store.$state.get().step.document)) === JSON.stringify(next.preset)
    ) {
      open(next);
    } else {
      setRequest(next);
    }
  }

  async function openFile(file: File): Promise<void> {
    // A file far over the limit is refused before it is read.
    const parsed: Result<Preset, PresetFailure> =
      file.size > PRESET_FILE_BYTE_LIMIT
        ? Result.err({ code: 'too-large' })
        : parsePresetFile(await file.text());

    if (!parsed.isOk()) {
      setRequest(null);
      setFileMessage({ variant: 'danger', text: presetFailureMessage(parsed.error) });

      return;
    }

    requestOpen({
      preset: parsed.value,
      origin: parsed.value,
      name: nameFromFile(file.name),
      label: file.name,
      fileName: file.name,
    });
  }

  async function openAttachedFile(kind: FileBlockKind): Promise<boolean> {
    const opened = await fileAccess.open({ mode: 'open' });

    if (!opened.isOk()) {
      setFileMessage({ variant: 'danger', text: copy.fileOperationFailed });

      return false;
    }

    if (opened.value === null) {
      return true;
    }

    const read = await fileAccess.read(opened.value);

    if (!read.isOk()) {
      setFileMessage({ variant: 'danger', text: copy.fileOperationFailed });

      return false;
    }

    if (kind === 'preset') {
      const parsed = parsePresetFile(read.value.text);

      if (!parsed.isOk()) {
        setFileMessage({ variant: 'danger', text: presetFailureMessage(parsed.error) });

        return true;
      }

      requestOpen({
        preset: parsed.value,
        origin: parsed.value,
        name: nameFromFile(opened.value.name),
        label: opened.value.name,
        fileName: opened.value.name,
        fileReference: opened.value,
        fileContents: read.value,
      });

      return true;
    }

    const imported = parseAttachedText('snapshot', read.value.text);

    if (!imported.ok) {
      setFileMessage({ variant: 'danger', text: imported.message });

      return true;
    }

    applyAttachedText(imported);
    dispatchFiles({
      type: 'attach',
      kind: 'snapshot',
      reference: opened.value,
      name: opened.value.name,
      contents: read.value,
      canonicalText: imported.canonicalText,
    });
    setFileMessage(undefined);

    return true;
  }

  async function openSnapshotFile(file: File): Promise<void> {
    if (file.size > SNAPSHOT_FILE_BYTE_LIMIT) {
      setFileMessage({ variant: 'danger', text: fileFailureText('too-large') });

      return;
    }

    const text = await file.text();
    const parsed = parseSnapshotFile(text);

    if (!parsed.isOk()) {
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

    if (!imported.isOk()) {
      setFileMessage({ variant: 'danger', text: snapshotImportFailureText(imported.error) });

      return;
    }

    store.setSnapshot(imported.value.records);
    dispatchFiles({
      type: 'attach',
      kind: 'snapshot',
      reference: null,
      name: file.name,
      contents: { text, modifiedAt: new Date() },
      canonicalText: formatSnapshotFile(parsed.value),
    });
    setFileMessage(undefined);
  }

  function openExample(key: string): void {
    const example = BUILDER_EXAMPLES.find((item) => item.key === key);
    const parsed = example === undefined ? null : parsePresetFile(example.text);

    if (example !== undefined && parsed?.isOk() === true) {
      requestOpen({
        preset: parsed.value,
        origin: null,
        name: example.name,
        label: example.label,
        fileName: null,
      });
    }
  }

  function openPresetInput(file: File): void {
    void openFile(file);
  }

  function openSnapshotInput(file: File): void {
    openSnapshotFile(file).catch(() => {
      console.error('Muster Roll could not load a snapshot');
    });
  }

  function parseAttachedText(kind: FileBlockKind, text: string): AttachedTextResult {
    if (kind === 'preset') {
      const parsed = parsePresetFile(text);

      return parsed.isOk()
        ? {
            ok: true,
            kind: 'preset',
            preset: parsed.value,
            canonicalText: formatPresetFile(parsed.value),
          }
        : { ok: false, message: presetFailureMessage(parsed.error) };
    }

    const parsed = parseSnapshotFile(text);

    if (!parsed.isOk()) {
      return { ok: false, message: fileFailureText(parsed.error) };
    }

    const step = store.$state.get().step;

    const imported = importSnapshot(
      parsed.value,
      { preset: toPreset(step.document), data: encodePreset(toPreset(step.document)) },
      'builder',
    );

    return imported.isOk()
      ? {
          ok: true,
          kind: 'snapshot',
          records: imported.value.records,
          file: parsed.value,
          canonicalText: formatSnapshotFile(parsed.value),
        }
      : { ok: false, message: snapshotImportFailureText(imported.error) };
  }

  useEffect(() => {
    const file = files.preset.file;

    if (
      fileAccess.capability !== 'write-and-follow' ||
      file?.reference === null ||
      file === null ||
      problems.length > 0
    ) {
      if (
        fileAccess.capability === 'write-and-follow' &&
        file !== null &&
        file.status.kind !== 'blocked' &&
        presetText !== files.preset.lastDocumentText
      ) {
        dispatchFiles({ type: 'block', kind: 'preset' });
      }

      return;
    }

    if (
      files.preset.lastDocumentText === presetText &&
      files.preset.forceWrite === 0 &&
      files.preset.file?.status.kind !== 'blocked'
    ) {
      return;
    }

    if (
      files.preset.conflict !== null ||
      (files.preset.file?.status.kind === 'failed' &&
        files.preset.failedDocumentText === presetText) ||
      (files.preset.file?.status.kind === 'refused' &&
        files.preset.refusedDocumentText === presetText)
    ) {
      return;
    }

    enqueueWrite('preset', file, textForWrite(files.preset, presetText), presetText);
  }, [
    fileAccess,
    enqueueWrite,
    files.preset,
    files.preset.conflict,
    files.preset.file,
    files.preset.failedDocumentText,
    files.preset.forceWrite,
    files.preset.lastDocumentText,
    files.preset.refusedDocumentText,
    files.preset.restoreDocumentText,
    files.preset.restoreText,
    presetText,
    problems.length,
  ]);

  useEffect(() => {
    const file = files.snapshot.file;

    if (
      fileAccess.capability !== 'write-and-follow' ||
      file?.reference === null ||
      file === null ||
      generatedSnapshot === null
    ) {
      if (
        file !== null &&
        generatedSnapshot === null &&
        file.status.kind !== 'blocked' &&
        files.snapshot.lastDocumentText !== null
      ) {
        dispatchFiles({ type: 'block', kind: 'snapshot' });
      }

      return;
    }

    if (
      files.snapshot.lastDocumentText === generatedSnapshot &&
      files.snapshot.forceWrite === 0 &&
      files.snapshot.file?.status.kind !== 'blocked'
    ) {
      return;
    }

    if (
      files.snapshot.conflict !== null ||
      (files.snapshot.file?.status.kind === 'failed' &&
        files.snapshot.failedDocumentText === generatedSnapshot) ||
      (files.snapshot.file?.status.kind === 'refused' &&
        files.snapshot.refusedDocumentText === generatedSnapshot)
    ) {
      return;
    }

    enqueueWrite(
      'snapshot',
      file,
      textForWrite(files.snapshot, generatedSnapshot),
      generatedSnapshot,
    );
  }, [
    fileAccess,
    enqueueWrite,
    files.snapshot,
    files.snapshot.file,
    files.snapshot.failedDocumentText,
    files.snapshot.forceWrite,
    files.snapshot.lastDocumentText,
    files.snapshot.refusedDocumentText,
    files.snapshot.restoreDocumentText,
    files.snapshot.restoreText,
    generatedSnapshot,
  ]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Keep one subscription effect per attached-file reference; the callback reads current state from filesRef.
  useEffect(() => followAttachedFile('preset'), [fileAccess, files.preset.file?.reference?.id]);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Keep one subscription effect per attached-file reference; the callback reads current state from filesRef.
  useEffect(() => followAttachedFile('snapshot'), [fileAccess, files.snapshot.file?.reference?.id]);

  function followAttachedFile(kind: FileBlockKind): () => void {
    const file = filesRef.current[kind].file;

    if (file?.reference === null || file === null || fileAccess.capability !== 'write-and-follow') {
      return () => undefined;
    }

    return fileAccess.follow(file.reference, (result) => {
      void handleExternalResult(kind, result);
    });
  }

  async function handleExternalResult(
    kind: FileBlockKind,
    result: FileAccessResult<FileContents>,
  ): Promise<void> {
    const currentDocumentText = documentText(kind);

    if (!result.isOk()) {
      dispatchFiles({
        type: 'fail',
        kind,
        message: copy.fileOperationFailed,
        documentText: documentText(kind),
      });

      return;
    }

    const parsed = parseAttachedText(kind, result.value.text);

    if (!parsed.ok) {
      dispatchFiles({
        type: 'refuse',
        kind,
        message: parsed.message,
        documentText: currentDocumentText,
      });

      return;
    }

    const current = filesRef.current[kind];
    const activeWrite = writeQueues.current[kind].active;

    const sameFile =
      current.file?.reference !== null &&
      current.file?.reference !== undefined &&
      current.file.reference.id === activeWrite?.file.reference?.id;

    const ownEcho =
      currentDocumentText === parsed.canonicalText ||
      current.lastDocumentText === parsed.canonicalText ||
      current.lastText === result.value.text ||
      (sameFile &&
        activeWrite !== null &&
        (activeWrite.text === result.value.text ||
          activeWrite.canonicalDocumentText === parsed.canonicalText));

    if (ownEcho) {
      dispatchFiles({
        type: 'observe-own',
        kind,
        contents: result.value,
        canonicalText: parsed.canonicalText,
      });

      return;
    }

    if (
      current.lastDocumentText !== null &&
      currentDocumentText !== current.lastDocumentText &&
      currentDocumentText !== parsed.canonicalText
    ) {
      dispatchFiles({
        type: 'conflict',
        kind,
        contents: result.value,
        canonicalText: parsed.canonicalText,
      });

      return;
    }

    if (current.conflict !== null) {
      dispatchFiles({
        type: 'conflict',
        kind,
        contents: result.value,
        canonicalText: parsed.canonicalText,
      });

      return;
    }

    applyAttachedText(parsed);
    dispatchFiles({
      type: 'accept-external',
      kind,
      contents: result.value,
      canonicalText: parsed.canonicalText,
    });
  }

  function applyAttachedText(parsed: AttachedText): void {
    if (parsed.kind === 'preset') {
      store.replacePreset(parsed.preset, parsed.preset, store.$state.get().step.name);
    } else {
      store.setSnapshot(parsed.records);
    }
  }

  function resolveConflict(kind: FileBlockKind, takeFile: boolean): void {
    const conflict = filesRef.current[kind].conflict;

    if (conflict === null) {
      return;
    }

    if (!takeFile) {
      dispatchFiles({ type: 'keep-local', kind });

      return;
    }

    const parsed = parseAttachedText(kind, conflict.contents.text);

    if (!parsed.ok) {
      dispatchFiles({
        type: 'refuse',
        kind,
        message: parsed.message,
        documentText: documentText(kind),
      });

      return;
    }

    applyAttachedText(parsed);
    dispatchFiles({ type: 'take-file', kind });
  }

  async function drainWriteQueue(kind: FileBlockKind): Promise<void> {
    const queue = writeQueues.current[kind];

    if (queue.active !== null || queue.queued === null) {
      return;
    }

    let knownContents: FileContents | null = null;

    while (queue.queued !== null) {
      const next = queue.queued;
      queue.queued = null;
      queue.active = next;

      try {
        knownContents = await writeFile(
          kind,
          next.file,
          next.text,
          next.canonicalDocumentText,
          knownContents,
        );
      } catch {
        const current = filesRef.current[kind].file;

        if (current?.reference?.id === next.file.reference?.id) {
          dispatchFiles({
            type: 'fail',
            kind,
            message: copy.fileOperationFailed,
            documentText: documentText(kind),
          });
        }

        knownContents = null;
      }

      queue.active = null;

      if (knownContents === null) {
        break;
      }
    }
  }

  useLayoutEffect(() => {
    drainWriteQueueRef.current = drainWriteQueue;
  });

  async function writeFile(
    kind: FileBlockKind,
    file: AttachedFile,
    text: string,
    canonicalDocumentText = text,
    knownContents: FileContents | null = null,
  ): Promise<FileContents | null> {
    if (file.reference === null || fileAccess.capability !== 'write-and-follow') {
      return null;
    }

    const beforeRead = filesRef.current[kind];

    if (
      beforeRead.file?.reference?.id !== file.reference.id ||
      (beforeRead.conflict !== null && beforeRead.forceWrite === 0)
    ) {
      return null;
    }

    const currentOnDisk = await fileAccess.read(file.reference);

    if (!currentOnDisk.isOk()) {
      if (filesRef.current[kind].file?.reference?.id === file.reference.id) {
        dispatchFiles({
          type: 'fail',
          kind,
          message: copy.fileOperationFailed,
          documentText: documentText(kind),
        });
      }

      return null;
    }

    const current = filesRef.current[kind];

    const diskChanged =
      knownContents === null
        ? current.file?.lastSyncAt.getTime() !== currentOnDisk.value.modifiedAt.getTime() ||
          current.lastText !== currentOnDisk.value.text
        : knownContents.modifiedAt.getTime() !== currentOnDisk.value.modifiedAt.getTime() ||
          knownContents.text !== currentOnDisk.value.text;

    if (diskChanged && current.forceWrite === 0) {
      const parsed = parseAttachedText(kind, currentOnDisk.value.text);

      if (!parsed.ok) {
        dispatchFiles({
          type: 'refuse',
          kind,
          message: parsed.message,
          documentText: canonicalDocumentText,
        });

        return null;
      }

      if (
        documentText(kind) === parsed.canonicalText ||
        current.lastDocumentText === parsed.canonicalText
      ) {
        dispatchFiles({
          type: 'observe-own',
          kind,
          contents: currentOnDisk.value,
          canonicalText: parsed.canonicalText,
        });

        return null;
      }

      dispatchFiles({
        type: 'conflict',
        kind,
        contents: currentOnDisk.value,
        canonicalText: parsed.canonicalText,
      });

      return null;
    }

    const result = await fileAccess.write(file.reference, text);

    if (!result.isOk()) {
      dispatchFiles({
        type: 'fail',
        kind,
        message: copy.fileOperationFailed,
        documentText: documentText(kind),
      });

      return null;
    }

    if (filesRef.current[kind].file?.reference?.id !== file.reference.id) {
      return null;
    }

    dispatchFiles({
      type: 'write-succeeded',
      kind,
      contents: result.value,
      text: result.value.text,
      documentText: canonicalDocumentText,
    });

    return result.value;
  }

  async function saveAs(kind: FileBlockKind): Promise<void> {
    const text = kind === 'preset' ? download : generatedSnapshot;

    if (text === null) {
      return;
    }

    const suggestedName =
      kind === 'preset'
        ? downloadFileName(store.$state.get().step.name, new Date())
        : snapshotFileName(new Date());

    const opened = await fileAccess.open({ mode: 'save', suggestedName });

    if (!opened.isOk()) {
      setFileMessage({ variant: 'danger', text: copy.fileOperationFailed });

      return;
    }

    if (opened.value === null) {
      return;
    }

    const written = await fileAccess.write(opened.value, text);

    if (!written.isOk()) {
      setFileMessage({ variant: 'danger', text: copy.fileOperationFailed });

      return;
    }

    dispatchFiles({
      type: 'attach',
      kind,
      reference: opened.value,
      name: opened.value.name,
      contents: written.value,
      canonicalText: text,
    });
    dispatchFiles({
      type: 'write-succeeded',
      kind,
      contents: written.value,
      text: written.value.text,
      documentText: text,
    });
    setFileMessage(undefined);
  }

  function attachedFile(kind: FileBlockKind): AttachedFile | null {
    return filesRef.current[kind].file;
  }

  function documentText(kind: FileBlockKind): string {
    const step = store.$state.get().step;

    return kind === 'preset'
      ? formatPresetFile(toPreset(step.document))
      : snapshotTextFor(step.records, step.document);
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
        snapshotDownload={generatedSnapshot}
        presetFile={presetFile}
        snapshotFile={snapshotFile}
        canAttach={fileAccess.capability === 'write-and-follow'}
        theme={theme}
        onTheme={(next) => {
          setTheme(next);
          saveThemeChoice(next);
        }}
        onOpenExample={openExample}
        onOpenFile={() => openAttachedFile('preset')}
        onSelectFile={openPresetInput}
        onOpenSnapshotFile={() => openAttachedFile('snapshot')}
        onSelectSnapshotFile={openSnapshotInput}
        onSavePreset={() => {
          void saveAs('preset').catch(() => {
            setFileMessage({
              variant: 'danger',
              text: copy.fileOperationFailed,
            });
          });
        }}
        onSaveSnapshot={() => {
          void saveAs('snapshot').catch(() => {
            setFileMessage({
              variant: 'danger',
              text: copy.fileOperationFailed,
            });
          });
        }}
        onDetachPreset={() => {
          dispatchFiles({ type: 'detach', kind: 'preset' });
        }}
        onDetachSnapshot={() => {
          dispatchFiles({ type: 'detach', kind: 'snapshot' });
        }}
        onClearPreset={() => {
          requestClear('preset');
        }}
        onClearSnapshot={() => {
          requestClear('snapshot');
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
      {clearRequest === null ? null : (
        <ClearConfirmation
          kind={clearRequest.kind}
          fileName={clearRequest.fileName}
          onConfirm={() => {
            clear(clearRequest.kind);
          }}
          onCancel={() => {
            setClearRequest(null);
          }}
        />
      )}
      {files.preset.conflict === null ? null : (
        <ConflictConfirmation
          onTakeFile={() => {
            resolveConflict('preset', true);
          }}
          onKeepMine={() => {
            resolveConflict('preset', false);
          }}
        />
      )}
      {files.snapshot.conflict === null ? null : (
        <ConflictConfirmation
          onTakeFile={() => {
            resolveConflict('snapshot', true);
          }}
          onKeepMine={() => {
            resolveConflict('snapshot', false);
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

function snapshotTextFor(records: readonly VersionedRecord[], document: BuilderDocument): string {
  return formatSnapshotFile(
    encodeSnapshotFile(new Map(records.map((record) => [record.k, record])), toPreset(document)),
  );
}

function textForWrite(file: AttachedFilesState[FileBlockKind], canonicalText: string): string {
  return file.restoreDocumentText === canonicalText && file.restoreText !== null
    ? file.restoreText
    : canonicalText;
}

type TopBarProps = {
  store: BuilderStore;
  problemCount: number;
  onFirstProblem: () => void;
  download: string | null;
  snapshotDownload: string | null;
  presetFile: AttachedFile | null;
  snapshotFile: AttachedFile | null;
  canAttach: boolean;
  theme: PreviewThemeName;
  onTheme: (theme: PreviewThemeName) => void;
  onOpenExample: (key: string) => void;
  onOpenFile: () => Promise<boolean>;
  onSelectFile: (file: File) => void;
  onOpenSnapshotFile: () => Promise<boolean>;
  onSelectSnapshotFile: (file: File) => void;
  onSavePreset: () => void;
  onSaveSnapshot: () => void;
  onDetachPreset: () => void;
  onDetachSnapshot: () => void;
  onClearPreset: () => void;
  onClearSnapshot: () => void;
};

function TopBar({
  store,
  problemCount,
  onFirstProblem,
  download,
  snapshotDownload,
  presetFile,
  snapshotFile,
  canAttach,
  theme,
  onTheme,
  onOpenExample,
  onOpenFile,
  onSelectFile,
  onOpenSnapshotFile,
  onSelectSnapshotFile,
  onSavePreset,
  onSaveSnapshot,
  onDetachPreset,
  onDetachSnapshot,
  onClearPreset,
  onClearSnapshot,
}: TopBarProps): ReactNode {
  const state = useStore(store.$state);

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
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <FileBlock
          kind="preset"
          file={presetFile}
          hasContent={!isEmptyDocument(state.step.document)}
          downloadText={download}
          onOpenFile={onOpenFile}
          onSelectFile={onSelectFile}
          canAttach={canAttach}
          onOpenExample={onOpenExample}
          onSaveAs={onSavePreset}
          onDownloadCopy={() => {
            if (download !== null) {
              downloadJsonFile(downloadFileName(state.step.name, new Date()), download);
            }
          }}
          onDetach={onDetachPreset}
          onClear={onClearPreset}
        />
        <FileBlock
          kind="snapshot"
          file={snapshotFile}
          hasContent={state.step.records.length > 0}
          downloadText={snapshotDownload}
          onOpenFile={onOpenSnapshotFile}
          onSelectFile={onSelectSnapshotFile}
          canAttach={canAttach}
          onSaveAs={onSaveSnapshot}
          onDownloadCopy={() => {
            if (snapshotDownload !== null) {
              downloadJsonFile(snapshotFileName(new Date()), snapshotDownload);
            }
          }}
          onDetach={onDetachSnapshot}
          onClear={onClearSnapshot}
        />
      </div>
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

type ClearConfirmationProps = {
  kind: FileBlockKind;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ClearConfirmation({
  kind,
  fileName,
  onConfirm,
  onCancel,
}: ClearConfirmationProps): ReactNode {
  const textId = useId();

  const kindLabel =
    kind === 'preset' ? copy.builder.fileBlock.preset : copy.builder.fileBlock.snapshot;

  return (
    <div
      role="group"
      aria-labelledby={textId}
      className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2"
    >
      <p id={textId} className="min-w-0 flex-1 text-text">
        {copy.builder.fileBlock.clearConfirmation(kindLabel.toLowerCase(), fileName)}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onConfirm}>
          {copy.builder.fileBlock.confirmClear}
        </Button>
        <Button autoFocus onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </div>
  );
}

type ConflictConfirmationProps = {
  onTakeFile: () => void;
  onKeepMine: () => void;
};

function ConflictConfirmation({ onTakeFile, onKeepMine }: ConflictConfirmationProps): ReactNode {
  const textId = useId();

  return (
    <div
      role="group"
      aria-labelledby={textId}
      className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2"
    >
      <p id={textId} className="min-w-0 flex-1 text-text">
        {copy.builder.fileConflict}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onTakeFile}>
          {copy.builder.takeFile}
        </Button>
        <Button onPress={onKeepMine}>{copy.builder.keepMine}</Button>
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
