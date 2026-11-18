import { suggestFieldId, suggestTemplateId } from '@/core/field-id-suggest';
import { PRESET_FORMAT_VERSION as FORMAT_VERSION } from '@/core/format-version';
import { renameFieldId } from '@/core/formula-rename';
import type {
  Preset,
  PresetCell,
  PresetFieldCell,
  PresetRow,
  PresetSection,
  PresetTab,
  SheetSetTemplate,
  SingleSheetTemplate,
  Template,
  WindowSize,
} from '@/core/preset';
import { copy } from '@/copy';

// AD-21: the builder document. It is the preset with a uid on every template, tab, section, row
// and cell, so tree keys, the selection and expansion survive moves. Uids never reach a file or the
// draft: `toPreset` drops them, and `fromPreset` mints new ones.

export type DocCell = PresetCell & { uid: string };

export type DocRow = Omit<PresetRow, 'cells'> & { uid: string; cells: readonly DocCell[] };

export type DocSection = Omit<PresetSection, 'rows'> & { uid: string; rows: readonly DocRow[] };

export type DocTab = Omit<PresetTab, 'sections'> & { uid: string; sections: readonly DocSection[] };

export type DocSheetSet = Omit<SheetSetTemplate, 'tabs'> & {
  uid: string;
  tabs: readonly DocTab[];
};

export type DocSingleSheet = Omit<SingleSheetTemplate, 'tabs'> & {
  uid: string;
  tabs: readonly DocTab[];
};

export type DocTemplate = DocSheetSet | DocSingleSheet;

export type BuilderDocument = { window?: WindowSize; templates: readonly DocTemplate[] };

export type CellKind = PresetCell['kind'];

export type TemplateKind = 'set' | 'single';

// The tree's first item. The window has no uid of its own, as a preset has one window at most.
export const WINDOW_UID = 'window';

// Where a problem of the whole preset sits, as "no templates".
export const PRESET_UID = 'preset';

// An item by its indexes in the document.
export type ItemPath =
  | { kind: 'window' }
  | { kind: 'template'; template: number }
  | { kind: 'tab'; template: number; tab: number }
  | { kind: 'section'; template: number; tab: number; section: number }
  | { kind: 'row'; template: number; tab: number; section: number; row: number }
  | { kind: 'cell'; template: number; tab: number; section: number; row: number; cell: number };

export type ItemKind = ItemPath['kind'];

// The result of one edit: the new document and the uid of the item it changed or added.
export type DocumentEdit = { document: BuilderDocument; changed: string };

// Where a moved item lands: at the end of `parent`, `null` for the preset itself, or beside a
// sibling of its own kind.
export type DropSpot =
  | { place: 'into'; parent: string | null }
  | { place: 'before' | 'after'; sibling: string };

export const EMPTY_DOCUMENT: BuilderDocument = { templates: [] };

let uidCounter = 0;

// Uids live only in one page load, so a counter keeps them unique.
export function mintUid(): string {
  uidCounter += 1;

  return `n${uidCounter}`;
}

export function fromPreset(preset: Pick<Preset, 'window' | 'templates'>): BuilderDocument {
  const templates = preset.templates.map((template): DocTemplate => ({
    ...template,
    uid: mintUid(),
    tabs: template.tabs.map(tabFromPreset),
  }));

  return preset.window === undefined ? { templates } : { window: preset.window, templates };
}

export function toPreset(document: BuilderDocument): Preset {
  const templates = document.templates.map(templateToPreset);

  return document.window === undefined
    ? { v: FORMAT_VERSION, templates }
    : { v: FORMAT_VERSION, window: document.window, templates };
}

export function templateToPreset(template: DocTemplate): Template {
  const tabs = template.tabs.map(tabToPreset);

  if (template.repeat !== undefined) {
    const { uid: _uid, tabs: _tabs, ...rest } = template;

    return { ...rest, tabs };
  }

  const { uid: _uid, tabs: _tabs, ...rest } = template;

  return { ...rest, tabs };
}

export function isEmptyDocument(document: BuilderDocument): boolean {
  return document.window === undefined && document.templates.length === 0;
}

function tabFromPreset(tab: PresetTab): DocTab {
  return { ...tab, uid: mintUid(), sections: tab.sections.map(sectionFromPreset) };
}

function tabToPreset(tab: DocTab): PresetTab {
  const { uid: _uid, sections, ...rest } = tab;

  return { ...rest, sections: sections.map(sectionToPreset) };
}

function sectionFromPreset(section: PresetSection): DocSection {
  return {
    ...section,
    uid: mintUid(),
    rows: section.rows.map((row) => ({
      ...row,
      uid: mintUid(),
      cells: row.cells.map(cellFromPreset),
    })),
  };
}

function cellFromPreset(cell: PresetCell): DocCell {
  return { ...cell, uid: mintUid() };
}

function sectionToPreset(section: DocSection): PresetSection {
  const { uid: _uid, rows, ...rest } = section;

  return {
    ...rest,
    rows: rows.map((row) => {
      const { uid: _rowUid, cells, ...rowRest } = row;

      return { ...rowRest, cells: cells.map(cellToPreset) };
    }),
  };
}

function cellToPreset(cell: DocCell): PresetCell {
  if (cell.kind === 'text') {
    return { kind: 'text', text: cell.text };
  }

  if (cell.kind === 'field') {
    const named = cell.name === undefined ? {} : { name: cell.name };

    return cell.type === 'select' || cell.type === 'dice-choice'
      ? { kind: 'field', type: cell.type, id: cell.id, ...named, options: cell.options }
      : { kind: 'field', type: cell.type, id: cell.id, ...named };
  }

  if (cell.kind === 'token') {
    return { kind: 'token', id: cell.id };
  }

  return cell.name === undefined
    ? { kind: 'dice', formula: cell.formula }
    : { kind: 'dice', formula: cell.formula, name: cell.name };
}

export function withFieldType(
  field: Extract<DocCell, { kind: 'field' }>,
  type: Extract<PresetFieldCell, { kind: 'field' }>['type'],
): Extract<DocCell, { kind: 'field' }> {
  if (type === 'select' || type === 'dice-choice') {
    return field.type === type
      ? field
      : {
          ...field,
          type,
          options:
            type === 'dice-choice'
              ? copy.builder.form.defaultDiceOptions.split('\n')
              : [
                  copy.builder.form.defaultSelectOptionOne,
                  copy.builder.form.defaultSelectOptionTwo,
                ],
        };
  }

  if (field.type !== 'select' && field.type !== 'dice-choice') {
    return { ...field, type };
  }

  const { options: _options, ...withoutOptions } = field;

  return { ...withoutOptions, type };
}

// Paths and lookups.

export function locate(document: BuilderDocument, uid: string): ItemPath | null {
  if (uid === WINDOW_UID) {
    return { kind: 'window' };
  }

  for (const [template, docTemplate] of document.templates.entries()) {
    if (docTemplate.uid === uid) {
      return { kind: 'template', template };
    }

    for (const [tab, docTab] of docTemplate.tabs.entries()) {
      if (docTab.uid === uid) {
        return { kind: 'tab', template, tab };
      }

      for (const [section, docSection] of docTab.sections.entries()) {
        if (docSection.uid === uid) {
          return { kind: 'section', template, tab, section };
        }

        for (const [row, docRow] of docSection.rows.entries()) {
          if (docRow.uid === uid) {
            return { kind: 'row', template, tab, section, row };
          }

          const cell = docRow.cells.findIndex((docCell) => docCell.uid === uid);

          if (cell !== -1) {
            return { kind: 'cell', template, tab, section, row, cell };
          }
        }
      }
    }
  }

  return null;
}

// The uid of the item at an index path of template, tab, section, row and cell, as deep as the
// path.
export function uidAt(document: BuilderDocument, path: readonly number[]): string | null {
  const [template, tab, section, row, cell] = path;
  const docTemplate = template === undefined ? undefined : document.templates[template];

  if (docTemplate === undefined || tab === undefined) {
    return docTemplate?.uid ?? null;
  }

  const docTab = docTemplate.tabs[tab];

  if (docTab === undefined || section === undefined) {
    return docTab?.uid ?? null;
  }

  const docSection = docTab.sections[section];

  if (docSection === undefined || row === undefined) {
    return docSection?.uid ?? null;
  }

  const docRow = docSection.rows[row];

  if (docRow === undefined || cell === undefined) {
    return docRow?.uid ?? null;
  }

  return docRow.cells[cell]?.uid ?? null;
}

// The index path of an item: template, tab, section, row and cell, as deep as the item.
export function indexPath(path: ItemPath): readonly number[] {
  switch (path.kind) {
    case 'window':
      return [];
    case 'template':
      return [path.template];
    case 'tab':
      return [path.template, path.tab];
    case 'section':
      return [path.template, path.tab, path.section];
    case 'row':
      return [path.template, path.tab, path.section, path.row];
    case 'cell':
      return [path.template, path.tab, path.section, path.row, path.cell];
    default:
      return unknownPath(path);
  }
}

// The item and its containers up to its template, nearest first.
export function ancestorUids(document: BuilderDocument, uid: string): string[] {
  const path = locate(document, uid);

  if (path === null) {
    return [];
  }

  const indexes = indexPath(path);

  // From the item's own depth up to its template.
  return indexes
    .map((_index, depth) => uidAt(document, indexes.slice(0, indexes.length - depth)))
    .filter((found) => found !== null);
}

// Every item in tree order: the window, then each template with its tabs, sections, rows and
// cells.
export function treeOrder(document: BuilderDocument): string[] {
  const order = [WINDOW_UID];

  for (const template of document.templates) {
    order.push(template.uid);

    for (const tab of template.tabs) {
      order.push(tab.uid);

      for (const section of tab.sections) {
        order.push(section.uid);

        for (const row of section.rows) {
          order.push(row.uid, ...row.cells.map((cell) => cell.uid));
        }
      }
    }
  }

  return order;
}

export function templateOf(document: BuilderDocument, uid: string): DocTemplate | null {
  const path = locate(document, uid);

  return path === null || path.kind === 'window'
    ? null
    : (document.templates[path.template] ?? null);
}

export function findTemplate(document: BuilderDocument, uid: string): DocTemplate | null {
  return document.templates.find((template) => template.uid === uid) ?? null;
}

export function findTab(document: BuilderDocument, uid: string): DocTab | null {
  const path = locate(document, uid);

  return path?.kind === 'tab' ? (document.templates[path.template]?.tabs[path.tab] ?? null) : null;
}

export function findSection(document: BuilderDocument, uid: string): DocSection | null {
  const path = locate(document, uid);

  return path?.kind === 'section' ? sectionOf(document.templates[path.template], path) : null;
}

export function findCell(document: BuilderDocument, uid: string): DocCell | null {
  const path = locate(document, uid);

  return path?.kind === 'cell'
    ? (sectionOf(document.templates[path.template], path)?.rows[path.row]?.cells[path.cell] ?? null)
    : null;
}

// A section of a template by its tab and its index in that tab.
export type SectionSpot = { tab: number; section: number };

export function sectionOf(template: DocTemplate | undefined, spot: SectionSpot): DocSection | null {
  return template?.tabs[spot.tab]?.sections[spot.section] ?? null;
}

// Every section of a template across its tabs, in tab order.
export function templateSections(template: DocTemplate): DocSection[] {
  return template.tabs.flatMap((tab) => tab.sections);
}

// The field ids of the scope of the section at `spot`: the section itself when it repeats,
// otherwise every section of its template, on any tab, that does not repeat. `except` leaves one
// cell out.
export function scopeFieldIds(
  template: DocTemplate,
  spot: SectionSpot,
  except: string | null = null,
): Set<string> {
  const own = sectionOf(template, spot);

  const sections =
    own?.repeat !== undefined
      ? [own]
      : templateSections(template).filter((section) => section.repeat === undefined);

  return new Set(sections.flatMap((section) => sectionFieldIds(section, except)));
}

// The ids that share a scope with a token cell. Token and repeat ids are not formula fields, but
// they still need distinct suggestions in the builder.
export function scopeIds(template: DocTemplate, spot: SectionSpot): Set<string> {
  const own = sectionOf(template, spot);

  const sections =
    own?.repeat !== undefined
      ? [own]
      : templateSections(template).filter((section) => section.repeat === undefined);

  return new Set([
    ...scopeFieldIds(template, spot),
    ...sections.flatMap((section) => [
      ...(section.repeat === undefined ? [] : [section.repeat.id]),
      ...section.rows.flatMap((row) => [
        ...(row.repeat === undefined ? [] : [row.repeat.id]),
        ...row.cells.flatMap((cell) => (cell.kind === 'token' ? [cell.id] : [])),
      ]),
    ]),
  ]);
}

// The field ids a formula in a row of the section at `spot` can read, for completion: its own
// repeat section's ids first, then the template's ids outside repeat sections, on any tab.
export function formulaFieldIds(template: DocTemplate, spot: SectionSpot): string[] {
  const own = sectionOf(template, spot);

  const outside = templateSections(template).flatMap((section) =>
    section.repeat !== undefined ? [] : sectionFieldIds(section, null),
  );

  const block = own?.repeat !== undefined ? sectionFieldIds(own, null) : [];

  return [...new Set([...block, ...outside])];
}

function sectionFieldIds(section: DocSection, except: string | null): string[] {
  return section.rows.flatMap((row) =>
    row.cells.flatMap((cell) => (cell.kind === 'field' && cell.uid !== except ? [cell.id] : [])),
  );
}

// Edits. Each is a pure function from document to document. A new item starts with defaults that
// pass the checks where it can.

export function addTemplate(document: BuilderDocument, kind: TemplateKind): DocumentEdit {
  const taken = new Set(document.templates.map((template) => template.id));
  const uid = mintUid();

  const template: DocTemplate =
    kind === 'set' ? newSheetSet(uid, taken) : newSingleSheet(uid, taken);

  return { document: { ...document, templates: [...document.templates, template] }, changed: uid };
}

function newSheetSet(uid: string, taken: ReadonlySet<string>): DocSheetSet {
  const title = copy.builder.newSetTitle;
  const nameField = suggestFieldId(copy.builder.newNameLabel, new Set());

  return {
    id: suggestTemplateId(title, taken),
    title,
    repeat: { nameField },
    uid,
    tabs: [
      {
        uid: mintUid(),
        sections: [
          {
            uid: mintUid(),
            rows: [
              {
                uid: mintUid(),
                cells: [
                  { kind: 'text', text: copy.builder.newNameLabel, uid: mintUid() },
                  { kind: 'field', type: 'text', id: nameField, uid: mintUid() },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function newSingleSheet(uid: string, taken: ReadonlySet<string>): DocSingleSheet {
  const title = copy.builder.newSingleTitle;

  return {
    id: suggestTemplateId(title, taken),
    title,
    uid,
    tabs: [{ uid: mintUid(), sections: [{ uid: mintUid(), rows: [] }] }],
  };
}

// A new tab has no title, which is a problem while its template has another tab.
export function addTab(document: BuilderDocument, templateUid: string): DocumentEdit | null {
  const uid = mintUid();

  const next = mapTemplate(document, templateUid, (template) => ({
    ...template,
    tabs: [...template.tabs, { uid, sections: [] }],
  }));

  return next === null ? null : { document: next, changed: uid };
}

export function addSection(document: BuilderDocument, tabUid: string): DocumentEdit | null {
  const uid = mintUid();

  const next = mapTab(document, tabUid, (tab) => ({
    ...tab,
    sections: [...tab.sections, { uid, rows: [] }],
  }));

  return next === null ? null : { document: next, changed: uid };
}

export function addRow(document: BuilderDocument, sectionUid: string): DocumentEdit | null {
  const uid = mintUid();

  const next = mapSection(document, sectionUid, (section) => ({
    ...section,
    rows: [...section.rows, { uid, cells: [] }],
  }));

  return next === null ? null : { document: next, changed: uid };
}

// A new field takes its id from the label before it in its row, as `cellLabel` reads it, unique in
// its scope. With no label the id is `field`.
export function addCell(
  document: BuilderDocument,
  rowUid: string,
  kind: CellKind,
): DocumentEdit | null {
  const path = locate(document, rowUid);

  if (path?.kind !== 'row') {
    return null;
  }

  const template = document.templates[path.template];
  const row = sectionOf(template, path)?.rows[path.row];

  if (template === undefined || row === undefined) {
    return null;
  }

  const uid = mintUid();
  let cell: DocCell;

  if (kind === 'text') {
    cell = { kind: 'text', text: copy.builder.newLabel, uid };
  } else if (kind === 'dice') {
    cell = { kind: 'dice', formula: copy.builder.newFormula, uid };
  } else if (kind === 'token') {
    cell = { kind: 'token', id: suggestFieldId('token', scopeIds(template, path)), uid };
  } else {
    const labels = row.cells.flatMap((other) =>
      other.kind === 'text' && other.text.trim() !== '' ? [other.text] : [],
    );

    const text = labels.at(-1) ?? '';

    cell = {
      kind: 'field',
      type: 'number',
      id: suggestFieldId(text, scopeFieldIds(template, path)),
      uid,
    };
  }

  const next = mapRow(document, rowUid, (docRow) => ({
    ...docRow,
    cells: [...docRow.cells, cell],
  }));

  return next === null ? null : { document: next, changed: uid };
}

export function setWindow(document: BuilderDocument, window: WindowSize | undefined): DocumentEdit {
  const next: BuilderDocument =
    window === undefined ? { templates: document.templates } : { ...document, window };

  return { document: next, changed: WINDOW_UID };
}

export function updateTemplate(
  document: BuilderDocument,
  uid: string,
  update: (template: DocTemplate) => DocTemplate,
): DocumentEdit | null {
  const next = mapTemplate(document, uid, update);

  return next === null ? null : { document: next, changed: uid };
}

export function updateTab(
  document: BuilderDocument,
  uid: string,
  update: (tab: DocTab) => DocTab,
): DocumentEdit | null {
  const next = mapTab(document, uid, update);

  return next === null ? null : { document: next, changed: uid };
}

export function updateSection(
  document: BuilderDocument,
  uid: string,
  update: (section: DocSection) => DocSection,
): DocumentEdit | null {
  const next = mapSection(document, uid, update);

  return next === null ? null : { document: next, changed: uid };
}

export function updateRow(
  document: BuilderDocument,
  uid: string,
  update: (row: DocRow) => DocRow,
): DocumentEdit | null {
  const next = mapRow(document, uid, update);

  return next === null ? null : { document: next, changed: uid };
}

export function updateCell(
  document: BuilderDocument,
  uid: string,
  update: (cell: DocCell) => DocCell,
): DocumentEdit | null {
  const path = locate(document, uid);

  if (path?.kind !== 'cell') {
    return null;
  }

  const rowUid = uidAt(document, [path.template, path.tab, path.section, path.row]);

  const next =
    rowUid === null
      ? null
      : mapRow(document, rowUid, (row) => ({
          ...row,
          cells: row.cells.map((cell) => (cell.uid === uid ? update(cell) : cell)),
        }));

  return next === null ? null : { document: next, changed: uid };
}

// A sheet set and a single sheet differ in `nameField` and `players`. A new sheet set is named by
// the first text field outside its repeat sections, or by `name`.
export function withTemplateKind(template: DocTemplate, kind: TemplateKind): DocTemplate {
  const isSet = template.repeat !== undefined;

  if ((kind === 'set') === isSet) {
    return template;
  }

  if (isSet) {
    const { repeat: _repeat, ...rest } = template;

    return rest;
  }

  const { players: _players, ...rest } = template;
  const nameField = nameFieldCandidates(template)[0] ?? 'name';

  return { ...rest, repeat: { nameField } };
}

// The text fields outside repeat sections, on any tab, which may name a sheet of a sheet set.
export function nameFieldCandidates(template: DocTemplate): string[] {
  return repeatNameFieldCandidates(template, { kind: 'template', template: 0 });
}

export type RepeatItemPath = Extract<ItemPath, { kind: 'template' | 'tab' | 'section' | 'row' }>;

export function repeatNameFieldCandidates(template: DocTemplate, path: RepeatItemPath): string[] {
  if (path.kind === 'template') {
    return templateSections(template).flatMap((section) =>
      section.repeat === undefined ? sectionNameFieldIds(section) : [],
    );
  }

  const tab = template.tabs[path.tab];

  if (path.kind === 'tab') {
    return (
      tab?.sections.flatMap((section) =>
        section.repeat === undefined ? sectionNameFieldIds(section) : [],
      ) ?? []
    );
  }

  const section = tab?.sections[path.section];

  if (path.kind === 'section') {
    return section === undefined ? [] : sectionNameFieldIds(section);
  }

  const row = section?.rows[path.row];

  return row === undefined ? [] : textFieldIds(row);
}

export function repeatIdsAt(template: DocTemplate, path: RepeatItemPath): Set<string> {
  if (path.kind === 'template') {
    return new Set();
  }

  const tab = template.tabs[path.tab];

  if (path.kind === 'tab') {
    return new Set(template.tabs.flatMap((item) => (item.repeat ? [item.repeat.id] : [])));
  }

  const section = tab?.sections[path.section];

  if (path.kind === 'section') {
    return new Set(tab?.sections.flatMap((item) => (item.repeat ? [item.repeat.id] : [])) ?? []);
  }

  return new Set(section?.rows.flatMap((item) => (item.repeat ? [item.repeat.id] : [])) ?? []);
}

function sectionNameFieldIds(section: DocSection): string[] {
  return section.rows.filter((row) => row.repeat === undefined).flatMap((row) => textFieldIds(row));
}

function textFieldIds(row: DocRow): string[] {
  return row.cells.flatMap((cell) =>
    cell.kind === 'field' && cell.type === 'text' ? [cell.id] : [],
  );
}

// A repeatable node that stops repeating loses its repeat block identity.
export function withRepeat(
  item: DocTab,
  repeat: boolean,
  taken?: ReadonlySet<string>,
  label?: string,
): DocTab;
export function withRepeat(
  item: DocSection,
  repeat: boolean,
  taken?: ReadonlySet<string>,
  label?: string,
): DocSection;
export function withRepeat(
  item: DocRow,
  repeat: boolean,
  taken?: ReadonlySet<string>,
  label?: string,
): DocRow;
export function withRepeat(
  item: DocTab | DocSection | DocRow,
  repeat: boolean,
  taken: ReadonlySet<string> = new Set(),
  label?: string,
): DocTab | DocSection | DocRow {
  if (repeat) {
    const candidates =
      'cells' in item ? textFieldIds(item) : 'rows' in item ? sectionNameFieldIds(item) : [];

    const nameField = candidates[0] ?? 'name';
    const id = suggestFieldId(label ?? ('title' in item ? (item.title ?? 'repeat') : 'row'), taken);

    return { ...item, repeat: { id, nameField } };
  }

  if ('cells' in item) {
    const { repeat: _repeat, ...rest } = item;

    return rest;
  }

  if ('rows' in item) {
    const { repeat: _repeat, ...rest } = item;

    return rest;
  }

  const { repeat: _repeat, ...rest } = item;

  return rest;
}

// `value` set, or the key left out when it is `undefined`, so no file holds an empty key.
export function withOption<Item extends object, Key extends keyof Item>(
  item: Item,
  key: Key,
  value: Item[Key] | undefined,
): Item {
  if (value !== undefined) {
    return { ...item, [key]: value };
  }

  const next = { ...item };

  delete next[key];

  return next;
}

// Removes an item. The changed item is its container, which the selection moves to.
export function removeItem(document: BuilderDocument, uid: string): DocumentEdit | null {
  const path = locate(document, uid);

  if (path === null || path.kind === 'window') {
    return null;
  }

  const parent = path.kind === 'template' ? null : uidAt(document, indexPath(path).slice(0, -1));
  const next = withoutItem(document, uid);

  return next === null ? null : { document: next, changed: parent ?? PRESET_UID };
}

// AD-25: a move keeps the preset form: a cell goes into a row, a row into a section, a section into
// a tab, a tab into a template, and a template among templates. A move that breaks a preset rule is
// allowed.
export function moveItem(
  document: BuilderDocument,
  uid: string,
  spot: DropSpot,
): DocumentEdit | null {
  const path = locate(document, uid);

  if (path === null || path.kind === 'window' || (spot.place !== 'into' && spot.sibling === uid)) {
    return null;
  }

  if (!acceptsDrop(document, path.kind, spot)) {
    return null;
  }

  const item = itemAt(document, path);
  const without = withoutItem(document, uid);

  if (item === null || without === null) {
    return null;
  }

  const next = insertItem(without, item, spot);

  return next === null ? null : { document: next, changed: uid };
}

// Whether an item of `kind` may land at `spot`.
export function acceptsDrop(document: BuilderDocument, kind: ItemKind, spot: DropSpot): boolean {
  if (spot.place === 'into') {
    const parentKind =
      spot.parent === null ? null : (locate(document, spot.parent)?.kind ?? 'none');

    return parentKind === PARENT_KIND[kind];
  }

  return locate(document, spot.sibling)?.kind === kind;
}

const PARENT_KIND: Readonly<Record<ItemKind, ItemKind | null | 'none'>> = {
  window: 'none',
  template: null,
  tab: 'template',
  section: 'tab',
  row: 'section',
  cell: 'row',
};

// AD-24: renames a field and rewrites every formula that resolves to it. `formulas` counts them.
export function renameField(
  document: BuilderDocument,
  uid: string,
  newId: string,
): (DocumentEdit & { formulas: number }) | null {
  const path = locate(document, uid);

  if (path?.kind !== 'cell') {
    return null;
  }

  const template = document.templates[path.template];
  const cell = findCell(document, uid);

  if (template === undefined || cell?.kind !== 'field' || cell.id === newId) {
    return null;
  }

  const renamed = renameFieldId(
    templateToPreset(template),
    { tabIndex: path.tab, sectionIndex: path.section, rowIndex: path.row, cellIndex: path.cell },
    cell.id,
    newId,
  );

  const next = mapTemplate(document, template.uid, () => withContent(template, renamed.template));

  return next === null ? null : { document: next, changed: uid, formulas: renamed.formulas };
}

// The preset template's content in the document template, which has the same items in the same
// places, so every uid stays.
function withContent(template: DocTemplate, content: Template): DocTemplate {
  const tabs = template.tabs.map((tab, tabIndex): DocTab => ({
    ...tab,
    sections: tab.sections.map((section, sectionIndex): DocSection => {
      const presetSection = content.tabs[tabIndex]?.sections[sectionIndex];

      return {
        ...section,
        rows: section.rows.map((row, rowIndex) => ({
          ...row,
          cells: row.cells.map((cell, cellIndex) => {
            const presetCell = presetSection?.rows[rowIndex]?.cells[cellIndex];

            return presetCell === undefined ? cell : { ...presetCell, uid: cell.uid };
          }),
        })),
      };
    }),
  }));

  return content.repeat !== undefined && template.repeat !== undefined
    ? { ...template, repeat: content.repeat, tabs }
    : { ...template, tabs };
}

type MovedItem =
  | { kind: 'template'; item: DocTemplate }
  | { kind: 'tab'; item: DocTab }
  | { kind: 'section'; item: DocSection }
  | { kind: 'row'; item: DocRow }
  | { kind: 'cell'; item: DocCell };

function itemAt(document: BuilderDocument, path: ItemPath): MovedItem | null {
  if (path.kind === 'window') {
    return null;
  }

  const template = document.templates[path.template];

  if (path.kind === 'template') {
    return template === undefined ? null : { kind: 'template', item: template };
  }

  const tab = template?.tabs[path.tab];

  if (path.kind === 'tab') {
    return tab === undefined ? null : { kind: 'tab', item: tab };
  }

  const section = tab?.sections[path.section];

  if (path.kind === 'section') {
    return section === undefined ? null : { kind: 'section', item: section };
  }

  const row = section?.rows[path.row];

  if (path.kind === 'row') {
    return row === undefined ? null : { kind: 'row', item: row };
  }

  const cell = row?.cells[path.cell];

  return cell === undefined ? null : { kind: 'cell', item: cell };
}

function withoutItem(document: BuilderDocument, uid: string): BuilderDocument | null {
  const path = locate(document, uid);

  if (path === null || path.kind === 'window') {
    return null;
  }

  if (path.kind === 'template') {
    return { ...document, templates: document.templates.filter((item) => item.uid !== uid) };
  }

  const parent = uidAt(document, indexPath(path).slice(0, -1));

  if (parent === null) {
    return null;
  }

  if (path.kind === 'tab') {
    return mapTemplate(document, parent, (template) => ({
      ...template,
      tabs: template.tabs.filter((item) => item.uid !== uid),
    }));
  }

  if (path.kind === 'section') {
    return mapTab(document, parent, (tab) => ({
      ...tab,
      sections: tab.sections.filter((item) => item.uid !== uid),
    }));
  }

  if (path.kind === 'row') {
    return mapSection(document, parent, (section) => ({
      ...section,
      rows: section.rows.filter((item) => item.uid !== uid),
    }));
  }

  return mapRow(document, parent, (row) => ({
    ...row,
    cells: row.cells.filter((item) => item.uid !== uid),
  }));
}

function insertItem(
  document: BuilderDocument,
  moved: MovedItem,
  spot: DropSpot,
): BuilderDocument | null {
  const parent = spot.place === 'into' ? spot.parent : parentUid(document, spot.sibling);

  if (moved.kind === 'template') {
    return { ...document, templates: placed(document.templates, moved.item, spot) };
  }

  if (parent === null) {
    return null;
  }

  if (moved.kind === 'tab') {
    return mapTemplate(document, parent, (template) => ({
      ...template,
      tabs: placed(template.tabs, moved.item, spot),
    }));
  }

  if (moved.kind === 'section') {
    return mapTab(document, parent, (tab) => ({
      ...tab,
      sections: placed(tab.sections, moved.item, spot),
    }));
  }

  if (moved.kind === 'row') {
    return mapSection(document, parent, (section) => ({
      ...section,
      rows: placed(section.rows, moved.item, spot),
    }));
  }

  return mapRow(document, parent, (row) => ({
    ...row,
    cells: placed(row.cells, moved.item, spot),
  }));
}

function parentUid(document: BuilderDocument, uid: string): string | null {
  const path = locate(document, uid);

  return path === null || path.kind === 'window' || path.kind === 'template'
    ? null
    : uidAt(document, indexPath(path).slice(0, -1));
}

function placed<Item extends { uid: string }>(
  items: readonly Item[],
  item: Item,
  spot: DropSpot,
): Item[] {
  if (spot.place === 'into') {
    return [...items, item];
  }

  const index = items.findIndex((other) => other.uid === spot.sibling);
  const at = index === -1 ? items.length : spot.place === 'before' ? index : index + 1;

  return [...items.slice(0, at), item, ...items.slice(at)];
}

function mapTemplate(
  document: BuilderDocument,
  uid: string,
  update: (template: DocTemplate) => DocTemplate,
): BuilderDocument | null {
  if (!document.templates.some((template) => template.uid === uid)) {
    return null;
  }

  return {
    ...document,
    templates: document.templates.map((template) =>
      template.uid === uid ? update(template) : template,
    ),
  };
}

function mapTab(
  document: BuilderDocument,
  uid: string,
  update: (tab: DocTab) => DocTab,
): BuilderDocument | null {
  const path = locate(document, uid);
  const template = path?.kind === 'tab' ? document.templates[path.template] : undefined;

  if (template === undefined) {
    return null;
  }

  return mapTemplate(document, template.uid, (docTemplate) => ({
    ...docTemplate,
    tabs: docTemplate.tabs.map((tab) => (tab.uid === uid ? update(tab) : tab)),
  }));
}

function mapSection(
  document: BuilderDocument,
  uid: string,
  update: (section: DocSection) => DocSection,
): BuilderDocument | null {
  const path = locate(document, uid);
  const tab = path?.kind === 'section' ? uidAt(document, [path.template, path.tab]) : null;

  if (tab === null) {
    return null;
  }

  return mapTab(document, tab, (docTab) => ({
    ...docTab,
    sections: docTab.sections.map((section) => (section.uid === uid ? update(section) : section)),
  }));
}

function mapRow(
  document: BuilderDocument,
  uid: string,
  update: (row: DocRow) => DocRow,
): BuilderDocument | null {
  const path = locate(document, uid);

  const section =
    path?.kind === 'row' ? uidAt(document, [path.template, path.tab, path.section]) : null;

  if (section === null) {
    return null;
  }

  return mapSection(document, section, (docSection) => ({
    ...docSection,
    rows: docSection.rows.map((row) => (row.uid === uid ? update(row) : row)),
  }));
}

// `tsc` fails here when an item kind has no case above.
function unknownPath(path: never): never {
  throw new Error(`Muster Roll has no index path for ${JSON.stringify(path)}`);
}
