import { expect, test } from 'bun:test';

import { rollDiceCell } from '@/core/dice-roll';
import { randomFaces } from '@/core/formula-evaluate';
import { assembleRecords } from '@/core/merge';
import { encodePreset, parsePresetStructure, presetProblems, type Preset } from '@/core/preset';
import { cellValues, blockDataSchema, type VersionedRecord } from '@/core/records';
import { encodeSnapshotFile } from '@/core/snapshot-file';
import { importSnapshot } from '@/core/snapshot-import';

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'journal',
      title: 'Журнал',
      tabs: [
        {
          sections: [
            {
              title: 'Состояния',
              rows: [
                {
                  repeat: { id: 'conditions', nameField: 'name' },
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'field', type: 'number', id: 'severity' },
                    { kind: 'dice', formula: '1d20 + severity', name: 'Проверка' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('gives each repeat row its own field scope while repeat ids remain unique in the sheet scope', () => {
  // #given
  const valid = {
    v: 4,
    templates: [
      {
        id: 'journal',
        title: 'Журнал',
        tabs: [
          {
            title: 'Первое',
            sections: [
              {
                rows: [
                  {
                    repeat: { id: 'conditions', nameField: 'name' },
                    cells: [{ kind: 'field', type: 'text', id: 'name' }],
                  },
                  {
                    repeat: { id: 'contacts', nameField: 'name' },
                    cells: [{ kind: 'field', type: 'text', id: 'name' }],
                  },
                ],
              },
            ],
          },
          {
            title: 'Второе',
            sections: [
              {
                repeat: { id: 'conditions', nameField: 'title' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'title' }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  // #when
  const structure = parsePresetStructure(valid);

  if (structure === null) {
    throw new Error('fixture is not a v4 preset structure');
  }

  const problems = presetProblems(structure);

  // #then
  expect(problems).toEqual([
    {
      failure: { code: 'duplicate-section', detail: 'conditions' },
      path: [0, 1, 0],
    },
  ]);
});

test('round-trips a repeat-row block through the public snapshot import boundary', () => {
  // #given
  const records = new Map<string, VersionedRecord>([
    [
      'blk:journal',
      {
        k: 'blk:journal',
        d: { order: 0, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
    [
      'blk:journal:conditions:c1',
      {
        k: 'blk:journal:conditions:c1',
        d: {
          order: 0,
          cells: { name: ['Отравлен', 1, 'seed'], severity: [2, 1, 'seed'] },
        },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);

  const snapshot = encodeSnapshotFile(records, PRESET);

  // #when
  const imported = importSnapshot(
    snapshot,
    { preset: PRESET, data: encodePreset(PRESET) },
    'import',
  );

  if (!imported.ok) {
    throw new Error(imported.error);
  }

  const assembled = assembleRecords(imported.value.records);
  const parsedBlock = blockDataSchema.safeParse(assembled.get('blk:journal:conditions:c1')?.d);

  // #then
  expect({
    snapshot: snapshot.sheets[0]?.blocks,
    values: parsedBlock.success ? cellValues(parsedBlock.data.cells) : null,
    erased: imported.value.count,
  }).toEqual({
    snapshot: [
      {
        path: ['conditions', 'c1'],
        order: 0,
        cells: { name: 'Отравлен', severity: 2 },
      },
    ],
    values: { name: 'Отравлен', severity: 2 },
    erased: 0,
  });
});

test('rolls a repeat-row dice cell from the scoped descendant block', () => {
  // #given
  const records = new Map<string, VersionedRecord>([
    [
      'blk:journal:conditions:c1',
      {
        k: 'blk:journal:conditions:c1',
        d: {
          order: 0,
          cells: { name: ['Отравлен', 1, 'seed'], severity: [2, 1, 'seed'] },
        },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);

  const template = PRESET.templates[0];

  if (template === undefined) {
    throw new Error('the fixture has no template');
  }

  // #when
  const rolled = rollDiceCell(
    template,
    records,
    'journal',
    { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: 'c1' },
    new Map(),
    randomFaces(() => 0.3),
  );

  // #then
  expect(rolled).toEqual({
    ok: true,
    value: {
      cell: 'Проверка',
      result: { roll: 9, faces: [7], target: null, targetFaces: [], outcome: null },
    },
  });
});
