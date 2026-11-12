# Preset format

A preset is a JSON file that lists the templates of one room. Each template is a sheet set or a single sheet, with its title and its sections of the shape section → rows → cells. A preset holds structure only. Values are stored apart from it, by field id. This file fixes the names it uses, with the terms of `GLOSSARY.md`. `docs/preset-format.md` holds the JSON keys. `docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md` records why.

## Templates

| Term | Interface | Format `kind` | In the room |
| --- | --- | --- | --- |
| Sheet set | «Набор» | `set` | GMs create, and delete, any number of sheets from it, such as the party. Its name field names each sheet |
| Single sheet | «Одиночный лист» | `single` | Exactly one sheet, such as NPCs, a shared inventory, a story log or a spell list. Its tab name is its `title`. No command creates or deletes it |

- Never call a sheet set "character sheets". Character and NPC are preset content, not kinds of sheet.
- A preset has at least one template. Each template has a stable `id`, unique in the preset, and a `title`.
- A template's identity is its `id` and `kind`. An upload that changes either removes the old template and adds a new one.
- Tabs follow the preset order.

| Template property | Effect |
| --- | --- |
| Name field (sheet set only, required) | A field of type `text` outside repeat sections of the template. Its value names each sheet on its tab, in token labels and in rolls. Anyone with write access may edit it |
| Visibility | Players see it (default), or only GMs. A hidden template's sheets show only to GMs, their rolls show only on GM clients, and players get no token menu on them. Hiding is in the interface only |
| Player-editable (single sheet only) | Every player may edit the single sheet, with no per-player write access. Without it, players read it only. A sheet of a sheet set takes per-player write access and an owner instead |
| Linkable | A token can link to the whole sheet, such as a chest token that opens a shared inventory |

## Cell kinds

| Kind | Holds | Stored value |
| --- | --- | --- |
| Label (`text`) | Fixed text | None |
| Field (`field`) | Type `text`, `number`, `check`, `select` or `dice-choice`, and a stable field id | One value per field id |
| Dice cell (`dice`) | Formula over field ids | None |

### Select field

A select field (type `select`, «Список» in the interface) lists its options in the preset. The sheet shows a picker with exactly those options.

- The value is the text of the chosen option.
- The picker also offers an empty choice, which clears the field.
- The preset check refuses a select field with no options, with a blank option (empty or spaces only) or with a repeated option, and the message names the field.
- A stored value that is no longer an option, as a changed preset leaves it, still shows and can be replaced.
- Anyone with write access picks an option. A player's pick is a pending edit, as for any field. A reader without write access sees the value read-only.
- A select field is never a sheet set's name field. A duplicate gives it no number.

### Dice-choice field

A dice-choice field (type `dice-choice`, «Выбор кубика» in the interface) is a select field whose options are die sizes, such as `d6` or `d8`. A formula rolls the chosen die (see Dice formulas).

- Each option is `d` followed by an integer from 1 to 1000 with no leading zero, such as `d4`, `d20` or `d100`.
- The picker, the empty choice, the value, stale values and the select field's option rules are the same as for a select field.
- The preset check also refuses an option that is not a die size, and the message names the field and the option.

## Layout

| Section property | Effect |
| --- | --- |
| `columns` | All rows of the section share one grid, so columns align. A shorter row leaves trailing cells empty, and a row with more cells than the grid is refused |
| No `columns` | Rows flow inline |
| `repeat` | A repeat section: all its rows form one repeat block, and each sheet has its own number of repeat blocks. Rule at upload: «в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем» |
| Linkable (with `repeat` only) | Each repeat block can link to its own token. The token opens the sheet scrolled to that repeat block. Deleting a repeat block removes its links. The offered token label is the repeat block's first field |
| `width` | `1/3`, `1/2` or `full` (default). Sections flow side by side and wrap as whole sections |

- Ids resolve inside the repeat block first, then in the sheet.
- The GM can duplicate a repeat block (CAP-30). A duplicate keeps the values, takes a number in the first field when it is a `text` field with a value, and has no token link.

## Window size

A preset can set the size of the action window with an optional top-level key, after `v`:

```json
{ "v": 2, "window": { "width": 900, "height": 700 }, "templates": [ … ] }
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

- A formula refers to fields by field id.
- A check counts as 0 or 1.
- Formulas support `floor`, `ceil` and roll-under.
- A formula with an empty, non-numeric or removed field shows an error and does not roll.
- A preset with a formula syntax error, an unknown function or a dice term outside 1 to 100 dice and 1 to 1000 sides is refused at upload.
- A dice cell's label is the nearest preceding label in its row, otherwise its formula.
- A formula holds integer literals, field ids, `+ - * /`, parentheses, `floor()`, `ceil()`, `NdM` with literal `N` and `M`, `Nd(id)` with a literal `N`, and at most one comparison from `<= < >= >`.
- `Nd(id)` rolls `N` dice of the size chosen in the dice-choice field `id`, such as `1d(weapon_die) + bonus`. An empty dice-choice field, or a value that is not a die size, shows the field error and does not roll.
- The preset check refuses, and names the dice cell, a formula whose id resolves to a dice-choice field outside `Nd(...)`, or whose `Nd(...)` id resolves to a field of another type. An id that resolves to no field is an error only at the roll.
- A roll names its dice cell by its label. A formula with `Nd(id)` writes out the chosen dice in that name: a dice cell named by its formula shows the formula with each `Nd(id)` as `NdM`, such as `1d8 + bonus`, and a dice cell named by a label shows the label and that formula in parentheses, such as «Урон (1d8)».
- Formulas run through a small parser, never `eval`.
- Anyone who can see a sheet can roll its dice cells.
- A roll uses the dice of a dice extension when one is in the room and a GM allows it. Otherwise the extension rolls itself. A roll from a sheet players can see goes to everyone by broadcast, with the roller's name.
- A roll from a hidden sheet shows only on GM clients.
- A formula runs only on a roll. Computed display fields are a non-goal.

## Preset changes

The GM downloads the JSON file, edits it and uploads it. A preset change that removes fields with values, or a template with sheets or values, asks for one confirmation for the whole upload: it names how many values will be erased and how many sheets will be deleted. Any other upload shows a short notice that the format changed.

| Change in the file | Effect on the room |
| --- | --- |
| Add a field | The field is empty |
| Remove a field | Its values are erased after the confirmation |
| Rename a field label (same field id) | Keeps its values |
| Change a field's type (same field id), `text` to `select` included | Counts as a removal: its values are erased after the confirmation |
| Change a select field's options (same field id) | Keeps its values. A value that is no longer an option still shows |
| Change a dice-choice field's options (same field id) | Keeps its values, as for a select field. `select` to `dice-choice`, or back, is a type change |
| Add a single sheet | Its tab appears, empty |
| Remove a sheet set, or change its `id` or `kind` | Its sheets are deleted with their values, token links, owners and write access after the confirmation |
| Remove a single sheet, or change its `id` or `kind` | Its values and token links are erased after the confirmation |
| Make a template or repeat section not linkable | Its token links are removed. Not counted in the confirmation |

A formula that refers to a removed field shows the error above.

## Older format

Format version 1 (a `character` and an `npc` template) is not migrated. A v1 preset or snapshot is refused with a message. A room with v1 data is cleared with a wipe («Очистить всё», CAP-31).
