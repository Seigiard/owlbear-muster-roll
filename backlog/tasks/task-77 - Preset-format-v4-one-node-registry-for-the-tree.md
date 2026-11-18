---
id: TASK-77
title: 'Preset format v4: one node registry for the tree'
status: Done
assignee:
  - '@openai'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-18T10:06:00Z'
labels:
  - format-v4
dependencies:
  - TASK-76
references:
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
  - TASK-88
type: feature
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every irregularity of format v3 is a special case in the checks and the builder: `kind: set|single`, a block named by its first field, `tokens: true` bound to `repeat`, a row that is a bare array, visibility on two levels only. Format v4 gives every level the same key vocabulary: `repeat: {id, nameField}` on template, section and row, `visibility` on section and row, a token cell with an id in place of `tokens: true`, `nameField` in place of the first-field rule. Story 9 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec checkpoint); CAP-2, CAP-3, CAP-5, CAP-6, CAP-8, CAP-14, CAP-18, CAP-30, CAP-35. `repeat` on a tab and a repeat scope inside another are refused by a temporary check until the two next tasks. No live users: v1-3 are refused, no converter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The schema is `template > tab > section > row > cell` with the keys of preset-format.md "Tree": `repeat: {nameField}` on a template, `repeat: {id, nameField}` on a section and a row, `visibility` on section and row, `players: "edit"` on any template, cell kinds text, field, dice and `token {id}`; `kind` and `tokens` are gone; `v` is 4 and v1-3 presets and snapshots are refused
- [x] #2 Rule checks refuse a duplicate id in a scope, a `nameField` that names no `text` field inside its scope, `repeat` on a tab and a repeat scope inside another (temporary), and each shows at its item in the builder and under the upload button
- [x] #3 A sheet set is a template with `repeat`: sidebar groups, "+", sheet names, rolls and the duplicate number read `repeat.nameField`; a block key uses `repeat.id`; a repeat row draws as a block of one row
- [x] #4 A token cell shows the GM an icon with the link status and a menu to link, unlink and select the linked tokens on the map, and players nothing; a link record names the sheet, the block path and the cell id; the picker offers the nearest ancestor name (block nameField, section title, sheet name or template title) as the label; several token cells per sheet work
- [x] #5 A hidden section or row is invisible to players, its rolls show only on GM clients, and its token cells give players no menu, through src/core/visibility.ts
- [x] #6 An upload that changes `repeat.id`, adds or removes `repeat`, or removes a token cell follows the table in preset-format.md "Preset changes" with one confirmation that counts the erased values
- [x] #7 docs/preset-format.md, docs/example-preset.json (parsed by `bun test src/core/preset.test.ts`), presets/*.json, test fixtures and GLOSSARY.md (Repeat scope, Block, Token cell added; Linkable retired; Repeat section widened) describe v4
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Approve _bmad-output/implementation-artifacts/spec-task-77-preset-format-v4.md at the bmad-build checkpoint.
2. Implement the v4 node registry, shared validation and stable repeat scopes; update naming, access and visibility.
3. Update token-cell link records, commands, rendering, opening and selection; apply preset-change loss rules.
4. Adapt Builder conversion and existing operations without adding TASK-80 controls; port examples, fixtures and docs.
5. Verify the acceptance matrix with calibrated targeted regressions, the required full changed-path checks and bmad-build review.

Cell-menu linking opens all scene tokens, marked when already linked. Prefer viewport-visible unlinked, off-screen unlinked, viewport-visible linked, off-screen linked. Extend both platform adapters for token listing and viewport data; keep the existing token-menu entry point.

Confirmed token-cell behavior: the GM picks individual linked tokens to unlink, with multi-selection; picking an already linked token reassigns its single link to the current cell. No map token is deleted. The draft spec is ready for the approval checkpoint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The single review and its bounded fix batch are complete at db11acc8cb09c1f9cd057e5b38d4d3ad6fcf8f39. Five behavior gaps were repaired: distinct token-cell picker identity, failed-command outcomes, current/elsewhere link status, repeat-row blocks and inherited player visibility. Final clean-state checks: format/typecheck/build pass; lint 0 errors/256 warnings; Bun3375 pass/1 environment skip; browser542/542. No second review. Partial-success and rejected-promise variants are handled in source but not independently exercised by new owners. AC2 remains unchecked: duplicate/nameField checks are covered, but the previously excluded temporary repeat-tab/nesting guard D19 was not established; dependent TASK78/79 implement those forms rather than treating this as a completed refusal check. Durable evidence: /Users/seigiard/.claude/artifacts/tdd-20261116-235057/task-77-review-fix/final-handoff.md.

D19 now has a durable Backlog record: TASK-88. It tracks validation of unsupported repeat shapes and the unresolved AC2 evidence. This does not authorize reintroducing a blanket repeat-tab ban after TASK-78 support, or checking the historical temporary refusal without proof.

Window 4 closing review leaves AC2 open. TASK-88 checks passed selected parser/Builder/upload paths, but TASK-79 still has blocking nested-runtime defects. The provisional supersession claim was withdrawn; no blanket repeat-tab ban was introduced. See _bmad-output/implementation-artifacts/task-79-window4-review.md.

Window5: AC2 remains open with TASK-88. Runtime fixes are integrated at 3d0c96a and pass all required checks, but the final confirming review leaves TASK-109. TASK-108 is optional, not a reason to narrow parent-local ids. No complete preset-v4 acceptance is claimed.

Window6 closes AC2 through TASK-88 at 6695d2346fbd2a0107e2fb24e19c9473bb28bf54. Duplicate scoped ids and invalid nameField values are refused at source item paths. The temporary rejection of repeat tabs/nesting is SUPERSEDED by implemented TASK-78/79 support, not claimed as tested. Remaining ordinary copied-token navigation is fixed by TASK-109; TASK-80 completes Builder controls. All required combined checks pass: format/lint/types/build, 3455 unit pass with1 existing environment skip,583 browser pass with0 skipped/flaky/errors. Boundary evidence: _bmad-output/implementation-artifacts/task-88-boundary-evidence.md. Optional follow-ups and owner-only TASK-86 remain separate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preset v4 uses one node registry across parsing, runtime and Builder. All seven criteria are accounted for; AC2 temporary refusal is explicitly superseded by verified repeat-tab and nested-scope support. The accepted source passes the full automated checks. Real Owlbear room acceptance remains the owner task TASK-86.
<!-- SECTION:FINAL_SUMMARY:END -->
