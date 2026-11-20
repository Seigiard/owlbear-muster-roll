import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';
import { parsePresetFile, PRESET_FILE_BYTE_LIMIT, type Preset } from '@/core/preset';
import { copy } from '@/copy';
import { presetFailureMessage } from '@/ui/preset-errors';
import {
  addTab,
  EMPTY_DOCUMENT,
  fromPreset,
  PRESET_UID,
  removeItem,
  toPreset,
  uidAt,
  WINDOW_UID,
  type BuilderDocument,
  type DocumentEdit,
} from './document';
import { builderProblems, downloadText, problemReason } from './problems';

const VALID: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Экипаж',
      repeat: { nameField: 'name' },
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] }] }],
    },
  ],
};

describe('builderProblems', () => {
  test('marks the inner field that reuses a sheet field id and refuses download', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'notes',
          title: 'Notes',
          tabs: [
            {
              sections: [
                {
                  repeat: { id: 'attack', nameField: 'attack' },
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'attack' },
                        { kind: 'field', type: 'number', id: 'bonus' },
                      ],
                    },
                  ],
                },
                { rows: [{ cells: [{ kind: 'field', type: 'number', id: 'bonus' }] }] },
              ],
            },
          ],
        },
      ],
    });

    // #when
    const problems = builderProblems(document);
    const problem = problems[0];
    const reason = problem === undefined ? '' : problemReason(problem.failure);
    const file = parsePresetFile(JSON.stringify(toPreset(document)));
    const message = file.isErr() ? presetFailureMessage(file.error) : '';
    // #then
    expect({
      uids: problems.map((item) => item.uid),
      download: downloadText(document),
      hasId: reason.includes('bonus'),
      hasInner: reason.includes('templates[0].tabs[0].sections[0].rows[0].cells[1]'),
      hasOuter: reason.includes('templates[0].tabs[0].sections[1].rows[0].cells[0]'),
      uploadReason: message.includes(reason) && reason !== '',
      russian: /[а-яё]/i.test(reason),
    }).toEqual({
      uids: [uidOf(document, [0, 0, 0, 0, 1])],
      download: null,
      hasId: true,
      hasInner: true,
      hasOuter: true,
      uploadReason: true,
      russian: true,
    });
  });
  test('the empty preset has one problem, at the preset, and no download', () => {
    // #when
    const problems = builderProblems(EMPTY_DOCUMENT);
    // #then
    expect(problems).toEqual([{ uid: PRESET_UID, failure: { code: 'no-templates' } }]);
    expect(downloadText(EMPTY_DOCUMENT)).toBeNull();
  });
  test('marks each invalid state at its item, in tree order', () => {
    // #given
    const document = fromPreset({
      window: { width: 200, height: 600 },
      templates: [
        {
          id: 'pc',

          title: 'Экипаж',
          repeat: { nameField: 'name' },
          tabs: [
            {
              sections: [
                {
                  columns: 1,
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'name' },
                        { kind: 'field', type: 'number', id: 'name' },
                      ],
                    },
                    { cells: [{ kind: 'dice', formula: '1d20+' }] },
                  ],
                },
                { repeat: { id: 'name', nameField: 'name' }, rows: [] },
              ],
            },
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
      { uid: at(0, 0, 0, 0), failure: { code: 'row-too-wide' } },
      { uid: at(0, 0, 0, 0, 1), failure: { code: 'duplicate-id', detail: 'name' } },
      { uid: at(0, 0, 0, 1, 0), failure: { code: 'bad-formula', detail: '1d20+' } },
      {
        uid: at(0, 0, 1),
        failure: { code: 'bad-name-field', detail: 'name', field: 'name' },
      },
    ]);
    expect(downloadText(document)).toBeNull();
  });
  test('puts a template problem before the problems of its items', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'pc',

          title: 'Экипаж',
          repeat: { nameField: 'nope' },
          tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'dice', formula: '(' }] }] }] }],
        },
      ],
    });

    // #when
    const problems = builderProblems(document);
    // #then
    expect(problems.map((problem) => problem.uid)).toEqual([
      uidAt(document, [0]) ?? '',
      uidAt(document, [0, 0, 0, 0, 0]) ?? '',
    ]);
  });
  test('a preset the checks pass but the upload refuses has its problem at the preset', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'pc',

          title: 'x'.repeat(PRESET_FILE_BYTE_LIMIT),
          tabs: [{ sections: [{ rows: [] }] }],
        },
      ],
    });

    // #when
    const problems = builderProblems(document);
    // #then
    expect(problems).toEqual([{ uid: PRESET_UID, failure: { code: 'too-large' } }]);
    expect(downloadText(document)).toBeNull();
  });
});

describe('builderProblems with tabs', () => {
  test('marks each untitled tab of a template with two tabs at the tab', () => {
    // #given
    const document = fromPreset(VALID);
    const added = edited(addTab(document, uidOf(document, [0])));
    // #when
    const problems = builderProblems(added.document);
    // #then
    expect(problems).toEqual([
      { uid: uidOf(document, [0, 0]), failure: { code: 'untitled-tab', detail: 'pc' } },
      { uid: added.changed, failure: { code: 'untitled-tab', detail: 'pc' } },
    ]);
  });
  test('marks a template with no tabs at the template, and gives no download', () => {
    // #given
    const document = fromPreset(VALID);
    const removed = edited(removeItem(document, uidOf(document, [0, 0])));
    // #when
    const problems = builderProblems(removed.document);
    // #then
    expect(problems).toContainEqual({
      uid: uidOf(document, [0]),
      failure: { code: 'invalid-structure' },
    });
    expect(downloadText(removed.document)).toBeNull();
  });
});

function uidOf(document: BuilderDocument, path: number[]): string {
  const found = uidAt(document, path);

  if (found === null) {
    throw new Error(`No item at ${path.join('.')}`);
  }

  return found;
}

function edited(edit: DocumentEdit | null): DocumentEdit {
  if (edit === null) {
    throw new Error('The edit changed nothing');
  }

  return edit;
}

describe('downloadText', () => {
  test('is the file the upload accepts', () => {
    // #when
    const text = downloadText(fromPreset(VALID));
    // #then
    expect(text).not.toBeNull();
    expect(parsePresetFile(text ?? '')).toEqual(Result.ok(VALID));
  });
});

describe('problemReason', () => {
  test("is the reason of the upload's refusal message", () => {
    // #when
    const reason = problemReason({ code: 'bad-formula', detail: '1d20+dx' });
    // #then
    expect(reason).toBe('ошибка в формуле «1d20+dx»');
  });
  test('a preset with no templates says what to add', () => {
    // #when
    const reason = problemReason(
      builderProblems(EMPTY_DOCUMENT)[0]?.failure ?? { code: 'too-large' },
    );

    // #then
    expect(reason).toBe(copy.builder.emptyPreset);
  });
});
