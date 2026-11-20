---
id: TASK-150
title: Keep Builder formula references when a conflicting field id is corrected
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-20T14:17:00Z'
updated_date: '2026-11-20T14:51:00Z'
labels:
  - review-follow-up
dependencies:
  - TASK-145
references:
  - src/core/formula-rename.ts
  - src/builder/document.ts
priority: low
type: bug
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A single GM edits a valid Builder draft with a sheet field `bonus`, a repeat field `attack_bonus`, and a dice formula `1d6+bonus` in the repeat. The GM renames the sheet field to `attack_bonus`, sees the duplicate warning, and types `bonus` again. The warning clears and export works, but the dice formula still says `1d6+attack_bonus` and reads the repeat field. Reproduced through Builder renameField, builderProblems and downloadText while completing TASK-145.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a GM corrects a conflicting manual field id, formulas that referred to the original field still refer to it after the draft becomes valid.
- [ ] #2 Renaming a field to an available id still rewrites its references, not references to unrelated fields.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the conflicting rename in Builder and lock a regression.
2. Use the TASK-145 conflict rule before rewriting formula references; keep free renames scope-aware.
3. Run the focused and changed-path checks, record acceptance evidence, and open the PR with automerge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 owner decision: «да» to option A. Treat a new field id as taken when TASK-145 rejects it in the same scope, an enclosing scope, or a nested scope of the field. Reuse the predicate from PR #112 and do not rewrite formulas on a conflict. Correcting attack_bonus back to bonus leaves 1d6+bonus referring to the sheet field. A free id still rewrites only references resolved to the renamed field. Scope: one GM, one window.
<!-- SECTION:NOTES:END -->
