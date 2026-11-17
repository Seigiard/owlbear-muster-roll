---
id: TASK-89
title: Keep repeat-tab fields out of root migration and edit scopes
status: To Do
assignee: []
created_date: '2026-11-17T11:03:00Z'
labels:
  - format-v4
  - review-follow-up
  - critical
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/core/preset-migrate.ts
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#adversarial-claude-4
priority: high
type: bug
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. A repeated field id in a tab block can silently erase a root value, even during an unchanged preset upload.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: adversarial-claude-4

> `treeProblems` (src/core/preset.ts:720) now gives each repeat tab its own id scope. A repeat-tab field can therefore reuse a root field id. `templateScopes` adds the repeat tab to `scopes.sections`. But its following `layoutSections(layout)` loop still walks the plain rows of repeat tabs and writes them into `scopes.rows`/`scopes.rowFields`, keyed by field id, last write wins. `plainRow`, `plainRowIdOf`, `templateHasNameField` and `tokenCells` were updated to skip repeat tabs; `templateScopes` was not.

> Failure case: the root has `hp` (number) and a later repeat tab has `hp` (text). `rowFields.get('hp')` returns the text field. In `presetDiff`, `keptCells` drops the root value 7, so the value is missing from `shown` and from the erase digest. The `cleared` loop then writes a null tombstone. Even an unchanged re-upload erases the root value with no confirmation. The same wrong field also feeds `stripToTemplate` on GM field patches (composers.ts:314), `strippedPatch` (proposal-queue.ts:303), snapshot import (snapshot-import.ts:146) and `presetMoves.rowOf`. A root field that is removed while a same-id repeat-tab field remains is never erased or reported.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An unchanged preset upload preserves root hp=7 when a later repeat tab declares its own text field hp; it emits no root null-clear or unreported loss.
- [ ] #2 Root field edits, player proposals, preset reconciliation and snapshot import resolve root fields independently from same-id repeat-tab fields.
- [ ] #3 Removing a root field is detected and counted even when a same-id field remains in a repeat tab.
- [ ] #4 Public consumer regressions reproduce the reported loss before repair and preserve independent root and tab-block values after repair.
<!-- AC:END -->
