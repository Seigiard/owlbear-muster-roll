# Preset file format

A preset is a JSON file that holds the structure of the sheets in one room: a character template and a short NPC template. It holds no values. Values are stored apart from it, by field id. The GM uploads it with "Загрузить пресет" and gets it back with "Скачать пресет".

`docs/example-preset.json` is a complete preset. A test parses it, so it stays valid.

## Shape

```
{ v, window?, character: Template, npc: Template }
Window   = { width, height }
Template = { sections: Section[] }
Section  = { title?, width?, columns?, repeat?, rows: Cell[][] }
Cell     = { kind: "text", text } | { kind: "field", type, id } | { kind: "dice", formula }
```

Every object is strict. A key that is not in this document makes the file invalid.

## Keys

### File

| Key | Type | Meaning |
| --- | --- | --- |
| `v` | integer, required | Format version. The current version is `1`. |
| `window` | `{ width, height }`, optional | The size of the action window in px, for every client. Both keys are required integers, and no other key is allowed. Without `window` the window is 600 by 600 px. "Скачать пресет" writes it back after `v`. |
| `character` | Template, required | The template of every character sheet. |
| `npc` | Template, required | The template of every NPC sheet. |

### Template

| Key | Type | Meaning |
| --- | --- | --- |
| `sections` | Section array, required | The sections of the sheet, in display order. |

### Section

| Key | Type | Meaning |
| --- | --- | --- |
| `title` | string, optional | The section heading. |
| `width` | `"1/3"`, `"1/2"` or `"full"`, optional | The share of the sheet width. The default is `"full"`. Sections flow side by side and wrap as whole blocks. |
| `columns` | positive integer, optional | All rows of the section share a grid of this many columns, so the columns align. A shorter row leaves the trailing grid cells empty. A row with more cells than `columns` makes the file invalid. Without `columns`, the cells of a row flow inline. |
| `repeat` | `true`, optional | The section holds one template row. Each character has its own list of rows made from it. |
| `rows` | array of Cell arrays, required | The rows of the section. Each row is an array of cells. |

### Cell

| `kind` | Other keys | Meaning |
| --- | --- | --- |
| `"text"` | `text`: string | A fixed label. It has no value. |
| `"field"` | `type`: `"text"`, `"number"` or `"check"`; `id`: string | A value that the GM fills in. The `id` is the key of its value. |
| `"dice"` | `formula`: string | A dice button that rolls the formula. It has no value. |

## Field ids

- An id matches `^[A-Za-z_][A-Za-z0-9_]*$`.
- An id cannot look like a dice term, such as `d20` or `D6`.
- An id cannot be `floor` or `ceil`, because formulas call them.
- An id cannot be a member name of `Object.prototype`, such as `constructor`, `__proto__` or `toString`.

### Scopes

- All fields outside `repeat` sections in one template are one scope. An id is unique in its scope.
- Each `repeat` template row is a scope of its own.
- The character template and the NPC template are separate. One id can occur in both.
- One id can occur in a `repeat` row and outside it.

### Repeat sections

- A `repeat` section holds exactly one row, and that row holds at least one field.
- The id of the first field in the row identifies the section. Two `repeat` sections of one template cannot start with the same id.

## Dice formulas

A formula holds:

- integer literals, such as `2`;
- field ids, such as `str`;
- `+`, `-`, `*`, `/` and parentheses;
- `floor(...)` and `ceil(...)`;
- dice terms `NdM` or `NDM`, with a literal `N` from 1 to 100 and a literal `M` from 1 to 1000;
- at most one comparison from `<=`, `<`, `>=`, `>`, outside parentheses. A comparison makes the roll a check: success when it holds.

Grammar:

```
comparison = sum [('<=' | '<' | '>=' | '>') sum]
sum        = product (('+' | '-') product)*
product    = atom (('*' | '/') atom)*
atom       = integer | dice | id | call | '(' sum ')'
call       = ('floor' | 'ceil') '(' sum ')'
```

- Minus is binary only. `-1` is a syntax error.
- A letter, digit or `_` right after a number or a dice term is a syntax error, such as `1d6x`.
- A formula is at most 200 characters.
- A check field counts as 0 or 1.
- A formula can name any valid id. An id that is not on the sheet is an error when the GM rolls, not at upload.

Examples: `1d20 <= str - 2*str_tired`, `floor(a/2)+ceil(b)`, `2D6+1`.

## Limits

- A file over 1 MiB is refused before it is read.
- The preset is stored deflated and base64-encoded in one record. A preset that cannot fit one message after that is refused as too large.
- `window.width` is from 360 to 1440 px, and `window.height` is from 360 to 1080 px. Both bounds are inclusive.

## Versions

- A file with a `v` higher than the current version is refused with "Файл из более новой версии. Перезагрузите страницу.". A newer build of the extension can read it.
- A file with no `v`, a `v` that is not an integer, or a lower `v` is refused. No migration exists yet.
- "Скачать пресет" always writes the current `v`.

## Refused files

A refused file changes nothing. The message under the button names the first problem found:

| Problem | Reason in the message |
| --- | --- |
| The file is not JSON | это не JSON |
| `window` is not an object with integer `width` and `height` in range, or has another key | в window нужны только width и height, целые числа: ширина от 360 до 1440 px, высота от 360 до 1080 px |
| An unknown key, cell kind, field type or `width`, or a missing key | неверная структура |
| No `v`, or a `v` that is lower or not an integer | неподдерживаемая версия формата |
| A field id breaks the id rules | недопустимый id поля «{id}» |
| An id repeats in one scope | поле «{id}» повторяется |
| A `repeat` section without exactly one row with a field | в повторяемой секции нужна одна строка хотя бы с одним полем |
| Two `repeat` sections start with one id | две повторяемые секции с id «{id}» |
| A row has more cells than `columns` | в строке больше ячеек, чем колонок |
| A formula breaks the formula rules | ошибка в формуле «{formula}» |
| The file or the stored preset is too large | файл слишком большой |

While sheets exist, "Загрузить пресет" is disabled with "Удалите листы, чтобы заменить пресет.".

## Annotated example

This walks through `docs/example-preset.json`.

```jsonc
{
  "v": 1, // the current format version
  "character": {
    "sections": [
      {
        "title": "Персонаж",
        "columns": 4, // one grid of four columns
        "rows": [
          [
            { "kind": "text", "text": "Класс" }, // a fixed label
            { "kind": "field", "type": "text", "id": "class" }, // a text value under the id "class"
            { "kind": "text", "text": "Уровень" },
            { "kind": "field", "type": "number", "id": "level" }, // a number value
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
            { "kind": "field", "type": "check", "id": "str_tired" }, // counts as 0 or 1 in a formula
            { "kind": "dice", "formula": "1d20 <= str - 2*str_tired" }, // a roll-under check
          ],
          // ... "Ловкость" in the same layout ...
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
            { "kind": "field", "type": "number", "id": "hp_max" },
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
        "repeat": true, // each character has its own list of attack rows
        "rows": [
          // exactly one template row; its first field id "attack" identifies the section
          [
            { "kind": "field", "type": "text", "id": "attack" },
            { "kind": "field", "type": "number", "id": "bonus" },
            { "kind": "text", "text": "Бросок" },
            { "kind": "dice", "formula": "1d20 + bonus" }, // "bonus" resolves inside the row first
          ],
        ],
      },
      {
        "title": "Снаряжение",
        "width": "1/3",
        "repeat": true,
        "rows": [
          [
            { "kind": "field", "type": "text", "id": "item" },
            { "kind": "field", "type": "check", "id": "equipped" },
          ],
        ],
      },
      {
        "title": "Заметки", // no "width": the full sheet width
        "rows": [[{ "kind": "field", "type": "text", "id": "notes" }]],
      },
    ],
  },
  "npc": {
    "sections": [
      {
        "columns": 3,
        "rows": [
          [
            { "kind": "text", "text": "Хиты" },
            { "kind": "field", "type": "number", "id": "hp" }, // "hp" is also a character id: templates are separate scopes
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
}
```
