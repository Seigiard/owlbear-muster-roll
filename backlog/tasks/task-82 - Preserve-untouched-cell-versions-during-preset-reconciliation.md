---
id: TASK-82
title: Preserve untouched cell versions during preset reconciliation
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T10:38:00Z'
labels:
  - blocked
dependencies: []
references:
  - src/replica/composers.ts
  - src/core/preset-migrate.ts
  - _bmad-output/implementation-artifacts/spec-task-76-block-records.md
priority: high
type: bug
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review of TASK-76 found two preset-change edge cases in src/replica/composers.ts. composePresetUpload reissues every planned cell at the upload version, so removing one field can overwrite a concurrent edit of an untouched field; the reviewer reproduced hp=10 instead of hp=20. mintedPatch omits fields removed by stripToTemplate rather than emitting null cells, so a write after an interrupted preset upload can retain obsolete values on merge. The owner requested follow-up issues instead of extending TASK-76. These scenarios concern preset changes concurrent with edits or interrupted uploads; ordinary different-cell editing is covered by the passing TASK-76 tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Removing armor while another GM updates hp preserves the exact concurrent hp value and its cell version.
- [ ] #2 A field removed by the current preset receives a versioned clear during subsequent reconciliation, so old values cannot return through merge.
- [ ] #3 Targeted regressions cover concurrent preset upload and edit, and a field write after an interrupted upload.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT STATUS — 2026-11-17, after closing review:
BLOCKED, NOT MERGED. Candidate 496ec87 on feature/preset-v4-task-82 is preserved. The corrected concurrent-edit test also passes on old source and does not reproduce the reported race. The candidate additionally fails the existing player-proposal strip owner because removed-field clears enter pending proposals. Needs a faithful concurrent oracle and a correct persisted/pending composition boundary.

Earlier progress below is historical; the current status above supersedes it.

Bounded autonomous attempt preserved clean candidate 496ec87d9f9b3f61cf855e04d49c2e7fee087531 on feature/preset-v4-task-82; it was not merged. Correcting the concurrent-owner mock sender made that test pass on the actual production base as well, so the test does not yet reproduce the reported race. This is not evidence that the original issue is absent. The candidate also breaks the existing player-proposal strip owner: a removed-field null clear enters pending proposals and is refused. A continuation needs a faithful concurrent oracle and an explicit composition boundary between persisted GM reconciliation and pending player proposals. Evidence: local artifact run preset-v4-78-87-20261117/task-82/orchestrator.report.md, corrected-lock-red-base.log and focused-full.log.

CURRENT: Blocked; candidate 496ec87 remains on feature/preset-v4-task-82 and is NOT merged. The corrected concurrent-edit test also passes on the old source, so the reported race still needs a faithful regression. The candidate additionally fails the existing player-proposal test because removed-field null clears enter pending proposals. This pass skips further repair; acceptance remains open.
<!-- SECTION:NOTES:END -->
