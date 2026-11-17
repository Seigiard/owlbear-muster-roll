import type { JsonObject, JsonValue } from '@/core/json';
import type { Cells, FieldValue, VersionedRecord } from '@/core/records';

export function fixtureCells(
  values: Readonly<Record<string, FieldValue | null>>,
  c = 1,
  a = 'seed',
): Cells {
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id, [value, c, a]]));
}

export function fixtureRecord(k: string, data: JsonValue, c = 1, a = 'seed'): VersionedRecord {
  if (!k.startsWith('blk:')) {
    // SAFETY: negative parser tests intentionally construct invalid records.
    return { k, d: data, c, a } as VersionedRecord;
  }

  if (data === null || !(data instanceof Object)) {
    // SAFETY: negative parser tests intentionally construct invalid records.
    return { k, d: data, c, a, l: [1, 'seed'] } as VersionedRecord;
  }

  // SAFETY: test factory inputs are JSON objects; deliberately invalid inputs remain invalid.
  const body = data as JsonObject;
  // SAFETY: callers provide plain scalar cells when constructing fixture records.
  const values = ('order' in body ? (body.cells ?? {}) : body) as Record<string, FieldValue | null>;

  const cells = Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, Array.isArray(value) ? value : [value, c, a]]),
  );

  const d = 'order' in body ? { ...body, cells } : { order: 0, cells };

  // SAFETY: the factory creates the v4 tuple shape, including intentionally invalid cell values in negative tests.
  return { k, d, c, a, l: [1, 'seed'] } as VersionedRecord;
}

export function fixturePatch(
  base: VersionedRecord,
  data: JsonValue,
  c = base.c,
  a = base.a,
): VersionedRecord {
  const record = fixtureRecord(base.k, data, c, a);

  if (!base.k.startsWith('blk:')) {
    // SAFETY: non-block fixtures preserve the deliberately supplied record variant.
    return record;
  }

  if (record.d === null) {
    // SAFETY: block tombstone fixtures preserve the supplied lifecycle variant.
    return { ...record, l: base.l } as VersionedRecord;
  }

  // SAFETY: fixturePatch is used only for block inputs; malformed data remains available to negative tests.
  const previous = base.d as { order: number; set?: string; cells: Cells } | null;
  // SAFETY: fixtureRecord constructed this block data.
  const next = record.d as { order: number; set?: string; cells: Cells };
  // SAFETY: fixturePatch accepts the same JSON object shape as fixtureRecord.
  const body = data as JsonObject;
  // SAFETY: fixturePatch accepts block data with either direct cells or a block body.
  const suppliedValues = ('order' in body ? (body.cells ?? {}) : body) as Record<string, JsonValue>;

  for (const [id, cell] of Object.entries(next.cells)) {
    const held = previous?.cells[id];

    if (held !== undefined && !Array.isArray(suppliedValues[id]) && held[0] === cell[0]) {
      next.cells[id] = held;
    }
  }

  const set = next.set ?? previous?.set;

  const d =
    set === undefined
      ? { ...previous, ...next, cells: next.cells }
      : { ...previous, ...next, set, cells: next.cells };

  return {
    ...record,
    l: base.l ?? [1, 'seed'],
    d,
  };
}

export function fixtureSnapshotCells(
  rows: Record<string, Record<string, FieldValue>>,
): Record<string, FieldValue> {
  return Object.assign({}, ...Object.values(rows));
}

export function fixtureSnapshotBlocks(
  repeats: Record<
    string,
    { instanceId: string; order: number; cells: Record<string, FieldValue> }[]
  >,
): { path: string[]; order: number; cells: Record<string, FieldValue> }[] {
  return Object.entries(repeats).flatMap(([scope, blocks]) =>
    blocks.map(({ instanceId, ...block }) => ({ path: [scope, instanceId], ...block })),
  );
}
