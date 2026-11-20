# Preset file format

A preset is a JSON file that lists the templates of one room. A template is a
sheet set or a single sheet. A preset holds structure only; values are stored
separately by field id. The GM uploads it with «Загрузить пресет» and downloads
it with «Скачать пресет».

`docs/example-preset.json` is a complete v4 preset. The preset owner test
parses it with the same validator as an upload.

## Shape

```text
preset   = { v, window?, templates[] }                         at least one template
template = { id, title, visibility?, repeat?: { nameField },    at least one tab
             players?, tabs[] }
tab      = { title?, visibility?, repeat?: { id, nameField }, sections[] }
section  = { title?, width?, columns?, visibility?,
             repeat?: { id, nameField }, rows[] }
row      = { visibility?, repeat?: { id, nameField }, cells[] }
cell     = text { text }
         | field { type, id, name?, options? }
         | dice { formula, name? }
         | token { id }
```

Every object is strict. A key that is not listed here makes the file invalid.
`repeat` is part of the v4 vocabulary at templates, tabs, sections and rows.
Repeat scopes can be nested at any depth.

## Keys

### File

| Key | Type | Meaning |
| --- | --- | --- |
| `v` | integer, required | Format version. The current version is `4`. |
| `window` | `{ width, height }`, optional | The action-window size in px for every client. Both keys are required integers and no other key is allowed. Without it, the window is 600 by 600 px. |
| `templates` | array, required, at least one | The room's templates in sidebar order. |

### Template

| Key | Type | Meaning |
| --- | --- | --- |
| `id` | string, required | The stable template id. No two templates share it. Changing it removes the old template and adds a new one. |
| `title` | string, required | The title shown for a single sheet, or the sheet-set heading and add command. |
| `visibility` | `"all"` or `"gm"`, optional | `"all"` is the default. `"gm"` hides the template from players in the interface. |
| `repeat` | `{ nameField }`, optional | Makes the template a sheet set. The value of `nameField` names each sheet. Without it, the template is a single sheet. |
| `players` | `"edit"`, optional | Every player may edit the template's sheet. On a repeated template this applies to every sheet. A hidden template still gives players no edit access. |
| `tabs` | array, required, at least one | The tabs of the sheet, in display order. |

A sheet set is a template with `repeat`. GMs can create and delete any number
of its sheets. A single sheet has no `repeat` and exists exactly once. Its
sidebar entry uses the template title. Template repetition does not add a pair
to a repeat block path.

Visibility is inherited. A player sees a node only when the node and every
ancestor are visible. Hiding is an interface rule; the records remain in
replicas and can be read by the room logic.

### Tab

A tab is a group of sections inside a sheet. A sheet shows one tab at a time.
A template with one tab draws no tab row. With more tabs, the tab row can
scroll sideways, and Left and Right move between tabs. Each client keeps its
open tab locally; it is not stored or sent.

| Key | Type | Meaning |
| --- | --- | --- |
| `title` | string, optional | The tab name. It is required and non-blank when the template has more than one tab. |
| `visibility` | `"all"` or `"gm"`, optional | `"all"` is the default. `"gm"` hides the tab and its content from players in the interface. |
| `repeat` | `{ id, nameField }`, optional | Makes one tab per block, named by `nameField`. A final `+` tab lets the GM add a block. |
| `sections` | array, required | The sections of the tab, in display order. |

Tabs change layout only. Fields outside repeat scopes share one scope across
all tabs of a template. A section can move to another tab without changing
the values of its fields. A token link opens the tab that contains its token
cell.

### Section

| Key | Type | Meaning |
| --- | --- | --- |
| `title` | string, optional | The section heading. |
| `width` | `"1/3"`, `"1/2"` or `"full"`, optional | The share of the sheet width. The default is `"full"`. |
| `columns` | positive integer, optional | The shared grid width for all rows. A row cannot contain more cells than this value. Without it, cells flow inline. |
| `visibility` | `"all"` or `"gm"`, optional | Visibility for the section and its rows. |
| `repeat` | `{ id, nameField }`, optional | Makes the section a repeat scope. Each sheet can hold its own blocks. |
| `rows` | array, required | The rows of the section. |

Sections flow side by side and wrap as whole sections. A repeat section can
link a token cell inside each of its blocks.

### Row

| Key | Type | Meaning |
| --- | --- | --- |
| `visibility` | `"all"` or `"gm"`, optional | Visibility for the row and its cells. |
| `repeat` | `{ id, nameField }`, optional | Makes the row a repeat scope. Each parent block can hold its own row blocks. |
| `cells` | array, required | The cells in the row. |

A row with more cells than its section's `columns` is invalid. A plain row has
no storage identity. A repeated row is a block scope and has an identity in its
parent block path.

### Cell

| Kind | Other keys | Meaning |
| --- | --- | --- |
| `text` | `text`: string | A fixed label. It has no value. |
| `field` | `type`, `id`, `name?`, `options?` | A value that a player or GM can read or edit under the access rules. |
| `dice` | `formula`, `name?` | A dice cell that rolls its formula. It has no stored value. |
| `token` | `id`: string | A bookmark that a token can link to. It has no stored value. |

Field types are `text`, `number`, `check`, `select` and `dice-choice`.
`select` and `dice-choice` fields require a non-empty list of distinct,
non-blank `options`. A select picker also has an empty choice that clears the
field. A stored value that is no longer an option remains visible until it is
replaced.

A token cell may appear in any row, inside or outside a repeat scope. A token
linked to a root cell opens the sheet on that cell's tab. A token linked to a
cell in a block opens the sheet on the tab and block containing that cell.
Players see no token-cell control.

### Cell names

The optional `name` key gives a field or dice cell a stable name in compact
layouts. It is its accessible name, the tooltip text, and the name shown for a
dice cell in a roll. A token cell and a text cell cannot have `name`.

The value must contain a non-space character and be no longer than 60 Unicode
characters. Without a cell name, the cell uses the nearest preceding label in
its row, then the field id or dice formula. Start a dice-cell name with the
visible button text so speech input can activate it.

## Ids and scopes

- A template id or field id matches `^[A-Za-z_][A-Za-z0-9_]*$`.
- An id cannot look like a dice term, such as `d20` or `D6`.
- An id cannot be `floor` or `ceil`, or a member name of `Object.prototype`.
- A template id is at most 64 characters.
- Field ids are unique in their scope. Fields outside repeat scopes of one
  template share one scope across all tabs.
- Fields inside a repeat scope share that scope. Nested scopes resolve an id
  inside the nearest block first, then through enclosing blocks, then in the
  sheet scope.
- A field inside a repeat scope cannot reuse an id from an enclosing repeat
  scope or the sheet scope.
- `repeat.id` is unique among repeat scopes in its parent scope.
- `repeat.nameField` names a text field inside its own scope.

## Repeat scopes and blocks

A repeat scope makes one block per instance. The scope kind decides where the
blocks appear:

| Scope | Blocks appear as | Who adds and removes them |
| --- | --- | --- |
| Template | Sheets under a sheet-set heading | GM |
| Tab | Tabs named by `nameField` | GM |
| Section | Blocks stacked in the section | Anyone with write access |
| Row | Blocks stacked as rows | Anyone with write access |

A block is addressed by a sheet and a path of `(scope id, block id)` pairs.
The path contains every pair from the outermost block through the block itself.
A record and a token link store that complete path. Snapshot import keeps a
nested block only when every ancestor pair names a scope in the preset and a
live parent block. Changing a repeat scope id creates a new scope and removes
its old blocks. Changing `nameField` keeps block identity and values while
changing the names shown in the interface.

## Dice formulas

A formula can contain integer literals, field ids, `+`, `-`, `*`, `/`,
parentheses, `floor(...)`, `ceil(...)`, dice terms `NdM`, dice-choice terms
`Nd(id)`, and at most one comparison from `<=`, `<`, `>=` and `>`.

`N` is from 1 to 100 and `M` is from 1 to 1000. A formula is at most 200
characters. `Nd(id)` takes the die size from a `dice-choice` field. An empty
or non-die value shows a field error and does not roll. An unknown id is
accepted at upload and reports an error only when rolled.

The parser runs the formula; the product never evaluates it with `eval`.
Anyone who can see a node can roll its dice cell. A roll from a hidden
template, tab, section or row is shown only to GMs.

## Preset changes

An upload keeps values by field id where the scope remains the same. One
confirmation names values and sheets that will be lost.

| Change | Effect |
| --- | --- |
| Add a field | The field is empty. |
| Remove a field or move it across a repeat boundary | Its values are erased after confirmation. |
| Change a field label, cell name or select options | Values are kept. |
| Change a field type, including `select` and `dice-choice` | Its values are erased after confirmation. |
| Add a single sheet | Its empty sidebar entry appears. |
| Remove a template, change its id, or add/remove template `repeat` | Its sheets and their values, links, owners and access are removed after confirmation. |
| Add, remove or change `repeat` on a tab, section or row | Blocks in that scope and their nested blocks are removed after confirmation. |
| Change `repeat.id` | The old blocks are removed after confirmation. |
| Change `repeat.nameField` | Block identity and values are kept; displayed names change. |
| Remove a token cell or its block | Its token links are removed. Links are not counted in the confirmation. |

## Limits and versions

- A file over 1 MiB is refused before it is read.
- A preset must fit one encoded room message.
- `window.width` is 480–1440 px and `window.height` is 360–1080 px,
  inclusive.
- A file with a version higher than `4` is refused so a newer build can read
  it. A file with no version, a non-integer version, or version 1–3 is
  refused. Older files are not converted.
- «Скачать пресет» writes the current version.

A refused file changes nothing. The upload reports the first invalid structure,
id, scope, cell, formula, repeat rule, size or version it finds. The Builder
uses the same checks and messages, and saving or downloading stays disabled
while a problem remains.

## Build a preset without JSON

The Builder page, `/builder.html`, creates a preset with forms for templates,
tabs, sections, rows and cells. It can open an empty preset, an example or a
file. Its preview shows one selected tab and applies the same visibility and
write rules as the room window.

The bundled examples are `docs/example-preset.json` and the files in
`tests/fixtures/presets/`. Files in `presets/` are standalone examples checked
by the preset owner.

## Annotated example

The complete example uses row objects, template repetition, explicit repeat
identities and token cells:

```jsonc
{
  "v": 4,
  "templates": [
    {
      "id": "pc",
      "title": "Персонажи",
      "repeat": { "nameField": "name" },
      "tabs": [
        {
          "sections": [
            {
              "title": "Персонаж",
              "rows": [
                {
                  "cells": [
                    { "kind": "text", "text": "Имя" },
                    { "kind": "field", "type": "text", "id": "name" },
                    { "kind": "token", "id": "token" }
                  ]
                }
              ]
            },
            {
              "title": "Атаки",
              "repeat": { "id": "attack", "nameField": "attack" },
              "rows": [
                {
                  "cells": [
                    { "kind": "field", "type": "text", "id": "attack" },
                    { "kind": "field", "type": "number", "id": "bonus" },
                    { "kind": "dice", "formula": "1d20 + bonus" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "inventory",
      "title": "Инвентарь",
      "players": "edit",
      "tabs": [ { "sections": [ { "rows": [ { "cells": [] } ] } ] } ]
    }
  ]
}
```

The shortened fragment shows the shape only; use
`docs/example-preset.json` for a complete valid file. The attack block is
addressed by the scope and block ids. A token in that block links to the
sheet, the attack path and the token-cell id.
