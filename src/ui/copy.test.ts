import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { copy } from './copy';

const EXPERIENCE_PATH = join(
  import.meta.dir,
  '../../_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md',
);

const SAMPLES: ReadonlyMap<string, string> = new Map([
  ['count', '7'],
  ['sheets', '3'],
  ['title', 'Персонажи'],
  ['name', 'Скелет 1'],
  ['field', 'Сила'],
  ['reason', 'нет поля'],
  ['roller', 'Лиза'],
  ['sheet', 'Брок'],
  ['cell', 'Атака'],
  ['result', '15'],
]);

const CATALOG_BY_JOB: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  [
    'Command',
    [
      copy.command.loadPreset,
      copy.command.downloadPreset,
      copy.command.loadSnapshot,
      copy.command.downloadSnapshot,
      copy.command.wipe,
      copy.command.add,
      copy.command.duplicate,
      copy.command.delete,
      copy.command.linkSheet,
      copy.command.unlinkSheet,
      copy.command.openSheet,
      copy.command.cancel,
    ],
  ],
  ['Add a sheet of a sheet set', [copy.addSign, copy.label.addToSet('Персонажи')]],
  ['Place', [copy.place.settings, copy.place.access]],
  [
    'Status',
    [
      copy.status.pending,
      copy.status.readOnly,
      copy.status.canEdit,
      copy.status.tokenLinked,
      copy.status.noToken,
    ],
  ],
  ['Empty sheet name', [copy.unnamed]],
  ['Loading', [copy.loading]],
  ['No GM', [copy.noGm]],
  ['Room copy not saved', [copy.roomCopyNotSaved]],
  ['Local save failed', [copy.localSaveFailed]],
  ['Room copy unreadable', [copy.roomCopyUnreadable]],
  ['Room copy of an older format, GM', [copy.roomCopyOlderFormat]],
  ['New version', [copy.newVersion]],
  [
    'Preset upload loses data',
    [
      copy.presetUploadErasesValues(7),
      copy.presetUploadDeletesSheets(3),
      copy.presetUploadQuestion,
    ],
  ],
  ['Preset upload removes nothing', [copy.presetUploadRemovesNothing]],
  ['Snapshot import', [copy.snapshotImport]],
  [
    'Snapshot import drops data',
    [copy.snapshotImportDropsValues(7), copy.snapshotImportDropsSheets(3)],
  ],
  ['Wipe', [copy.wipeConfirmation]],
  ['Delete', [copy.deleteConfirmation('Скелет 1')]],
  ['Bad formula', [copy.badFormula('Сила')]],
  ['Bad formula result', [copy.badFormulaResult]],
  ['Bad number', [copy.badNumber]],
  ['Bad duplicate count', [copy.badDuplicateCount]],
  ['Value too long', [copy.valueTooLong]],
  ['Bad file', [copy.badFile('нет поля')]],
  ['Newer file', [copy.newerFile]],
  ['No preset for a snapshot', [copy.presetRequired]],
  ['Roll', [copy.roll('Лиза', 'Брок', 'Атака', '15'), copy.rollSuccess, copy.rollFailure]],
  ['Edit denied', [copy.editDenied]],
  ['Data replaced', [copy.dataReplaced]],
  ['Guest note', [copy.guestNote]],
]);

const documented = readVoiceAndToneTable();

describe('copy catalog', () => {
  test('covers exactly the jobs of the Voice and Tone table', () => {
    // #when
    const jobs = [...CATALOG_BY_JOB.keys()];

    // #then
    expect(jobs).toEqual([...documented.keys()]);
  });

  for (const [job, expected] of documented) {
    test(`holds the exact text of the "${job}" row`, () => {
      // #when
      const actual = CATALOG_BY_JOB.get(job);

      // #then
      expect(actual).toEqual(expected);
    });
  }
});

function readVoiceAndToneTable(): ReadonlyMap<string, readonly string[]> {
  const experience = readFileSync(EXPERIENCE_PATH, 'utf8');
  const section = experience.split('## Voice and Tone')[1]?.split('\n## ')[0];

  if (section === undefined) {
    throw new Error('EXPERIENCE.md has no Voice and Tone section');
  }

  const table = new Map<string, readonly string[]>();

  // The first two table lines are the header and the separator.
  for (const line of section.split('\n').filter(isTableRow).slice(2)) {
    const [, job = '', cell = ''] = line.split('|').map((part) => part.trim());

    table.set(job, quotedTexts(cell));
  }

  return table;
}

function isTableRow(line: string): boolean {
  return line.startsWith('|');
}

function quotedTexts(cell: string): string[] {
  return [...cell.matchAll(/"([^"]*)"/g)].map((match) => fillPlaceholders(match[1] ?? ''));
}

function fillPlaceholders(text: string): string {
  return text.replaceAll(/\{(\w+)\}/g, (placeholder, name: string) => {
    return SAMPLES.get(name) ?? placeholder;
  });
}
