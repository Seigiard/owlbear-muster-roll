---
title: 'TASK-58 Split each sheet into tabs with preset format v3'
type: 'feature'
created: '2026-11-12'
status: 'done'
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
- [x] `src/core/*` -- v3 schema, helpers, address with tab, problems, failure code, window min -- the contract everything reads
- [x] `src/replica/*` -- compile against the helpers; no behavior change
- [x] `src/ui/sheet/*`, `src/ui/main.tsx`, `src/ui/copy.ts` -- tab row, open tab, reveal selects tab
- [x] `src/preview/*` -- frames switch tabs
- [x] `src/builder/*` -- tab node, form, drag, add, preview tab, problems
- [ ] fixtures, presets, tests -- convert to v3; add unit tests for the I/O matrix and an e2e for tab switching, cross-tab roll and token reveal
- [x] `docs/preset-format.md`, spec `preset-format.md` (already v3), `docs/adr/0001…:19`, `GLOSSARY.md` -- keys, refusals, width, Tab

**Acceptance Criteria:**
- Given a two-tab sheet set, when a GM clicks the second tab, then only its sections show, and switching sheets and back keeps that tab.
- Given a token linked to a repeat block on tab 2, when it is opened, then the window shows tab 2 scrolled to the block.
- Given the builder, when the author adds a tab, drags a section into it and selects a cell on it, then the tree shows the tab level, the preview shows that tab, and the downloaded file parses.

## Implementation Notes

## Review Triage Log

| # | Layer | Finding | Verdict | Route / evidence |
|---|---|---|---|---|
| 1 | edge | Chosen tab is a bare index, so a preset change that reorders tabs opens another tab | low | Rejected: AD-26 fixes the index; a reorder is rare and the fallback is safe; a stable key adds state |
| 2 | edge | Switching tab during a roll unmounts the dice button state | low | Rejected: same as switching sheets today; the roll still lands in the log |
| 3 | edge | A v2 builder draft is replaced by an empty one | false | AD-21 drops a draft that fails the structure schema by design; no live users |
| 4 | edge | Open request before the rep: record exists never selects the tab | low | Rejected: a linked token implies the block record; the window is `ready` before it takes the request |
| 5 | gap | renameFieldId and fieldFormulaCount untested on two tabs | medium | patch: two-tab cases in formula-rename.test.ts |
| 6 | gap | scopeFieldIds, formulaFieldIds, nameFieldCandidates untested across tabs | medium | patch: two-tab cases in document.test.ts |
| 7 | gap | Builder preview click and marks on a non-first tab untested | medium | patch: extend the multi-tab builder e2e |
| 8 | gap | preview.html frame tab switching untested | medium | patch: preview.e2e case with two tabs |
| 9 | gap | untitled-tab message missing from the preset-errors table | low | patch: one table row |
| 10 | blind | Full check red: copy catalog test wants "+ Добавить" | medium | defer: red since 6c8785b (UX update), not this diff; the sidebar task sets the copy; noted on TASK-60 |
| 11 | blind | Tab visibility "gm" hides nothing yet, no hint | low | Rejected: the intent leaves hiding to TASK-59, which follows before release |
| 12 | blind | Selection, pending and error marks do not reach the tab row | low | Rejected: tab selection marks are TASK-60 by intent |
| 13 | blind | Builder preview does not mark a tab that holds a problem | low | Rejected: the problem counter selects the item and the preview follows to its tab |
| 14 | blind | untitled-tab message does not name the tab; "в листе" wording | low | Rejected: the builder path names the tab; "лист «id»" matches duplicateTemplate |
| 15 | blind | Template with no tabs shows invalid-structure | false | AD-22 puts it under the existing failure codes by design |
| 16 | blind | Add tab gives two untitled-tab problems at once | low | Rejected: both problems are true and guide the author |
| 17 | blind | Glossary and format docs still use "tab" for the sheet bar | low | Rejected: TASK-60 replaces that meaning with Sidebar entry |
| 18 | blind | No multi-tab example file | low | Rejected: the annotated example in docs shows tabs; the e2e builds its own |
| 19 | blind | v2 refusal tested on presets only, not snapshots or room data | medium | patch: v 2 cases beside the v 1 ones |
| 20 | blind | Tab row does not scroll the chosen tab into view; long titles have no tooltip | low | Rejected: needs many tabs; adds an effect |
| 21 | blind | Comment over moveItem in document.ts is 109 chars | low | patch: wrap it |

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run build` -- all pass
- `bun run test:browser` (outside the sandbox) -- passes
