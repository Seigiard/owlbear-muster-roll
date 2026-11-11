import { acceptedFieldValue, targetFields } from '@/core/field-patch';
import { sameJson } from '@/core/json';
import {
  firstFieldId,
  type Preset,
  type PresetFieldCell,
  type PresetTemplate,
} from '@/core/preset';
import {
  fieldValuesSchema,
  repDataSchema,
  sheetDataSchema,
  type FieldValue,
  type FieldValues,
  type RepData,
  type SheetData,
  type VersionedRecord,
} from '@/core/records';

type SheetKind = SheetData['kind'];

// One write of the migration, before a version is minted: a `row:` with its values, or a `rep:`
// with its data. `d: null` is a tombstone.
export type PlannedWrite = { k: string; d: FieldValues | null } | { k: string; d: RepData | null };

// AD-14: what one preset upload does to the values of every live sheet.
export type PresetMigration = {
  // The stored values the new preset erases, across all sheets.
  count: number;
  // A hash of the erased (key, field id) pairs. Two diffs with one count can erase different
  // values; the upload checks this too, so a confirmation answers only for what it showed.
  digest: string;
  // The field ids that held a value and lose it, per sheet kind, sorted.
  removed: Readonly<Record<SheetKind, readonly string[]>>;
  // Written before `preset`: rows under new keys, and rows that gain values. A row that gains
  // values keeps its old ones here too, so the old preset still reads it.
  first: PlannedWrite[];
  // Written after `preset`: tombstones of keys the new preset no longer has, and rows stripped to
  // the new template.
  last: PlannedWrite[];
};

// The fields of a template by scope. A non-repeat field is found by id in any non-repeat row. A
// repeat section is named by its sectionId and lists its fields in template order.
type TemplateScopes = {
  rows: Map<string, PresetFieldCell[]>;
  rowFields: Map<string, { rowId: string; field: PresetFieldCell }>;
  sections: Map<string, PresetFieldCell[]>;
};

// The two templates of one sheet kind, and where each old repeat section goes.
type KindPlan = {
  kind: SheetKind;
  before: TemplateScopes;
  after: TemplateScopes;
  sectionTargets: Map<string, string | null>;
};

type Tally = { count: number; removed: Record<SheetKind, Set<string>>; erased: string[] };

// The digest of a diff that erases nothing.
export const NOTHING_ERASED = erasedDigest([]);

const EMPTY_MIGRATION: PresetMigration = {
  count: 0,
  digest: NOTHING_ERASED,
  removed: { pc: [], npc: [] },
  first: [],
  last: [],
};

// AD-14: one pass over the full replica, each sheet against the template of its kind. A value is read only
// where the old preset shows it: its field in the row of its record, with its type. Any other
// stored value is no value and leaves without a count. A `row:` value survives when the new
// template has its id in any non-repeat row with the same type, and moves to that row. A `rep:`
// row moves to the new section of its old one with its `instanceId`, `order` and the values whose
// id the new section has with the same type. A key present with `false` holds a value. With no old
// preset nothing is read, so nothing moves or counts.
export function presetDiff(
  records: ReadonlyMap<string, VersionedRecord>,
  oldPreset: Preset | null,
  newPreset: Preset,
): PresetMigration {
  if (oldPreset === null) {
    return EMPTY_MIGRATION;
  }

  const kinds: Record<SheetKind, KindPlan> = {
    pc: kindPlan('pc', oldPreset.character, newPreset.character),
    npc: kindPlan('npc', oldPreset.npc, newPreset.npc),
  };

  const tally: Tally = { count: 0, removed: { pc: new Set(), npc: new Set() }, erased: [] };
  const first: PlannedWrite[] = [];
  const last: PlannedWrite[] = [];
  const sheets = liveSheetKinds(records);

  for (const sheetId of [...sheets.keys()].sort()) {
    const kind = sheets.get(sheetId);

    if (kind !== undefined) {
      planSheet(records, sheetId, kinds[kind], tally, first, last);
    }
  }

  return {
    count: tally.count,
    digest: erasedDigest(tally.erased),
    removed: { pc: [...tally.removed.pc].sort(), npc: [...tally.removed.npc].sort() },
    first,
    last,
  };
}

// AD-14: a record minted after an upload holds only the fields of its own row in the template of
// its sheet's kind, each with its field's type. A `row:` or `rep:` of a row the template does not
// have keeps no value. A tombstone and every other key form pass as they are.
export function stripToTemplate<Stripped extends Pick<VersionedRecord, 'k' | 'd'>>(
  record: Stripped,
  template: PresetTemplate,
): Stripped {
  if (record.d === null) {
    return record;
  }

  const [form, , id = ''] = record.k.split(':');

  if (form === 'row') {
    const values = fieldValuesSchema.safeParse(record.d);
    const fields = targetFields(template, { kind: 'row', rowId: id });

    return values.success ? { ...record, d: keptValues(values.data, fields ?? []) } : record;
  }

  if (form === 'rep') {
    const row = repDataSchema.safeParse(record.d);
    const fields = targetFields(template, { kind: 'rep', sectionId: id });

    return row.success
      ? { ...record, d: { ...row.data, cells: keptValues(row.data.cells, fields ?? []) } }
      : record;
  }

  return record;
}

// The values whose id is a field of `fields`, with a value of its type.
export function keptValues(values: FieldValues, fields: readonly PresetFieldCell[]): FieldValues {
  const kept: FieldValues = {};

  for (const [fieldId, value] of Object.entries(values)) {
    if (
      holdsValue(
        fields.find((field) => field.id === fieldId),
        value,
      )
    ) {
      kept[fieldId] = value;
    }
  }

  return kept;
}

// AD-14: where a value of the old template goes in the new one, by the rules of `presetDiff`: a
// non-repeat field to the new row that holds its id, and a repeat section to its new section.
// `null` when it has none.
export type PresetMoves = {
  rowOf: (fieldId: string) => string | null;
  sectionOf: (sectionId: string) => string | null;
};

export function presetMoves(before: PresetTemplate, after: PresetTemplate): PresetMoves {
  const plan = kindPlan('pc', before, after);

  return {
    rowOf: (fieldId) => plan.after.rowFields.get(fieldId)?.rowId ?? null,
    sectionOf: (sectionId) => plan.sectionTargets.get(sectionId) ?? null,
  };
}

function planSheet(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  plan: KindPlan,
  tally: Tally,
  first: PlannedWrite[],
  last: PlannedWrite[],
): void {
  const rowPrefix = `row:${sheetId}:`;
  const repPrefix = `rep:${sheetId}:`;

  const keys = [...records.keys()].filter(
    (key) => key.startsWith(rowPrefix) || key.startsWith(repPrefix),
  );

  keys.sort();

  // The values of each new non-repeat row, gathered by field id from the old rows.
  const newRows = new Map<string, FieldValues>([...plan.after.rows.keys()].map((id) => [id, {}]));

  for (const key of keys) {
    const record = records.get(key);

    if (record === undefined || record.d === null || !key.startsWith(rowPrefix)) {
      continue;
    }

    const values = fieldValuesSchema.safeParse(record.d);
    const oldFields = plan.before.rows.get(key.slice(rowPrefix.length)) ?? [];

    for (const [fieldId, value] of Object.entries(values.data ?? {})) {
      if (
        !holdsValue(
          oldFields.find((field) => field.id === fieldId),
          value,
        )
      ) {
        continue;
      }

      const target = plan.after.rowFields.get(fieldId);
      const row = target === undefined ? undefined : newRows.get(target.rowId);

      if (target !== undefined && row !== undefined && holdsValue(target.field, value)) {
        row[fieldId] = value;
      } else {
        countRemoved(tally, plan.kind, key, fieldId);
      }
    }
  }

  for (const [rowId, values] of newRows) {
    planRowWrite(records, `${rowPrefix}${rowId}`, values, first, last);
  }

  // A row the new preset no longer has goes, and so does a row record no template row names.
  for (const key of keys) {
    const record = records.get(key);
    const rowId = key.slice(rowPrefix.length);

    if (
      key.startsWith(rowPrefix) &&
      record !== undefined &&
      record.d !== null &&
      !newRows.has(rowId)
    ) {
      last.push({ k: key, d: null });
    }
  }

  planRepeatRows(records, keys, sheetId, plan, tally, first, last);
}

// A row that gains a value is written before `preset` with its old values too. A row that only
// loses values, or the stripped form of one written before, is written after.
function planRowWrite(
  records: ReadonlyMap<string, VersionedRecord>,
  key: string,
  values: FieldValues,
  first: PlannedWrite[],
  last: PlannedWrite[],
): void {
  const current = records.get(key);
  const held = current?.d === null ? undefined : fieldValuesSchema.safeParse(current?.d).data;

  if (held === undefined) {
    if (Object.keys(values).length > 0) {
      first.push({ k: key, d: values });
    }

    return;
  }

  const gains = Object.entries(values).some(([fieldId, value]) => held[fieldId] !== value);

  if (gains) {
    const both = { ...held, ...values };

    first.push({ k: key, d: both });

    if (!sameJson(both, values)) {
      last.push({ k: key, d: values });
    }
  } else if (!sameJson(held, values)) {
    last.push({ k: key, d: values });
  }
}

// A live repeat row with the new section it goes to.
type RepeatRow = {
  key: string;
  newKey: string;
  sectionId: string;
  target: string;
  order: number;
  held: FieldValues;
  newFields: PresetFieldCell[];
};

// A repeat row moves to the new section of its section, keeping its `instanceId` and the values
// that survive. When several old sections go to one new section, the first keeps its `order` and
// each next one goes after the highest `order` so far. A section with no new section, or a key a
// live row keeps or another moved row claimed, leaves the row tombstoned with every value it held
// counted. A key that already holds the cells the move would write is a retry of a batch that
// stopped part way: only the old key goes, uncounted. A section the old preset does not have
// shows nothing, so its row goes uncounted.
function planRepeatRows(
  records: ReadonlyMap<string, VersionedRecord>,
  keys: readonly string[],
  sheetId: string,
  plan: KindPlan,
  tally: Tally,
  first: PlannedWrite[],
  last: PlannedWrite[],
): void {
  const repPrefix = `rep:${sheetId}:`;
  const moving: RepeatRow[] = [];
  const gone = new Set<string>();

  for (const key of keys) {
    const record = records.get(key);

    if (!key.startsWith(repPrefix) || record === undefined || record.d === null) {
      continue;
    }

    const [, , sectionId = '', instanceId = ''] = key.split(':');
    const row = repDataSchema.safeParse(record.d);
    const oldFields = plan.before.sections.get(sectionId);

    if (!row.success || oldFields === undefined) {
      gone.add(key);
      continue;
    }

    const held = keptValues(row.data.cells, oldFields);
    const target = plan.sectionTargets.get(sectionId) ?? null;
    const newFields = target === null ? undefined : plan.after.sections.get(target);

    if (target === null || newFields === undefined) {
      countAll(tally, plan.kind, key, held);
      gone.add(key);
      continue;
    }

    const newKey = `rep:${sheetId}:${target}:${instanceId}`;

    moving.push({ key, newKey, sectionId, target, order: row.data.order, held, newFields });
  }

  const staying = new Set(moving.flatMap((row) => (row.newKey === row.key ? [row.key] : [])));
  const retried = new Set<string>();

  for (const row of moving) {
    if (row.newKey !== row.key && staying.has(row.newKey)) {
      const cells = repDataSchema.safeParse(records.get(row.newKey)?.d).data?.cells;

      if (cells !== undefined && sameJson(cells, keptValues(row.held, row.newFields))) {
        retried.add(row.newKey);
        gone.add(row.key);
      }
    }
  }

  const claimed = new Set<string>();
  const strips = new Map<string, RepData>();

  for (const row of shiftedOrders(moving, plan)) {
    if (gone.has(row.key) || retried.has(row.key)) {
      continue;
    }

    const cells = keptValues(row.held, row.newFields);
    const next: RepData = { order: row.order, cells };

    if (row.newKey === row.key) {
      const current = repDataSchema.safeParse(records.get(row.key)?.d).data;

      countLost(tally, plan.kind, row.key, row.held, cells);

      if (current === undefined || !sameJson(current, next)) {
        strips.set(row.key, next);
      }

      continue;
    }

    gone.add(row.key);

    if (staying.has(row.newKey) || claimed.has(row.newKey)) {
      countAll(tally, plan.kind, row.key, row.held);
      continue;
    }

    claimed.add(row.newKey);

    const existing = repDataSchema.safeParse(records.get(row.newKey)?.d).data;

    if (existing === undefined || !sameJson(existing.cells, cells)) {
      countLost(tally, plan.kind, row.key, row.held, cells);
      first.push({ k: row.newKey, d: next });
    }
  }

  for (const key of [...new Set([...gone, ...strips.keys()])].sort()) {
    const strip = strips.get(key);

    if (strip !== undefined) {
      last.push({ k: key, d: strip });
    } else if (!claimed.has(key)) {
      last.push({ k: key, d: null });
    }
  }
}

// The rows that go to one new section, by section: the old section of the same id first, then
// the others in old template order. The first section keeps its `order`. Each next one shifts so
// its lowest `order` comes after the highest so far.
function shiftedOrders(moving: readonly RepeatRow[], plan: KindPlan): RepeatRow[] {
  const sections = [...plan.before.sections.keys()];

  const rank = (row: RepeatRow): number =>
    row.sectionId === row.target ? -1 : sections.indexOf(row.sectionId);

  const sorted = [...moving].sort(
    (left, right) =>
      left.target.localeCompare(right.target) ||
      rank(left) - rank(right) ||
      left.key.localeCompare(right.key),
  );

  const shifted: RepeatRow[] = [];
  let index = 0;

  while (index < sorted.length) {
    const head = sorted[index];
    let end = index;

    while (end < sorted.length && sorted[end]?.target === head?.target) {
      end += 1;
    }

    shifted.push(...shiftedSections(sorted.slice(index, end)));
    index = end;
  }

  return shifted;
}

// One new section's rows, grouped by old section in order.
function shiftedSections(rows: readonly RepeatRow[]): RepeatRow[] {
  const shifted: RepeatRow[] = [];
  let highest = -Infinity;
  let index = 0;

  while (index < rows.length) {
    const group = rows.filter((row) => row.sectionId === rows[index]?.sectionId);
    const lowest = Math.min(...group.map((row) => row.order));
    const shift = highest >= lowest ? highest + 1 - lowest : 0;

    for (const row of group) {
      shifted.push({ ...row, order: row.order + shift });
      highest = Math.max(highest, row.order + shift);
    }

    index += group.length;
  }

  return shifted;
}

function kindPlan(kind: SheetKind, before: PresetTemplate, after: PresetTemplate): KindPlan {
  const oldScopes = templateScopes(before);
  const newScopes = templateScopes(after);
  const sectionTargets = new Map<string, string | null>();

  for (const [sectionId, fields] of oldScopes.sections) {
    sectionTargets.set(sectionId, sectionTarget(sectionId, fields, newScopes));
  }

  return { kind, before: oldScopes, after: newScopes, sectionTargets };
}

// The new section of an old one: of the new sections that keep at least one of its field ids with
// the same type, the one that holds the old sectionId, else the one that keeps the most, with ties
// going to the first in template order. `null` when none keeps any.
function sectionTarget(
  sectionId: string,
  fields: readonly PresetFieldCell[],
  after: TemplateScopes,
): string | null {
  let best: { id: string; kept: number } | null = null;

  for (const [candidate, newFields] of after.sections) {
    const kept = fields.filter((field) =>
      newFields.some((other) => other.id === field.id && other.type === field.type),
    ).length;

    if (kept === 0) {
      continue;
    }

    if (newFields.some((field) => field.id === sectionId)) {
      return candidate;
    }

    if (best === null || kept > best.kept) {
      best = { id: candidate, kept };
    }
  }

  return best?.id ?? null;
}

function templateScopes(template: PresetTemplate): TemplateScopes {
  const scopes: TemplateScopes = { rows: new Map(), rowFields: new Map(), sections: new Map() };

  for (const section of template.sections) {
    for (const row of section.rows) {
      const id = firstFieldId(row);

      if (id === null) {
        continue;
      }

      const fields = row.filter((cell) => cell.kind === 'field');

      if (section.repeat === true) {
        scopes.sections.set(id, fields);
        continue;
      }

      scopes.rows.set(id, fields);

      for (const field of fields) {
        scopes.rowFields.set(field.id, { rowId: id, field });
      }
    }
  }

  return scopes;
}

function liveSheetKinds(records: ReadonlyMap<string, VersionedRecord>): Map<string, SheetKind> {
  const kinds = new Map<string, SheetKind>();

  for (const [key, record] of records) {
    if (!key.startsWith('sheet:')) {
      continue;
    }

    const sheet = sheetDataSchema.safeParse(record.d);

    if (sheet.success) {
      kinds.set(key.slice('sheet:'.length), sheet.data.kind);
    }
  }

  return kinds;
}

// "" and no key hold no value. Any value of the field's type does, `false` and `0` included.
function holdsValue(field: PresetFieldCell | undefined, value: FieldValue): boolean {
  return field !== undefined && acceptedFieldValue(field, value).ok;
}

function countRemoved(tally: Tally, kind: SheetKind, key: string, fieldId: string): void {
  tally.count += 1;
  tally.removed[kind].add(fieldId);
  tally.erased.push(`${key}\u0000${fieldId}`);
}

function countAll(tally: Tally, kind: SheetKind, key: string, held: FieldValues): void {
  for (const fieldId of Object.keys(held)) {
    countRemoved(tally, kind, key, fieldId);
  }
}

function countLost(
  tally: Tally,
  kind: SheetKind,
  key: string,
  held: FieldValues,
  kept: FieldValues,
): void {
  for (const fieldId of Object.keys(held)) {
    if (!Object.hasOwn(kept, fieldId)) {
      countRemoved(tally, kind, key, fieldId);
    }
  }
}

// A 32-bit FNV-1a hash of the sorted erased (key, field id) pairs, as hex.
function erasedDigest(erased: readonly string[]): string {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode([...erased].sort().join('\u0001'))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
