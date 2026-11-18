import { describe, expect, test } from 'bun:test';
import { fixturePatch } from '../../tests/support/block-fixtures';
import { checkProposal, type ProposalContext } from './access';
import { assembleRecords } from './merge';
import type { VersionedRecord } from './records';

const PRESET_V4 = {
  v: 4,
  templates: [
    {
      id: 'journal',
      title: 'Журнал',
      players: 'edit',
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [{ kind: 'field', type: 'text', id: 'public_note' }],
                },
                {
                  visibility: 'gm',
                  cells: [{ kind: 'field', type: 'text', id: 'secret_note' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const ROOT: VersionedRecord = {
  k: 'blk:journal',
  d: {
    order: 0,
    cells: {
      public_note: ['До', 1, 'gm-a'],
      secret_note: ['Тайна', 1, 'gm-a'],
    },
  },
  c: 1,
  a: 'gm-a',
  l: [1, 'seed'],
};

describe('v4 inherited edit visibility', () => {
  test('admits a visible edit and denies an edit under a hidden row in the same sheet', () => {
    // #given
    const preset: ProposalContext['preset'] = JSON.parse(JSON.stringify(PRESET_V4));

    const context: ProposalContext = {
      preset,
      records: assembleRecords([ROOT]),
    };

    const sender = { playerId: 'p-1', author: 'p-conn' };

    // #when
    const verdicts = {
      visible: capture(() => checkProposal(context, sender, patch({ public_note: 'После' }))),
      hidden: capture(() => checkProposal(context, sender, patch({ secret_note: 'Украдено' }))),
    };

    // #then
    expect(verdicts).toEqual({
      visible: { result: { kind: 'commit' } },
      hidden: { result: { kind: 'denied' } },
    });
  });
});

function patch(values: Record<string, string>): VersionedRecord {
  return fixturePatch(ROOT, values, 2, 'p-conn');
}

function capture<Result>(operation: () => Result): { result: Result } | { threw: string } {
  try {
    return { result: operation() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}
