# Forged idea: uniform preset tree

Outcome: HARDENED. A format change (v → 4) plus a record model change. No live users, so no converter.

## Locked

- **Fixed depth, one child kind per level:** `template → tab → section → row → cell`. Every level is a node with the same key vocabulary; a per-kind registry lists which keys it takes and its one child kind.
- **`repeat` at every container level, as an object.** `repeat: { id, nameField }` on tab, section and row; `repeat: { nameField }` on the template (its `id` exists anyway). It means "one block per instance"; the node kind decides how blocks show: template → sheets in the sidebar, tab → tabs with a "+" tab, section and row → stacked blocks. `kind: "set" | "single"` is removed: a sheet set is a template with `repeat`. GLOSSARY words "Sheet set" and "Single sheet" stay as UI labels.
- **`nameField` names the block of its own scope** and replaces the first-field rule. Sidebar, rolls, block render, "+" and token labels all read it. Required with `repeat`, must name a `text` field inside the scope.
- **Nested repeat is allowed.** A block is addressed by a path of `(scopeId, blockId)` pairs under the sheet. A formula resolves an id in its own block, then each enclosing block, then the sheet. Duplicating a block copies its nested blocks.
- **Ids only where something refers to the node:** template, field, token cell, repeat scope (inside `repeat`). Tabs and non-repeat sections and rows have no id. Changing a repeat scope id erases its blocks, as a template id change erases sheets. The builder mints ids from titles, as it does for fields.
- **Token is a cell, `{ kind: "token", id }`, and a bookmark.** `tokens: true` leaves the template and the section, with the "tokens only with repeat" refine. The token opens the sheet scrolled to that cell, as to a block today. Several token cells per sheet are allowed. The label comes from the nearest ancestor that has one: the block's `nameField`, then a section `title`, then the sheet name or template `title`. The link record gains a cell reference: `{ s, path?, c }`.
- **Value records: one record per block, the sheet root included.** `blk:<sheet>[:<scopeId>:<blockId>]*` → `{ order, cells }`, and each cell carries its own `[value, counter, author]`. Merge is per cell; a `null` record deletes the block. `row:` and `rep:` keys are removed. Measured on a synthetic room (6 PCs × 40 fields + 10 inventory blocks each, 60 NPC blocks × 5 fields): 7436 B deflated, 126 records, against 4644 B / 198 today. Fallback if per-cell merge proves awkward: one record per field (9048 B / 846 records).
- **`visibility` on template, tab, section and row.** A node shows when it and every ancestor show. Cells have none.
- **`players: "edit"` on any template.** On a repeat template it means every player edits every sheet of the set; per-player access stays on top as today. No key-depends-on-key rule remains in the schema.

## Registry

| Node | Keys | Children |
|---|---|---|
| preset | `v`, `window?` | `templates[]`, ≥ 1 |
| window | `width`, `height` | — |
| template | `id`, `title`, `visibility?`, `repeat?: { nameField }`, `players?: "edit"` | `tabs[]`, ≥ 1 |
| tab | `title?` (required with > 1 tab), `visibility?`, `repeat?: { id, nameField }` | `sections[]` |
| section | `title?`, `width?`, `columns?`, `visibility?`, `repeat?: { id, nameField }` | `rows[]` |
| row | `visibility?`, `repeat?: { id, nameField }` | `cells[]` |
| cell | `text { text }` · `field { type, id, name?, options? }` · `dice { formula, name? }` · `token { id }` | — |

Rule checks that stay outside the schema: unique ids per scope, `nameField` names a `text` field inside its scope, formula ids, row width against `columns`.

## Rejected

- **A name-field property on the token cell:** a second source for the scope's name; the name belongs to the scope.
- **Whole-block last-writer-wins for values:** smallest snapshot (4040 B) but loses concurrent edits of different fields on one sheet, which today only happens inside one layout row.
- **Id on every node:** nobody reads a tab or plain section id.
- **Forbidding or limiting nested repeat:** makes a repeat tab (NPC per tab) useless, since an NPC needs its own lists.
- **Mixed nesting** (rows in a tab, cells in a section): a titleless section already renders no heading; it buys one bracket and costs two shapes in every consumer.
- **A hidden row in a `columns` grid:** accepted as the author's choice; it leaves a gap or shifts the grid.

## Weak points that survive

- Per-cell merge changes `src/core/merge.ts` from record-level to cell-level: the core of sync. The per-field fallback exists for this reason.
- A bookmark token cell removed from the preset removes its links, as `tokens` removal does today.
- Snapshot grows ~60 % against today for the same room.

## Touch points

`src/core/preset.ts` (schema, checks, section helpers), `src/core/records.ts` (keys, cell versions), `src/core/merge.ts`, `src/core/sheet-values.ts`, `src/core/sheets.ts` (names), `src/core/token-links.ts`, `src/core/link-target.ts`, `src/core/visibility.ts`, `src/core/preset-migrate.ts`, `src/core/formula-rename.ts`, `src/core/format-version.ts`, `src/replica/*` (commands on blocks), `src/ui/sheet/*` (repeat tab, token cell, hidden section/row), `src/ui/shell/sidebar-entries.ts`, `src/builder/{document,structure-tree,item-form,preview-pane,preview-records}.ts(x)`, `docs/preset-format.md`, `_bmad-output/specs/spec-muster-roll/preset-format.md`, `docs/example-preset.json`, `presets/*.json`, `GLOSSARY.md`.
