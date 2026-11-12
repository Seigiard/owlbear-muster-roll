import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { fieldFormulaCount } from '@/core/formula-rename';
import { DEFAULT_WINDOW_SIZE, type Preset, type PresetSection } from '@/core/preset';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';

import type { BuilderStore } from './builder-store';
import {
  formulaFieldIds,
  locate,
  nameFieldCandidates,
  PRESET_UID,
  removeItem,
  renameField,
  setWindow,
  templateToPreset,
  updateCell,
  updateSection,
  updateTemplate,
  withOption,
  withFieldType,
  withRepeat,
  withTemplateKind,
  type BuilderDocument,
  type DocCell,
  type DocSection,
  type DocTemplate,
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

  const messages = problems
    .filter((problem) => problem.uid === selection)
    .map((problem) => problemReason(problem.failure));

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
      className="flex flex-col gap-3 rounded-md bg-surface p-3"
      data-builder-form
    >
      <h2 id={headingId} className="text-section-heading">
        {path === null ? copy.section.preset : formHeading(document, path)}
      </h2>
      {messages.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-danger-text" data-builder-problems>
          {messages.map((message, index) => (
            <li key={index}>{message}</li>
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
  if (path.kind === 'window') {
    return <WindowForm store={store} document={document} />;
  }

  const template = document.templates[path.template];

  if (template === undefined) {
    return null;
  }

  const remove = <RemoveButton store={store} uid={uid} />;

  if (path.kind === 'template') {
    return (
      <>
        <TemplateForm store={store} template={template} origin={origin} />
        {remove}
      </>
    );
  }

  const section = template.sections[path.section];

  if (section === undefined) {
    return null;
  }

  if (path.kind === 'section') {
    return (
      <>
        <SectionForm store={store} section={section} />
        {remove}
      </>
    );
  }

  if (path.kind === 'row') {
    return remove;
  }

  const cell = section.rows[path.row]?.cells[path.cell];

  if (cell === undefined) {
    return null;
  }

  return (
    <>
      <CellForm store={store} template={template} origin={origin} cell={cell} path={path} />
      {remove}
    </>
  );
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

  const section = template?.sections[path.section];

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

type TemplateFormProps = { store: BuilderStore; template: DocTemplate; origin: Preset | null };

function TemplateForm({ store, template, origin }: TemplateFormProps): ReactNode {
  const { uid } = template;
  const form = copy.builder.form;

  function update(change: (current: DocTemplate) => DocTemplate, coalesce?: string): void {
    store.edit((document) => updateTemplate(document, uid, change), coalesce);
  }

  const candidates = nameFieldCandidates(template);

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
          const oldId = template.id;

          update((current) => ({ ...current, id: next }));

          return origin?.templates.some((other) => other.id === oldId) === true
            ? [copy.builder.templateSheetsDeleted(oldId)]
            : [];
        }}
      />
      <SelectInput
        label={form.kind}
        value={template.kind}
        options={[
          { value: 'set', label: form.kindSet },
          { value: 'single', label: form.kindSingle },
        ]}
        onChange={(kind) => {
          if (kind === 'set' || kind === 'single') {
            update((current) => withTemplateKind(current, kind));
          }
        }}
      />
      {template.kind === 'set' ? (
        <SelectInput
          label={form.nameField}
          value={template.nameField}
          options={[...new Set([...candidates, template.nameField])].map((id) => ({
            value: id,
            label: id,
          }))}
          onChange={(nameField) => {
            update((current) => (current.kind === 'set' ? { ...current, nameField } : current));
          }}
        />
      ) : null}
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
      {template.kind === 'single' ? (
        <CheckInput
          label={form.playersEdit}
          checked={template.players === 'edit'}
          describedBy={undefined}
          onChange={(checked) => {
            update((current) =>
              current.kind === 'single'
                ? withOption(current, 'players', checked ? 'edit' : undefined)
                : current,
            );
          }}
        />
      ) : null}
      <CheckInput
        label={form.templateTokens}
        checked={template.tokens === true}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) => withOption(current, 'tokens', checked ? true : undefined));
        }}
      />
    </>
  );
}

const WIDTHS: readonly { value: NonNullable<PresetSection['width']>; label: string }[] = [
  { value: 'full', label: copy.builder.form.widthFull },
  { value: '1/2', label: copy.builder.form.widthHalf },
  { value: '1/3', label: copy.builder.form.widthThird },
];

function SectionForm({ store, section }: { store: BuilderStore; section: DocSection }): ReactNode {
  const { uid } = section;
  const form = copy.builder.form;
  const columnsHintId = useId();

  function update(change: (current: DocSection) => DocSection, coalesce?: string): void {
    store.edit((document) => updateSection(document, uid, change), coalesce);
  }

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
      <CheckInput
        label={form.repeat}
        checked={section.repeat === true}
        describedBy={undefined}
        onChange={(checked) => {
          update((current) => withRepeat(current, checked));
        }}
      />
      {section.repeat === true ? (
        <CheckInput
          label={form.blockTokens}
          checked={section.tokens === true}
          describedBy={undefined}
          onChange={(checked) => {
            update((current) => withOption(current, 'tokens', checked ? true : undefined));
          }}
        />
      ) : null}
    </>
  );
}

type CellFormProps = {
  store: BuilderStore;
  template: DocTemplate;
  origin: Preset | null;
  cell: DocCell;
  path: Extract<ItemPath, { kind: 'cell' }>;
};

function CellForm({ store, template, origin, cell, path }: CellFormProps): ReactNode {
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
          fieldIds={formulaFieldIds(template, path.section)}
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
      </div>
    );
  }

  const uses = fieldFormulaCount(templateToPreset(template), {
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
        ]}
        onChange={(type) => {
          if (type === 'text' || type === 'number' || type === 'check' || type === 'select') {
            update((current) =>
              current.kind === 'field' ? withFieldType(current, type) : current,
            );
          }
        }}
      />
      {cell.type === 'select' ? (
        <OptionsInput
          options={cell.options}
          onChange={(options) => {
            update(
              (current) =>
                current.kind === 'field' && current.type === 'select'
                  ? { ...current, options }
                  : current,
              `${uid}:options`,
            );
          }}
          onBlur={store.endRun}
        />
      ) : null}
      <IdInput
        label={form.fieldId}
        id={cell.id}
        hint={form.fieldUses(uses)}
        onCommit={(next) => {
          const oldId = cell.id;
          const renamed = renameField(store.$state.get().step.document, uid, next);

          if (renamed === null) {
            return [];
          }

          store.edit(() => renamed);

          const fromFile = origin?.templates
            .find((other) => other.id === template.id)
            ?.sections.some((section) =>
              section.rows.some((row) =>
                row.some((other) => other.kind === 'field' && other.id === oldId),
              ),
            );

          return [
            copy.builder.formulasChanged(renamed.formulas),
            ...(fromFile === true ? [copy.builder.fieldValuesErased(oldId)] : []),
          ];
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
  onChange: (value: string) => void;
  onBlur: () => void;
};

function TextInput({ label, value, onChange, onBlur }: TextInputProps): ReactNode {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={INPUT_CLASS}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
      />
    </div>
  );
}

type IdInputProps = {
  label: string;
  id: string;
  hint: string | null;
  // Applies the new id and returns the messages to show under the input.
  onCommit: (next: string) => readonly string[];
};

// AD-24: an id commits on `Enter` or when the focus leaves, as one rename. `Esc` returns the input
// to the current id.
function IdInput({ label, id, hint, onCommit }: IdInputProps): ReactNode {
  const inputId = useId();
  const hintId = useId();
  const messagesId = useId();
  const [text, setText] = useState(id);
  const [shownId, setShownId] = useState(id);
  const [messages, setMessages] = useState<readonly string[]>([]);

  // Undo, redo and the rename itself change the id under the input.
  if (shownId !== id) {
    setShownId(id);
    setText(id);
  }

  function commit(): void {
    if (text !== id) {
      setMessages(onCommit(text));
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
        className={`${INPUT_CLASS} font-[ui-monospace,monospace]`}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setText(id);
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
          <p key={message}>{message}</p>
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
        className={`${INPUT_CLASS} max-w-[120px]`}
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
        className={`${SELECT_CLASS} self-start`}
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
