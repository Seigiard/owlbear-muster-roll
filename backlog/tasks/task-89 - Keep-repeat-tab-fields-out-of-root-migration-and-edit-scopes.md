---
id: TASK-89
title: Keep repeat-tab fields out of root migration and edit scopes
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-17T11:03:00Z'
updated_date: '2026-11-17T12:20:00Z'
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
modified_files:
  - src/core/preset-migrate.ts
  - src/core/preset-migrate.test.ts
  - src/replica/engine-preset.test.ts
  - src/replica/composers.test.ts
  - src/replica/proposal-queue.test.ts
  - src/core/snapshot-import.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock public-consumer regressions for independent root/tab field ids, unchanged upload, edit/proposal/import scopes and counted root removal. 2. Repair shared root scope collection without changing accepted nested support. 3. Validate focused regressions and required source checks; integrate through the TASK-77–98 parent with one closing review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-17: Scoped the implementation to the shared `templateScopes` root/block boundary. The locked regression suite will cover unchanged upload, root edits, player proposals, snapshot import, and counted root removal; repeat-tab storage and nested support remain unchanged.

2026-11-17: Locked and calibrated public-consumer regressions at 5fbccdd. Implemented the shared root/block scope repair at 5d66f13. Focused tests passed 143/143; format, lint, typecheck, unit, browser (workers=2), and build passed in durable runs on 5d66f13. Parent owns integration, final acceptance, and status.
<!-- SECTION:NOTES:END -->
