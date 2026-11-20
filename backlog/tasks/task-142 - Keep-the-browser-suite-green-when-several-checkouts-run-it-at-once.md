---
id: TASK-142
title: Keep the browser suite green when several checkouts run it at once
status: To Do
assignee: []
created_date: '2026-11-20T06:52:00Z'
updated_date: '2026-11-20T07:03:00Z'
labels:
  - flaky-test
dependencies: []
references:
  - tests/access.e2e.ts
  - tests/selection.e2e.ts
  - playwright.config.ts
  - TASK-139
priority: low
type: bug
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-20 four task lanes ran their full local checks in parallel worktrees. `bun run test:browser` then failed in places that pass alone: 4 tests in `tests/access.e2e.ts` timed out waiting for the first page load to finish (583 passed, 4 failed; the file alone ran 16/16), and `tests/selection.e2e.ts:135` timed out on the map selection poll (alone 3/3; tracked as TASK-139). Each checkout starts its own Vite server and Playwright uses `fullyParallel` with the default worker count, so N checkouts put N times the browser and server load on one machine. CLAUDE.md makes `bun run test:browser` a local responsibility for every full-check commit, and CI does not run it, so a red run that is only load makes the one browser gate unreliable: agents re-run until green, and a real failure can hide in that habit. Evidence: TASK-123 and TASK-112 implementation notes, `_bmad-output/implementation-artifacts/deferred-work.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the load failures is named in the task notes with evidence: which waits time out, and whether the cause is test timing, the app, or machine saturation
- [ ] #2 With at least three checkouts running `bun run test:browser` at the same time, the suite passes in repeated runs, or the documented way to run it under load does
- [ ] #3 A browser test that fails only under load can be told apart from a real failure without re-running the whole suite by hand
- [ ] #4 TASK-139 is closed by this work or still names a cause this task does not cover
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Further cases of the same pattern, 2026-11-20, from the TASK-108 lane (one timeout per full run, each in a different test, each green when its file ran alone): tests/player.e2e.ts:145 hit the 30 s test timeout (alone 15/15); tests/builder.e2e.ts:415 timed out in page.waitForEvent for the download (alone 31/31). These were filed as TASK-143, which is archived as a duplicate of this task.
<!-- SECTION:NOTES:END -->
