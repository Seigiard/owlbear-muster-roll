import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePresetFile, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import {
  createBuilderStore,
  DRAFT_STORAGE_KEY,
  type BuilderStore,
  type DraftStorage,
} from './builder-store';
import {
  addCell,
  addRow,
  addSection,
  addTemplate,
  moveItem,
  removeItem,
  renameField,
  serializeOriginRepeatIds,
  setWindow,
  toPreset,
  uidAt,
  updateCell,
  updateSection,
  updateTemplate,
  withRepeat,
  WINDOW_UID,
  type BuilderDocument,
  type DocumentEdit,
} from './document';

const D20 = readPreset(join(import.meta.dir, '../../tests/fixtures/presets/d20.json'));

function readPreset(path: string): Preset {
  const parsed = parsePresetFile(readFileSync(path, 'utf8'));

  if (!parsed.isOk()) {
    throw new Error(`${path} is no preset`);
  }

  return parsed.value;
}

class MemoryStorage implements DraftStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

class BrokenStorage implements DraftStorage {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    throw new Error('quota');
  }
}

function presetOf(store: BuilderStore): Preset {
  return toPreset(store.$state.get().step.document);
}

function uid(store: BuilderStore, ...path: number[]): string {
  const found = uidAt(store.$state.get().step.document, path);

  if (found === null) {
    throw new Error(`No item at ${path.join('.')}`);
  }

  return found;
}

type EditCase = [
  string,
  (store: BuilderStore) => (document: BuilderDocument) => DocumentEdit | null,
];

// One case per edit kind, each on the d20 preset.
const EDITS: EditCase[] = [
  ['an added template', () => (document) => addTemplate(document, 'set')],
  ['an added section', (store) => (document) => addSection(document, uid(store, 0, 0))],
  ['an added row', (store) => (document) => addRow(document, uid(store, 0, 0, 0))],
  ['an added field', (store) => (document) => addCell(document, uid(store, 0, 0, 0, 0), 'field')],
  [
    'a template form change',
    (store) => (document) =>
      updateTemplate(document, uid(store, 0), (template) => ({ ...template, title: 'Герои' })),
  ],
  [
    'a section form change',
    (store) => (document) =>
      updateSection(document, uid(store, 0, 0, 0), (section) => withRepeat(section, true)),
  ],
  [
    'a cell form change',
    (store) => (document) =>
      updateCell(document, uid(store, 0, 0, 0, 0, 1), (cell) =>
        cell.kind === 'field' ? { ...cell, type: 'number' } : cell,
      ),
  ],
  ['a window change', () => (document) => setWindow(document, { width: 800, height: 700 })],
  ['a removal', (store) => (document) => removeItem(document, uid(store, 0, 0, 1))],
  [
    'a move',
    (store) => (document) =>
      moveItem(document, uid(store, 1), { place: 'before', sibling: uid(store, 0) }),
  ],
  ['a rename', (store) => (document) => renameField(document, uid(store, 0, 0, 0, 0, 1), 'imya')],
];

describe('undo and redo', () => {
  test.each(EDITS)('%s undoes and redoes to the same preset each time', (_name, makeEdit) => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    const before = presetOf(store);
    // #when
    store.edit(makeEdit(store));
    const after = presetOf(store);
    store.undo();
    const undone = presetOf(store);
    store.redo();
    const redone = presetOf(store);
    store.undo();
    // #then
    expect(after).not.toEqual(before);
    expect(undone).toEqual(before);
    expect(redone).toEqual(after);
    expect(presetOf(store)).toEqual(before);
  });
  test('an open is one step, and undoing it restores the old draft, origin and name', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.edit((document) => addTemplate(document, 'single'));
    const draft = presetOf(store);
    // #when
    store.open(D20, D20, 'd20');
    store.undo();
    // #then
    expect(presetOf(store)).toEqual(draft);
    expect(store.$state.get().step.origin).toBeNull();
    expect(store.$state.get().step.name).toBe('preset');
  });
  test('replacing snapshot records is one complete step through undo and redo', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());

    const before = [
      { k: 'blk:anya', d: { set: 'pc', order: 0, cells: {} }, c: 1, a: 'test', l: [1, 'seed'] },
    ] satisfies VersionedRecord[];

    const after = [
      { k: 'blk:brok', d: { set: 'pc', order: 1, cells: {} }, c: 1, a: 'test', l: [1, 'seed'] },
    ] satisfies VersionedRecord[];

    store.setSnapshot(before);
    // #when
    store.setSnapshot(after);
    store.undo();
    const undone = store.$state.get().step.records;
    store.redo();
    // #then
    expect({ undone, redone: store.$state.get().step.records }).toEqual({
      undone: before,
      redone: after,
    });
  });
  test('adding a sheet is one complete step through undo and redo', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    // #when
    store.addSheet('pc');
    const added = store.$state.get().step.records;
    store.undo();
    const undone = store.$state.get().step.records;
    store.redo();
    const redone = store.$state.get().step.records;

    const normalizedAdded = added.map((record) =>
      record.k.startsWith('blk:') ? { ...record, k: 'blk:<generated>' } : record,
    );

    const normalizedRedone = redone.map((record) =>
      record.k.startsWith('blk:') ? { ...record, k: 'blk:<generated>' } : record,
    );

    // #then
    expect({
      added: normalizedAdded,
      generatedId: /^blk:[A-Za-z0-9_-]{8}$/.test(added[0]?.k ?? ''),
      undone,
      redone: normalizedRedone,
      sameId: redone[0]?.k === added[0]?.k,
    }).toEqual({
      added: [
        {
          k: 'blk:<generated>',
          d: { set: 'pc', order: 0, cells: {} },
          c: 1,
          a: 'builder',
          l: [1, 'builder'],
        },
      ],
      generatedId: true,
      undone: [],
      redone: [
        {
          k: 'blk:<generated>',
          d: { set: 'pc', order: 0, cells: {} },
          c: 1,
          a: 'builder',
          l: [1, 'builder'],
        },
      ],
      sameId: true,
    });
  });
  test('typing in one input is one step until the run ends', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    const template = uid(store, 0);

    const retitle = (title: string) => (document: BuilderDocument) =>
      updateTemplate(document, template, (current) => ({ ...current, title }));

    // #when
    store.edit(retitle('Г'), `${template}:title`);
    store.edit(retitle('Ге'), `${template}:title`);
    store.edit(retitle('Гер'), `${template}:title`);
    store.endRun();
    store.edit(retitle('Герои'), `${template}:title`);
    store.undo();
    // #then
    expect(presetOf(store).templates[0]?.title).toBe('Гер');
    // #when
    store.undo();
    // #then
    expect(presetOf(store).templates[0]?.title).toBe(D20.templates[0]?.title);
  });
  test('a selection change ends the run too', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    const template = uid(store, 0);

    const retitle = (title: string) => (document: BuilderDocument) =>
      updateTemplate(document, template, (current) => ({ ...current, title }));

    // #when
    store.edit(retitle('А'), `${template}:title`);
    store.select(WINDOW_UID);
    store.edit(retitle('АБ'), `${template}:title`);
    store.undo();
    // #then
    expect(presetOf(store).templates[0]?.title).toBe('А');
  });
  test('undo selects the changed item, or its nearest live container', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    const row = uid(store, 0, 0, 0, 0);
    store.edit((document) => addCell(document, row, 'dice'));
    store.select(WINDOW_UID);
    // #when
    store.undo();
    // #then
    expect(store.$state.get().selection).toBe(row);
    // #when
    store.redo();
    // #then
    expect(store.$state.get().selection).toBe(
      uid(store, 0, 0, 0, 0, D20.templates[0]?.tabs[0]?.sections[0]?.rows[0]?.cells.length ?? 0),
    );
  });
});

describe('the draft', () => {
  test('opens again after a reload, with no prompt, and with new uids', () => {
    // #given
    const storage = new MemoryStorage();
    const first = createBuilderStore(storage);
    first.open(D20, D20, 'd20');
    first.edit((document) => setWindow(document, { width: 200, height: 600 }));
    // #when
    const second = createBuilderStore(storage);
    // #then
    expect(presetOf(second)).toEqual(presetOf(first));
    expect(second.$state.get().step.origin).toEqual(D20);
    expect(second.$state.get().step.name).toBe('d20');
    expect(second.$state.get().selection).toBe(uid(second, 0));
    expect(second.$state.get().undo).toEqual([]);
  });
  test('opens an existing v4 draft without warning identity metadata', () => {
    // #given
    const storage = new MemoryStorage();

    const preset: Preset = {
      ...D20,
      templates: D20.templates.map((template, index) =>
        index === 0 ? { ...template, title: 'Герои' } : template,
      ),
    };

    const records = [
      { k: 'blk:anya', d: { set: 'pc', order: 0, cells: {} }, c: 1, a: 'test', l: [1, 'seed'] },
    ] satisfies VersionedRecord[];

    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ preset, origin: D20, name: 'existing-draft', records }),
    );

    // #when
    const store = createBuilderStore(storage);

    // #then
    expect({
      preset: presetOf(store),
      origin: store.$state.get().step.origin,
      name: store.$state.get().step.name,
      records: store.$state.get().step.records,
    }).toEqual({
      preset,
      origin: D20,
      name: 'existing-draft',
      records,
    });
  });
  test('a draft that fails the structure check is dropped for the empty preset', () => {
    // #given
    const storage = new MemoryStorage();
    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ preset: { v: 3, templates: [{ id: 'x' }] }, origin: null, name: 'x' }),
    );
    // #when
    const store = createBuilderStore(storage);
    // #then
    expect(presetOf(store)).toEqual({ v: 4, templates: [] });
    expect(store.$state.get().selection).toBe(WINDOW_UID);
  });
  test('a storage that keeps nothing says so, and editing goes on', () => {
    // #given
    const store = createBuilderStore(new BrokenStorage());
    // #when
    store.edit((document) => addTemplate(document, 'set'));
    // #then
    expect(store.$state.get().draft).toBe('failed');
    expect(presetOf(store).templates).toHaveLength(1);
  });
  test('a storage that throws on the read starts on the empty preset and says the draft fails', () => {
    // #given
    const storage: DraftStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => undefined,
    };

    // #when
    const store = createBuilderStore(storage);
    // #then
    expect(store.$state.get().draft).toBe('failed');
    expect(presetOf(store)).toEqual({ v: 4, templates: [] });
  });
});

describe('adopting an origin', () => {
  test('gives an origin-less draft the loaded repeat ids and keeps its uids, records and undo steps', () => {
    // #given
    const storage = new MemoryStorage();
    const store = createBuilderStore(storage);
    store.open(D20, null, 'd20');
    store.addSheet('pc');
    const before = store.$state.get();
    const loaded = createBuilderStore(new MemoryStorage());
    loaded.open(D20, D20, 'd20');
    // #when
    store.adoptOrigin(D20);
    // #then
    const after = store.$state.get();
    const restored = createBuilderStore(storage).$state.get();
    expect({
      origin: after.step.origin,
      templateUids: after.step.document.templates.map((template) => template.uid),
      records: after.step.records,
      selection: after.selection,
      undoSteps: after.undo.length,
      repeatIds: serializeOriginRepeatIds(after.step.document),
      restoredOrigin: restored.step.origin,
      restoredRepeatIds: serializeOriginRepeatIds(restored.step.document),
    }).toEqual({
      origin: D20,
      templateUids: before.step.document.templates.map((template) => template.uid),
      records: before.step.records,
      selection: before.selection,
      undoSteps: before.undo.length,
      repeatIds: serializeOriginRepeatIds(loaded.$state.get().step.document),
      restoredOrigin: D20,
      restoredRepeatIds: serializeOriginRepeatIds(loaded.$state.get().step.document),
    });
  });
  test('keeps the adopted origin through undo, redo and a new edit after an undo', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    store.edit((document) =>
      updateTemplate(document, uid(store, 0), (template) => ({ ...template, title: 'Герои' })),
    );
    const edited = toPreset(store.$state.get().step.document);
    store.adoptOrigin(edited);
    const adoptedIds = serializeOriginRepeatIds(store.$state.get().step.document);
    // #when
    store.undo();
    const undone = store.$state.get().step;
    store.redo();
    const redone = store.$state.get().step;
    store.undo();
    store.edit((document) => setWindow(document, { width: 800, height: 700 }));
    const branched = store.$state.get().step;
    // #then
    expect({
      undone: { origin: undone.origin, ids: serializeOriginRepeatIds(undone.document) },
      redone: { origin: redone.origin, ids: serializeOriginRepeatIds(redone.document) },
      branched: { origin: branched.origin, ids: serializeOriginRepeatIds(branched.document) },
    }).toEqual({
      undone: { origin: edited, ids: adoptedIds },
      redone: { origin: edited, ids: adoptedIds },
      branched: { origin: edited, ids: adoptedIds },
    });
  });
  test('ignores a preset that differs from the draft', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, null, 'd20');
    const before = store.$state.get();
    // #when
    store.adoptOrigin({ ...D20, templates: D20.templates.slice(1) });
    // #then
    expect(store.$state.get()).toBe(before);
  });
  test('keeps the origin of a draft that has one', () => {
    // #given
    const store = createBuilderStore(new MemoryStorage());
    store.open(D20, D20, 'd20');
    const attack = uid(store, 0, 0, 3);
    store.edit((document) =>
      updateSection(document, attack, (section) =>
        section.repeat === undefined
          ? section
          : { ...section, repeat: { ...section.repeat, id: 'moves' } },
      ),
    );
    const before = store.$state.get();
    // #when
    store.adoptOrigin(toPreset(before.step.document));
    // #then
    expect(store.$state.get()).toBe(before);
  });
});
