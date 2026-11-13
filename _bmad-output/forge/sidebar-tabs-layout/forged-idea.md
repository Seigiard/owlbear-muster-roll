# Forged idea: sidebar and tabs layout

Outcome: HARDENED. No live users, so backward compatibility is not a constraint.

## Locked

- **Format:** every template (sheet set and single sheet) has a required `tabs: Tab[]`; `Template.sections` is removed. `Tab = { title?, visibility?, sections }`, strict. `title` may be omitted only when the template has one tab. `v` becomes 3; v2 presets and snapshots are refused, no converter.
- **One tab** draws no tab bar.
- **Visibility:** GM-only is set in the preset on two levels: the template (exists) and the tab (new). It only narrows. No per-sheet runtime hiding. No check for a visible template whose every tab is `gm`: the author's choice.
- **Hidden tab** behaves as a hidden template does: rolls show only on GM clients, linked repeat blocks give players no token menu. Known leak, accepted: a visible dice formula that names a field on a hidden tab shows its value in the roll (hiding is interface-only).
- **Field id scopes unchanged:** all fields outside repeat sections of a template are one scope across its tabs; formulas may name fields on other tabs.
- **Sidebar** replaces the window tab bar. Permanent, ~8–9 rem, long names truncate with a tooltip. `window.width` minimum rises from 360 to 480.
- **Sidebar order:** preset order. Each sheet set is a group: its title as a heading (text, not a control), its sheets (a player's own first), its "+". Single sheets are plain entries with no heading. A divider follows a set group. Settings is pinned at the bottom.
- **Tabs:** many tabs scroll in one row. A token that opens a repeat block also selects its tab. A selection mark on a block in an unselected tab also marks that tab.
- **One window frame** component (navigation model in, sidebar + tabs + content out) is used by the extension, `preview.html` and the builder preview; today the frame is rebuilt by hand in three places.
- **Builder:** Tab is a tree node between template and section; a new template starts with one untitled tab; sections drag between tabs; the tab form has title and visibility. Preview frames let you switch tabs; the builder preview shows the tab of the selected tree node.
- **Terms (GLOSSARY.md, same commit):** Tab («Вкладка») = the new template level. Sidebar = the navigation column; Sidebar entry = one item (a sheet, a set's "+", settings). The old "sheet tab" meaning is retired: `sheet-tabs.ts`/`TabEntry` → `sidebar-entries.ts`/`SidebarEntry`.

## Rejected

- **Schema-driven builder** (forms and tree generated from the zod schema): the true exceptions stay hand-written (data-dependent value domains such as `nameField` and formula ids; edits with side effects such as id rename across formulas, set↔single, field type change; formula and options inputs), and the cell form is mostly exceptions. Not convinced it simplifies code.
- **`Section.tab?: string`:** a tab as a string, not a node; typos make new tabs.
- **Optional `tabs`:** two shapes in every consumer, no compatibility reason left.
- **Collapsible sidebar below a width threshold:** a second navigation mode for little gain.

## Later

- A collapse button for the sidebar, state remembered locally per client.
- Node descriptor table for `src/builder/document.ts` navigation; `z.toJSONSchema()` export for editor autocompletion.

## Touch points

`src/core/preset.ts` (schema, checks), `src/core/format-version.ts`, `src/core/visibility.ts`, `src/ui/sheet-tabs.ts`, `src/ui/shell/*`, `src/ui/sheet/sheet-body.tsx` (render and values signature), `src/preview/preview-page.tsx`, `src/builder/{document,structure-tree,item-form,preview-pane}.ts(x)`, `docs/preset-format.md`, `_bmad-output/specs/spec-muster-roll/preset-format.md`, `docs/example-preset.json`, `presets/*.json`, test fixtures, `GLOSSARY.md`.
