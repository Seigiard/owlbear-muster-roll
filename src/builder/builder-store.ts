import { atom, type ReadableAtom } from 'nanostores';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { encodePreset, formatPresetFile, parsePresetStructure, type Preset } from '@/core/preset';
import { presetMoves } from '@/core/preset-migrate';
import { recordSchema, templateIdSchema, type VersionedRecord } from '@/core/records';
import { importSnapshot } from '@/core/snapshot-import';
import { encodeSnapshotFile } from '@/core/snapshot-file';
import { isSheetSet, liveSheets, sheetKey } from '@/core/sheets';

import {
  ancestorUids,
  collectOriginRepeatIds,
  EMPTY_DOCUMENT,
  fromPreset,
  locate,
  restoreOriginRepeatIds,
  serializeOriginRepeatIds,
  toPreset,
  WINDOW_UID,
  type BuilderDocument,
  type DocumentEdit,
} from './document';

// AD-21: the one store of the builder page.

// One undo step: the document with the preset of the opened file and the draft's name, so undoing
// an open restores the old draft whole.
export type BuilderStep = {
  document: BuilderDocument;
  // The preset of the file the draft was opened from, or of an identical file opened over a draft
  // with none, for the loaded-file warnings. `null` otherwise.
  origin: Preset | null;
  // The name the download file starts with.
  name: string;
  // The builder's snapshot records, kept beside the preset and never written to a preset file.
  records: readonly VersionedRecord[];
};

// The step before an edit, and the item the edit changed with its containers, nearest first, so
// undo and redo can select it or its nearest live container.
type HistoryEntry = { step: BuilderStep; changed: readonly string[] };

export type DraftStatus = 'saved' | 'failed';

export type BuilderState = {
  step: BuilderStep;
  undo: readonly HistoryEntry[];
  redo: readonly HistoryEntry[];
  selection: string | null;
  // The coalesce key of the last edit while its run goes on, `null` once the run ended.
  run: string | null;
  draft: DraftStatus;
};

// What one edit does to the step. `null` changes nothing.
export type StepEdit = (step: BuilderStep) => { step: BuilderStep; changed: string } | null;

// The part of `localStorage` the store uses, so a test can give its own.
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type BuilderStore = {
  $state: ReadableAtom<BuilderState>;
  // `coalesce` is the item uid and the property. An edit with the key of the edit before replaces
  // that step, so typing in one input is one step.
  apply: (edit: StepEdit, coalesce?: string) => void;
  // A document edit, with the origin and the name kept.
  edit: (edit: (document: BuilderDocument) => DocumentEdit | null, coalesce?: string) => void;
  open: (preset: Preset, origin: Preset | null, name: string) => void;
  replacePreset: (preset: Preset, origin: Preset | null, name: string) => void;
  // A file the GM opened that holds the draft's preset becomes the origin of a draft with none.
  adoptOrigin: (origin: Preset) => void;
  setSnapshot: (records: readonly VersionedRecord[]) => void;
  addSheet: (setId: string) => void;
  undo: () => void;
  redo: () => void;
  select: (uid: string | null) => void;
  // A blur ends the run of one input.
  endRun: () => void;
};

export const DRAFT_STORAGE_KEY = 'muster-roll-builder-draft';

export const BLANK_NAME = 'preset';

const draftSchema = z.object({
  preset: z.json(),
  origin: z.json().nullable(),
  name: z.string(),
  records: z.array(recordSchema).optional(),
  originRepeatIds: z
    .array(z.object({ path: z.array(z.number().int().nonnegative()), id: z.string() }))
    .optional(),
});

const BUILDER_AUTHOR = 'builder';

export function createBuilderStore(storage: DraftStorage | null): BuilderStore {
  const { step: loaded, readable } = readDraft(storage);

  const $state = atom<BuilderState>({
    step: loaded,
    undo: [],
    redo: [],
    selection: firstSelection(loaded.document),
    run: null,
    draft: storage === null || !readable ? 'failed' : 'saved',
  });

  function commit(next: Omit<BuilderState, 'draft'>): void {
    $state.set({ ...next, draft: writeDraft(storage, next.step) });
  }

  function apply(edit: StepEdit, coalesce?: string): void {
    const state = $state.get();
    const result = edit(state.step);

    if (result === null) {
      return;
    }

    const changed = changedChain(state.step.document, result.step.document, result.changed);
    const continues = coalesce !== undefined && coalesce === state.run && state.undo.length > 0;

    commit({
      step: result.step,
      undo: continues ? state.undo : [...state.undo, { step: state.step, changed }],
      redo: continues ? state.redo : [],
      selection: result.changed,
      run: coalesce ?? null,
    });
  }

  function swap(from: 'undo' | 'redo'): void {
    const state = $state.get();
    const source = from === 'undo' ? state.undo : state.redo;
    const entry = source.at(-1);

    if (entry === undefined) {
      return;
    }

    const back = { step: state.step, changed: entry.changed };
    const rest = source.slice(0, -1);

    commit({
      step: entry.step,
      undo: from === 'undo' ? rest : [...state.undo, back],
      redo: from === 'undo' ? [...state.redo, back] : rest,
      selection: nearestLive(entry.step.document, entry.changed),
      run: null,
    });
  }

  return {
    $state,
    apply,
    edit: (edit, coalesce) => {
      apply((step) => {
        const result = edit(step.document);

        return result === null
          ? null
          : {
              step: {
                ...step,
                document: result.document,
                records: reconcileRecords(
                  step.records,
                  toPreset(step.document),
                  toPreset(result.document),
                ),
              },
              changed: result.changed,
            };
      }, coalesce);
    },
    open: (preset, origin, name) => {
      apply(() => {
        const document = fromPreset(preset, origin ?? undefined);

        return {
          step: { document, origin, name, records: [] },
          changed: firstSelection(document) ?? WINDOW_UID,
        };
      });
    },
    replacePreset: (preset, origin, name) => {
      apply((step) => {
        const document = fromPreset(preset, origin ?? undefined);

        return {
          step: {
            document,
            origin,
            name,
            records: reconcileRecords(step.records, toPreset(step.document), preset),
          },
          changed: firstSelection(document) ?? WINDOW_UID,
        };
      });
    },
    adoptOrigin: (origin) => {
      const state = $state.get();

      // A draft with an origin keeps it: its attached file is written on each edit, so reopening
      // that file must not drop the warnings about the file the GM opened first.
      if (
        state.step.origin !== null ||
        formatPresetFile(toPreset(state.step.document)) !== formatPresetFile(origin)
      ) {
        return;
      }

      // The opened file holds the whole draft, so every step of its history gets the origin too,
      // by uid. Not an undo step, as the draft's content stays.
      const ids = collectOriginRepeatIds(state.step.document.templates, origin.templates);

      const adopt = (step: BuilderStep): BuilderStep =>
        step.origin === null
          ? { ...step, origin, document: { ...step.document, originRepeatIds: ids } }
          : step;

      const adoptEntry = (entry: HistoryEntry): HistoryEntry => ({
        ...entry,
        step: adopt(entry.step),
      });

      commit({
        ...state,
        step: adopt(state.step),
        undo: state.undo.map(adoptEntry),
        redo: state.redo.map(adoptEntry),
      });
    },
    setSnapshot: (records) => {
      const selection = $state.get().selection ?? WINDOW_UID;

      apply((step) => ({
        step: { ...step, records: [...records] },
        changed: selection,
      }));
    },
    addSheet: (setId) => {
      const selection = $state.get().selection ?? WINDOW_UID;

      apply((step) => {
        const preset = toPreset(step.document);

        const template = preset.templates.find(
          (candidate) => candidate.id === setId && isSheetSet(candidate),
        );

        if (template === undefined) {
          return null;
        }

        if (!templateIdSchema.safeParse(setId).success) {
          return null;
        }

        const used = new Set(step.records.map((record) => record.k));
        let sheetId = nanoid(8);

        while (used.has(sheetKey(sheetId))) {
          sheetId = nanoid(8);
        }

        const sheets = liveSheets(step.records, preset, setId);
        const order = sheets.reduce((highest, sheet) => Math.max(highest, sheet.order), -1) + 1;

        const record = recordSchema.parse({
          k: sheetKey(sheetId),
          d: { set: setId, order, cells: {} },
          c: 1,
          a: BUILDER_AUTHOR,
          l: [1, BUILDER_AUTHOR],
        });

        return {
          step: { ...step, records: [...step.records, record] },
          changed: selection,
        };
      });
    },
    undo: () => {
      swap('undo');
    },
    redo: () => {
      swap('redo');
    },
    select: (uid) => {
      const state = $state.get();

      if (state.selection !== uid || state.run !== null) {
        $state.set({ ...state, selection: uid, run: null });
      }
    },
    endRun: () => {
      const state = $state.get();

      if (state.run !== null) {
        $state.set({ ...state, run: null });
      }
    },
  };
}

// The first template, or the window of a preset with none.
function firstSelection(document: BuilderDocument): string | null {
  return document.templates[0]?.uid ?? WINDOW_UID;
}

// The changed item with its containers, read from the document that has it: the new one for an
// add, the old one for a remove.
function changedChain(before: BuilderDocument, after: BuilderDocument, uid: string): string[] {
  const chain = ancestorUids(after, uid);

  return chain.length > 0 ? chain : [uid, ...ancestorUids(before, uid).slice(1)];
}

function nearestLive(document: BuilderDocument, chain: readonly string[]): string | null {
  return chain.find((uid) => locate(document, uid) !== null) ?? firstSelection(document);
}

type ReadDraft = { step: BuilderStep; readable: boolean };

// The draft, or a blank step when there is none or it fails the preset structure check. Uids are
// minted again. `readable` is false when the storage threw on the read.
function readDraft(storage: DraftStorage | null): ReadDraft {
  const blank: BuilderStep = {
    document: EMPTY_DOCUMENT,
    origin: null,
    name: BLANK_NAME,
    records: [],
  };

  let text: string | null = null;

  try {
    text = storage?.getItem(DRAFT_STORAGE_KEY) ?? null;
  } catch {
    return { step: blank, readable: false };
  }

  return { step: text === null ? blank : parseDraft(text, blank), readable: true };
}

function parseDraft(text: string, blank: BuilderStep): BuilderStep {
  let candidate: ReturnType<typeof JSON.parse>;

  try {
    candidate = JSON.parse(text);
  } catch {
    return blank;
  }

  const draft = draftSchema.safeParse(candidate);
  const preset = draft.success ? parsePresetStructure(draft.data.preset) : null;

  if (!draft.success || preset === null) {
    return blank;
  }

  const origin = draft.data.origin === null ? null : parsePresetStructure(draft.data.origin);

  return {
    document: restoreOriginRepeatIds(fromPreset(preset), draft.data.originRepeatIds),
    origin,
    name: draft.data.name,
    records: draft.data.records ?? [],
  };
}

function writeDraft(storage: DraftStorage | null, step: BuilderStep): DraftStatus {
  if (storage === null) {
    return 'failed';
  }

  try {
    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        preset: toPreset(step.document),
        origin: step.origin,
        name: step.name,
        records: step.records,
        originRepeatIds: serializeOriginRepeatIds(step.document),
      }),
    );

    return 'saved';
  } catch {
    return 'failed';
  }
}

function reconcileRecords(
  records: readonly VersionedRecord[],
  before: Preset,
  after: Preset,
): readonly VersionedRecord[] {
  if (records.length === 0) {
    return records;
  }

  const file = encodeSnapshotFile(new Map(records.map((record) => [record.k, record])), before);

  for (const sheet of file.sheets) {
    const previous = before.templates.find((template) => template.id === (sheet.set ?? sheet.id));

    const next = after.templates.find(
      (template) =>
        template.id === previous?.id &&
        (template.repeat !== undefined) === (previous?.repeat !== undefined),
    );

    if (previous === undefined || next === undefined) continue;
    const moves = presetMoves(previous, next);

    for (const block of sheet.blocks) {
      const scope = block.path[0];
      const target = scope === undefined ? null : moves.sectionOf(scope);

      if (target !== null) block.path = [target, ...block.path.slice(1)];
    }
  }

  const imported = importSnapshot(
    file,
    { preset: after, data: encodePreset(after) },
    BUILDER_AUTHOR,
  );

  return imported.isOk() ? imported.value.records : records;
}
