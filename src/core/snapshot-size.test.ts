import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FieldValue, VersionedRecord } from '@/core/records';

import { INSTANCE_ID_LENGTH, SHEET_ID_LENGTH } from './ids';
import {
  encodePreset,
  firstFieldId,
  parsePresetFile,
  type Preset,
  type PresetSection,
} from './preset';
import {
  encodeSnapshot,
  readSnapshot,
  ROOM_METADATA_BYTE_LIMIT,
  SNAPSHOT_KEY,
  type SnapshotValue,
} from './snapshot';

// AD-8 and NFR16: the TASK-18 AC 12 measurement. It prints the size of a full party's room copy, to
// be copied into the task notes. TASK-37 shortened new ids to keep 1500 bytes of margin, and this
// test enforces that margin: a failure here needs an owner decision, as TASK-34 was. Rooms built
// before TASK-37 keep their 21-character ids and so their thin margin; the test prints that size
// too, for comparison, and asserts nothing about it.

// The larger Story 1.11 fixture.
const FIXTURE_PATH = join(import.meta.dir, '../../tests/fixtures/presets/d20.json');

const CHARACTER_COUNT = 6;
const NPC_COUNT = 60;
const CHARACTER_ATTACKS = 4;
const NPC_ATTACKS = 2;
const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';

// GM connection ids, the record authors. Owlbear makes them, so TASK-37 leaves their length as is.
const CONNECTION_ID_LENGTH = 21;

// TASK-37 AC 3: the margin the room copy must keep, written out by hand.
const REQUIRED_MARGIN = 1500;

// The nanoid default length, which every new id had before TASK-37.
const OLD_ID_LENGTH = 21;

const CLASSES = ['Следопыт', 'Волшебница', 'Паладин', 'Плут', 'Жрица', 'Варвар'];
const HEROES = ['Брок Железнобокий', 'Лиза Ветреная', 'Агнесса', 'Мирон Тень', 'Дарья', 'Гром'];
const PLAYERS = ['Андрей', 'Лиза', 'Катя', 'Миша', 'Даша', 'Гоша'];

const MONSTERS = ['Гоблин-лучник', 'Скелет-воин', 'Орк-берсерк', 'Культист', 'Волк', 'Разбойник'];

const ATTACKS = ['Длинный меч', 'Короткий лук', 'Кинжал с ядом', 'Огненный снаряд', 'Укус'];

describe('room copy size of the AC 12 party', () => {
  test('a party of 6 characters and 60 NPCs with Russian text encodes, reads back whole and leaves the margin', () => {
    // #given
    const preset = loadPreset();
    const records = party(preset, SHEET_ID_LENGTH, INSTANCE_ID_LENGTH);
    const oldRecords = party(preset, OLD_ID_LENGTH, OLD_ID_LENGTH);

    // #when
    const encoded = encodedCopy(records);
    const bytes = copyBytes(encoded);
    const margin = ROOM_METADATA_BYTE_LIMIT - bytes;
    const oldBytes = copyBytes(encodedCopy(oldRecords));

    console.log(`snapshot bytes: ${bytes}, margin: ${margin}`);
    console.log(
      `with ids made before TASK-37: snapshot bytes: ${oldBytes}, margin: ${ROOM_METADATA_BYTE_LIMIT - oldBytes}`,
    );

    const readBack = readSnapshot({ [SNAPSHOT_KEY]: encoded });

    // #then
    expect(readBack.ok ? readBack.value?.records.length : null).toBe(records.length);
    expect(margin).toBeGreaterThanOrEqual(REQUIRED_MARGIN);
  });
});

function encodedCopy(records: readonly VersionedRecord[]): SnapshotValue {
  const encoded = encodeSnapshot({ n: 0, a: '' }, records);

  if (!encoded.ok) {
    throw new Error(`the party did not encode: ${encoded.error}`);
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

// Real ids as the extension makes them: nanoid sheet and instance ids of the given lengths, Owlbear
// UUIDs for players and tokens and two GM connections as authors. A seeded random keeps the number
// reproducible.
function party(preset: Preset, sheetIdLength: number, instanceIdLength: number): VersionedRecord[] {
  const random = seeded(18);
  const gms = [nanoid(random, CONNECTION_ID_LENGTH), nanoid(random, CONNECTION_ID_LENGTH)];
  const author = (): string => gms[Math.floor(random() * gms.length)] ?? '';
  const counter = (): number => 1 + Math.floor(random() * 40);
  const records: VersionedRecord[] = [{ k: 'preset', d: encodePreset(preset), c: 1, a: author() }];

  for (let index = 0; index < CHARACTER_COUNT + NPC_COUNT; index += 1) {
    const isPc = index < CHARACTER_COUNT;
    const sheetId = nanoid(random, sheetIdLength);
    const name = isPc ? at(HEROES, index) : `${at(MONSTERS, index)} ${index - CHARACTER_COUNT + 1}`;
    const sections = isPc ? preset.character.sections : preset.npc.sections;

    const values = (fieldId: string, type: string): FieldValue =>
      fieldValue(random, fieldId, type, index);

    records.push({
      k: `sheet:${sheetId}`,
      d: { kind: isPc ? 'pc' : 'npc', name, order: index },
      c: counter(),
      a: author(),
    });

    for (const section of sections) {
      records.push(
        ...sectionRecords(
          section,
          sheetId,
          isPc ? CHARACTER_ATTACKS : NPC_ATTACKS,
          values,
          () => nanoid(random, instanceIdLength),
          counter,
          author,
        ),
      );
    }

    records.push({ k: `link:${uuid(random)}`, d: sheetId, c: 1, a: author() });

    if (isPc) {
      const playerId = uuid(random);

      records.push({
        k: `acl:${sheetId}:${playerId}`,
        d: { name: at(PLAYERS, index) },
        c: 1,
        a: author(),
      });
      records.push({
        k: `plink:${sheetId}:${playerId}`,
        d: { name: at(PLAYERS, index) },
        c: 1,
        a: author(),
      });
    }
  }

  return records;
}

function sectionRecords(
  section: PresetSection,
  sheetId: string,
  repeatCount: number,
  values: (fieldId: string, type: string) => FieldValue,
  newInstanceId: () => string,
  counter: () => number,
  author: () => string,
): VersionedRecord[] {
  const records: VersionedRecord[] = [];

  for (const row of section.rows) {
    const rowId = firstFieldId(row);

    if (rowId === null) {
      continue;
    }

    const cells = Object.fromEntries(
      row.flatMap((cell) => (cell.kind === 'field' ? [[cell.id, values(cell.id, cell.type)]] : [])),
    );

    if (section.repeat === true) {
      for (let order = 0; order < repeatCount; order += 1) {
        const k = `rep:${sheetId}:${rowId}:${newInstanceId()}`;

        records.push({ k, d: { order, cells }, c: counter(), a: author() });
      }
    } else {
      records.push({ k: `row:${sheetId}:${rowId}`, d: cells, c: counter(), a: author() });
    }
  }

  return records;
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

// mulberry32: a small seeded generator, so every run builds the same party.
function seeded(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
