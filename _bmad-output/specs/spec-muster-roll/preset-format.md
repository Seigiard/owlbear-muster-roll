# Preset format

A preset is a JSON file that lists the templates of one room. Each template is a sheet set or a single sheet, with its title and its tabs of the shape tab → sections → rows → cells. A preset holds structure only. Values are stored apart from it, by field id. This file fixes the names it uses, with the terms of `GLOSSARY.md`. `docs/preset-format.md` holds the JSON keys. `docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md` records why.

## Templates

| Term | Interface | Format `kind` | In the room |
| --- | --- | --- | --- |
| Sheet set | «Набор» | `set` | GMs create, and delete, any number of sheets from it, such as the party. Its name field names each sheet |
| Single sheet | «Одиночный лист» | `single` | Exactly one sheet, such as NPCs, a shared inventory, a story log or a spell list. Its sidebar entry is its `title`. No command creates or deletes it |

- Never call a sheet set "character sheets". Character and NPC are preset content, not kinds of sheet.
- A preset has at least one template. Each template has a stable `id`, unique in the preset, and a `title`.
- A template's identity is its `id` and `kind`. An upload that changes either removes the old template and adds a new one.
- Sidebar entries follow the preset order. Each sheet set is a group: a heading with its `title`, its sheets and its "+". A single sheet is a plain entry. A player's own sheets come first in their group. A divider follows each sheet set group, and settings sit at the bottom. The sidebar entry takes over what the word "tab" meant for a sheet before version 3.

| Template property | Effect |
| --- | --- |
| Name field (sheet set only, required) | A field of type `text` outside repeat sections of the template. Its value names each sheet in the sidebar, in token labels and in rolls. It may sit on any tab. On a hidden tab, players read the name and do not edit it. On a visible tab, anyone with write access may edit it |
| Visibility | Players see it (default), or only GMs. A hidden template's sheets show only to GMs, their rolls show only on GM clients, and players get no token menu on them. Hiding is in the interface only |
| Player-editable (single sheet only) | Every player may edit the single sheet, with no per-player write access. Without it, players read it only. A sheet of a sheet set takes per-player write access and an owner instead |
| Linkable | A token can link to the whole sheet, such as a chest token that opens a shared inventory |

## Tabs

A tab («Вкладка» in the interface) is a titled group of sections inside a sheet. Every template has a list of at least one tab, and the sections live in the tabs. A sheet shows one tab at a time.

| Tab property | Effect |
| --- | --- |
| `title` | The tab's name in the tab row. Required when the template has more than one tab. A template with one tab draws no tab row, and its tab may have no title |
| `visibility` | Players see the tab (default), or only GMs. A hidden tab acts as a hidden template does: players do not see it or its sections, its rolls show only on GM clients, and players get no token menu on its linkable repeat blocks. Hiding is in the interface only |
| `sections` | The tab's sections, in display order |

- Visibility only narrows: a tab is hidden when its template or the tab is hidden.
- A visible template whose every tab is hidden is accepted. Players see its sheets with no tab.
- Many tabs scroll in one row.
- A token that opens a repeat block selects the tab that holds it. A selection mark on a repeat block in another tab also marks that tab.
- The shape of a tab is strict, as every object of the format.
- A dice cell that players see and whose formula names a field on a hidden tab shows that value in the roll. This is accepted.
- The preview page's frames switch tabs too.
- Rejected: a tab as a string key on a section (a typo makes a new tab), and optional tabs beside `sections` (two shapes in every reader of the format).

## Cell kinds

| Kind | Holds | Stored value |
| --- | --- | --- |
| Label (`text`) | Fixed text | None |
| Field (`field`) | Type `text`, `number`, `check`, `select` or `dice-choice`, and a stable field id | One value per field id |
| Dice cell (`dice`) | Formula over field ids | None |

A field and a dice cell may also carry a cell name (see Cell names).

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

### Cell names

A cell name (key `name`, «Название» in the builder) names a field or a dice cell. It fixes a compact layout, where the label before a cell does not say what the cell is for.

- A field of any type and a dice cell may carry it. A label (`text`) may not.
- It is a string with at least one non-space character, at most 60 characters long. The preset check refuses a blank name (empty or spaces only) and a longer one, and the message names the cell: a field by its id, a dice cell by its formula.
- A cell's label is its cell name; without one, the nearest preceding label with text in its row; without that, the field id or the formula. The label is the field's accessible name, the dice button's accessible name, the roll's name for the dice cell and the field's name in a roll error.
- The dice button keeps its visible text: the nearest preceding label, otherwise its formula.
- A named field or dice cell shows its cell name in a tooltip on hover and on focus, for a reader and a writer alike. The tooltip leaves the control uncovered.

## Layout

| Section property | Effect |
| --- | --- |
| `columns` | All rows of the section share one grid, so columns align. A shorter row leaves trailing cells empty, and a row with more cells than the grid is refused |
| No `columns` | Rows flow inline |
| `repeat` | A repeat section: all its rows form one repeat block, and each sheet has its own number of repeat blocks. Rule at upload: «в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем» |
| Linkable (with `repeat` only) | Each repeat block can link to its own token. The token opens the sheet scrolled to that repeat block. Deleting a repeat block removes its links. The offered token label is the repeat block's first field |
| `width` | `1/3`, `1/2` or `full` (default). Sections flow side by side and wrap as whole sections |

- Ids resolve inside the repeat block first, then in the sheet, across all its tabs.
- The GM can duplicate a repeat block (CAP-30). A duplicate keeps the values, takes a number in the first field when it is a `text` field with a value, and has no token link.

## Window size

A preset can set the size of the action window with an optional top-level key, after `v`:

```json
{ "v": 3, "window": { "width": 900, "height": 700 }, "templates": [ … ] }
```

- `width` and `height` are integers in px. Width: 480 to 1440, so the sidebar and a sheet fit side by side. Height: 360 to 1080. Both bounds are inclusive.
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
- A dice cell's label is its cell name, otherwise the nearest preceding label in its row, otherwise its formula.
- A formula holds integer literals, field ids, `+ - * /`, parentheses, `floor()`, `ceil()`, `NdM` with literal `N` and `M`, `Nd(id)` with a literal `N`, and at most one comparison from `<= < >= >`.
- `Nd(id)` rolls `N` dice of the size chosen in the dice-choice field `id`, such as `1d(weapon_die) + bonus`. An empty dice-choice field, or a value that is not a die size, shows the field error and does not roll.
- The preset check refuses, and names the dice cell, a formula whose id resolves to a dice-choice field outside `Nd(...)`, or whose `Nd(...)` id resolves to a field of another type. An id that resolves to no field is an error only at the roll.
- A roll names its dice cell by its label. A formula with `Nd(id)` writes out the chosen dice in that name: a dice cell named by its formula shows the formula with each `Nd(id)` as `NdM`, such as `1d8 + bonus`, and a dice cell named by a cell name or a label shows that name and the formula in parentheses, such as «Урон (1d8)».
- Formulas run through a small parser, never `eval`.
- Anyone who can see a sheet can roll its dice cells.
- A roll uses the dice of a dice extension when one is in the room and a GM allows it. Otherwise the extension rolls itself. A roll from a sheet players can see goes to everyone by broadcast, with the roller's name.
- A roll from a hidden sheet or a hidden tab shows only on GM clients.
- A formula runs only on a roll. Computed display fields are a non-goal.

## Preset changes

The GM downloads the JSON file, edits it and uploads it. A preset change that removes fields with values, or a template with sheets or values, asks for one confirmation for the whole upload: it names how many values will be erased and how many sheets will be deleted. Any other upload shows a short notice that the format changed.

| Change in the file | Effect on the room |
| --- | --- |
| Add a field | The field is empty |
| Remove a field | Its values are erased after the confirmation |
| Rename a field label (same field id) | Keeps its values |
| Add, change or remove a cell name | Keeps every value |
| Change a field's type (same field id), `text` to `select` included | Counts as a removal: its values are erased after the confirmation |
| Change a select field's options (same field id) | Keeps its values. A value that is no longer an option still shows |
| Change a dice-choice field's options (same field id) | Keeps its values, as for a select field. `select` to `dice-choice`, or back, is a type change |
| Add a single sheet | Its sidebar entry appears, empty |
| Add, rename, reorder, hide or show a tab | Keeps every value |
| Move a section to another tab | Keeps its values |
| Remove a tab | Its fields count as removed: their values are erased after the confirmation |
| Remove a sheet set, or change its `id` or `kind` | Its sheets are deleted with their values, token links, owners and write access after the confirmation |
| Remove a single sheet, or change its `id` or `kind` | Its values and token links are erased after the confirmation |
| Make a template or repeat section not linkable | Its token links are removed. Not counted in the confirmation |

A formula that refers to a removed field shows the error above.

## Older format

The current format is version 3. Versions 1 (a `character` and an `npc` template) and 2 (sections directly in a template, no tabs) are not migrated. Such a preset or snapshot is refused with a message. A room with such data is cleared with a wipe («Очистить всё», CAP-31).
