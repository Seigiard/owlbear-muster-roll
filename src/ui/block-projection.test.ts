import { fixturePatch } from '../../tests/support/block-fixtures';
import { expect, test } from 'bun:test';
import { fragmentRecord } from '@/core/message-size';
import { blockDataSchema, cellValues, type VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import { createProjectionStore } from '@/ui/projection-store';

const sync: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'PLAYER',
};

const root: VersionedRecord = {
  k: 'blk:journal',
  c: 1,
  a: 'gm',
  l: [1, 'gm'],
  d: { order: 0, cells: { a: ['base', 1, 'gm'] } },
};

test('projection assembles all cells of a fragmented root', () => {
  // #given
  const first = 'a'.repeat(10000);
  const second = 'b'.repeat(10000);

  const large: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: [first, 1, 'gm'], b: [second, 1, 'gm'] } },
    root.c,
    root.a,
  );

  const fragments = fragmentRecord(large);

  if (!fragments.ok) throw new Error(fragments.error);
  const projection = createProjectionStore();
  // #when
  projection.replaceAll([...fragments.value].reverse(), [], [], sync);
  // #then
  expect(cellValues(blockDataSchema.parse(projection.$records.get().get(root.k)?.d).cells)).toEqual(
    { a: first, b: second },
  );
});

test('a newer pending revision replaces the old provisional value while marking only its field', () => {
  // #given
  const projection = createProjectionStore();

  const older: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: ['z', 2, 'player'] } },
    2,
    'player',
  );

  const newer: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: ['a', 3, 'player'] } },
    3,
    'player',
  );

  projection.replaceAll([root], [older], [], sync);
  // #when
  projection.applyDelta([], [newer], [], [], sync);
  // #then
  expect({
    shown: cellValues(blockDataSchema.parse(projection.$records.get().get(root.k)?.d).cells),
    fields: [...(projection.$pending.get().get(root.k)?.fields ?? [])],
  }).toEqual({ shown: { a: 'a' }, fields: [['a', 'a']] });
});

test('a pending edit back to the applied value still names only the touched field', () => {
  // #given
  const projection = createProjectionStore();

  const returned: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: ['base', 2, 'player'] } },
    2,
    'player',
  );

  // #when
  projection.replaceAll([root], [returned], [], sync);
  // #then
  expect([...(projection.$pending.get().get(root.k)?.fields ?? [])]).toEqual([['a', 'base']]);
});
