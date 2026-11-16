---
id: TASK-85
title: Keep accepted v4 records and fixtures faithful to merge versions
status: To Do
assignee: []
created_date: '2026-11-16T15:15:00Z'
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
