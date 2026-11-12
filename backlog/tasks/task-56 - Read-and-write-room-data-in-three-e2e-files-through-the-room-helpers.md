---
id: TASK-56
title: Read and write room data in three e2e files through the room helpers
status: To Do
assignee: []
created_date: '2026-11-12T07:50:00Z'
labels: []
dependencies:
  - TASK-47
references:
  - tests/support/room.ts
priority: low
type: task
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-47 moved the engine unit tests onto one room rig, so the storage key format (AD-11, `mr2:...`) appears only where it is the subject of a test. Three e2e files still build or read `mr2:` keys by hand instead of using the helpers in `tests/support/room.ts`: `tests/preset.e2e.ts`, `tests/preset-change.e2e.ts` and `tests/snapshot.e2e.ts`. A later key format change would then have to touch them as well. `tests/wipe.e2e.ts` keeps its keys, because checking which keys a wipe deletes is what it tests. The owner chose this small follow-up over reopening TASK-47. Queue it last.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/preset.e2e.ts, tests/preset-change.e2e.ts and tests/snapshot.e2e.ts seed and read room data only through helpers in tests/support/room.ts; the `mr2:` key format appears in none of them
- [ ] #2 In e2e tests the key format appears only in tests/support/room.ts and tests/wipe.e2e.ts
- [ ] #3 Every e2e test that passed before still passes with the same assertions; none is skipped or weakened
<!-- AC:END -->
