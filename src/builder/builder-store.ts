import { atom, type ReadableAtom } from 'nanostores';
import { z } from 'zod';

import { parsePresetStructure, type Preset } from '@/core/preset';

import {
  ancestorUids,
  EMPTY_DOCUMENT,
  fromPreset,
  locate,
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
  // The preset of the file the draft was opened from, for the rename warning. `null` otherwise.
  origin: Preset | null;
  // The name the download file starts with.
  name: string;
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
});

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
          : { step: { ...step, document: result.document }, changed: result.changed };
      }, coalesce);
    },
    open: (preset, origin, name) => {
      apply(() => {
        const document = fromPreset(preset);

        return {
          step: { document, origin, name },
          changed: firstSelection(document) ?? WINDOW_UID,
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
  const blank: BuilderStep = { document: EMPTY_DOCUMENT, origin: null, name: BLANK_NAME };
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

  return {
    document: fromPreset(preset),
    origin: draft.data.origin === null ? null : parsePresetStructure(draft.data.origin),
    name: draft.data.name,
  };
}

function writeDraft(storage: DraftStorage | null, step: BuilderStep): DraftStatus {
  if (storage === null) {
    return 'failed';
  }

  try {
    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ preset: toPreset(step.document), origin: step.origin, name: step.name }),
    );

    return 'saved';
  } catch {
    return 'failed';
  }
}
