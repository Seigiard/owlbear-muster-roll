import { describe, expect, test } from 'bun:test';

import { parsePresetFile, type Preset } from '@/core/preset';

import { EMPTY_DOCUMENT, fromPreset, PRESET_UID, uidAt, WINDOW_UID } from './document';
import { builderProblems, downloadText, problemReason } from './problems';

const VALID: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Экипаж',
      nameField: 'name',
      sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }],
    },
  ],
};

describe('builderProblems', () => {
  test('the empty preset has one problem, at the preset, and no download', () => {
    // #when
    const problems = builderProblems(EMPTY_DOCUMENT);

    // #then
    expect(problems).toEqual([{ uid: PRESET_UID, failure: { code: 'invalid-structure' } }]);
    expect(downloadText(EMPTY_DOCUMENT)).toBeNull();
  });

  test('marks each invalid state at its item, in tree order', () => {
    // #given
    const document = fromPreset({
      window: { width: 200, height: 600 },
      templates: [
        {
          id: 'pc',
          kind: 'set',
          title: 'Экипаж',
          nameField: 'name',
          sections: [
            {
              columns: 1,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'name' },
                  { kind: 'field', type: 'number', id: 'name' },
                ],
                [{ kind: 'dice', formula: '1d20+' }],
              ],
            },
            { repeat: true, rows: [] },
          ],
        },
      ],
    });

    // #when
    const problems = builderProblems(document);

    // #then
    const at = (...path: number[]): string => uidAt(document, path) ?? '';

    expect(problems).toEqual([
      { uid: WINDOW_UID, failure: { code: 'bad-window' } },
      { uid: at(0, 0, 0), failure: { code: 'row-too-wide' } },
      { uid: at(0, 0, 0, 1), failure: { code: 'duplicate-id', detail: 'name' } },
      { uid: at(0, 0, 1, 0), failure: { code: 'bad-formula', detail: '1d20+' } },
      { uid: at(0, 1), failure: { code: 'bad-repeat' } },
    ]);
    expect(downloadText(document)).toBeNull();
  });

  test('puts a template problem before the problems of its items', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'pc',
          kind: 'set',
          title: 'Экипаж',
          nameField: 'nope',
          sections: [{ rows: [[{ kind: 'dice', formula: '(' }]] }],
        },
      ],
    });

    // #when
    const problems = builderProblems(document);

    // #then
    expect(problems.map((problem) => problem.uid)).toEqual([
      uidAt(document, [0]) ?? '',
      uidAt(document, [0, 0, 0, 0]) ?? '',
    ]);
  });
});

describe('downloadText', () => {
  test('is the file the upload accepts', () => {
    // #when
    const text = downloadText(fromPreset(VALID));

    // #then
    expect(text).not.toBeNull();
    expect(parsePresetFile(text ?? '')).toEqual({ ok: true, value: VALID });
  });
});

describe('problemReason', () => {
  test("is the reason of the upload's refusal message", () => {
    // #when
    const reason = problemReason({ code: 'bad-formula', detail: '1d20+dx' });

    // #then
    expect(reason).toBe('ошибка в формуле «1d20+dx»');
  });
});
