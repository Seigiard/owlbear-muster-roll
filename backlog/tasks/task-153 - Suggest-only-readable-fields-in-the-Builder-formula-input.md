---
id: TASK-153
title: Suggest only readable fields in the Builder formula input
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-20T17:15:00Z'
updated_date: '2026-11-20T19:27:00Z'
labels: []
dependencies:
  - TASK-152
references:
  - src/builder/document.ts
  - src/builder/item-form.tsx
  - src/core/preset.ts
documentation:
  - >-
    _bmad-output/implementation-artifacts/spec-task-153-readable-formula-suggestions.md
priority: low
type: bug
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Builder formula completion can suggest a field that the dice cell cannot read. A plain dice row next to a repeat row gets row_bonus as a suggestion even when row_bonus is defined only inside the repeat row. Selecting it leaves an unresolved reference and disables preset export. The same scope mismatch affects repeat-tab fields. TASK-152 validates these references but does not change completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dice cell never suggests an id owned only by a child or unrelated repeat block.
- [x] #2 A dice cell still suggests readable field ids in its own block, enclosing blocks, and the sheet across plain tabs.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the wrong completion list in Chromium for a plain dice cell and a nested dice cell.
2. Pass the dice cell row to completion and reuse the preset validator’s field-scope resolution. Keep closest-scope-first order.
3. Check the suggestions and preset download in Chromium. Run the repository checks, then open the PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC 1–2: Chromium Builder tests assert exact plain and nested option lists and prove that accepting a readable numeric suggestion leaves preset download enabled. The two moved-repeat document tests verify that a duplicate repeat id never makes a child or adjacent section readable. The draft still reports the id conflicts.

Final source at 8039eaca66fa25da67d23c9fb3994b202aa7bcb6: bun run test:browser --workers=1 passed all 598 tests; format, lint (warnings only), typecheck, Bun tests (3,695 pass, one skip), build, formal drift, and mutants (55 killed) passed. The TASK-152 comparison matched 2,396 reference results across shipped presets. Two reviewers reported no findings in the confirming round.

First full Chromium run at 2184de0556f7e4a166baca4a406b317c56a97dfd: 597 pass, one 30 s timeout in tests/builder.e2e.ts:570 (opening the Snapshot file menu before clearing). Preserved the original log and error context. The traced exact retry passed during the source change; the full Builder file then passed 38/38 on clean final source. The initial full run remains red. This is recorded here with the TASK-142 flake history; the timeout cause was not established and no new task was filed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Builder formula completion now shows only field ids the selected dice cell can read, from its own block through the sheet scope. Completion and preset validation share one lookup. Draft moves keep their existing conflict warnings. The final Chromium suite passed all 598 tests, including both completion scenarios; the Bun suite and other local checks passed.
<!-- SECTION:FINAL_SUMMARY:END -->
