# Preset file format

A preset is a JSON file that lists the templates of one room. Each template is a sheet set or a single sheet, with its own tabs of sections. A preset holds no values. Values are stored apart from it, by field id. The GM uploads it with "Загрузить пресет" and gets it back with "Скачать пресет".

- A **sheet set** (`"kind": "set"`) is a template that GMs create any number of sheets from, such as the party. Its name field gives each sheet its tab name.
- A **single sheet** (`"kind": "single"`) exists exactly once in the room, such as NPCs, a shared inventory, a story log or a spell list. Its tab name is its `title`. Nobody creates or deletes it.

The window shows one tab per sheet, in the order of the list. A sheet splits into tabs of its own (see Tab below), and shows one of them at a time.

`docs/example-preset.json` is a complete preset. A test parses it, so it stays valid.

## Shape

```
{ v, window?, templates: Template[] }
Window   = { width, height }
Template = { id, kind: "set", title, nameField, visibility?, tokens?, tabs: Tab[] }
         | { id, kind: "single", title, visibility?, players?, tokens?, tabs: Tab[] }
Tab      = { title?, visibility?, sections: Section[] }
Section  = { title?, width?, columns?, repeat?, tokens?, rows: Cell[][] }
Cell     = { kind: "text", text } | { kind: "field", type, id, name?, options? } | { kind: "dice", formula, name? }
```

Every object is strict. A key that is not in this document makes the file invalid.

## Keys

### File

| Key | Type | Meaning |
| --- | --- | --- |
| `v` | integer, required | Format version. The current version is `3`. |
| `window` | `{ width, height }`, optional | The size of the action window in px, for every client. Both keys are required integers, and no other key is allowed. Without `window` the window is 600 by 600 px. "Скачать пресет" writes it back after `v`. |
| `templates` | Template array, required, at least one | The sheet sets and single sheets of the room, in tab order. |

### Template

| Key | Type | Meaning |
| --- | --- | --- |
| `id` | string, required | The stable id of the template. Its values are stored under it. It follows the id rules below, and no two templates share it. Changing it in an upload removes the template and adds a new one. |
| `kind` | `"set"` or `"single"`, required | A sheet set or a single sheet. Changing it in an upload removes the template and adds a new one. |
| `title` | string, required | A single sheet's tab name. For a sheet set: the name of its "+" ("Добавить: {title}") and of its group in the link picker. |
| `nameField` | string, required on a sheet set, not allowed on a single sheet | The id of a `field` of type `text`, outside `repeat` sections of this template. Its value is the tab name of each sheet. An empty value shows "Без имени". |
| `visibility` | `"all"` or `"gm"`, optional | `"all"` (the default): players see the template's sheets. `"gm"`: only the GM sees them, rolls from them show only on GM clients, and players get no token menu on them. Hiding is in the interface only: any client can read the room copy. |
| `players` | `"edit"`, optional, on a single sheet only | Every player may edit the single sheet. Without it, players read it only. A sheet of a sheet set takes write access per player from the GM, in the "Доступ" panel. A hidden single sheet takes no player edit. |
| `tokens` | `true`, optional | A token can link to the whole sheet, such as a chest token that opens Инвентарь. |
| `tabs` | Tab array, required, at least one | The tabs of the sheet, in display order. |

### Tab

A tab («Вкладка» in the interface) is a titled group of sections inside a sheet. A sheet shows one tab at a time. A template with one tab draws no tab row. With more tabs, the row sits above the sheet's sections, scrolls sideways when the tabs do not fit, and the Left and Right keys move between the tabs. Each client keeps the open tab of each sheet for itself: it is never stored or sent. A token that opens a repeat block opens the tab that holds it.

| Key | Type | Meaning |
| --- | --- | --- |
| `title` | string, optional | The tab's name in the tab row. Required, and not blank, when the template has more than one tab. |
| `visibility` | `"all"` or `"gm"`, optional | Kept in the file. This version does not hide a tab yet: every tab shows to everyone who sees the sheet. |
| `sections` | Section array, required | The sections of the tab, in display order. |

Tabs change only the layout. Field id scopes, the name field, formulas, repeat section ids and stored values are the same for the whole template, across all its tabs. A formula on one tab can use a field on another tab. A section can move to another tab, and its values stay.

### Section

| Key | Type | Meaning |
| --- | --- | --- |
| `title` | string, optional | The section heading. |
| `width` | `"1/3"`, `"1/2"` or `"full"`, optional | The share of the sheet width. The default is `"full"`. Sections flow side by side and wrap as whole sections. |
| `columns` | positive integer, optional | All rows of the section share a grid of this many columns, so the columns align. A shorter row leaves the trailing grid cells empty. A row with more cells than `columns` makes the file invalid. Without `columns`, the cells of a row flow inline. |
| `repeat` | `true`, optional | A repeat section: all its rows form one repeat block. Each sheet has its own list of repeat blocks made from it. |
| `tokens` | `true`, optional, with `repeat` only | Each repeat block can link to its own token. The token opens the sheet scrolled to that repeat block. The repeat block's first field is offered as the token label. |
| `rows` | array of Cell arrays, required | The rows of the section. Each row is an array of cells. |

### Cell

| `kind` | Other keys | Meaning |
| --- | --- | --- |
| `"text"` | `text`: string | A fixed label. It has no value. A label cannot have `name`. |
| `"field"` | `type`: `"text"`, `"number"`, `"check"`, `"select"` or `"dice-choice"`; `id`: string; `name?`: string | A value that the GM fills in. The `id` is the key of its value. A `select` or `dice-choice` field also has required `options`: a non-empty list of distinct, non-blank strings. |
| `"dice"` | `formula`: string; `name?`: string | A dice cell that rolls the formula. It has no value. |

A `select` field offers the empty choice «—» followed by its `options` in order. The empty choice
clears the field. Stored values are strings; a value that is no longer in `options` remains visible
until the picker replaces it.

A `dice-choice` field is a select field whose options are die sizes. Each option is `d` followed by
an integer from 1 to 1000, with no leading zero, such as `d4`, `d20` or `d100`. Its picker, empty
choice, stale values and option rules are the same as for a `select` field.

### Cell names

The optional `name` key gives a field or dice cell a stable name in compact layouts. It is the
accessible name of a field, the accessible name and tooltip text of a dice cell, and the name shown
for the cell in a roll. A label (`text`) cannot have this key.

The value must contain a non-space character and be no longer than 60 Unicode characters. The
preset check refuses an empty or spaces-only value, and a value over 60 characters. The refusal
message names a field by its `id` and a dice cell by its `formula`.

The cell's label is its name, then the nearest preceding label with visible text in the same row,
then the field `id` or the dice `formula`. A named field or dice cell shows its name in a tooltip on
pointer hover and keyboard, pointer or touch focus. The tooltip stays outside the control. A named
read-only value is a Tab stop. The dice button's visible text does not change: it still shows the
preceding label or its formula.

For accessibility, start a dice name with the text visible on its button. This follows WCAG 2.5.3:
the accessible name starts with the visible label, so speech input users can activate the button.

## Ids

- A field id or an template id matches `^[A-Za-z_][A-Za-z0-9_]*$`.
- An id cannot look like a dice term, such as `d20` or `D6`.
- An id cannot be `floor` or `ceil`, because formulas call them.
- An id cannot be a member name of `Object.prototype`, such as `constructor`, `__proto__` or `toString`.
- A template id is at most 64 characters.

### Scopes

- All fields outside `repeat` sections in one template, across all its tabs, are one scope. An id is unique in its scope.
- All fields of one `repeat` section, across its rows, are a scope of their own.
- Each template is separate. One field id can occur in two templates.
- One id can occur in a `repeat` section and outside it.

### Repeat sections

- A `repeat` section needs at least one row with at least one field.
- The id of the first field of the section, in row order, identifies the section. Two `repeat` sections of one template cannot start with the same id.
- A formula in a repeat block resolves an id inside its own repeat block first, then among the template's fields outside `repeat` sections.

## Dice formulas

A formula holds:

- integer literals, such as `2`;
- field ids, such as `str`;
- `+`, `-`, `*`, `/` and parentheses;
- `floor(...)` and `ceil(...)`;
- dice terms `NdM` or `NDM`, with a literal `N` from 1 to 100 and a literal `M` from 1 to 1000;
- dice-choice terms `Nd(id)` or `ND(id)`, with a literal `N` from 1 to 100 and optional spaces around
  the field id;
- at most one comparison from `<=`, `<`, `>=`, `>`, outside parentheses. A comparison makes the roll a check: success when it holds.

Grammar:

```
comparison = sum [('<=' | '<' | '>=' | '>') sum]
sum        = product (('+' | '-') product)*
product    = atom (('*' | '/') atom)*
atom       = integer | dice | dice-choice | id | call | '(' sum ')'
call       = ('floor' | 'ceil') '(' sum ')'
```

- Minus is binary only. `-1` is a syntax error.
- A letter, digit or `_` right after a number or a dice term is a syntax error, such as `1d6x`.
- A formula is at most 200 characters.
- A check field counts as 0 or 1.
- A formula can name any valid id. An id that is not on the sheet is an error when the GM rolls, not at upload.

Examples: `1d20 <= str - 2*str_tired`, `floor(a/2)+ceil(b)`, `2D6+1`, `1d(weapon_die) + bonus`.

Before a roll, `Nd(id)` becomes the literal `NdM` from the selected dice-choice field. An empty or
non-die value, such as `Меч`, shows a field error and does not roll. A stale value that is still a
die size, such as `d8` after it was removed from the options, still rolls that die. A formula that
uses a dice-choice field outside `Nd(id)`, or uses another field type inside `Nd(id)`, is refused
when the preset is uploaded. An unknown id inside `Nd(id)` is accepted and gives a field error only
when rolled.

## Preset changes

An upload over existing sheets keeps values by field id. One confirmation names what is lost:

| Change in the file | Effect on the room |
| --- | --- |
| Add a field | The field is empty |
| Remove a field | Its values are erased |
| Rename a field label (same id) | Keeps its values |
| Add, change or remove a cell name | Keeps its values |
| Change only a select field's `options` (same id and type) | Keeps its values |
| Change only a dice-choice field's `options` (same id and type) | Keeps its values |
| Change a field's type (same id) | Counts as a removal: its values are erased |
| Change `select` to `dice-choice`, or `dice-choice` to `select` | Counts as a removal: its values are erased |
| Add a template | A single sheet tab appears empty; a sheet set shows its "+" |
| Remove a template, or change its `id` or `kind` | Its sheets are deleted with their values, token links, owners and write access |
| Remove `tokens`, or the repeat block or sheet a token links to | That token link is removed. It is not counted in the confirmation |

## Limits

- A file over 1 MiB is refused before it is read.
- The preset is stored deflated and base64-encoded in one record. A preset that cannot fit one message after that is refused as too large.
- `window.width` is from 480 to 1440 px, and `window.height` is from 360 to 1080 px. Both bounds are inclusive.
- A cell name is at most 60 Unicode characters. It must contain a non-space character.

## Versions

- A file with a `v` higher than the current version is refused with "Файл из более новой версии. Перезагрузите страницу.". A newer build of the extension can read it.
- A file with no `v`, a `v` that is not an integer, or a lower `v` is refused. Older presets are not converted: rewrite them in this format. For a version 2 preset, put the `sections` of each template into `"tabs": [{ "sections": [...] }]` and set `"v": 3`. Version 1 presets (with `character` and `npc`) need a full rewrite.
- "Скачать пресет" always writes the current `v`.

## Refused files

A refused file changes nothing. The message under the button names the first problem found:

| Problem | Reason in the message |
| --- | --- |
| The file is not JSON | это не JSON |
| `window` is not an object with integer `width` and `height` in range, or has another key | в window нужны только width и height, целые числа: ширина от 480 до 1440 px, высота от 360 до 1080 px |
| An unknown key, cell kind, field type, `kind` or `width`, a missing key, an empty `templates`, an empty `tabs`, `nameField` on a single sheet, `players` on a sheet set, or `tokens` on a section without `repeat` | неверная структура |
| No `v`, or a `v` that is lower or not an integer | неподдерживаемая версия формата |
| An template id breaks the id rules | недопустимый id листа «{id}» |
| Two templates share an id | лист «{id}» повторяется |
| A template has more than one tab, and a tab has no title or a blank one | в листе «{id}» больше одной вкладки, и у вкладки нет заголовка |
| A sheet set's `nameField` names no `text` field outside its `repeat` sections | в наборе «{id}» нет текстового поля «{nameField}» вне повторяемых секций |
| A field id breaks the id rules | недопустимый id поля «{id}» |
| An id repeats in one scope | поле «{id}» повторяется |
| A select field has no options | у поля «{id}» нет вариантов |
| A select field has an empty or spaces-only option | пустой вариант в поле «{id}» |
| A select field repeats an option | вариант «{option}» повторяется в поле «{id}» |
| A dice-choice field has an option that is not `d1` to `d1000` | вариант «{option}» в поле «{id}» не кубик вида d6 |
| A field or dice cell has an empty or spaces-only name | пустое название у поля «{id}» or пустое название у кубика «{formula}» |
| A field or dice cell has a name over 60 Unicode characters | название поля «{id}» or название кубика «{formula}» длиннее 60 символов |
| A `repeat` section without a row with a field | в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем |
| Two `repeat` sections start with one id | две повторяемые секции с id «{id}» |
| A row has more cells than `columns` | в строке больше ячеек, чем колонок |
| A formula breaks the formula rules | ошибка в формуле «{formula}» |
| A formula uses a dice-choice field as a number outside `Nd(id)` | в формуле «{formula}» поле «{id}» — выбор кубика, бросайте его как 1d({id}) |
| A formula uses a non-dice field inside `Nd(id)` | в формуле «{formula}» поле «{id}» не выбор кубика |
| The file or the stored preset is too large | файл слишком большой |

## Build a preset without JSON

The builder page, `/builder.html`, makes a preset with no JSON to write. Open it with "Конструктор пресетов" in the Пресет section of Settings. It opens in a new tab. The page starts from an empty preset, an example or a file, and edits it as a tree with a form for each item: template, tab, section, row and cell. A new template starts with one untitled tab; "Добавить вкладку" adds another, and a section can be dragged to another tab. The preview shows the tab of the selected item, and a click on a tab in the preview selects it. "Скачать пресет" is enabled only when the preset has no problems, so each file it gives is one that "Загрузить пресет" accepts.

## Preview a preset

To see a preset while you edit it, with no Owlbear room, run:

```
bun run preview [path/to/preset.json]
```

The command starts the dev server in the mock mode and opens `/preview.html`. The page lists `docs/example-preset.json`, `tests/fixtures/presets/*.json` and `presets/*.json`. Only the `.json` files right in each folder are listed, not those in subfolders. A path given to the command can be anywhere on disk. It joins the list, is marked "(launch file)", and opens first. A relative path is read from the repository root. A path with no file stops the command with an error.

The page draws one sheet of each template read-only, as a player sees it, each in a frame of the preset's window size. A hidden template is drawn too, so its author can see it. Each frame shows the window's tab bar with the sheet's tab, so the sheet gets the same room as in the window. A sheet with more than one tab shows its tab row, and a click switches the tab in that frame. "Sample values" fills every field and gives each repeat section two blocks; off, the sheets are empty, as just after they are added. "Light theme" switches from Owlbear's dark theme. The page address keeps the chosen file and both switches. The address names a launch file by its absolute path, so a link to it works only on the same machine.

Each save of a listed file draws the page again. A file that fails the checks shows the same message as an upload, and the next good save draws the sheets again. Dice cells do not roll. The page never writes to a file.

## Annotated example

This walks through `docs/example-preset.json`.

```jsonc
{
  "v": 3, // the current format version
  "templates": [
    {
      "id": "pc", // values of every sheet of this sheet set are stored under "pc"
      "kind": "set", // a sheet set: the GM adds sheets with its "+"
      "title": "Персонажи", // the "+" reads "Добавить: Персонажи"
      "nameField": "name", // the "name" field below names each tab
      "tokens": true, // a token can link to one of these sheets
      "tabs": [
        { // one tab: the sheet draws no tab row, and its title may be left out
          "sections": [
            {
              "title": "Персонаж",
              "columns": 4, // one grid of four columns
              "rows": [
                [
                  { "kind": "text", "text": "Имя" }, // a fixed label
                  { "kind": "field", "type": "text", "id": "name" }, // the tab name
                ],
                [
                  { "kind": "text", "text": "Класс" },
                  { "kind": "field", "type": "text", "id": "class" },
                  { "kind": "text", "text": "Уровень" },
                  { "kind": "field", "type": "number", "id": "level" }, // a number value
                ],
                [
                  { "kind": "text", "text": "Броня" },
                  { "kind": "field", "type": "select", "id": "armor", "options": ["Нет", "Кожаная", "Кольчуга"] }, // a pick from a list
                ],
              ],
            },
            {
              "title": "Характеристики",
              "width": "1/2", // half the sheet width, beside the next section
              "columns": 4,
              "rows": [
                [
                  { "kind": "text", "text": "Сила" },
                  { "kind": "field", "type": "number", "id": "str" },
                  { "kind": "field", "type": "check", "id": "str_tired", "name": "Сила: усталость" }, // counts as 0 or 1 in a formula
                  { "kind": "dice", "formula": "1d20 <= str - 2*str_tired" }, // a roll-under check
                ],
                // ... "Ловкость" in the same layout, with dex_tired named "Ловкость: усталость" ...
                [
                  { "kind": "text", "text": "Удача" },
                  { "kind": "dice", "formula": "2D6+1" }, // two cells: the last two grid cells stay empty
                ],
              ],
            },
            {
              "title": "Здоровье",
              "width": "1/2",
              // no "columns": the cells of each row flow inline
              "rows": [
                [
                  { "kind": "text", "text": "Хиты" },
                  { "kind": "field", "type": "number", "id": "hp" },
                  { "kind": "text", "text": "из" },
                  { "kind": "field", "type": "number", "id": "hp_max", "name": "Хиты, максимум" },
                ],
                [
                  { "kind": "text", "text": "Отдых" },
                  { "kind": "dice", "formula": "floor(hp_max/2) + ceil(level/3)" }, // ids from other sections
                ],
              ],
            },
            {
              "title": "Атаки",
              "width": "full",
              "columns": 4,
              "repeat": true, // each sheet has its own list of attack repeat blocks
              "rows": [
                // the first field id, "attack", identifies the section
                [
                  { "kind": "field", "type": "text", "id": "attack" },
                  { "kind": "field", "type": "number", "id": "bonus" },
                  { "kind": "text", "text": "Бросок" },
                  { "kind": "dice", "formula": "1d20 + bonus" }, // "bonus" resolves inside the repeat block first
                ],
                [
                  { "kind": "text", "text": "Урон" },
                  { "kind": "field", "type": "dice-choice", "id": "damage_die", "options": ["d4", "d6", "d8", "d10", "d12"] },
                  { "kind": "dice", "formula": "1d(damage_die) + bonus" }, // the chosen die is written into the roll label
                ],
              ],
            },
            // ... "Снаряжение" (repeat, 1/3) and "Заметки" ...
          ],
        },
      ],
    },
    {
      "id": "npc",
      "kind": "single", // a single sheet: one tab, named "NPC"; NPCs are its repeat blocks
      "title": "NPC",
      "visibility": "gm", // only the GM sees it and its rolls
      "tabs": [
        {
          "sections": [
            {
              "title": "Противники",
              "columns": 3,
              "repeat": true,
              "tokens": true, // each NPC repeat block links to its own token; the GM can duplicate one
              "rows": [
                // two rows, one repeat block: every NPC has a name, hits and strength
                [
                  { "kind": "field", "type": "text", "id": "npc_name" }, // the first field: the token label and the duplicate number
                  { "kind": "text", "text": "Хиты" },
                  { "kind": "field", "type": "number", "id": "hp" }, // "hp" is also a "pc" id: templates are separate scopes
                ],
                [
                  { "kind": "text", "text": "Сила" },
                  { "kind": "field", "type": "number", "id": "str" },
                  { "kind": "dice", "formula": "1d20 <= str" },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      "id": "inventory",
      "kind": "single",
      "title": "Инвентарь",
      "players": "edit", // every player may edit it
      "tokens": true, // a chest token can open it
      "tabs": [
        {
          "sections": [
            // ... a repeat section of items, and "Деньги" with "gold" ...
          ],
        },
      ],
    },
  ],
}
```
