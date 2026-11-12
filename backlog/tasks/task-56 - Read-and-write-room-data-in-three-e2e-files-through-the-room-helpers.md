---
id: TASK-56
title: Read and write room data in three e2e files through the room helpers
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T07:50:00Z'
updated_date: '2026-11-12T13:27:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Spec _bmad-output/implementation-artifacts/spec-task-56-room-helpers-in-e2e.md (bmad-build, dispatch route).
2. Add key and seed helpers to tests/support/room.ts.
3. Move preset.e2e.ts, preset-change.e2e.ts and snapshot.e2e.ts onto them.
4. Prove same JUnit names, same per-test expect counts, and an equivalence probe of the key reads; full check.
<!-- SECTION:PLAN:END -->
