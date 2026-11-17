import { z } from 'zod';

import {
  plainRowIdOf,
  sectionFields,
  type Preset,
  type PresetFieldCell,
  type PresetSection,
  type Template,
} from '@/core/preset';
import {
  blockDataSchema,
  blockKey,
  linkDataSchema,
  repDataSchema,
  repKey,
  rowKey,
  sheetDataSchema,
  type FieldValue,
  type SheetData,
  type VersionedRecord,
} from '@/core/records';

// The most code points of a sheet's name that a roll or a view shows. A name field holds any text,
// so its value is cut to this.
export const SHEET_NAME_MAX_LENGTH = 100;

// The nanoid alphabet. A narrower rule than the record key's, so an id never holds ":". A template
// id fits it too, so a single sheet's sheet id passes.
export const sheetIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// The forms whose key holds the sheet id right after the form name. A `link:` key holds a token id
// instead, so it is matched by its data.
const KEYED_DEPENDENT_FORMS = ['blk', 'acl', 'plink'] as const;

// A live sheet of a sheet set, with its root metadata.
export type SheetSummary = Pick<SheetData, 'set' | 'order'> & { sheetId: string };

// AD-4: who besides a GM may edit a sheet. `per-player`: a player holding a live `acl:` of it.
// `players-edit`: every player. `none`: no player.
export type WriteRule = 'per-player' | 'players-edit' | 'none';

// The field whose root cell names a sheet, with its preset row address.
export type NameField = { rowId: string; fieldId: string };

// AD-18: what the one template of a sheet decides for it.
export type SheetPolicy = {
  sheetId: string;
  template: Template;
  // `visibility: "gm"`: only GMs see the sheet and its rolls.
  hidden: boolean;
  write: WriteRule;
  // `null`: the template's `title` names the sheet.
  nameField: NameField | null;
  // Whether the template has a token cell that can be linked to the sheet.
  linkable: boolean;
};

export function sheetKey(sheetId: string): string {
  return blockKey(sheetId);
}

// A sheet set gives any number of sheets; a single sheet is one sheet, named by its title.
export function isSheetSet<T extends { repeat?: unknown }>(
  template: T,
): template is T & { repeat: { nameField: string } } {
  return template.repeat !== undefined;
}

// AD-18: the one function that finds a sheet's template. A `sheetId` equal to a template id is that
// template's single sheet or nothing. Any other `sheetId` needs a live root whose `set`
// names a sheet set. `null`: no template owns the sheet, so it is not shown and takes no edit.
export function resolveSheet(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  sheetId: string,
): SheetPolicy | null {
  if (preset === null) {
    return null;
  }

  const own = preset.templates.find((template) => template.id === sheetId);

  if (own !== undefined) {
    return isSheetSet(own) ? null : sheetPolicy(own, sheetId);
  }

  const sheet = sheetDataSchema.safeParse(records.get(sheetKey(sheetId))?.d);

  if (!sheet.success) {
    return null;
  }

  const set = preset.templates.find((template) => template.id === sheet.data.set);

  return set !== undefined && isSheetSet(set) ? sheetPolicy(set, sheetId) : null;
}

// What a template decides for every sheet it owns. A hidden template takes no player edit.
export function sheetPolicy(template: Template, sheetId: string): SheetPolicy {
  const hidden = template.visibility === 'gm';

  if (isSheetSet(template)) {
    const nameField = template.repeat.nameField;
    const rowId = nameField === undefined ? null : plainRowIdOf(template, nameField);

    return {
      sheetId,
      template,
      hidden,
      write: hidden ? 'none' : template.players === 'edit' ? 'players-edit' : 'per-player',
      nameField: rowId === null ? null : { rowId, fieldId: nameField },
      linkable: templateHasToken(template),
    };
  }

  return {
    sheetId,
    template,
    hidden,
    write: !hidden && template.players === 'edit' ? 'players-edit' : 'none',
    nameField: null,
    linkable: templateHasToken(template),
  };
}

function templateHasToken(template: Template): boolean {
  return template.tabs.some(
    (tab) =>
      tab.repeat === undefined &&
      tab.sections.some((section) =>
        section.rows.some((row) => row.cells.some((cell) => cell.kind === 'token')),
      ),
  );
}

// The live sheets of the sheet set `setId`, ordered by `(order, sheetId)`. A root whose
// id is a template id belongs to no sheet set, so it is not listed. A tombstoned sheet is deleted.
export function liveSheets(
  records: Iterable<VersionedRecord>,
  preset: Preset,
  setId: string,
): SheetSummary[] {
  const set = preset.templates.find((template) => template.id === setId);

  if (set === undefined || !isSheetSet(set)) {
    return [];
  }

  const templateIds = new Set(preset.templates.map((template) => template.id));
  const sheets: SheetSummary[] = [];

  for (const record of records) {
    if (!record.k.startsWith('blk:') || record.k.split(':').length !== 2) {
      continue;
    }

    const sheetId = record.k.slice('blk:'.length);
    const data = sheetDataSchema.safeParse(record.d);

    if (data.success && data.data.set === setId && !templateIds.has(sheetId)) {
      sheets.push({ sheetId, set: data.data.set, order: data.data.order });
    }
  }

  return sortSheets(sheets);
}

// Every sheet a template owns, in tab order: the live sheets of a sheet set, or the single sheet,
// whose sheet id is its template id.
export function templateSheetIds(
  records: Iterable<VersionedRecord>,
  preset: Preset,
  template: Template,
): string[] {
  return isSheetSet(template)
    ? liveSheets(records, preset, template.id).map((sheet) => sheet.sheetId)
    : [template.id];
}

// The Sheet names convention: a sheet of a sheet set is named by its name field's value, a single
// sheet by its `title`. "" is an empty name, which every view shows as its one fallback label.
// `null`: no template owns the sheet.
export function sheetName(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  sheetId: string,
): string | null {
  const policy = resolveSheet(records, preset, sheetId);

  if (policy === null) {
    return null;
  }

  if (policy.nameField === null) {
    return policy.template.title;
  }

  const values = blockDataSchema.safeParse(records.get(rowKey(sheetId, policy.nameField.rowId))?.d);

  // The preset schema makes every name field a `text` field.
  const name = nameText('text', values.data?.cells[policy.nameField.fieldId]?.[0] ?? undefined);

  return Array.from(name).slice(0, SHEET_NAME_MAX_LENGTH).join('');
}

// A repeat block is named by its repeat scope's explicit nameField value, "" when it has none.
export function repeatBlockName(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  section: PresetSection,
  instanceId: string,
): string {
  const nameField = section.repeat?.nameField ?? null;

  if (nameField === null || section.repeat?.id === undefined) {
    return '';
  }

  const block = repDataSchema.safeParse(
    records.get(repKey(sheetId, section.repeat.id, instanceId))?.d,
  );

  const named = sectionFields(section).find((field) => field.id === nameField);

  return named === undefined
    ? ''
    : nameText(named.type, block.data?.cells[nameField]?.[0] ?? undefined);
}

// True for a live record the sheet's deletion must tombstone with it. A tombstone needs no second
// one, so the caller filters tombstones out first. The trailing ":" keeps a sheet "a" from matching
// the records of a sheet "ab".
export function isSheetDependent(
  key: string,
  record: Pick<VersionedRecord, 'd'>,
  sheetId: string,
): boolean {
  return dependentSheetId(key, record) === sheetId;
}

// True for a block, an access record, an owner link or a token link.
export function isDependentKey(key: string): boolean {
  return (
    key.startsWith('link:') || KEYED_DEPENDENT_FORMS.some((form) => key.startsWith(`${form}:`))
  );
}

// The id of the sheet a record depends on, or `null` for a record that names no valid sheet id. A
// `link:` holds it in its data, so a tombstoned one names none. A keyed form holds it in the key,
// before the next ":".
export function dependentSheetId(key: string, record: Pick<VersionedRecord, 'd'>): string | null {
  const candidate = key.startsWith('link:')
    ? linkDataSchema.safeParse(record.d).data?.s
    : keyedSheetSegment(key);

  const sheetId = sheetIdSchema.safeParse(candidate);

  return sheetId.success ? sheetId.data : null;
}

// Ties compare by code unit, not by locale, so every client and reload gets the same order.
export function sortSheets<Sheet extends Pick<SheetSummary, 'sheetId' | 'order'>>(
  sheets: readonly Sheet[],
): Sheet[] {
  return [...sheets].sort((first, second) => {
    if (first.order !== second.order) {
      return first.order - second.order;
    }

    if (first.sheetId === second.sheetId) {
      return 0;
    }

    return first.sheetId < second.sheetId ? -1 : 1;
  });
}

function keyedSheetSegment(key: string): string | undefined {
  const form = KEYED_DEPENDENT_FORMS.find((candidate) => key.startsWith(`${candidate}:`));

  if (form === undefined) {
    return undefined;
  }

  const rest = key.slice(form.length + 1);
  const end = rest.indexOf(':');

  return end === -1 ? rest : rest.slice(0, end);
}

// A value names as a field shows it. A blank text and a check name nothing.
function nameText(type: PresetFieldCell['type'], value: FieldValue | undefined): string {
  const text = type === 'check' || value === undefined ? '' : String(value);

  return text.trim() === '' ? '' : text;
}
