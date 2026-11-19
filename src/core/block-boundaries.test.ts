import { Result } from 'better-result';
import { fixturePatch } from '../../tests/support/block-fixtures';
import { expect, test } from 'bun:test';
import fc from 'fast-check';
import { checkProposal } from '@/core/access';
import { recordDigest } from '@/core/digest';
import { assembleRecords, mergeRecords } from '@/core/merge';
import { fitsOneMessage, fragmentRecord, recordFitsOneMessage } from '@/core/message-size';
import { encodePreset, type Preset } from '@/core/preset';
import { blockDataSchema, cellValues, type VersionedRecord } from '@/core/records';
import { readBackHolds } from '@/core/snapshot';
import { encodeSnapshotFile } from '@/core/snapshot-file';
import { importSnapshot, parseSnapshotFile } from '@/core/snapshot-import';
import { decodeStateRecords, stateAnswer } from '@/core/state-records';

const preset: Preset = {
  v: 4,
  templates: [
    {
      id: 'journal',

      title: 'Journal',
      players: 'edit',

      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', id: 'a', type: 'text' },
                    { kind: 'field', id: 'b', type: 'text' },
                    { kind: 'token', id: 'token' },
                  ],
                },
              ],
            },
          ],
        },
        {
          visibility: 'gm',
          sections: [{ rows: [{ cells: [{ kind: 'field', id: 'secret', type: 'text' }] }] }],
        },
      ],
    },
  ],
};

const root: VersionedRecord = {
  k: 'blk:journal',
  c: 5,
  a: 'gm',
  l: [1, 'seed'],
  d: { order: 0, cells: { a: ['first', 2, 'gm'], b: ['second', 5, 'gm'] } },
};

const generation = { n: 0, a: '' };

test('different cell coverage changes the digest and fails room-copy read-back', () => {
  // #given
  const incomplete: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: ['first', 2, 'gm'] } },
    root.c,
    root.a,
  );

  // #when
  const result = {
    equalDigest: recordDigest([root]) === recordDigest([incomplete]),
    holds: readBackHolds(
      { g: generation, records: [root] },
      { g: generation, records: [incomplete] },
    ),
  };

  // #then
  expect(result).toEqual({ equalDigest: false, holds: false });
});

test('a player patch is judged by the changed cell, not a newer unrelated outer version', () => {
  // #given
  const records = new Map([[root.k, root]]);

  const proposed: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: ['edited', 3, 'player'] } },
    3,
    'player',
  );

  // #when
  const verdict = checkProposal(
    { records, preset },
    { playerId: 'player-id', author: 'player' },
    proposed,
  );

  // #then
  expect(verdict).toEqual({ kind: 'commit' });
});

test('a player cannot write a hidden field in the root shared with visible fields', () => {
  // #given
  const proposed: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { secret: ['leak', 6, 'player'] } },
    6,
    'player',
  );

  // #when
  const verdict = checkProposal(
    { records: new Map([[root.k, root]]), preset },
    { playerId: 'player-id', author: 'player' },
    proposed,
  );

  // #then
  expect(verdict).toEqual({ kind: 'denied' });
});

test('manual snapshots use root cells and restore values and live links without rights or replica versions', () => {
  // #given
  const records = new Map<string, VersionedRecord>([
    [
      root.k,
      fixturePatch(
        root,
        { order: 0, cells: { a: ['first', 2, 'gm'], b: [null, 5, 'gm'] } },
        root.c,
        root.a,
      ),
    ],
    ['link:token', { k: 'link:token', d: { s: 'journal', c: 'token' }, c: 1, a: 'gm' }],
    ['acl:journal:player', { k: 'acl:journal:player', d: { name: 'Player' }, c: 1, a: 'gm' }],
  ]);

  // #when
  const file = encodeSnapshotFile(records, preset);
  const imported = importSnapshot(file, { preset, data: encodePreset(preset) }, 'importer');

  if (!imported.isOk()) throw new Error(imported.error);
  // #then
  expect({
    file,
    root: blockDataSchema.parse(imported.value.records.find((record) => record.k === root.k)?.d),
    keys: imported.value.records.map((record) => record.k),
  }).toEqual({
    file: {
      v: 4,
      type: 'muster-roll/snapshot',
      sheets: [{ id: 'journal', cells: { a: 'first' }, blocks: [] }],
      links: [{ tokenId: 'token', sheetId: 'journal', cellId: 'token' }],
    },
    root: { order: 0, cells: { a: ['first', 1, 'importer'] } },
    keys: ['blk:journal', 'link:token', 'preset'],
  });
});

test('an old manual snapshot is refused as older-version before its structure is read', () => {
  // #given
  const text = '{"v":3,"type":"muster-roll/snapshot","sheets":[],"links":[]}';
  // #when
  const parsed = parseSnapshotFile(text);
  // #then
  expect(parsed).toEqual(Result.err('older-version'));
});

test('large blocks split at cell boundaries and full-state assembly preserves both literals', () => {
  // #given
  const first = 'a'.repeat(10000);
  const second = 'b'.repeat(10000);

  const large: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: [first, 5, 'gm'], b: [second, 5, 'gm'] } },
    root.c,
    root.a,
  );

  // #when
  const fragments = fragmentRecord(large);

  if (!fragments.isOk()) throw new Error(fragments.error);
  const answer = stateAnswer(generation, 'request', [large]);

  const decoded = answer.messages.flatMap((message) => {
    const result = decodeStateRecords(message.records);

    if (!result.isOk()) throw new Error(result.error);

    return result.value;
  });

  // #then
  expect({
    fragments: fragments.value.length,
    bounded: answer.messages.every(fitsOneMessage),
    skipped: answer.skipped,
    state: cellValues(blockDataSchema.parse(assembleRecords(decoded).get(root.k)?.d).cells),
  }).toEqual({ fragments: 2, bounded: true, skipped: [], state: { a: first, b: second } });
});

test('an individually oversized cell is rejected even when it compresses well', () => {
  // #given
  const oversized: VersionedRecord = fixturePatch(
    root,
    { order: 0, cells: { a: ['a'.repeat(15000), 5, 'gm'] } },
    root.c,
    root.a,
  );

  // #when
  const fits = recordFitsOneMessage(oversized);
  // #then
  expect(fits).toBe(false);
});

test('block merge obeys commutativity, associativity and idempotence across cells, lifecycles and deletions', () => {
  // #given
  const cell = fc.tuple(
    fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant('text')),
    fc.integer({ min: 1, max: 10 }),
    fc.constantFrom('a', 'b'),
  );

  const cells = fc.dictionary(fc.constantFrom('hp', 'name', 'tired'), cell);

  const record = fc
    .tuple(
      cells,
      fc.boolean(),
      fc.integer({ min: 1, max: 3 }),
      fc.integer({ min: 1, max: 10 }),
      fc.constantFrom('a', 'b'),
    )
    .map(([values, deleted, life, c, a]): VersionedRecord => ({
      k: 'blk:hero',
      c,
      a,
      l: [life, 'creator'],
      d: deleted ? null : { order: 0, cells: values },
    }));

  // #when
  const property = fc.property(record, record, record, (a, b, c) => {
    expect(mergeRecords(a, b)).toEqual(mergeRecords(b, a));
    expect(mergeRecords(mergeRecords(a, b), c)).toEqual(mergeRecords(a, mergeRecords(b, c)));
    expect(mergeRecords(a, a)).toBe(a);
  });

  // #then
  fc.assert(property, { numRuns: 300 });
});
