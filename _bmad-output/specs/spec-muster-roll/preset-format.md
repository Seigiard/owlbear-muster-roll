# Preset format

A preset is a JSON file that lists the sheets of one room. Each entry is a Набор or a Лист with its own schema of the shape section → rows → cells. A preset holds structure only. Values are stored apart from it, by field id. This file fixes the names it uses. Architecture decides all other JSON keys.

## Sheet entries

| Term | Format `kind` | In the room |
| --- | --- | --- |
| Набор | `many` | The GM creates, and deletes, any number of sheets from its schema, such as player characters. A field the entry names gives each sheet its tab name |
| Лист | `one` | Exactly one sheet, from its own schema, such as NPC, Инвентарь, История or Список заклинаний. Its tab name is its `title`. No command creates or deletes it |

- Never call a Набор "character sheets". The name stays abstract.
- A preset has at least one entry. Each entry has a stable `id` and a `title`.
- An entry's identity is its `id` and `kind`. An upload that changes either removes the old entry and adds a new one.
- Tabs follow the preset order.

| Entry property | Effect |
| --- | --- |
| Name field (Набор only, required) | Names a non-repeat `text` field of the entry. Its value is each sheet's tab name. Anyone with write access may edit it |
| `visibility` | Visible to players (default) or hidden. A hidden entry shows only to the GM, its rolls show only on GM clients, and players get no token menu on its sheets. Hiding is in the interface only |
| `players: edit` (Лист only) | Every player may edit the Лист. Without it, players read it only. A Набор sheet takes per-player write access and an owner instead |
| `tokens` | A token can link to the whole sheet, such as a chest that opens Инвентарь |

## Cell kinds

| Kind | Holds | Stored value |
| --- | --- | --- |
| `text` | Fixed label text | None |
| `field` | Type `text`, `number` or `check`, and a stable id | One value per id |
| `dice` | Formula over field ids | None |

## Layout

| Section property | Effect |
| --- | --- |
| `columns` | All rows of the section share one grid, so columns align. A shorter row leaves trailing cells empty, and a row with more cells than the grid is refused |
| No `columns` | Rows flow inline |
| `repeat` | All rows of the section form one block. The block repeats, and each sheet has its own blocks. Rule at upload: «в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем» |
| `tokens` (with `repeat` only) | Each block links to its own token. The token opens the sheet scrolled to that block. Deleting a block removes its links. The offered token label is the block's first field |
| `width` | `1/3`, `1/2` or `full` (default). Sections flow side by side and wrap as whole blocks |

- Ids resolve inside the block first, then in the sheet.
- The GM can duplicate a repeat block (CAP-30). Copies keep the values, take a number in the first field when it is a `text` field with a value, and have no token link.

## Window size

A preset can set the size of the action window with an optional top-level key, after `v`:

```json
{ "v": 2, "window": { "width": 900, "height": 700 }, "sheets": [ … ] }
```

- `width` and `height` are integers in px. Width: 360 to 1440. Height: 360 to 1080. Both bounds are inclusive.
- Both keys are necessary, and no other key is allowed in `window`.
- A `window` that breaks one of these rules refuses the whole file. The message under the upload button names the allowed range, and nothing changes.
- With no `window`, or with no preset in the room, the window is 600 by 600 px.
- Every client applies the size of the room's preset, also before the window opens and while it is open. All clients get the same size.
- A downloaded preset keeps its `window`.
- An upload that changes only `window` erases no values and shows the short notice.

## Dice formulas

Example: `1d20 <= str - 2*str_tired`.

- A formula refers to fields by id.
- A check counts as 0 or 1.
- Formulas support `floor`, `ceil` and roll-under.
- A formula with an empty, non-numeric or removed field shows an error and does not roll.
- A preset with a formula syntax error, an unknown function or a dice term outside 1 to 100 dice and 1 to 1000 sides is refused at upload.
- A dice button's label is the nearest preceding `text` cell in its row, otherwise its formula.
- A formula holds integer literals, field ids, `+ - * /`, parentheses, `floor()`, `ceil()`, `NdM` with literal `N` and `M`, and at most one comparison from `<= < >= >`.
- Formulas run through a small parser, never `eval`.
- Anyone who can see a sheet can roll its dice cells.
- The extension rolls itself. A result from a visible sheet goes to everyone by broadcast, with the roller's name.
- A result from a hidden sheet shows only on GM clients.
- A formula runs only on a roll. Computed display fields are a non-goal.

## Preset changes

The GM downloads the JSON file, edits it and uploads it. An upload that removes fields with values, or a Набор or Лист with sheets or values, asks for one confirmation for the whole upload: it names how many values will be erased and how many sheets will be deleted. Any other upload shows a short notice that the format changed.

| Change in the file | Effect on the room |
| --- | --- |
| Add a field | The field is empty |
| Remove a field | Its values are erased after the confirmation |
| Rename a field (same id) | Keeps its values |
| Change a field's type (same id) | Counts as a removal: its values are erased after the confirmation |
| Add a Лист | Its tab appears, empty |
| Remove a Набор, or change its `id` or `kind` | Its sheets are deleted with their values, token links, owners and write rights after the confirmation |
| Remove a Лист, or change its `id` or `kind` | Its values and token links are erased after the confirmation |
| Remove `tokens` | Its token links are removed. Not counted in the confirmation |

A formula that refers to a removed field shows the error above.

## Older format

Format version 1 (a `character` and an `npc` template) is not migrated. A v1 preset or snapshot file is refused with a message. A room with v1 data is cleared with "Очистить всё" (CAP-31).
