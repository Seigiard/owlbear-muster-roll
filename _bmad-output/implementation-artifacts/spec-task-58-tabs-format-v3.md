---
title: 'TASK-58 Split each sheet into tabs with preset format v3'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: '411b3d04d0bd49351d39f87b5b7112fdb7034e1f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A long sheet does not fit one window, and a GM cannot put a part of a sheet on its own page. Backlog TASK-58, story 1 of `_bmad-output/specs/spec-muster-roll/stories.yaml`; the owner said «заводи и выполняй» and set no spec checkpoint.

**Approach:** Format v3: every template holds a required `tabs: [{ title?, visibility?, sections }]` and loses `sections`. A cell address becomes `{ tab, section, row, cell }`. The window sheet, `preview.html` and the builder show a tab row under the sheet header and the sections of one tab. Record keys do not change.

## Boundaries & Constraints

**Always:**
- `FORMAT_VERSION` is 3, so storage keys get `mr3`. v1 and v2 presets, snapshots and messages are refused as older formats are today. No migration.
- `tabs` has at least one tab in a file; the builder draft accepts zero tabs and shows it as a problem at the template. A tab title is required when the template has more than one tab; the problem path names the tab.
- Field id scopes, `nameField` lookup, migrate diffs, token links and sample records read all sections of a template across its tabs.
- `section` in an address counts within its tab. The roll request, `data-cell="{tab}.{section}.{row}.{cell}"`, problem paths, `TemplateRowPlace` and `resolveFieldReference` use one form; one `core` function maps an address to its section.
- The open tab is client UI state per sheet: chosen index if it exists, else the first tab. It never enters a record, message or snapshot.
- A template with one tab draws no tab row. Tab row: react-aria `Tabs`, `Left`/`Right`, horizontal scroll on overflow (EXPERIENCE.md "Tab row", DESIGN.md).
- Opening a repeat block from a token selects the tab that holds its repeat section.
- `window.width` accepts 480 to 1440.
- Interface text is Russian in `src/ui/copy.ts`. Glossary gains **Tab** in the same commit.

**Never:**
- Hiding anything by tab `visibility` (TASK-59); the key is accepted and kept by the builder.
- A sidebar, `WindowFrame`, or tab selection marks (TASK-60). The sheet tab bar stays.
- Tab indexes in record keys.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| v3 preset | 2 tabs, titled | Parses; sheet shows tab row, first tab open | N/A |
| One untitled tab | 1 tab, no title | Parses; no tab row | N/A |
| Untitled among many | 2 tabs, one with no title | Refused | new failure code, Russian message naming the template |
| Old file | `"v": 2` | Refused | existing unsupported-version message |
| Cross-tab formula | dice on tab 2 names a field on tab 1 | Rolls with that value | N/A |
| Duplicate id across tabs | same field id on tab 1 and tab 2 outside repeats | Refused | existing `duplicate-id`, path on the second |
| Move section between tabs | upload moves a section | No values erased, short notice | N/A |
| Remove a tab with values | upload drops a tab | Confirmation counts its values | N/A |
| Narrow window | `window.width` 400 | Refused | `badWindow` names 480–1440 |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- schemas (`sectionSchema` :66, templates :81-99, `presetStructureSchema` :126), `TemplateLayout` :148, `TemplateRowPlace` :163, scope helpers :316-376, `presetProblems` :388, `nameFieldFailure`, `sectionsProblems`, `formulaTypeProblems` :608, `fieldReference` :686, `WINDOW_SIZE_LIMITS` :108. Add `tabSchema`, `layoutSections(layout)` (all sections in order) and `sectionAt(layout, place)`.
- `src/core/format-version.ts` -- 2 → 3; `src/core/storage-key.ts` follows it (fix the `mr2` comment).
- `src/core/dice-roll.ts:34` `dicePlaceSchema` gains `tabIndex`; `prepareDiceRoll` :96, `fieldLabel` :235.
- `src/core/formula-evaluate.ts:242,334`, `src/core/formula-rename.ts` (`TemplateCellPlace`, `renameFieldId` maps tabs→sections), `src/core/field-patch.ts`, `src/core/preset-migrate.ts` (`stripToTemplate`, `presetMoves`, `templateScopes`), `src/core/snapshot-import.ts`, `src/core/token-links.ts:185`, `src/core/sheets.ts:102` -- swap `layout.sections` for `layoutSections`, add tab to index places.
- `src/replica/*` -- through the helpers above; `engine.ts:1842` passes the place through.
- `src/ui/sheet/sheet-body.tsx` -- takes the open tab index, renders that tab's sections; `BlockReveal` :16; `sheetValuesSignature` reads all tabs. `preset-section.tsx`, `dice-button.tsx`, `preset-cell.tsx:106` -- carry `tabIndex` into `DiceRow`, `data-cell`.
- `src/ui/main.tsx:418-440` -- open request → block reveal; resolve the tab from the `rep:` record's section id. `:573`, `:623` -- tab row between `SheetHeader` and `SheetBody`; open-tab state map per sheet.
- `src/preview/preview-page.tsx:192` `SheetFrame`, `src/preview/sample-records.ts:88`.
- `src/builder/document.ts` -- `DocTab`, `ItemPath` kind `tab`, `PARENT_KIND`, locate/uidAt/indexPath/treeOrder/item moves, `newSheetSet`/`newSingleSheet` start with one untitled tab, `addSection` into a tab, `renameField` place. `structure-tree.tsx` -- `TabItem`, `add:tab`, drag type `tab`. `item-form.tsx` -- `TabForm` (title, visibility), headings. `problems.ts`, `preview-records.ts`, `preview-pane.tsx` (tab row; `clickedUid` :157 must not mistake sheet tabs for template tabs; shown tab follows selection).
- `src/ui/copy.ts:136,264` -- window hint 480; new failure and builder labels. `src/ui/preset-errors.ts`.
- Fixtures: `docs/example-preset.json`, `presets/cairn-2e.json`, `tests/fixtures/presets/*.json`, `tests/support/room.ts:33` (`mr2`), ~40 unit and ~25 e2e files with inline templates.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/*` -- v3 schema, helpers, address with tab, problems, failure code, window min -- the contract everything reads
- [ ] `src/replica/*` -- compile against the helpers; no behavior change
- [ ] `src/ui/sheet/*`, `src/ui/main.tsx`, `src/ui/copy.ts` -- tab row, open tab, reveal selects tab
- [ ] `src/preview/*` -- frames switch tabs
- [ ] `src/builder/*` -- tab node, form, drag, add, preview tab, problems
- [ ] fixtures, presets, tests -- convert to v3; add unit tests for the I/O matrix and an e2e for tab switching, cross-tab roll and token reveal
- [ ] `docs/preset-format.md`, spec `preset-format.md` (already v3), `docs/adr/0001…:19`, `GLOSSARY.md` -- keys, refusals, width, Tab

**Acceptance Criteria:**
- Given a two-tab sheet set, when a GM clicks the second tab, then only its sections show, and switching sheets and back keeps that tab.
- Given a token linked to a repeat block on tab 2, when it is opened, then the window shows tab 2 scrolled to the block.
- Given the builder, when the author adds a tab, drags a section into it and selects a cell on it, then the tree shows the tab level, the preview shows that tab, and the downloaded file parses.

## Implementation Notes

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run build` -- all pass
- `bun run test:browser` (outside the sandbox) -- passes
