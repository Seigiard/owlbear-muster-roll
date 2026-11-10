# Preset format

A preset is a JSON template with the shape section → rows → cells. It holds structure only. Values are stored apart from it, by field id. One preset file holds a character template and a short NPC template. This file fixes the names it uses. Architecture decides all other JSON keys.

## Cell kinds

| Kind | Holds | Stored value |
| --- | --- | --- |
| `text` | Fixed label text | None |
| `field` | Type `text`, `number` or `check`, and a stable id | One value per id |
| `dice` | Formula over field ids | None |

## Layout

| Section property | Effect |
| --- | --- |
| `columns` | All rows of the section share one grid, so columns align |
| No `columns` | Rows flow inline |
| `repeat` | A row template repeats per character, and each character has its own rows |
| `width` | `1/3`, `1/2` or `full` (default). Sections flow side by side and wrap as whole blocks |

Ids resolve inside the row first, then globally.

## Dice formulas

Example: `1d20 <= str - 2*str_tired`.

- A formula refers to fields by id.
- A check counts as 0 or 1.
- Formulas support `floor`, `ceil` and roll-under.
- A formula with an empty, non-numeric or removed field shows an error and does not roll.
- Formulas run through a small parser, never `eval`.
- Anyone who can see a sheet can roll its dice cells.
- The extension rolls itself. A result from a character sheet goes to everyone by broadcast, with the roller's name.
- A result from an NPC sheet shows only on GM clients.
- A formula runs only on a roll. Computed display fields are a non-goal.

## Preset changes

The GM downloads the JSON file, edits it and uploads it. An upload that removes fields with values asks for one confirmation for the whole upload: the data will be lost. Any other upload shows a short notice that the format changed.

| Change in the file | Effect on all sheets |
| --- | --- |
| Add a field | The field is empty |
| Remove a field | Its values are erased after the confirmation |
| Rename a field (same id) | Keeps its values |

A formula that refers to a removed field shows the error above.
