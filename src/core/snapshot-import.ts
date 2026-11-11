import { z } from 'zod';

import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';
import { FORMAT_VERSION } from '@/core/format-version';
import type { JsonValue } from '@/core/json';
import { recordFitsOneMessage } from '@/core/message-size';
import { PRESET_FILE_BYTE_LIMIT, type Preset, type PresetFieldCell } from '@/core/preset';
import {
  erasedDigest,
  holdsValue,
  keptValues,
  sectionTarget,
  templateScopes,
  type TemplateScopes,
} from '@/core/preset-migrate';
import { recordSchema, type FieldValues, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { snapshotFileSchema, SNAPSHOT_FILE_TYPE, type SnapshotFile } from '@/core/snapshot-file';
import { parseSheetName } from '@/core/sheets';

// The same byte limit as a preset file.
export const SNAPSHOT_FILE_BYTE_LIMIT = PRESET_FILE_BYTE_LIMIT;

// Check order: size, JSON, `v`, `type`, then structure. `v` comes before the structure, because a
// newer file may have a shape this build does not know. `not-snapshot` is a file of another kind,
// such as a preset.
export type SnapshotFileFailure =
  | 'too-large'
  | 'not-json'
  | 'newer-version'
  | 'unsupported-version'
  | 'not-snapshot'
  | 'invalid-structure';

// AD-9: the records an import writes, all at `c: 1`, and the values of the file the current preset
// has no place for: their count, and a hash of them, so a confirmation answers only for what it
// showed.
export type SnapshotImport = { records: VersionedRecord[]; count: number; digest: string };

// `too-large`: a record that cannot fit one message. `invalid-structure`: a sheet name the sheet
// name rules refuse, or a record no record schema takes.
export type SnapshotImportFailure = 'too-large' | 'invalid-structure';

// The room's preset as the import reads it: decoded, and as the `preset` record holds it.
export type CurrentPreset = { preset: Preset; data: string };

const encoder = new TextEncoder();

const BYTE_ORDER_MARK = '\uFEFF';

const FIELD_TYPES: readonly PresetFieldCell['type'][] = ['text', 'number', 'check'];

const fileObjectSchema = z.looseObject({ v: z.unknown().optional(), type: z.unknown().optional() });

const versionSchema = z.number();

export function parseSnapshotFile(text: string): Result<SnapshotFile, SnapshotFileFailure> {
  if (encoder.encode(text).length > SNAPSHOT_FILE_BYTE_LIMIT) {
    return err('too-large');
  }

  let candidate: ReturnType<typeof JSON.parse>;

  // A byte order mark some editors save is no part of the JSON.
  try {
    candidate = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  } catch {
    return err('not-json');
  }

  const file = fileObjectSchema.safeParse(candidate);

  if (!file.success) {
    return err('invalid-structure');
  }

  // A JSON object of another kind with no `v` says what it is by its `type`.
  if (
    file.data.v === undefined &&
    file.data.type !== undefined &&
    file.data.type !== SNAPSHOT_FILE_TYPE
  ) {
    return err('not-snapshot');
  }

  const version = versionSchema.safeParse(file.data.v);

  // A version is an integer. `Number.isInteger` also holds above the safe range, so `1e16` is newer.
  if (!version.success || !Number.isInteger(version.data)) {
    return err('unsupported-version');
  }

  if (version.data > FORMAT_VERSION) {
    return err('newer-version');
  }

  // No migration exists yet, so a lower `v` is refused. The first format change adds the registry.
  if (version.data < FORMAT_VERSION) {
    return err('unsupported-version');
  }

  if (file.data.type !== SNAPSHOT_FILE_TYPE) {
    return err('not-snapshot');
  }

  const parsed = snapshotFileSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-structure');
}

// The window sends the file deflated, as a preset, so a file over the message limit as JSON can
// still fit once deflated. The replica parses it again from this data.
export function encodeSnapshotFileData(file: SnapshotFile): string {
  return deflateToBase64(JSON.stringify(file));
}

export function decodeSnapshotFileData(data: string): Result<SnapshotFile, SnapshotFileFailure> {
  const text = inflateFromBase64(data, SNAPSHOT_FILE_BYTE_LIMIT);

  if (!text.ok) {
    return err(text.error === 'too-large' ? 'too-large' : 'invalid-structure');
  }

  return parseSnapshotFile(text.value);
}

type SnapshotSheet = SnapshotFile['sheets'][number];

// A record before the record schema has checked it.
type Candidate = { k: string; d: JsonValue; c: number; a: string };

type CandidateData = [string, JsonValue];

type FileRepeatRow = SnapshotSheet['repeats'][string][number];

// The values of the file the current template has no place for, as `(key, field id)` pairs under
// the keys the file names.
type Dropped = string[];

// AD-9: one pass over the file with the current preset. Every sheet keeps its id, kind, name and
// order. A value goes by field id into the template of its sheet's kind: a non-repeat value into
// the non-repeat row that holds its id now, a repeat row into the repeat section of its file
// section, with its `instanceId` and `order`. A value whose id the template does not have in that
// scope, or whose type is not its field's, is dropped and counted. The output holds the current
// `preset`, every `link:` of the file, and no `acl:` or `plink:` record, so every player is read-only
// and no character has an owner. Every record is at `c: 1` by `author`.
export function importSnapshot(
  file: SnapshotFile,
  current: CurrentPreset,
  author: string,
): Result<SnapshotImport, SnapshotImportFailure> {
  const records: Candidate[] = [];
  const dropped: Dropped = [];

  const scopes = {
    pc: templateScopes(current.preset.character),
    npc: templateScopes(current.preset.npc),
  };

  const add = (k: string, d: JsonValue): void => {
    records.push({ k, d, c: 1, a: author });
  };

  add('preset', current.data);

  for (const sheet of file.sheets) {
    const name = parseSheetName(sheet.name);

    if (!name.ok) {
      return err('invalid-structure');
    }

    add(`sheet:${sheet.id}`, { kind: sheet.kind, name: name.value, order: sheet.order });

    for (const [k, d] of sheetValues(sheet, scopes[sheet.kind], dropped)) {
      add(k, d);
    }
  }

  for (const link of file.links) {
    add(`link:${link.tokenId}`, link.sheetId);
  }

  const parsed: VersionedRecord[] = [];

  for (const record of records) {
    const valid = recordSchema.safeParse(record);

    if (!valid.success) {
      return err('invalid-structure');
    }

    if (!recordFitsOneMessage(valid.data)) {
      return err('too-large');
    }

    parsed.push(valid.data);
  }

  parsed.sort((left, right) => compareCodeUnits(left.k, right.k));

  return ok({ records: parsed, count: dropped.length, digest: erasedDigest(dropped) });
}

// The `row:` and `rep:` records of one sheet of the file, as the current template places them.
function sheetValues(
  sheet: SnapshotSheet,
  scopes: TemplateScopes,
  dropped: Dropped,
): CandidateData[] {
  const out: CandidateData[] = [];
  const rows = new Map<string, FieldValues>();

  // The value in the field's own row comes first, so a stray copy in another row never wins.
  const cells = sortedEntries(sheet.rows)
    .flatMap(([rowId, values]) =>
      sortedEntries(values).map(([fieldId, value]) => ({ rowId, fieldId, value })),
    )
    .sort(
      (left, right) =>
        ownRowRank(left.rowId, left.fieldId, scopes) -
        ownRowRank(right.rowId, right.fieldId, scopes),
    );

  for (const { rowId, fieldId, value } of cells) {
    const target = scopes.rowFields.get(fieldId);
    const row = target === undefined ? undefined : (rows.get(target.rowId) ?? {});

    // A field id holds one value per sheet, so a second one for the same id is dropped too.
    if (
      target === undefined ||
      row === undefined ||
      !holdsValue(target.field, value) ||
      Object.hasOwn(row, fieldId)
    ) {
      dropped.push(`row:${sheet.id}:${rowId}\u0000${fieldId}`);
      continue;
    }

    row[fieldId] = value;
    rows.set(target.rowId, row);
  }

  for (const [rowId, values] of [...rows].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    out.push([`row:${sheet.id}:${rowId}`, values]);
  }

  out.push(...repeatValues(sheet, scopes, dropped));

  return out;
}

// 0 for a value in the row that holds its field now, 1 for any other.
function ownRowRank(rowId: string, fieldId: string, scopes: TemplateScopes): number {
  return scopes.rowFields.get(fieldId)?.rowId === rowId ? 0 : 1;
}

// One file section with the current section it goes to.
type SectionMove = { sectionId: string; target: string | null; rows: readonly FileRepeatRow[] };

// Every file section goes to one current section, or to none. The file sections of one current
// section keep their order: the one with the section's own id first, then the others by id. The
// first keeps its `order`, and each next one shifts so its lowest `order` comes after the highest
// so far. A repeat row whose `instanceId` an earlier section took in the same current section is
// dropped with all its values.
function repeatValues(
  sheet: SnapshotSheet,
  scopes: TemplateScopes,
  dropped: Dropped,
): CandidateData[] {
  const out: CandidateData[] = [];

  const moves: SectionMove[] = sortedEntries(sheet.repeats).map(([sectionId, rows]) => ({
    sectionId,
    target: sectionTarget(sectionId, fileSectionFields(rows), scopes),
    rows,
  }));

  const targets = [...scopes.sections.keys()];

  for (const move of moves) {
    if (move.target === null) {
      for (const row of move.rows) {
        dropAll(dropped, repKey(sheet.id, move.sectionId, row.instanceId), row.cells);
      }
    }
  }

  for (const target of targets) {
    const fields = scopes.sections.get(target) ?? [];

    const groups = moves
      .filter((move) => move.target === target)
      .sort((left, right) => rankOf(left, target) - rankOf(right, target));

    const claimed = new Set<string>();
    let highest = -Infinity;

    for (const group of groups) {
      const lowest = Math.min(...group.rows.map((row) => row.order));
      const shift = highest >= lowest ? highest + 1 - lowest : 0;

      for (const row of group.rows) {
        const fileKey = repKey(sheet.id, group.sectionId, row.instanceId);

        if (claimed.has(row.instanceId)) {
          dropAll(dropped, fileKey, row.cells);
          continue;
        }

        claimed.add(row.instanceId);

        const cells = keptValues(row.cells, fields);

        for (const fieldId of Object.keys(row.cells)) {
          if (!Object.hasOwn(cells, fieldId)) {
            dropped.push(`${fileKey}\u0000${fieldId}`);
          }
        }

        const order = row.order + shift;

        highest = Math.max(highest, order);
        out.push([repKey(sheet.id, target, row.instanceId), { order, cells: sortedValues(cells) }]);
      }
    }
  }

  return out.sort(([left], [right]) => compareCodeUnits(left, right));
}

// The section of its own id comes first, then the others by their file id.
function rankOf(move: SectionMove, target: string): number {
  return move.sectionId === target ? 0 : 1;
}

// The file section's field ids, each with the first type its values fit, so the section goes
// where a preset migration would send a section of those fields (5.1).
function fileSectionFields(rows: readonly FileRepeatRow[]): PresetFieldCell[] {
  const fields = new Map<string, PresetFieldCell>();

  for (const row of rows) {
    for (const [id, value] of sortedEntries(row.cells)) {
      const type = FIELD_TYPES.find((candidate) =>
        holdsValue({ kind: 'field', type: candidate, id }, value),
      );

      if (type !== undefined && !fields.has(id)) {
        fields.set(id, { kind: 'field', type, id });
      }
    }
  }

  return [...fields.values()];
}

function dropAll(dropped: Dropped, key: string, cells: FieldValues): void {
  for (const fieldId of Object.keys(cells)) {
    dropped.push(`${key}\u0000${fieldId}`);
  }
}

function repKey(sheetId: string, sectionId: string, instanceId: string): string {
  return `rep:${sheetId}:${sectionId}:${instanceId}`;
}

function sortedValues(values: FieldValues): FieldValues {
  return Object.fromEntries(sortedEntries(values));
}

function sortedEntries<Value>(object: Readonly<Record<string, Value>>): [string, Value][] {
  return Object.entries(object).sort(([left], [right]) => compareCodeUnits(left, right));
}

// By code unit, not by locale, so every client gets the same order.
function compareCodeUnits(first: string, second: string): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}
