# Preset format

A preset is a JSON template with the shape section → rows → cells. It holds structure only. Values are stored apart from it, by field id. This file fixes the names it uses. Architecture decides all other JSON keys.

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

Ids resolve inside the row first, then globally.

## Dice formulas

Example: `1d20 <= str - 2*str_tired`.

- A formula refers to fields by id.
- A check counts as 0 or 1.
- Formulas support `floor`, `ceil` and roll-under.
- A formula with an empty, non-numeric or removed field shows an error and does not roll.
- Formulas run through a small parser, never `eval`.
- The extension rolls itself and shows the result to everyone by broadcast.
- A formula runs only on a roll. Computed display fields are a non-goal.

## Live edits

| Edit | Effect on all sheets |
| --- | --- |
| Add a field | The field is empty |
| Remove a field | Asks for confirmation, then erases its values |
| Rename a field | Keeps its values |

A formula that refers to a removed field shows the error above.
