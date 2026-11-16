import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blockDataSchema,
  versionCells,
  type FieldValue,
  type LinkData,
  type VersionedRecord,
} from '@/core/records';
import { INSTANCE_ID_LENGTH, SHEET_ID_LENGTH } from './ids';
import {
  encodePreset,
  firstFieldId,
  layoutSections,
  parsePresetFile,
  repeatSectionId,
  sectionFields,
  type Preset,
  type PresetSection,
  type Template,
} from './preset';
import {
  encodeSnapshot,
  readSnapshot,
  ROOM_METADATA_BYTE_LIMIT,
  SNAPSHOT_KEY,
  type SnapshotValue,
} from './snapshot';

// AD-8 and NFR16: the TASK-41 worst case. It prints the size of a full room copy, to be copied into
// the task notes, and enforces the 1500 bytes of margin TASK-37 set: a failure here needs an owner
// decision, as TASK-34 was. A v1 room copy is wiped, not read, so no v2 room holds the 21-character
// ids made before TASK-37.
// The larger Story 1.11 fixture: a linkable sheet set `pc`, the linkable NPC single sheet `npc` and
// three other single sheets.
const FIXTURE_PATH = join(import.meta.dir, '../../tests/fixtures/presets/d20.json');
const CHARACTER_COUNT = 6;
const CHARACTER_ATTACKS = 4;

// The repeat blocks of the NPC single sheet, each linked to its own token.
const NPC_COUNT = 60;

// The repeat blocks of each other single sheet's repeat section.
const SINGLE_SHEET_BLOCKS = 4;
const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';

// GM connection ids, the record authors. Owlbear makes them, so TASK-37 leaves their length as is.
const CONNECTION_ID_LENGTH = 21;

// TASK-37 AC 3: the margin the room copy must keep, written out by hand.
const REQUIRED_MARGIN = 1500;
const CLASSES = ['Следопыт', 'Волшебница', 'Паладин', 'Плут', 'Жрица', 'Варвар'];
const HEROES = ['Брок Железнобокий', 'Лиза Ветреная', 'Агнесса', 'Мирон Тень', 'Дарья', 'Гром'];
const PLAYERS = ['Андрей', 'Лиза', 'Катя', 'Миша', 'Даша', 'Гоша'];
const MONSTERS = ['Гоблин-лучник', 'Скелет-воин', 'Орк-берсерк', 'Культист', 'Волк', 'Разбойник'];
const ATTACKS = ['Длинный меч', 'Короткий лук', 'Кинжал с ядом', 'Огненный снаряд', 'Укус'];

describe('room copy size of the TASK-41 worst case', () => {
  test('6 sheets of a sheet set, 60 linked NPC blocks and 3 other single sheets with Russian text encode, read back whole and leave the margin', () => {
    // #given
    const records = room(loadPreset());
    // #when
    const encoded = encodedCopy(records);
    const bytes = copyBytes(encoded);
    const margin = ROOM_METADATA_BYTE_LIMIT - bytes;
    console.log(`snapshot bytes: ${bytes}, margin: ${margin}`);
    const readBack = readSnapshot({ [SNAPSHOT_KEY]: encoded });
    // #then
    expect(readBack.ok ? readBack.value?.records.length : null).toBe(records.length);
    expect(margin).toBeGreaterThanOrEqual(REQUIRED_MARGIN);
  });
});

function encodedCopy(records: readonly VersionedRecord[]): SnapshotValue {
  const encoded = encodeSnapshot({ n: 0, a: '' }, records);

  if (!encoded.ok) {
    throw new Error(`the room did not encode: ${encoded.error}`);
  }

  return encoded.value;
}

// The bytes the copy adds to room metadata on its own: its key, its value and the braces.
function copyBytes(encoded: SnapshotValue): number {
  return new TextEncoder().encode(JSON.stringify({ [SNAPSHOT_KEY]: encoded })).length;
}

function loadPreset(): Preset {
  const parsed = parsePresetFile(readFileSync(FIXTURE_PATH, 'utf8'));

  if (!parsed.ok) {
    throw new Error(`the fixture did not parse: ${parsed.error.code}`);
  }

  return parsed.value;
}

// The tools that make one room's records with real ids: nanoid sheet and instance ids, Owlbear
// UUIDs for players and tokens, and two GM connections as authors. A seeded random keeps the number
// reproducible.
type Maker = {
  random: () => number;
  author: () => string;
  counter: () => number;
  instanceId: () => string;
  rootAuthor: string;
};

// Every template of the preset filled: each sheet set with its sheets, each single sheet once. A
// linkable template links a token to each sheet, a linkable repeat section to each block, and each
// sheet of a sheet set has one player's `acl:` and `plink:`.
function room(preset: Preset): VersionedRecord[] {
  const random = seeded(18);
  const gms = [nanoid(random, CONNECTION_ID_LENGTH), nanoid(random, CONNECTION_ID_LENGTH)];

  const maker: Maker = {
    random,
    author: () => gms[Math.floor(random() * gms.length)] ?? '',
    counter: () => 1 + Math.floor(random() * 40),
    instanceId: () => nanoid(random, INSTANCE_ID_LENGTH),
    rootAuthor: gms[0] ?? '',
  };

  const records: VersionedRecord[] = [
    { k: 'preset', d: encodePreset(preset), c: 1, a: maker.author() },
  ];

  for (const template of preset.templates) {
    if (template.repeat === undefined) {
      records.push(...sheetRecords(template, template.id, 0, maker));
      continue;
    }

    for (let index = 0; index < CHARACTER_COUNT; index += 1) {
      const sheetId = nanoid(random, SHEET_ID_LENGTH);
      const playerId = uuid(random);
      const player = { name: at(PLAYERS, index) };
      const rootAuthor = maker.author();
      records.push(
        ...sheetRecords(template, sheetId, index, maker, rootAuthor),
        { k: `acl:${sheetId}:${playerId}`, d: player, c: 1, a: maker.author() },
        { k: `plink:${sheetId}:${playerId}`, d: player, c: 1, a: maker.author() },
      );
    }
  }

  return records;
}

// One sheet's root and descendant block records, and its token links.
function sheetRecords(
  template: Template,
  sheetId: string,
  index: number,
  maker: Maker,
  rootAuthor = maker.rootAuthor,
): VersionedRecord[] {
  const records: VersionedRecord[] = [];

  const root: VersionedRecord = {
    k: `blk:${sheetId}`,
    c: 1,
    a: rootAuthor,
    l: [1, rootAuthor],
    d:
      template.repeat !== undefined
        ? { order: index, set: template.id, cells: {} }
        : { order: index, cells: {} },
  };

  const rootToken = layoutSections(template)
    .filter((section) => section.repeat === undefined)
    .flatMap((section) => section.rows)
    .flatMap((row) => row.cells)
    .find((cell) => cell.kind === 'token');

  if (rootToken !== undefined) {
    records.push(linkRecord(maker, { s: sheetId, c: rootToken.id }));
  }

  for (const section of layoutSections(template)) {
    const sectionId = repeatSectionId(section);

    if (sectionId === null) {
      const data = blockDataSchema.parse(root.d);

      for (const row of plainRows(section, sheetId, index, maker)) {
        Object.assign(data.cells, blockDataSchema.parse(row.d).cells);
        root.c = Math.max(root.c, row.c);
      }

      root.d = data;
      continue;
    }

    for (let order = 0; order < blockCount(template); order += 1) {
      const instanceId = maker.instanceId();
      const cells = fieldValues(section, maker, template.repeat !== undefined ? index : order);
      const c = maker.counter();
      const a = maker.author();
      records.push({
        k: `blk:${sheetId}:${sectionId}:${instanceId}`,
        d: { order, cells: versionCells(cells, c, a) },
        c,
        a,
        l: [1, a],
      });

      const token = section.rows.flatMap((row) => row.cells).find((cell) => cell.kind === 'token');

      if (token !== undefined) {
        records.push(linkRecord(maker, { s: sheetId, path: [sectionId, instanceId], c: token.id }));
      }
    }
  }

  return [root, ...records];
}

function plainRows(
  section: PresetSection,
  sheetId: string,
  index: number,
  maker: Maker,
): VersionedRecord[] {
  return section.rows.flatMap((row): VersionedRecord[] => {
    const rowId = firstFieldId(row);
    const values = rowId === null ? null : fieldValues({ rows: [row] }, maker, index);
    const c = values === null ? 1 : maker.counter();
    const a = values === null ? maker.rootAuthor : maker.author();

    return values === null
      ? []
      : [
          {
            k: `blk:${sheetId}`,
            d: { order: index, cells: versionCells(values, c, a) },
            c,
            a,
            l: [1, maker.rootAuthor],
          },
        ];
  });
}

function blockCount(template: Template): number {
  if (template.repeat !== undefined) {
    return CHARACTER_ATTACKS;
  }

  return template.id === 'npc' ? NPC_COUNT : SINGLE_SHEET_BLOCKS;
}

function linkRecord(maker: Maker, d: LinkData): VersionedRecord {
  return { k: `link:${uuid(maker.random)}`, d, c: 1, a: maker.author() };
}

// A value for every field of a section's rows, which is one repeat block's cells.
function fieldValues(
  section: PresetSection,
  maker: Maker,
  index: number,
): Record<string, FieldValue> {
  return Object.fromEntries(
    sectionFields(section).map((field) => [
      field.id,
      fieldValue(maker.random, field.id, field.type, index),
    ]),
  );
}

function fieldValue(
  random: () => number,
  fieldId: string,
  type: string,
  index: number,
): FieldValue {
  if (type === 'check') {
    return true;
  }

  if (type === 'number') {
    return Math.floor(random() * 30) - 5;
  }

  if (fieldId === 'name') {
    return at(HEROES, index);
  }

  if (fieldId === 'npc_name') {
    return `${at(MONSTERS, index)} ${index + 1}`;
  }

  return fieldId === 'class'
    ? at(CLASSES, index)
    : at(ATTACKS, Math.floor(random() * ATTACKS.length));
}

function at(list: readonly string[], index: number): string {
  return list[index % list.length] ?? '';
}

function nanoid(random: () => number, length: number): string {
  return Array.from({ length }, () => NANOID_ALPHABET[Math.floor(random() * 64)]).join('');
}

function uuid(random: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// mulberry32: a small seeded generator, so every run builds the same room.
function seeded(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
