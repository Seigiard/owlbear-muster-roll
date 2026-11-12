---
title: 'TASK-38: build presets without writing JSON (preset builder page)'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: '208c950c762bddcd4c596498a01aa22c50a2ca6d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-builder.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A GM describes sheets only by writing preset JSON by hand. SPEC CAP-20 to CAP-28 ask for a builder page where a GM makes or changes a preset with no JSON and downloads a file the upload accepts.

**Approach:** A fourth page, `builder.html`, built from parts (AD-20 to AD-25): one store with an undo stack of documents, a react-aria `Tree` with drag, hand-written forms, and a preview drawn by the window's own sheet components. Checks reuse `parsePresetFile` through a new `presetProblems`. The extension Settings links to it.

## Boundaries & Constraints

**Always:** Interface text in Russian in `src/ui/copy.ts` (builder strings under `copy.builder`). Builder code never imports `@/platform/current`, `src/replica`, the replica client or the projection store. Download is `formatPresetFile` and only when `parsePresetFile` accepts it. Owner decisions in the UX memlog: layout B, system theme with a switch, drag only, opens on the draft with no prompt, one confirmation before replacing a non-empty draft, preview content as in EXPERIENCE.md "Preset builder".

**Never:** A second sheet renderer; editing on the sheet; blocking invalid edits; repairing a refused file; writing to a room; preset in the URL fragment; changing the preset format; editing SPEC.md; deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First open | No draft | Empty preset, 1 problem, download off | — |
| Return | Draft in storage | Draft opens, no prompt | Draft that fails the structure schema is dropped |
| Open file | Valid preset file | Replaces draft after one confirmation (none if draft empty); origin set | Bad file: upload message, draft unchanged |
| Rename id | `str` → `strength` with `1d20 <= str - 2*str_tired` | `1d20 <= strength - 2*str_tired`, "Формулы изменены: 1." | Invalid new id shows as a problem |
| Rename in repeat | Field `bonus` in repeat section, `bonus` also outside | Only formulas whose row resolves to the renamed one change | — |
| Invalid states | Duplicate id, bad formula, too-wide row, empty templates, window 200 | Each marked at its tree item and preview cell/row/section; counter = count | Download disabled with reason |
| Undo | Any edit, then undo, redo | Same preset each time | Typing in one input is one step |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- `parsePresetFile`, rule checks `presetRulesFailure`…`cellFailure` (refactor to collect all with paths; first must stay identical), `formatPresetFile`, `resolveFieldReference`, `WINDOW_SIZE_LIMITS`, `DEFAULT_WINDOW_SIZE`, `presetSchema` (export a structure-only parse for the draft).
- `src/core/field-id.ts` -- `isFieldId`, `isTemplateId`.
- `src/core/preset.test.ts` -- existing order tests guard the refactor.
- `src/ui/preset-errors.ts` -- `presetFailureMessage`, `badFileReason` (export the reason for item messages).
- `src/ui/sheet/preset-cell.tsx` -- `SheetCell`, `ReadOnlyValue`: add `CellPreviewContext` (data-cell wrapper, placeholder).
- `src/ui/sheet/preset-section.tsx` -- add `data-section-index` on section root, `data-row-index` on row divs.
- `src/ui/sheet/sheet-body.tsx`, `sheet-header.tsx`, `src/ui/shell/tab-bar.tsx` (`TabBar`, `ShellTab`), `src/ui/shell/window-shell.tsx` (`CONTENT_CLASS`) -- reused as is.
- `src/preview/themes.ts` (`PREVIEW_THEMES`), `src/ui/theme.ts` (`applyTheme`), `src/preview/stub-rolling.ts` (`createStubRolling`) -- reused.
- `src/ui/download.ts` -- `downloadJsonFile`.
- `src/ui/settings/settings-view.tsx` -- add the builder link to Пресет.
- `vite.config.ts` -- add `builder` input. `public/_headers` -- `/builder.html` no-cache. `tests/build.test.ts` -- add `builder.html` to required pages.
- `src/ui/main.css` -- tokens; no `font-mono` (theme reset): use `font-[ui-monospace,monospace]`.
- `tests/fixtures/presets/{d20,d6-pool}.json`, `docs/example-preset.json` -- bundled examples (`?raw`).
- `tests/preview.e2e.ts`, `tests/support/` -- e2e patterns.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/preset.ts` -- add `presetProblems(preset): PresetProblem[]` (failure + index path, parser order); `presetRulesFailure` returns its first; export `parsePresetStructure` -- AD-22.
- [x] `src/core/field-id-suggest.ts` -- `suggestFieldId(label, taken)`, `suggestTemplateId` with Russian transliteration -- AD-24.
- [x] `src/core/formula-rename.ts` -- `renameFieldId(template, place, oldId, newId) → { template, formulas }` -- AD-24.
- [x] `src/builder/document.ts` -- document with uids; `fromPreset`, `toPreset`, paths, pure edits (add/update/remove/move/rename) with defaults -- AD-21.
- [x] `src/builder/builder-store.ts` -- store, `apply` with coalescing, undo/redo, selection, origin, name, draft persistence -- AD-21.
- [x] `src/builder/problems.ts` -- builder problems (no templates, window) + `presetProblems` mapped to uids; download gate -- AD-22.
- [x] `src/builder/preview-records.ts` -- preview records and placeholder -- AD-23.
- [x] `src/builder/*.tsx` -- page, top bar, tree with DnD, forms, formula completion, preview -- AD-20, AD-23, AD-25.
- [x] `builder.html`, `vite.config.ts`, `public/_headers`, `tests/build.test.ts`, settings link, copy.
- [x] Unit tests beside each pure module; `tests/builder.e2e.ts`.

**Acceptance Criteria:**
- Given the builder page, when a GM adds a sheet set, a single sheet, sections, rows, labels, fields, dice cells and a window size through the tree and forms, then "Скачать пресет" downloads a file that `parsePresetFile` accepts and the extension upload loads.
- Given a file downloaded from the extension, when opened with "Файл…", then its templates show in the tree and preview; given a refused file, then the upload's message shows and the draft is unchanged.
- Given a form edit, then the preview redraws at once; given a click on a preview cell, then that cell's tree item is selected.
- Given a field after the label "Сила", when added, then its id is `sila`; when the label changes, then the id stays.
- Given a reload, then the draft returns with no prompt.
- Given each edit kind, when undone and redone, then the preset matches each time.
- Given an invalid preset, then each problem marks its tree item and preview element, the counter jumps to the first, and download is disabled.
- Given Settings in the window, then a "Конструктор пресетов" link to `/builder.html` with `target=_blank` shows in Пресет.

## Implementation Notes

- `presetProblems` reports every failure in parser order with an index path: a template, a section, a row or a cell. `parsePresetFile` keeps its first failure. `parsePresetStructure` accepts any draft whose structure parses, so a stored draft with problems opens again.
- The builder's own problems are the window size out of range and a preset with no templates. Core problems map to uids through `uidAt` and sort by tree order.
- Chunks: rolldown puts a group's dependencies into the group. So `src/core/`, zod and fflate now form a `core` chunk ahead of the `obr` group. Without it the builder page loaded the Owlbear SDK through zod. `tests/build.test.ts` now checks that the builder's entry imports no `obr-` chunk.
- The builder's entry chunk carries the fixed preview themes from `src/preview/`. The hex test of `tests/build.test.ts` skips `builder-*` chunks for that reason; the window chunks are still checked.
- React Aria warns when an item of a draggable tree has no drag button. The window and the add items get a hidden one; no drop accepts them.
- React Aria restores a tree's scroll on focus from its last `scroll` event. A test that scrolls and clicks in one frame selects the wrong row, so `tests/builder.e2e.ts` waits a frame before each tree click. A person never scrolls and clicks in one frame.
- The Settings link opens `/builder.html` in a new tab from the extension iframe. The mock proves the link only; a new tab from a live Owlbear room is the owner's check.

## Spec Change Log

## Review Triage Log

## Design Notes

Document uids: tree keys, selection and expansion survive moves; `toPreset` drops them. Problems carry index paths from core; `problems.ts` maps them to uids through the same document.

Preview cell hook (window unchanged when the context is `null`):

```tsx
const preview = useContext(CellPreviewContext);
const node = /* existing render */;
return preview === null ? node : <div className="contents" data-cell={`${row.sectionIndex}.${row.rowIndex}.${cellIndex}`}>{node}</div>;
```

Marks: the preview injects a scoped `<style>` with `[data-cell="…"] > *` / `[data-section-index="…"]` outlines for the selected item and problems.

Spec length: above the 1600-token target. Kept whole on purpose: one user goal, owner asleep, autonomous run.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .` -- clean
- `bun run lint` -- 0 errors
- `bun run typecheck` -- 0 errors
- `bun test` -- all pass
- `bun run test:browser` -- all pass (outside the sandbox)
- `bun run build` -- emits `builder.html`
