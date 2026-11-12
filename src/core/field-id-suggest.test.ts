import { describe, expect, test } from 'bun:test';

import { isFieldId, isTemplateId } from '@/core/field-id';

import { suggestFieldId, suggestTemplateId } from './field-id-suggest';

const NONE: ReadonlySet<string> = new Set();

describe('suggestFieldId', () => {
  test.each<[string, string]>([
    ['Сила', 'sila'],
    ['Ловкость', 'lovkost'],
    ['Щит и меч', 'shchit_i_mech'],
    ['Бойцовый ёж', 'boytsovyy_ezh'],
    ['Бонус атаки', 'bonus_ataki'],
    ['HP max', 'hp_max'],
    ['Élan', 'elan'],
    ['  Сила!  ', 'sila'],
  ])('transliterates %p to %p', (label, expected) => {
    // #when
    const id = suggestFieldId(label, NONE);

    // #then
    expect(id).toBe(expected);
  });

  test('is "field" for a label with no letter or digit', () => {
    // #when
    const id = suggestFieldId('—', NONE);

    // #then
    expect(id).toBe('field');
  });

  test('takes a numeric suffix for an id its scope already holds', () => {
    // #given
    const taken = new Set(['sila', 'sila_2', 'field']);

    // #when
    const ids = [suggestFieldId('Сила', taken), suggestFieldId('', taken)];

    // #then
    expect(ids).toEqual(['sila_3', 'field_2']);
  });

  test.each<[string, string]>([
    ['d20', 'd20_2'],
    ['floor', 'floor_2'],
    ['constructor', 'constructor_2'],
    ['2 руки', '_2_ruki'],
  ])('makes %p follow the id rules as %p', (label, expected) => {
    // #when
    const id = suggestFieldId(label, NONE);

    // #then
    expect(id).toBe(expected);
    expect(isFieldId(id)).toBe(true);
  });

  test('keeps a long label to a short id', () => {
    // #when
    const id = suggestFieldId('Очень длинная подпись поля, которую никто не прочтёт', NONE);

    // #then
    expect(id.length).toBeLessThanOrEqual(32);
    expect(isFieldId(id)).toBe(true);
  });
});

describe('suggestTemplateId', () => {
  test('transliterates the title and is unique among the template ids', () => {
    // #when
    const ids = [
      suggestTemplateId('Экипаж', NONE),
      suggestTemplateId('Экипаж', new Set(['ekipazh'])),
    ];

    // #then
    expect(ids).toEqual(['ekipazh', 'ekipazh_2']);
    expect(ids.every(isTemplateId)).toBe(true);
  });

  test('is "sheet" for an empty title', () => {
    // #when
    const id = suggestTemplateId('', NONE);

    // #then
    expect(id).toBe('sheet');
  });
});
