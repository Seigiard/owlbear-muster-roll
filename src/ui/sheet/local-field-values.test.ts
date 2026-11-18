import { describe, expect, test } from 'bun:test';
import type { ShownValue } from '@/core/dice-roll';
import type { FieldPatchTarget } from '@/core/field-patch';
import { createLocalFieldValues, shownForRoll, type LocalFieldValue } from './local-field-values';

const STR_ROW: FieldPatchTarget = { kind: 'row', rowId: 'str' };
const ATTACK_ONE: FieldPatchTarget = { kind: 'rep', sectionId: 'attack', instanceId: 'i1' };
const ATTACK_TWO: FieldPatchTarget = { kind: 'rep', sectionId: 'attack', instanceId: 'i2' };

function local(target: FieldPatchTarget, fieldId: string, text: string): LocalFieldValue {
  return { sheetId: 'brok', target, fieldId, shown: { kind: 'text', text } };
}

describe('shownForRoll', () => {
  test('a plain row reaches every plain-row field and no repeat row', () => {
    // #given
    const values = [local(STR_ROW, 'str', '16'), local(ATTACK_ONE, 'bonus', '5')];
    // #when
    const shown = shownForRoll(values, STR_ROW, new Set(['str']));
    // #then
    expect([...shown]).toEqual([['str', { kind: 'text', text: '16' }]]);
  });
  test('a repeat row reaches its own instance and the plain rows, not another instance', () => {
    // #given
    const values = [
      local(ATTACK_TWO, 'bonus', '9'),
      local(ATTACK_ONE, 'bonus', '5'),
      local(STR_ROW, 'str', '16'),
    ];

    // #when
    const shown = shownForRoll(values, ATTACK_ONE, new Set(['attack', 'bonus']));
    // #then
    expect(new Map(shown)).toEqual(
      new Map<string, ShownValue>([
        ['bonus', { kind: 'text', text: '5' }],
        ['str', { kind: 'text', text: '16' }],
      ]),
    );
  });
  test('a field of the rolled row hides a plain-row field of the same id', () => {
    // #given: only the plain-row `bonus` holds a local value.
    const values = [local({ kind: 'row', rowId: 'bonus' }, 'bonus', '9')];
    // #when
    const shown = shownForRoll(values, ATTACK_ONE, new Set(['attack', 'bonus']));
    // #then
    expect(shown.size).toBe(0);
  });
  test('a row with no field reaches the plain rows', () => {
    // #given
    const values = [local(STR_ROW, 'str', '16'), local(ATTACK_ONE, 'bonus', '5')];
    // #when
    const shown = shownForRoll(values, null, new Set());
    // #then
    expect([...shown]).toEqual([['str', { kind: 'text', text: '16' }]]);
  });
});

describe('createLocalFieldValues', () => {
  test('reads the registered fields of one sheet that hold a local value, until unregistered', () => {
    // #given
    const values = createLocalFieldValues();
    const brok = local(STR_ROW, 'str', '16');
    values.register(() => brok);
    values.register(() => null);
    values.register(() => ({ ...brok, sheetId: 'liza' }));
    const unregister = values.register(() => local(STR_ROW, 'str_tired', 'x'));
    // #when
    unregister();
    // #then
    expect(values.read('brok')).toEqual([brok]);
  });
  test('counts the local changes of each sheet apart', () => {
    // #given
    const values = createLocalFieldValues();
    // #when
    values.changed('brok');
    values.changed('brok');
    values.changed('liza');
    // #then
    expect([...values.$changes.get()]).toEqual([
      ['brok', 2],
      ['liza', 1],
    ]);
  });
});
