import clsx from 'clsx';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { fieldFormulaCount } from '@/core/formula-rename';
import { isFieldId } from '@/core/field-id';
import { DEFAULT_WINDOW_SIZE, type Preset, type PresetSection } from '@/core/preset';
import { isSheetSet } from '@/core/sheets';
import { copy } from '@/copy';
import { Button } from '@/ui/primitives/button';

import type { BuilderStore } from './builder-store';
import {
  formulaFieldIds,
  locate,
  relatedScopeFieldConflict,
  nameFieldCandidates,
  PRESET_UID,
  repeatIdsAt,
  repeatNameFieldCandidates,
  removeItem,
  renameField,
  setWindow,
  templateToPreset,
  updateCell,
  updateRow,
  updateSection,
  updateTab,
  updateTemplate,
  withOption,
  withFieldType,
  withRepeat,
  withTemplateKind,
  type BuilderDocument,
  type DocCell,
  type DocSection,
  type DocTab,
  type DocTemplate,
  type DocRow,
  type ItemPath,
} from './document';
import { FormulaInput, INPUT_CLASS } from './formula-input';
import { problemReason, type BuilderProblem } from './problems';
import { cellItemLabel } from './structure-tree';

type ItemFormProps = {
  store: BuilderStore;
  document: BuilderDocument;
  origin: Preset | null;
  selection: string | null;
  problems: readonly BuilderProblem[];
};

const SELECT_CLASS = 'touch-target rounded-sm border border-line bg-surface px-2 text-text';

const LABEL_CLASS = 'text-label-sm text-text-muted';

const HINT_CLASS = 'text-label-sm text-text-muted';

const WARNING_PROBLEMS = new Set<BuilderProblem['failure']['code']>([
  'shadowed-field-id',
  'shadowed-repeat-id',
  'unresolved-formula-field',
]);

// CAP-22: the form of the selected item. A change applies at once, through the store, and the
// preview redraws at once. "Удалить" ends each form and asks nothing, as undo restores the item.
// Typing in one input is one undo step, keyed by the item and the property.
export function ItemForm({
  store,
  document,
  origin,
  selection,
  problems,
}: ItemFormProps): ReactNode {
  const headingId = useId();
  const path = selection === null ? null : locate(document, selection);

  const messages = problems.filter((problem) => problem.uid === selection);

  // The preset itself has no form: when the counter lands on a problem of the whole preset, its
  // messages show alone.
  const presetOnly = selection === PRESET_UID && messages.length > 0;

  if (selection === null || (path === null && !presetOnly)) {
    return null;
  }

  return (
    <section
      // Each item's form starts fresh: an id input's draft and its rename message belong to it.
      key={selection}
      aria-labelledby={headingId}
      className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto rounded-md bg-surface p-3"
      data-builder-form
    >
      <h2 id={headingId} className="text-section-heading">
        {path === null ? copy.section.preset : formHeading(document, path)}
      </h2>
      {messages.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-danger-text" data-builder-problems>
          {messages.map((message, index) => (
            <li
              key={`${message.failure.code}-${index}`}
              className={clsx(WARNING_PROBLEMS.has(message.failure.code) && 'text-warning-text')}
            >
              {problemReason(message.failure)}
            </li>
          ))}
        </ul>
      )}
      {path === null ? null : (
        <FormBody store={store} document={document} origin={origin} uid={selection} path={path} />
      )}
    </section>
  );
}

type FormBodyProps = {
  store: BuilderStore;
  document: BuilderDocument;
  origin: Preset | null;
  uid: string;
  path: ItemPath;
};

function FormBody({ store, document, origin, uid, path }: FormBodyProps): ReactNode {
  const warning = repeatWarning(document, origin, uid, path);

  function withWarning(content: ReactNode): ReactNode {
    return (
      <>
        {warning === null ? null : (
          <p aria-live="polite" className="text-danger-text">
            {warning}
          </p>
        )}
        {content}
      </>
    );
  }

  if (path.kind === 'window') {
    return withWarning(<WindowForm store={store} document={document} />);
  }

  const template = document.templates[path.template];

  if (template === undefined) {
    return null;
  }

  const remove = <RemoveButton store={store} uid={uid} />;

  if (path.kind === 'template') {
    return withWarning(
      <>
        <TemplateForm store={store} template={template} />
        {remove}
      </>,
    );
  }

  const tab = template.tabs[path.tab];

  if (tab === undefined) {
    return null;
  }

  if (path.kind === 'tab') {
    return withWarning(
      <>
        <TabForm store={store} template={template} tab={tab} path={path} />
        {remove}
      </>,
    );
  }

  const section = tab.sections[path.section];

  if (section === undefined) {
    return null;
  }

  if (path.kind === 'section') {
    return withWarning(
      <>
        <SectionForm store={store} template={template} section={section} path={path} />
        {remove}
      </>,
    );
  }

  if (path.kind === 'row') {
    const row = section.rows[path.row];

    if (row === undefined) {
      return null;
    }

    return withWarning(
      <>
        <RowForm store={store} template={template} row={row} path={path} />
        {remove}
      </>,
    );
  }

  const cell = section.rows[path.row]?.cells[path.cell];

  if (cell === undefined) {
    return null;
  }

  return withWarning(
    <>
      <CellForm store={store} template={template} cell={cell} path={path} />
      {remove}
    </>,
  );
}

function repeatWarning(
  document: BuilderDocument,
  origin: Preset | null,
  uid: string,
  path: ItemPath,
): string | null {
  if (origin === null || path.kind === 'window' || path.kind === 'cell') {
    return null;
  }

  const originalId = document.originRepeatIds?.get(uid);
  const currentId = repeatIdAt(document, path);

  return originalId !== undefined && currentId !== originalId
    ? copy.builder.repeatBlocksErased(originalId)
    : null;
}

function repeatIdAt(
  document: BuilderDocument,
  path: Exclude<ItemPath, { kind: 'window' | 'cell' }>,
): string | undefined {
  const template = document.templates[path.template];

  if (path.kind === 'template') {
    return template?.repeat === undefined ? undefined : template.id;
  }

  const tab = template?.tabs[path.tab];

  if (path.kind === 'tab') return tab?.repeat?.id;

  const section = tab?.sections[path.section];

  if (path.kind === 'section') return section?.repeat?.id;

  return section?.rows[path.row]?.repeat?.id;
}

function formHeading(document: BuilderDocument, path: ItemPath): string {
  if (path.kind === 'window') {
    const size = document.window ?? DEFAULT_WINDOW_SIZE;

    return copy.builder.windowItem(size.width, size.height);
  }

  const template = document.templates[path.template];

  if (path.kind === 'template') {
    return template?.title.trim() === '' || template === undefined
      ? copy.builder.untitled
      : template.title;
  }

  const tab = template?.tabs[path.tab];

  if (path.kind === 'tab') {
    return tab?.title === undefined || tab.title.trim() === ''
      ? copy.builder.untitledTab
      : tab.title;
  }

  const section = tab?.sections[path.section];

  if (path.kind === 'section') {
    return section?.title === undefined || section.title.trim() === ''
      ? copy.builder.untitledSection
      : section.title;
  }

  if (path.kind === 'row') {
    return copy.builder.rowItem(path.row + 1);
  }

  const cell = section?.rows[path.row]?.cells[path.cell];

  return cell === undefined ? '' : cellItemLabel(cell);
}

function RemoveButton({ store, uid }: { store: BuilderStore; uid: string }): ReactNode {
  return (
    <div>
      <Button
        onPress={() => {
          store.edit((document) => removeItem(document, uid));
        }}
      >
        {copy.command.delete}
      </Button>
    </div>
  );
}

function WindowForm({
  store,
  document,
}: {
  store: BuilderStore;
  document: BuilderDocument;
}): ReactNode {
  const hintId = useId();
  const window = document.window;

  return (
    <>
      <CheckInput
        label={copy.builder.form.ownWindowSize}
        checked={window !== undefined}
        describedBy={hintId}
        onChange={(checked) => {
          store.edit((current) => setWindow(current, checked ? DEFAULT_WINDOW_SIZE : undefined));
        }}
      />
      {window === undefined ? null : (
        <div className="flex gap-3">
          <IntegerInput
            label={copy.builder.form.width}
            value={window.width}
            allowEmpty={false}
            minimum={0}
            onValue={(width) => {
              store.edit(
                (current) =>
                  setWindow(current, { width: width ?? 0, height: current.window?.height ?? 0 }),
                'window:width',
              );
            }}
            onBlur={store.endRun}
          />
          <IntegerInput
            label={copy.builder.form.height}
            value={window.height}
            allowEmpty={false}
            minimum={0}
            onValue={(height) => {
              store.edit(
                (current) =>
                  setWindow(current, { width: current.window?.width ?? 0, height: height ?? 0 }),
                'window:height',
              );
            }}
            onBlur={store.endRun}
          />
        </div>
      )}
      <p id={hintId} className={HINT_CLASS}>
        {copy.builder.form.windowHint}
      </p>
    </>
  );
}

type TemplateFormProps = { store: BuilderStore; template: DocTemplate };

function TemplateForm({ store, template }: TemplateFormProps): ReactNode {
  const { uid } = template;
  const form = copy.builder.form;

  function update(change: (current: DocTemplate) => DocTemplate, coalesce?: string): void {
    store.edit((document) => updateTemplate(document, uid, change), coalesce);
  }

  const candidates = nameFieldCandidates(template);
  const set = isSheetSet(template);

  return (
    <>
      <TextInput
        label={form.title}
        value={template.title}
        onChange={(title) => {
          update((current) => ({ ...current, title }), `${uid}:title`);
        }}
        onBlur={store.endRun}
      />
      <IdInput
        label={form.id}
        id={template.id}
        hint={null}
        onCommit={(next) => {
          update((current) => ({ ...current, id: next }));

          return [];
        }}
      />
      {set ? (
        <SelectInput
          label={form.nameField}
          value={template.repeat?.nameField ?? ''}
          options={[...new Set([...candidates, template.repeat?.nameField ?? ''])].flatMap((id) =>
            id === '' ? [] : [{ value: id, label: id }],
          )}
          onChange={(nameField) => {
            update((current) =>
              isSheetSet(current)
                ? { ...current, repeat: { ...current.repeat, nameField } }
                : current,
            );
          }}
        />
      ) : null}
      <CheckInput
        label={form.repeat}
        checked={set}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) => withTemplateKind(current, checked ? 'set' : 'single'));
        }}
      />
      <SelectInput
        label={form.visibility}
        value={template.visibility === 'gm' ? 'gm' : 'all'}
        options={[
          { value: 'all', label: form.visibilityAll },
          { value: 'gm', label: form.visibilityGm },
        ]}
        onChange={(visibility) => {
          update((current) =>
            withOption(current, 'visibility', visibility === 'gm' ? 'gm' : undefined),
          );
        }}
      />
      <CheckInput
        label={form.playersEdit}
        checked={template.players === 'edit'}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) => withOption(current, 'players', checked ? 'edit' : undefined));
        }}
      />
    </>
  );
}

// CAP-34: a tab's title, which a template with one tab may leave empty, and who sees it. `gm` hides
// the tab from players; the key is kept.
function TabForm({
  store,
  template,
  tab,
  path,
}: {
  store: BuilderStore;
  template: DocTemplate;
  tab: DocTab;
  path: Extract<ItemPath, { kind: 'tab' }>;
}): ReactNode {
  const { uid } = tab;
  const form = copy.builder.form;

  function update(change: (current: DocTab) => DocTab, coalesce?: string): void {
    store.edit((document) => updateTab(document, uid, change), coalesce);
  }

  const candidates = repeatNameFieldCandidates(template, path);

  const options = (current: DocTab) =>
    [...new Set([...candidates, current.repeat?.nameField ?? ''])].flatMap((id) =>
      id === '' ? [] : [{ value: id, label: id }],
    );

  return (
    <>
      <TextInput
        label={form.title}
        value={tab.title ?? ''}
        onChange={(title) => {
          update(
            (current) => withOption(current, 'title', title === '' ? undefined : title),
            `${uid}:title`,
          );
        }}
        onBlur={store.endRun}
      />
      <SelectInput
        label={form.visibility}
        value={tab.visibility === 'gm' ? 'gm' : 'all'}
        options={[
          { value: 'all', label: form.visibilityAll },
          { value: 'gm', label: form.visibilityGm },
        ]}
        onChange={(visibility) => {
          update((current) =>
            withOption(current, 'visibility', visibility === 'gm' ? 'gm' : undefined),
          );
        }}
      />
      <CheckInput
        label={form.repeat}
        checked={tab.repeat !== undefined}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) =>
            withRepeat(
              current,
              checked,
              repeatIdsAt(template, path),
              tab.title ?? copy.builder.untitledTab,
            ),
          );
        }}
      />
      {tab.repeat === undefined ? null : (
        <>
          <IdInput
            label={form.id}
            id={tab.repeat.id}
            hint={null}
            validate={(next) =>
              repeatIdsAt(template, path).has(next) ? copy.builder.repeatIdTaken(next) : null
            }
            onCommit={(id) => {
              update((current) =>
                current.repeat === undefined
                  ? current
                  : { ...current, repeat: { ...current.repeat, id } },
              );

              return [];
            }}
          />
          <SelectInput
            label={form.nameField}
            value={tab.repeat.nameField}
            options={options(tab)}
            onChange={(nameField) => {
              update((current) =>
                current.repeat === undefined
                  ? current
                  : { ...current, repeat: { ...current.repeat, nameField } },
              );
            }}
          />
        </>
      )}
    </>
  );
}

const WIDTHS: readonly { value: NonNullable<PresetSection['width']>; label: string }[] = [
  { value: 'full', label: copy.builder.form.widthFull },
  { value: '1/2', label: copy.builder.form.widthHalf },
  { value: '1/3', label: copy.builder.form.widthThird },
];

function SectionForm({
  store,
  template,
  section,
  path,
}: {
  store: BuilderStore;
  template: DocTemplate;
  section: DocSection;
  path: Extract<ItemPath, { kind: 'section' }>;
}): ReactNode {
  const { uid } = section;
  const form = copy.builder.form;
  const columnsHintId = useId();
  const candidates = repeatNameFieldCandidates(template, path);

  function update(change: (current: DocSection) => DocSection, coalesce?: string): void {
    store.edit((document) => updateSection(document, uid, change), coalesce);
  }

  const options = [...new Set([...candidates, section.repeat?.nameField ?? ''])].flatMap((id) =>
    id === '' ? [] : [{ value: id, label: id }],
  );

  return (
    <>
      <TextInput
        label={form.title}
        value={section.title ?? ''}
        onChange={(title) => {
          update(
            (current) => withOption(current, 'title', title === '' ? undefined : title),
            `${uid}:title`,
          );
        }}
        onBlur={store.endRun}
      />
      <SelectInput
        label={form.sectionWidth}
        value={section.width ?? 'full'}
        options={WIDTHS}
        onChange={(width) => {
          const chosen = WIDTHS.find((option) => option.value === width)?.value;

          update((current) => withOption(current, 'width', chosen === 'full' ? undefined : chosen));
        }}
      />
      <IntegerInput
        label={form.columns}
        value={section.columns}
        allowEmpty
        minimum={1}
        describedBy={columnsHintId}
        onValue={(columns) => {
          update((current) => withOption(current, 'columns', columns), `${uid}:columns`);
        }}
        onBlur={store.endRun}
      />
      <p id={columnsHintId} className={HINT_CLASS}>
        {form.columnsHint}
      </p>
      <SelectInput
        label={form.visibility}
        value={section.visibility === 'gm' ? 'gm' : 'all'}
        options={[
          { value: 'all', label: form.visibilityAll },
          { value: 'gm', label: form.visibilityGm },
        ]}
        onChange={(visibility) => {
          update((current) =>
            withOption(current, 'visibility', visibility === 'gm' ? 'gm' : undefined),
          );
        }}
      />
      <CheckInput
        label={form.repeat}
        checked={section.repeat !== undefined}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) =>
            withRepeat(
              current,
              checked,
              repeatIdsAt(template, path),
              section.title ?? copy.builder.untitledSection,
            ),
          );
        }}
      />
      {section.repeat === undefined ? null : (
        <>
          <IdInput
            label={form.id}
            id={section.repeat.id}
            hint={null}
            validate={(next) =>
              repeatIdsAt(template, path).has(next) ? copy.builder.repeatIdTaken(next) : null
            }
            onCommit={(id) => {
              update((current) =>
                current.repeat === undefined
                  ? current
                  : { ...current, repeat: { ...current.repeat, id } },
              );

              return [];
            }}
          />
          <SelectInput
            label={form.nameField}
            value={section.repeat.nameField}
            options={options}
            onChange={(nameField) => {
              update((current) =>
                current.repeat === undefined
                  ? current
                  : { ...current, repeat: { ...current.repeat, nameField } },
              );
            }}
          />
        </>
      )}
    </>
  );
}

function RowForm({
  store,
  template,
  row,
  path,
}: {
  store: BuilderStore;
  template: DocTemplate;
  row: DocRow;
  path: Extract<ItemPath, { kind: 'row' }>;
}): ReactNode {
  const { uid } = row;
  const form = copy.builder.form;
  const candidates = repeatNameFieldCandidates(template, path);

  const options = [...new Set([...candidates, row.repeat?.nameField ?? ''])].flatMap((id) =>
    id === '' ? [] : [{ value: id, label: id }],
  );

  function update(change: (current: DocRow) => DocRow): void {
    store.edit((document) => updateRow(document, uid, change));
  }

  return (
    <>
      <SelectInput
        label={form.visibility}
        value={row.visibility === 'gm' ? 'gm' : 'all'}
        options={[
          { value: 'all', label: form.visibilityAll },
          { value: 'gm', label: form.visibilityGm },
        ]}
        onChange={(visibility) => {
          update((current) =>
            withOption(current, 'visibility', visibility === 'gm' ? 'gm' : undefined),
          );
        }}
      />
      <CheckInput
        label={form.repeat}
        checked={row.repeat !== undefined}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) =>
            withRepeat(
              current,
              checked,
              repeatIdsAt(template, path),
              copy.builder.rowItem(path.row + 1),
            ),
          );
        }}
      />
      {row.repeat === undefined ? null : (
        <>
          <IdInput
            label={form.id}
            id={row.repeat.id}
            hint={null}
            validate={(next) =>
              repeatIdsAt(template, path).has(next) ? copy.builder.repeatIdTaken(next) : null
            }
            onCommit={(id) => {
              update((current) =>
                current.repeat === undefined
                  ? current
                  : { ...current, repeat: { ...current.repeat, id } },
              );

              return [];
            }}
          />
          <SelectInput
            label={form.nameField}
            value={row.repeat.nameField}
            options={options}
            onChange={(nameField) => {
              update((current) =>
                current.repeat === undefined
                  ? current
                  : { ...current, repeat: { ...current.repeat, nameField } },
              );
            }}
          />
        </>
      )}
    </>
  );
}

type CellFormProps = {
  store: BuilderStore;
  template: DocTemplate;
  cell: DocCell;
  path: Extract<ItemPath, { kind: 'cell' }>;
};

function CellForm({ store, template, cell, path }: CellFormProps): ReactNode {
  const { uid } = cell;
  const form = copy.builder.form;
  const formulaId = useId();
  const formulaHintId = useId();

  function update(change: (current: DocCell) => DocCell, coalesce?: string): void {
    store.edit((document) => updateCell(document, uid, change), coalesce);
  }

  if (cell.kind === 'text') {
    return (
      <TextInput
        label={form.text}
        value={cell.text}
        onChange={(text) => {
          update(
            (current) => (current.kind === 'text' ? { ...current, text } : current),
            `${uid}:text`,
          );
        }}
        onBlur={store.endRun}
      />
    );
  }

  if (cell.kind === 'dice') {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={formulaId} className={LABEL_CLASS}>
          {form.formula}
        </label>
        <FormulaInput
          id={formulaId}
          value={cell.formula}
          fieldIds={formulaFieldIds(template, path)}
          describedBy={formulaHintId}
          invalid={false}
          onChange={(formula) => {
            update(
              (current) => (current.kind === 'dice' ? { ...current, formula } : current),
              `${uid}:formula`,
            );
          }}
          onBlur={store.endRun}
        />
        <p id={formulaHintId} className={HINT_CLASS}>
          {form.formulaHint}
        </p>
        <TextInput
          label={form.name}
          hint={form.nameHint}
          value={cell.name ?? ''}
          onChange={(name) => {
            update(
              (current) =>
                current.kind === 'dice'
                  ? withOption(current, 'name', name.trim() === '' ? undefined : name)
                  : current,
              `${uid}:name`,
            );
          }}
          onBlur={store.endRun}
        />
      </div>
    );
  }

  if (cell.kind === 'token') {
    return (
      <IdInput
        label={form.id}
        id={cell.id}
        hint={null}
        onCommit={(id) => {
          update((current) => (current.kind === 'token' ? { ...current, id } : current));

          return [];
        }}
      />
    );
  }

  const uses = fieldFormulaCount(templateToPreset(template), {
    tabIndex: path.tab,
    sectionIndex: path.section,
    rowIndex: path.row,
    cellIndex: path.cell,
  });

  return (
    <>
      <SelectInput
        label={form.fieldType}
        value={cell.type}
        options={[
          { value: 'text', label: form.typeText },
          { value: 'number', label: form.typeNumber },
          { value: 'check', label: form.typeCheck },
          { value: 'select', label: form.typeSelect },
          { value: 'dice-choice', label: form.typeDiceChoice },
        ]}
        onChange={(type) => {
          if (
            type === 'text' ||
            type === 'number' ||
            type === 'check' ||
            type === 'select' ||
            type === 'dice-choice'
          ) {
            update((current) =>
              current.kind === 'field' ? withFieldType(current, type) : current,
            );
          }
        }}
      />
      {cell.type === 'select' || cell.type === 'dice-choice' ? (
        <OptionsInput
          options={cell.options}
          onChange={(options) => {
            update(
              (current) =>
                current.kind === 'field' &&
                (current.type === 'select' || current.type === 'dice-choice')
                  ? { ...current, options }
                  : current,
              `${uid}:options`,
            );
          }}
          onBlur={store.endRun}
        />
      ) : null}
      <TextInput
        label={form.name}
        hint={form.nameHint}
        value={cell.name ?? ''}
        onChange={(name) => {
          update(
            (current) =>
              current.kind === 'field'
                ? withOption(current, 'name', name.trim() === '' ? undefined : name)
                : current,
            `${uid}:name`,
          );
        }}
        onBlur={store.endRun}
      />
      <IdInput
        label={form.fieldId}
        id={cell.id}
        hint={form.fieldUses(uses)}
        validate={(next) => {
          if (!isFieldId(next)) return null;

          const scope = relatedScopeFieldConflict(store.$state.get().step.document, uid, next);

          return scope === null ? null : copy.builder.fieldIdTaken(next, scope);
        }}
        onCommit={(next) => {
          const renamed = renameField(store.$state.get().step.document, uid, next);

          if (renamed === null) {
            return [];
          }

          store.edit(() => renamed);

          return [copy.builder.formulasChanged(renamed.formulas)];
        }}
      />
    </>
  );
}

type OptionsInputProps = {
  options: readonly string[];
  onChange: (options: string[]) => void;
  onBlur: () => void;
};

function OptionsInput({ options, onChange, onBlur }: OptionsInputProps): ReactNode {
  const id = useId();
  const [text, setText] = useState(() => options.join('\n'));
  const [committed, setCommitted] = useState(() => options.join('\n'));
  const serialized = options.join('\n');

  // A store change from undo/redo or another form replaces the draft, but normal typing keeps its
  // raw whitespace and blank lines while the document stores the normalized options.
  if (serialized !== committed) {
    setCommitted(serialized);
    setText(serialized);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {copy.builder.form.selectOptions}
      </label>
      <textarea
        id={id}
        className={INPUT_CLASS}
        rows={Math.max(2, text.split('\n').length)}
        value={text}
        onChange={(event) => {
          const nextText = event.target.value;
          const nextOptions = normalizedOptions(nextText);

          setText(nextText);
          setCommitted(nextOptions.join('\n'));
          onChange(nextOptions);
        }}
        onBlur={onBlur}
      />
    </div>
  );
}

function normalizedOptions(text: string): string[] {
  return text
    .split('\n')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

// Inputs.

type TextInputProps = {
  label: string;
  value: string;
  hint?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

function TextInput({ label, value, hint, onChange, onBlur }: TextInputProps): ReactNode {
  const id = useId();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={INPUT_CLASS}
        aria-describedby={hint === undefined ? undefined : hintId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
      />
      {hint === undefined ? null : (
        <p id={hintId} className={HINT_CLASS}>
          {hint}
        </p>
      )}
    </div>
  );
}

type IdInputProps = {
  label: string;
  id: string;
  hint: string | null;
  validate?: (next: string) => string | null;
  // Applies the new id and returns the messages to show under the input.
  onCommit: (next: string) => readonly string[];
};

// AD-24: an id commits on `Enter` or when the focus leaves, as one rename. `Esc` returns the input
// to the current id.
function IdInput({ label, id, hint, validate, onCommit }: IdInputProps): ReactNode {
  const inputId = useId();
  const hintId = useId();
  const messagesId = useId();
  const [text, setText] = useState(id);
  const [shownId, setShownId] = useState(id);
  const [messages, setMessages] = useState<readonly string[]>([]);
  const [rejected, setRejected] = useState(false);

  // Undo, redo and the rename itself change the id under the input.
  if (shownId !== id) {
    setShownId(id);
    setText(id);
  }

  function commit(): void {
    if (text !== id) {
      const error = validate?.(text);

      if (error !== null && error !== undefined) {
        setMessages([error]);
        setRejected(true);

        return;
      }

      setMessages(onCommit(text));
      setRejected(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        aria-describedby={[hint === null ? null : hintId, messagesId]
          .filter((part) => part !== null)
          .join(' ')}
        className={clsx(INPUT_CLASS, 'font-[ui-monospace,monospace]')}
        aria-invalid={rejected || undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);

          if (event.target.value === id) {
            setMessages([]);
            setRejected(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            return;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setText(id);
            setMessages([]);
            setRejected(false);
          }
        }}
        onBlur={commit}
      />
      {hint === null ? null : (
        <p id={hintId} className={HINT_CLASS}>
          {hint}
        </p>
      )}
      <div id={messagesId} aria-live="polite" className="flex flex-col gap-1" data-builder-rename>
        {messages.map((message) => (
          <p key={message} className={clsx(rejected && 'text-danger-text')}>
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}

type IntegerInputProps = {
  label: string;
  value: number | undefined;
  allowEmpty: boolean;
  minimum: number;
  describedBy?: string;
  onValue: (value: number | undefined) => void;
  onBlur: () => void;
};

const DIGITS = /^\d+$/;

// A whole number. Text that is not one stays in the input and changes nothing, so the document
// keeps a valid structure.
function IntegerInput({
  label,
  value,
  allowEmpty,
  minimum,
  describedBy,
  onValue,
  onBlur,
}: IntegerInputProps): ReactNode {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [shownValue, setShownValue] = useState(value);

  if (shownValue !== value) {
    setShownValue(value);
    setText(value === undefined ? '' : String(value));
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-describedby={describedBy}
        className={clsx(INPUT_CLASS, 'max-w-[120px]')}
        value={text}
        onChange={(event) => {
          const next = event.target.value.trim();

          setText(event.target.value);

          if (next === '' && allowEmpty) {
            onValue(undefined);
          } else if (
            DIGITS.test(next) &&
            Number.isSafeInteger(Number(next)) &&
            Number(next) >= minimum
          ) {
            onValue(Number(next));
          }
        }}
        onBlur={() => {
          setText(value === undefined ? '' : String(value));
          onBlur();
        }}
      />
    </div>
  );
}

type SelectOption = { value: string; label: string };

type SelectInputProps = {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
};

function SelectInput({ label, value, options, onChange }: SelectInputProps): ReactNode {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        className={clsx(SELECT_CLASS, 'self-start')}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type CheckInputProps = {
  label: string;
  checked: boolean;
  describedBy: string | undefined;
  onChange: (checked: boolean) => void;
};

function CheckInput({ label, checked, describedBy, onChange }: CheckInputProps): ReactNode {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="size-4 accent-accent"
        checked={checked}
        aria-describedby={describedBy}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {label}
    </label>
  );
}
