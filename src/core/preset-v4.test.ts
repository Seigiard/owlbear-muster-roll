import { describe, expect, test } from 'bun:test';
import { parsePresetFile, parsePresetStructure, presetProblems } from './preset';

const VALID_V4 = {
  v: 4,
  templates: [
    {
      id: 'crew',
      title: 'Экипаж',
      repeat: { nameField: 'name' },
      players: 'edit',
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              title: 'Персонаж',
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'level' },
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'portrait' },
                  ],
                },
              ],
            },
            {
              title: 'Атаки',
              repeat: { id: 'attacks', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'bonus' },
                    { kind: 'field', type: 'text', id: 'attack' },
                    { kind: 'dice', formula: '1d20 + bonus' },
                    { kind: 'token', id: 'attack_token' },
                  ],
                },
              ],
            },
            {
              title: 'Состояния',
              rows: [
                {
                  repeat: { id: 'conditions', nameField: 'condition' },
                  cells: [
                    { kind: 'field', type: 'number', id: 'severity' },
                    { kind: 'field', type: 'text', id: 'condition' },
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

describe('preset format v4', () => {
  test('accepts the strict tree with explicit repeat identity, name fields and token cells', () => {
    // #given
    const text = JSON.stringify(VALID_V4);
    // #when
    const parsed = parsePresetFile(text);
    const actual: unknown = parsed;

    // #then
    expect(actual).toEqual({ ok: true, value: VALID_V4 });
  });

  test('refuses the complete older v3 shape as unsupported', () => {
    // #given
    const older = {
      v: 3,
      templates: [
        {
          id: 'crew',
          kind: 'set',
          title: 'Экипаж',
          nameField: 'name',
          tabs: [
            {
              sections: [
                {
                  rows: [[{ kind: 'field', type: 'text', id: 'name' }]],
                },
                {
                  repeat: true,
                  tokens: true,
                  rows: [[{ kind: 'field', type: 'text', id: 'attack' }]],
                },
              ],
            },
          ],
        },
      ],
    };

    // #when
    const parsed = parsePresetFile(JSON.stringify(older));

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });

  test('locates a duplicate field id at its second cell', () => {
    // #given
    const candidate = JSON.parse(JSON.stringify(VALID_V4));

    candidate.templates[0].tabs[0].sections[0].rows[0].cells.push({
      kind: 'field',
      type: 'text',
      id: 'level',
    });

    // #when
    const structure = parsePresetStructure(candidate);
    const problems = structure === null ? null : presetProblems(structure);

    // #then
    expect(problems).toEqual([
      { failure: { code: 'duplicate-id', detail: 'level' }, path: [0, 0, 0, 0, 3] },
    ]);
  });
});
