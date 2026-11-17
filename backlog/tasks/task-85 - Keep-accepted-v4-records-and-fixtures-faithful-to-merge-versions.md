---
id: TASK-85
title: Keep accepted v4 records and fixtures faithful to merge versions
status: In Progress
assignee: []
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T08:56:00Z'
labels: []
dependencies: []
references:
  - src/core/records.ts
  - src/core/merge.ts
  - tests/support/block-fixtures.ts
priority: medium
type: bug
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-76 review found record-boundary edge cases and a fixture gap. recordSchema accepts lifecycle l on non-block records, but equal-version non-block merge ignores it and can retain either input. cellsSchema accepts prototype member names such as constructor although valid preset field ids reject them; merge lookup on a normal object can then lose such a parsed cell. These cases are not produced by normal valid-preset commands and are deferred boundary hardening. Separately, tests/support/block-fixtures.ts fixturePatch replaces an explicitly supplied newer tuple with the older tuple whenever values are equal, masking same-value/new-version cases. The owner requested follow-up tracking rather than expanding TASK-76.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every accepted non-block record has a deterministic merge result in both argument orders, including lifecycle metadata validation.
- [ ] #2 A parsed cell cannot disappear because its id resolves to an inherited object property; rejection or safe preservation is explicit.
- [ ] #3 A fixture with an explicitly supplied newer cell tuple preserves its counter and author even when its value is unchanged.
- [ ] #4 Narrow tests cover those schema, merge and fixture boundaries without adding old-format compatibility.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock parser and merge-consumer regressions for lifecycle, inherited cell ids, and explicit same-value newer tuples.
2. Restrict accepted record shapes and repair fixture tuple preservation without an old-format compatibility path.
3. Run focused owners and the required stable full source checks with durable evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented record-boundary hardening at source SHA 91db19053060ca215fe70237187548e27400e81b. Locked tests: 3fc7bfc63ee5876f4ab00d20cc76b2c5c644abb5. Final source checks passed at 91db190: format, lint, typecheck, bun test (3382 passed, 1 environment skip), browser (558 passed), build; manifest: /Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/task-85/final-checks/checks.json. Calibration: criteria 1 and 2 calibrated; criterion 3 is explicitly uncalibrated because the parent stopped calibration. No acceptance criteria were checked and status remains In Progress.
<!-- SECTION:NOTES:END -->
