# Preset format

A preset is a JSON file that lists the templates of one room. A preset holds structure only. Values are stored apart from it, by field id. This file fixes the names it uses, with the terms of `GLOSSARY.md`. `docs/preset-format.md` holds the JSON keys. `docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md` records why presets are lists of templates.

## Tree

Format version 4. The tree has a fixed depth, and each container holds one kind of child:

```
preset   = { v, window?, templates[] }           at least one template
template = { id, title, visibility?, repeat?: { nameField }, players?, tabs[] }   at least one tab
tab      = { title?, visibility?, repeat?: { id, nameField }, sections[] }
section  = { title?, width?, columns?, visibility?, repeat?: { id, nameField }, rows[] }
row      = { visibility?, repeat?: { id, nameField }, cells[] }
cell     = text { text } | field { type, id, name?, options? } | dice { formula, name? } | token { id }
```

Every object is strict. Every level uses the same key vocabulary, and a per-kind registry lists which keys a kind takes and its one child kind. Rejected: rows directly in a tab or cells directly in a section (a titleless section already draws no heading, so it buys one bracket and costs two shapes in every reader), and ids on every node (nobody reads a tab or plain section id).

| Key | On | Effect |
| --- | --- | --- |
| `id` | template, field, token cell, and inside `repeat` | A stable name that records, formulas and links refer to. Unique in its scope. A changed id is a new thing: a template id change deletes its sheets, a repeat scope id change erases its blocks, a field id change erases its values |
| `title` | template, tab, section | The name shown. A tab's title is required when the template has more than one tab |
| `visibility` | template, tab, section, row | Players see it (default), or only GMs. A node shows when it and every ancestor show. A hidden node's rolls show only on GM clients, and players get no token menu on its token cells. Hiding is in the interface only. Cells have no visibility: a hidden field is a hidden row |
| `repeat` | template, tab, section, row | The node is a repeat scope: one block per instance (see Repeat) |
| `players` | template | `"edit"`: every player may edit the template's sheet, or every sheet of a repeat template. Without it, a single sheet is read-only for players and a sheet of a set takes per-player write access and an owner |

Rule checks outside the schema: ids are unique in their scope, `nameField` names a `text` field inside its own scope, a formula's ids follow the id rules, a row is no wider than `columns`. No key depends on another key.

## Release boundary

The v4 vocabulary reserves `repeat` on templates, tabs, sections and rows,
and a block path is a sequence of `(scope id, block id)` pairs. The current
release temporarily rejects nested block scopes through rule checks. This is a
release boundary, not a change to the v4 tree or its future path model.

## Templates

A template is the root of a sheet. Its interface words stay: a template with `repeat` is a sheet set («Набор»), a template without it is a single sheet («Одиночный лист»).

| Template | Format | In the room |
| --- | --- | --- |
| Sheet set | `repeat: { nameField }` | GMs create, and delete, any number of sheets from it, such as the party. `nameField` names each sheet in the sidebar, in token labels and in rolls |
| Single sheet | no `repeat` | Exactly one sheet, such as a shared inventory, a story log or a spell list. Its sidebar entry is its `title`. No command creates or deletes it |

- Never call a sheet set "character sheets". Character and NPC are preset content, not kinds of sheet.
- A template's identity is its `id`. An upload that changes it, or adds or removes `repeat`, removes the old template and adds a new one.
- Sidebar entries follow the preset order. Each sheet set is a group: a heading with its `title`, its sheets and its "+". A single sheet is a plain entry. A player's own sheets come first in their group. A divider follows each sheet set group, and settings sit at the bottom.
- A sheet set's `nameField` may sit on any tab, a hidden one included. The sheet's name still shows in the sidebar; on a hidden tab players read it and do not edit it.

## Repeat

`repeat` means one block per instance. The kind of the node decides how its blocks show:

| Repeat scope | Blocks show as | Who adds and removes |
| --- | --- | --- |
| Template | Sheets, each a sidebar entry under the set's heading, with "+" | GM (CAP-17) |
| Tab | Tabs in the tab row, titled by `nameField`, with a "+" tab last for the GM | GM (CAP-41) |
| Section | Blocks stacked inside the section | Anyone with write access to the sheet (CAP-5) |
| Row | Blocks stacked, each one row | Anyone with write access to the sheet (CAP-5) |

- `repeat.id` is the scope's stable name; `repeat.nameField` names a `text` field inside the scope whose value names each block: in the tab title, in token labels, in rolls and in the duplicate's number. The first-field rule of version 3 is gone.
- A repeat scope may sit inside another repeat scope. Each block then has its own nested blocks: a repeat tab «Персонаж» with a repeat section «Атаки» gives every NPC its own attacks (CAP-42).
- A block is addressed by the sheet and a path of `(scope id, block id)` pairs. A record and a link name a block by that path.
- Ids resolve inside the block first, then in each enclosing block, then in the sheet across all its tabs. Fields outside every repeat scope of a template are one scope across its tabs.
- The current release supports the non-nested repeat forms used by the shipped
presets. It rejects nested repeat scopes by rule checks. The reserved nested
form remains part of the approved future contract.
- The GM can duplicate a block (CAP-30). A duplicate keeps the values and its nested blocks, takes a number in `nameField` when that field holds a value, and has no token link.
- Rejected: forbidding nested repeat, or one level only. A repeat tab without its own lists is useless, and a depth limit is an exception the registry must know.

## Tabs

A tab («Вкладка» in the interface) is a titled group of sections inside a sheet. Every template has at least one tab, and a sheet shows one tab at a time.

- A template with one tab draws no tab row, and its tab may have no title. Many tabs scroll in one row.
- A visible template whose every tab is hidden is accepted. Players see its sheets with no tab.
- A token that opens a token cell selects the tab that holds it. A selection mark on a block in another tab also marks that tab.
- A dice cell that players see and whose formula names a field on a hidden tab shows that value in the roll. This is accepted.

## Cell kinds

| Kind | Holds | Stored value |
| --- | --- | --- |
| Label (`text`) | Fixed text | None |
| Field (`field`) | Type `text`, `number`, `check`, `select` or `dice-choice`, and a stable field id | One value per field id, per block |
| Dice cell (`dice`) | Formula over field ids | None |
| Token cell (`token`) | A stable id. A place a token can link to | None; the link is a room record that names the cell by its id |

A field and a dice cell may also carry a cell name (see Cell names).

### Token cell

A token cell («ячейка-токен») is a bookmark: a token linked to it opens the sheet on the tab that holds the cell, scrolled to it. It replaces the version 3 `tokens: true` on templates and repeat sections and the rule that bound it to `repeat`.

- A sheet may hold several token cells, in any section or row, inside or outside a repeat scope. A token cell inside a block links to that block.
- On the sheet the GM sees the cell as an icon with the link status and a menu: link a token, unlink, select the linked tokens on the map (CAP-32). A player sees nothing in its place.
- The offered token label is the name of the nearest ancestor that has one: the block's `nameField`, then the section's `title`, then the sheet's name or the template's `title`. A single sheet Инвентарь with one token cell offers «Инвентарь».
- Rejected: a name-field property on the token cell (a second source for the scope's name, which the sidebar, rolls, the block and "+" also read), and a token flag on a field (Инвентарь has no name field).
- Deleting the block that holds a token cell, or removing the cell from the preset, removes its links. Links are not counted in the upload confirmation.

### Select field

A select field (type `select`, «Список» in the interface) lists its options in the preset. The sheet shows a picker with exactly those options.

- The value is the text of the chosen option.
- The picker also offers an empty choice, which clears the field.
- The preset check refuses a select field with no options, with a blank option (empty or spaces only) or with a repeated option, and the message names the field.
- A stored value that is no longer an option, as a changed preset leaves it, still shows and can be replaced.
- Anyone with write access picks an option. A player's pick is a pending edit, as for any field. A reader without write access sees the value read-only.
- A select field is never a `nameField`. A duplicate gives it no number.

### Dice-choice field

A dice-choice field (type `dice-choice`, «Выбор кубика» in the interface) is a select field whose options are die sizes, such as `d6` or `d8`. A formula rolls the chosen die (see Dice formulas).

- Each option is `d` followed by an integer from 1 to 1000 with no leading zero, such as `d4`, `d20` or `d100`.
- The picker, the empty choice, the value, stale values and the select field's option rules are the same as for a select field.
- The preset check also refuses an option that is not a die size, and the message names the field and the option.

### Cell names

A cell name (key `name`, «Название» in the builder) names a field or a dice cell. It fixes a compact layout, where the label before a cell does not say what the cell is for.

- A field of any type and a dice cell may carry it. A label (`text`) and a token cell may not.
- It is a string with at least one non-space character, at most 60 characters long. The preset check refuses a blank name (empty or spaces only) and a longer one, and the message names the cell: a field by its id, a dice cell by its formula.
- A cell's label is its cell name; without one, the nearest preceding label with text in its row; without that, the field id or the formula. The label is the field's accessible name, the dice button's accessible name, the roll's name for the dice cell and the field's name in a roll error.
- The dice button keeps its visible text: the nearest preceding label, otherwise its formula.
- A named field or dice cell shows its cell name in a tooltip on hover and on focus, for a reader and a writer alike. The tooltip leaves the control uncovered.

## Layout

| Section property | Effect |
| --- | --- |
| `columns` | All rows of the section share one grid, so columns align. A shorter row leaves trailing cells empty, and a row with more cells than the grid is refused |
| No `columns` | Rows flow inline |
| `width` | `1/3`, `1/2` or `full` (default). Sections flow side by side and wrap as whole sections |

- A hidden row in a `columns` grid leaves a gap or shifts the grid for the player. This is the author's choice, with no check.

## Window size

A preset can set the size of the action window with an optional top-level key, after `v`:

```json
{ "v": 4, "window": { "width": 900, "height": 700 }, "templates": [ … ] }
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

- A formula refers to fields by field id. An id resolves in the dice cell's block, then each enclosing block, then the sheet.
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
- A roll from a hidden sheet, tab, section or row shows only on GM clients.
- A formula runs only on a roll. Computed display fields are a non-goal.

## Preset changes

The GM downloads the JSON file, edits it and uploads it. A preset change that removes fields with values, or a template with sheets or values, or a repeat scope with blocks, asks for one confirmation for the whole upload: it names how many values will be erased and how many sheets will be deleted. Any other upload shows a short notice that the format changed.

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
| Add, rename, reorder, hide or show a tab, section or row | Keeps every value |
| Move a section to another tab, or a row to another section, outside every repeat scope | Keeps its values |
| Remove a tab, section or row | Its fields count as removed: their values are erased after the confirmation |
| Remove a sheet set, change its `id`, or add or remove its `repeat` | Its sheets are deleted with their values, token links, owners and write access after the confirmation |
| Remove a single sheet, change its `id`, or add or remove its `repeat` | Its values and token links are erased after the confirmation |
| Add `repeat` to a tab, section or row, remove it, or change `repeat.id` | Its blocks are erased with their values, nested blocks and links after the confirmation. Fields moved into or out of a repeat scope count as removed |
| Change `repeat.nameField` | Keeps every value |
| Remove a token cell | Its token links are removed. Not counted in the confirmation |

A formula that refers to a removed field shows the error above.

## Older format

The current format is version 4. Versions 1 (a `character` and an `npc` template), 2 (sections directly in a template, no tabs) and 3 (`kind: "set" | "single"`, `tokens: true`, blocks named by their first field) are not migrated. Such a preset or snapshot is refused with a message. A room with such data is cleared with a wipe («Очистить всё», CAP-31).
