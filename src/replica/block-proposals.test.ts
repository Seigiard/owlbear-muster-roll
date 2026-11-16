import { expect, test } from 'bun:test';
import { mergeRecords } from '@/core/merge';
import { blockDataSchema, cellValues, type VersionedRecord } from '@/core/records';
import { proposedRecord, type ProposalPatch } from '@/replica/proposal-queue';

const key = 'blk:hero:item:new';
const lifecycle: [number, string] = [1, 'player'];

function made(patch: ProposalPatch, counter: number): VersionedRecord {
  const result = proposedRecord(
    key,
    patch,
    undefined,
    () => ({ c: counter, a: 'player' }),
    true,
    lifecycle,
  );

  if (!result.ok) throw new Error(result.error);

  return result.value;
}

test('a resent creation with new cells keeps its lifecycle independent of its proposal counter', () => {
  // #given
  const first = made({ kind: 'add', d: { order: 0, cells: {} } }, 1);
  const second = made({ kind: 'add', d: { order: 0, cells: { item: ['Sword', 2, 'player'] } } }, 2);
  // #when
  const merged = mergeRecords(first, second);
  // #then
  expect({
    lifecycle: merged.l,
    proposalCounter: merged.c,
    values: cellValues(blockDataSchema.parse(merged.d).cells),
  }).toEqual({
    lifecycle: [1, 'player'],
    proposalCounter: 2,
    values: { item: 'Sword' },
  });
});

test('deleting a pending creation defeats its delayed creation proposal', () => {
  // #given
  const creation = made({ kind: 'add', d: { order: 0, cells: {} } }, 1);
  const removal = made({ kind: 'remove' }, 2);
  // #when
  const merged = mergeRecords(removal, creation);
  // #then
  expect({ lifecycle: merged.l, data: merged.d }).toEqual({ lifecycle: [1, 'player'], data: null });
});
