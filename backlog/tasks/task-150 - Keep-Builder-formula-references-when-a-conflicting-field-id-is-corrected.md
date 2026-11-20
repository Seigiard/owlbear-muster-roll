---
id: TASK-150
title: Keep Builder formula references when a conflicting field id is corrected
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-20T14:17:00Z'
updated_date: '2026-11-20T15:19:00Z'
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
- [ ] #1 When a GM enters a manual field id that already exists in the same, an enclosing, or a nested scope, Builder refuses the rename, shows an inline error naming where it is taken, and keeps the field and formulas unchanged.
- [ ] #2 After the refused rename bonus → attack_bonus, entering bonus again clears the error and the downloaded preset still reads 1d6+bonus.
- [ ] #3 After the refused rename bonus → attack_bonus, entering a free id such as damage_bonus clears the error and updates only references to the original field to 1d6+damage_bonus.
- [ ] #4 A draft that already contains a conflicting field id still shows the TASK-145 warning.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock browser scenarios for refusal, return to the previous id, and correction to a free id. Keep existing draft validation.
2. Reuse the TASK-145 scope check at the Builder manual edit boundary and report the conflict inline in Russian. Restore the original core rename behavior.
3. Run changed-path checks, review, and open the PR with automerge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 owner decision: «да» to option A. Treat a new field id as taken when TASK-145 rejects it in the same scope, an enclosing scope, or a nested scope of the field. Reuse the predicate from PR #112 and do not rewrite formulas on a conflict. Correcting attack_bonus back to bonus leaves 1d6+bonus referring to the sheet field. A free id still rewrites only references resolved to the renamed field. Scope: one GM, one window.

Review hold: baseline 133b5be1da20d951c05756b84ad4388cebf579a4 rewrites a sheet formula to 1d6+damage_bonus after bonus → attack_bonus (taken by a repeat) → damage_bonus. With the approved destination guard in f414ef9174489116360eeed49a711aba97467921, the same export has no preset problems but contains 1d6+bonus with no field that resolves to bonus. Verified baseline and branch by running renameFieldId, presetProblems, and resolveFieldReference. The approved return to bonus passes in Chromium. A reverse collision that rewrites a reference to the repeat field produces the same result on baseline and branch; it is not a new regression. No PR or automerge while the scope decision is pending.

2026-11-20 owner decision after review: «Б: не принимать (Recommended)». Refuse the conflicting manual rename in Builder, show an inline error that names the scope where the id is taken, and keep the previous id and its formula references. A free rename can follow without an invalid draft. Keep TASK-145 warnings for drafts that already contain a conflict. Supersedes option A.
<!-- SECTION:NOTES:END -->
