---
title: 'TASK-154: Builder as a three-column workspace'
type: 'feature'
created: '2026-11-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '614e1405743a45fa9c85472866c7f154a7714e03'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the Builder the item form sits under the structure tree and the page scrolls, so editing a selected block means scrolling past the tree. Every tree container ends with permanent add rows (a row has four), which makes long presets hard to scan, and the top bar's file cards are tall.

**Approach:** Adopt the layout and density of the owner's reference prototype (`~/Downloads/owlbear_studio_example.html`, read-only): tree left, preview centred on a canvas, block properties right, one compact top bar, every pane scrolling on its own. Layout and look only; the owner excluded the prototype's new functions.

**Decisions (owner, 2026-11-21):**
- Palette: theme tokens. The Builder keeps the Owlbear theme copies; the prototype's colours are not adopted.
- Tree icons: each tree item shows a small muted type icon before its label (window, template, tab, section, row, label, field, dice, token), details in muted text after it. `DESIGN.md` gains an exception for the Builder tree. Icons are `aria-hidden`; accessible names stay as today.
- Add items: a container's add items show only when that container is selected or one of its direct children is selected. The two top-level template add items ("Добавить набор", "Добавить одиночный лист") always show at the end of the tree. `EXPERIENCE.md` changes from "each container ends with add items" to this rule.

## Boundaries & Constraints

**Always:** Keep every current Builder behavior: file blocks and their menus, conflicts and confirmations, problem counter and marks, react-aria treegrid keys, drag reorder, preview selection and record editing, theme switch, undo keys. Interface text in `src/copy.ts`. Colours come from the Builder's theme tokens (`src/ui/main.css`, `src/ui/themes.ts`); the preview window keeps the app's sheet look. Update `DESIGN.md` and `EXPERIENCE.md` (Preset builder sections) to the new layout in the same change. `className` assembly by `clsx`/`cva`.

**Never:** Tree search, a JSON mode or per-block JSON view, block duplication, new keyboard shortcuts. No change to `document.ts`, `builder-store.ts`, problems, file access or preview composition logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Desktop | 1400 × 1000 viewport, example preset | Three columns; page has no scroll; each pane scrolls alone | N/A |
| Narrow | 1000 px wide | Three columns still fit; preview frame scales down keeping proportions | No horizontal page scroll |
| Large window | Custom size 1440 × 1080 | Frame scales to the centre pane width, as today | N/A |
| Empty preset | First visit | Tree shows window + two add items; canvas shows "Добавьте набор или одиночный лист."; properties show the window form | N/A |
| Confirmation | Open example over a draft | Confirmation shows under the top bar; columns keep filling the rest of the height | N/A |
| Add items | Field in row 2 selected | Row 2 shows its add items; other rows show none; "Добавить набор"/"Добавить одиночный лист" stay at the end | N/A |
| Add to fresh row | "Добавить строку" pressed | New row selected, so its cell add items appear under it | N/A |
| Problem focus | Problem counter pressed on an empty preset | Focus goes to "Добавить набор" as today | N/A |

</frozen-after-approval>

## Code Map

- `src/builder/builder-page.tsx:980-1121` -- page shell: `main` is `min-h-dvh` and scrolls; grid of two columns; `ItemForm` under `StructureTree`. Becomes a full-height grid of three panes.
- `src/builder/builder-page.tsx:1167-1280` -- `TopBar`: `h1`, draft `output`, undo/redo, problem counter (`data-problem-count`), two `FileBlock`s, theme switch. Compact to one 44 px row; keep accessible names.
- `src/builder/file-block.tsx:93-112` -- three-line card button (`FILE_BLOCK_CLASS`). Make it a one-line chip; keep the status text reachable (accessible name, `title`). e2e finds it by `header` button text starting "Пресет"/"Снимок".
- `src/builder/structure-tree.tsx:66-76,200,232-313` -- `ITEM_CLASS`, `ADD_ITEM_CLASS`, `max-h-[50vh]` on the `Tree`, `Item` row content, `AddItem`. Pane scroll replaces `max-h-[50vh]`; row density and secondary text here. `cellItemLabel` (line 442) builds labels like "name · Текст" — accessible names used by e2e, keep them.
- `src/builder/item-form.tsx:90-99` -- form `section` (`data-builder-form`) with `rounded-md bg-surface p-3`; heading. Becomes the right pane body.
- `src/builder/preview-pane.tsx:586-625` -- `section[data-builder-preview]`, `h2` pane title, `PreviewRoleSwitch`, `area` ref measured for `scale` (line 464, `useElementWidth` at 1035). Move title and role switch into a toolbar; centre the frame on a canvas background; keep scale-to-width.
- `src/ui/main.css` -- tokens; a canvas dot pattern may use `--color-line` on `--color-surface-bar`.
- `src/copy.ts` (`copy.builder`) -- all labels; add only if a new visible label appears.
- `tests/builder.e2e.ts:105-200` -- helpers at 1400 × 1000: `tree`, `item`, `form`, `preview`, `fileBlock`, `pick` (scrolls into view), `dragOnto` (needs both rows on screen). `tests/builder-snapshot.e2e.ts` uses the same shapes.
- Do not touch: `document.ts`, `builder-store.ts`, `problems.ts`, `attached-files.ts`, `file-access.ts`, `preview-*.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/builder/builder-page.tsx` -- full-height shell `h-dvh` with top bar, confirmations, banners, then a three-pane grid (tree ~280 px, preview `1fr`, properties ~340 px), each pane `overflow-auto`, `min-h-0` -- fixes the form below the fold.
- [x] `src/builder/builder-page.tsx` `TopBar` + `src/builder/file-block.tsx` -- one compact row; status pills for draft and problems; file blocks as one-line chips.
- [x] `src/builder/structure-tree.tsx` -- drop `max-h-[50vh]`; denser rows; type icon and muted detail text; render a container's add items only per the add-items decision (`allAddKeys` must list only rendered add keys so `disabledKeys` stays exact).
- [x] `tests/builder.e2e.ts`, `tests/builder-snapshot.e2e.ts` -- flows that press an add item first select its container where it is not already shown; assert the add-items rule once (I/O rows "Add items" and "Add to fresh row").
- [x] `src/builder/preview-pane.tsx` -- toolbar with pane title and role switch; canvas background; frame centred with its size label.
- [x] `src/builder/item-form.tsx` -- right-pane styling; heading as pane header.
- [x] `tests/builder.e2e.ts` -- add one layout test: at 1400 × 1000 with the example preset, the three panes sit side by side, the page does not scroll, and the form is in the viewport. Adjust existing helpers only where layout broke them.
- [x] `DESIGN.md`, `EXPERIENCE.md` -- Preset builder sections describe the three-pane layout and the decisions above.

**Acceptance Criteria:**
- Given the example preset at 1400 × 1000, when a tree item is selected, then its form is fully visible in the right pane without page scroll.
- Given a long tree, when the tree pane scrolls, then the top bar, preview and form stay in place.
- Given any existing builder e2e flow, when run after the change, then it passes with only layout-helper edits.

## Implementation Notes

- Built through the `implement` skill; tdd run directory `~/.claude/artifacts/tdd-20261121-084943/task-154-builder-three-column/`. Three batches: the initial build (criteria 1-15), review round 01 fixes (criteria 16-19: visible file-chip warnings, padding-aware preview scale, wrapping top bar, Tailwind responsive variants in place of global CSS), and the Matrix Test Audit gap (criterion 20: empty-preset problem focus).
- Commits: `99dd236` tests, `4709793` implementation, `0effc78` UX docs, `9712b1f` problem-focus test. The pre-reslice chain stays at `refs/tdd/tdd-20261121-084943/task-154-builder-three-column/chain`.
- The file chip shows only the file name in neutral states; a problem status (blocked, changed, refused, failed) shows as visible warning text, and every state carries the full status in the accessible name and `title`.
- Below 1000 px the panes stack in one column (Tailwind `max-[999px]:` variants); the 700 px repeat-tab suites depend on it.
- Evidence: full `bun run test:browser --workers=1` 606 passed on the final tree; `bun test` 3695 passed; oxfmt, lint, typecheck and build green. `bun run mutants` not run (CI).
- Code review: revmux round 01-initial (mixed, 6/6 sources, 11 findings, all routed) and round 02-after-fix (final, 2/2, one minor, deferred).

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence | Route |
|---|---|---|---|
| bugs+impl-1 (code-review round 02, deferred): preview scale can oscillate when the canvas's classic vertical scrollbar toggles (`src/builder/preview-pane.tsx:464,608-611`) | maybe-false | `scale` divides the canvas content width, and the canvas is `overflow-auto`; with a classic (non-overlay) scrollbar a frame whose scaled height sits near the canvas height could add and remove the scrollbar in turn. Not observed with overlay scrollbars; settling it needs Chromium with classic scrollbars at that height. | defer (medium, unverified) |
| docs+tests-claude-4 (code-review round 01, deferred): the `my-auto` wrapper fix has no test that fails without it (`src/builder/preview-pane.tsx:616`) | false | A missing test is not a bad outcome: the wrapper carries `my-auto`, so a frame taller than the canvas keeps its top reachable. | reject |

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run build` -- expected: pass (~3 min).
- `bun run test:browser` (outside the sandbox) -- expected: pass (~8 min).
- `bun run mutants` -- CI and on request only.

**Manual checks:**
- Screenshots at 1400 × 1000 and 1000 × 800, light and dark, compared with `.playwright-mcp/example.png`.
