import { suggestFieldId, suggestTemplateId } from '@/core/field-id-suggest';
import { FORMAT_VERSION } from '@/core/format-version';
import { renameFieldId } from '@/core/formula-rename';
import type {
  Preset,
  PresetCell,
  PresetFieldCell,
  PresetSection,
  SheetSetTemplate,
  SingleSheetTemplate,
  Template,
  WindowSize,
} from '@/core/preset';
import { copy } from '@/ui/copy';

// AD-21: the builder document. It is the preset with a uid on every template, section, row and
// cell, so tree keys, the selection and expansion survive moves. Uids never reach a file or the
// draft: `toPreset` drops them, and `fromPreset` mints new ones.

export type DocCell = PresetCell & { uid: string };

export type DocRow = { uid: string; cells: readonly DocCell[] };

export type DocSection = Omit<PresetSection, 'rows'> & { uid: string; rows: readonly DocRow[] };

export type DocSheetSet = Omit<SheetSetTemplate, 'sections'> & {
  uid: string;
  sections: readonly DocSection[];
};

export type DocSingleSheet = Omit<SingleSheetTemplate, 'sections'> & {
  uid: string;
  sections: readonly DocSection[];
};

export type DocTemplate = DocSheetSet | DocSingleSheet;

export type BuilderDocument = { window?: WindowSize; templates: readonly DocTemplate[] };

export type CellKind = PresetCell['kind'];

export type TemplateKind = Template['kind'];

// The tree's first item. The window has no uid of its own, as a preset has one window at most.
export const WINDOW_UID = 'window';

// Where a problem of the whole preset sits, as "no templates".
export const PRESET_UID = 'preset';

// An item by its indexes in the document.
export type ItemPath =
  | { kind: 'window' }
  | { kind: 'template'; template: number }
  | { kind: 'section'; template: number; section: number }
  | { kind: 'row'; template: number; section: number; row: number }
  | { kind: 'cell'; template: number; section: number; row: number; cell: number };

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
    sections: template.sections.map(sectionFromPreset),
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
  const sections = template.sections.map(sectionToPreset);

  if (template.kind === 'set') {
    const { uid: _uid, sections: _sections, ...rest } = template;

    return { ...rest, sections };
  }

  const { uid: _uid, sections: _sections, ...rest } = template;

  return { ...rest, sections };
}

export function isEmptyDocument(document: BuilderDocument): boolean {
  return document.window === undefined && document.templates.length === 0;
}

function sectionFromPreset(section: PresetSection): DocSection {
  return {
    ...section,
    uid: mintUid(),
    rows: section.rows.map((cells) => ({ uid: mintUid(), cells: cells.map(cellFromPreset) })),
  };
}

function cellFromPreset(cell: PresetCell): DocCell {
  return { ...cell, uid: mintUid() };
}

function sectionToPreset(section: DocSection): PresetSection {
  const { uid: _uid, rows, ...rest } = section;

  return { ...rest, rows: rows.map((row) => row.cells.map(cellToPreset)) };
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

    for (const [section, docSection] of docTemplate.sections.entries()) {
      if (docSection.uid === uid) {
        return { kind: 'section', template, section };
      }

      for (const [row, docRow] of docSection.rows.entries()) {
        if (docRow.uid === uid) {
          return { kind: 'row', template, section, row };
        }

        const cell = docRow.cells.findIndex((docCell) => docCell.uid === uid);

        if (cell !== -1) {
          return { kind: 'cell', template, section, row, cell };
        }
      }
    }
  }

  return null;
}

// The uid of the item at an index path of template, section, row and cell, as deep as the path.
export function uidAt(document: BuilderDocument, path: readonly number[]): string | null {
  const [template, section, row, cell] = path;
  const docTemplate = template === undefined ? undefined : document.templates[template];

  if (docTemplate === undefined || section === undefined) {
    return docTemplate?.uid ?? null;
  }

  const docSection = docTemplate.sections[section];

  if (docSection === undefined || row === undefined) {
    return docSection?.uid ?? null;
  }

  const docRow = docSection.rows[row];

  if (docRow === undefined || cell === undefined) {
    return docRow?.uid ?? null;
  }

  return docRow.cells[cell]?.uid ?? null;
}

// The index path of an item: template, section, row and cell, as deep as the item.
export function indexPath(path: ItemPath): readonly number[] {
  switch (path.kind) {
    case 'window':
      return [];
    case 'template':
      return [path.template];
    case 'section':
      return [path.template, path.section];
    case 'row':
      return [path.template, path.section, path.row];
    case 'cell':
      return [path.template, path.section, path.row, path.cell];
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

// Every item in tree order: the window, then each template with its sections, rows and cells.
export function treeOrder(document: BuilderDocument): string[] {
  const order = [WINDOW_UID];

  for (const template of document.templates) {
    order.push(template.uid);

    for (const section of template.sections) {
      order.push(section.uid);

      for (const row of section.rows) {
        order.push(row.uid, ...row.cells.map((cell) => cell.uid));
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

export function findSection(document: BuilderDocument, uid: string): DocSection | null {
  const path = locate(document, uid);

  return path?.kind === 'section'
    ? (document.templates[path.template]?.sections[path.section] ?? null)
    : null;
}

export function findCell(document: BuilderDocument, uid: string): DocCell | null {
  const path = locate(document, uid);

  return path?.kind === 'cell'
    ? (document.templates[path.template]?.sections[path.section]?.rows[path.row]?.cells[
        path.cell
      ] ?? null)
    : null;
}

// The field ids of the scope of section `sectionIndex`: the section itself when it repeats,
// otherwise every section of its template that does not repeat. `except` leaves one cell out.
export function scopeFieldIds(
  template: DocTemplate,
  sectionIndex: number,
  except: string | null = null,
): Set<string> {
  const own = template.sections[sectionIndex];

  const sections =
    own?.repeat === true ? [own] : template.sections.filter((section) => section.repeat !== true);

  return new Set(sections.flatMap((section) => sectionFieldIds(section, except)));
}

// The field ids a formula in a row of section `sectionIndex` can read, for completion: its own
// repeat section's ids first, then the template's ids outside repeat sections.
export function formulaFieldIds(template: DocTemplate, sectionIndex: number): string[] {
  const own = template.sections[sectionIndex];

  const outside = template.sections.flatMap((section) =>
    section.repeat === true ? [] : sectionFieldIds(section, null),
  );

  const block = own?.repeat === true ? sectionFieldIds(own, null) : [];

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
    kind: 'set',
    title,
    nameField,
    uid,
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
  };
}

function newSingleSheet(uid: string, taken: ReadonlySet<string>): DocSingleSheet {
  const title = copy.builder.newSingleTitle;

  return {
    id: suggestTemplateId(title, taken),
    kind: 'single',
    title,
    uid,
    sections: [{ uid: mintUid(), rows: [] }],
  };
}

export function addSection(document: BuilderDocument, templateUid: string): DocumentEdit | null {
  const uid = mintUid();

  const next = mapTemplate(document, templateUid, (template) => ({
    ...template,
    sections: [...template.sections, { uid, rows: [] }],
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
  const row = template?.sections[path.section]?.rows[path.row];

  if (template === undefined || row === undefined) {
    return null;
  }

  const uid = mintUid();
  let cell: DocCell;

  if (kind === 'text') {
    cell = { kind: 'text', text: copy.builder.newLabel, uid };
  } else if (kind === 'dice') {
    cell = { kind: 'dice', formula: copy.builder.newFormula, uid };
  } else {
    const labels = row.cells.flatMap((other) =>
      other.kind === 'text' && other.text.trim() !== '' ? [other.text] : [],
    );

    const text = labels.at(-1) ?? '';

    cell = {
      kind: 'field',
      type: 'number',
      id: suggestFieldId(text, scopeFieldIds(template, path.section)),
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

export function updateSection(
  document: BuilderDocument,
  uid: string,
  update: (section: DocSection) => DocSection,
): DocumentEdit | null {
  const next = mapSection(document, uid, update);

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

  const rowUid = uidAt(document, [path.template, path.section, path.row]);

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
  if (template.kind === kind) {
    return template;
  }

  if (template.kind === 'set') {
    const { nameField: _nameField, kind: _kind, ...rest } = template;

    return { ...rest, kind: 'single' };
  }

  const { players: _players, kind: _kind, ...rest } = template;
  const nameField = nameFieldCandidates(template)[0] ?? 'name';

  return { ...rest, kind: 'set', nameField };
}

// The text fields outside repeat sections, which may name a sheet of a sheet set.
export function nameFieldCandidates(template: DocTemplate): string[] {
  return template.sections.flatMap((section) =>
    section.repeat === true
      ? []
      : section.rows.flatMap((row) =>
          row.cells.flatMap((cell) =>
            cell.kind === 'field' && cell.type === 'text' ? [cell.id] : [],
          ),
        ),
  );
}

// A section that stops repeating loses its repeat block tokens too.
export function withRepeat(section: DocSection, repeat: boolean): DocSection {
  if (repeat) {
    return { ...section, repeat: true };
  }

  const { repeat: _repeat, tokens: _tokens, ...rest } = section;

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
// a template, and a template among templates. A move that breaks a preset rule is allowed.
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
  section: 'template',
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
    { sectionIndex: path.section, rowIndex: path.row, cellIndex: path.cell },
    cell.id,
    newId,
  );

  const next = mapTemplate(document, template.uid, () => withContent(template, renamed.template));

  return next === null ? null : { document: next, changed: uid, formulas: renamed.formulas };
}

// The preset template's content in the document template, which has the same items in the same
// places, so every uid stays.
function withContent(template: DocTemplate, content: Template): DocTemplate {
  const sections = template.sections.map((section, sectionIndex): DocSection => {
    const presetSection = content.sections[sectionIndex];

    return {
      ...section,
      rows: section.rows.map((row, rowIndex) => ({
        ...row,
        cells: row.cells.map((cell, cellIndex) => {
          const presetCell = presetSection?.rows[rowIndex]?.[cellIndex];

          return presetCell === undefined ? cell : { ...presetCell, uid: cell.uid };
        }),
      })),
    };
  });

  return content.kind === 'set' && template.kind === 'set'
    ? { ...template, nameField: content.nameField, sections }
    : { ...template, sections };
}

type MovedItem =
  | { kind: 'template'; item: DocTemplate }
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

  const section = template?.sections[path.section];

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

  if (path.kind === 'section') {
    return mapTemplate(document, parent, (template) => ({
      ...template,
      sections: template.sections.filter((item) => item.uid !== uid),
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

  if (moved.kind === 'section') {
    return mapTemplate(document, parent, (template) => ({
      ...template,
      sections: placed(template.sections, moved.item, spot),
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

function mapSection(
  document: BuilderDocument,
  uid: string,
  update: (section: DocSection) => DocSection,
): BuilderDocument | null {
  const path = locate(document, uid);
  const template = path?.kind === 'section' ? document.templates[path.template] : undefined;

  if (template === undefined) {
    return null;
  }

  return mapTemplate(document, template.uid, (docTemplate) => ({
    ...docTemplate,
    sections: docTemplate.sections.map((section) =>
      section.uid === uid ? update(section) : section,
    ),
  }));
}

function mapRow(
  document: BuilderDocument,
  uid: string,
  update: (row: DocRow) => DocRow,
): BuilderDocument | null {
  const path = locate(document, uid);
  const section = path?.kind === 'row' ? uidAt(document, [path.template, path.section]) : null;

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
