---
id: TASK-56
title: Read and write room data in three e2e files through the room helpers
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T07:50:00Z'
updated_date: '2026-11-12T14:29:00Z'
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
- [x] #1 tests/preset.e2e.ts, tests/preset-change.e2e.ts and tests/snapshot.e2e.ts seed and read room data only through helpers in tests/support/room.ts; the `mr2:` key format appears in none of them
- [x] #2 In e2e tests the key format appears only in tests/support/room.ts and tests/wipe.e2e.ts
- [x] #3 Every e2e test that passed before still passes with the same assertions; none is skipped or weakened
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Spec _bmad-output/implementation-artifacts/spec-task-56-room-helpers-in-e2e.md (bmad-build, dispatch route).
2. Add key and seed helpers to tests/support/room.ts.
3. Move preset.e2e.ts, preset-change.e2e.ts and snapshot.e2e.ts onto them.
4. Prove same JUnit names, same per-test expect counts, and an equivalence probe of the key reads; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1: rg -n 'mr[0-9]+:|STORAGE_PREFIX|localStorage' over tests/preset.e2e.ts, tests/preset-change.e2e.ts, tests/snapshot.e2e.ts finds nothing (exit 1); they seed and read through storageKey, roomKeys, storageKeyParts, isStorageKeyInGeneration, seedRecords, seedStorage, storedData in tests/support/room.ts.
AC2: rg -ln 'mr[0-9]+:' tests/ lists only tests/wipe.e2e.ts and tests/support/room.ts.
AC3: base f1724df vs branch: Playwright JUnit list of the three files equal (60 tests, 0 skipped, 0 failed); per-test expect call sites equal (39 test blocks, 165 total incl. room.ts); a temporary probe compared every roomKeys result with raw localStorage keys starting mr2: in all 60 tests, no difference, non-empty reads of 6/8/16 keys. Full check on merged 7b8e642: oxfmt, lint, typecheck, bun test 2655 pass, test:browser 492 passed, build - all pass.
Spec: _bmad-output/implementation-artifacts/spec-task-56-room-helpers-in-e2e.md. Run dir: ~/.claude/artifacts/tdd-20261112-142811/task-56-room-helpers-in-e2e/.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Three e2e files (preset, preset-change, snapshot) no longer build, seed or filter mr2: storage keys by hand. tests/support/room.ts gained storageKey, roomKeys, storageKeyParts, isStorageKeyInGeneration and seedRecords, and is now, beside tests/wipe.e2e.ts, the only e2e place that knows the AD-11 key format. No test changed its name, expect calls or expected values; each new key read selects the same keys as the filter it replaced (JUnit list, expect counts and an equivalence probe prove it). Two code-review rounds: 3 minors fixed, then clean. Full check passes. One seed in preset.e2e.ts now writes the preset before the sheet (both before the background starts). No production code changed.
<!-- SECTION:FINAL_SUMMARY:END -->
