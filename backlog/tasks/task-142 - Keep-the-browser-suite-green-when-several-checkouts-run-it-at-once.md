---
id: TASK-142
title: Keep the browser suite green when several checkouts run it at once
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-20T06:52:00Z'
updated_date: '2026-11-20T14:10:00Z'
labels:
  - flaky-test
dependencies: []
references:
  - tests/access.e2e.ts
  - tests/selection.e2e.ts
  - playwright.config.ts
  - TASK-139
documentation:
  - >-
    _bmad-output/implementation-artifacts/spec-task-142-browser-suite-under-load.md
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the reported waits with the existing command and compare default and capped workers under concurrent checkout load.
2. Record which waits fail and why. Use the smallest fix the evidence supports, without extending timeouts.
3. Prove repeated concurrent runs and document a focused failure diagnosis command.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Further cases of the same pattern, 2026-11-20, from the TASK-108 lane (one timeout per full run, each in a different test, each green when its file ran alone): tests/player.e2e.ts:145 hit the 30 s test timeout (alone 15/15); tests/builder.e2e.ts:415 timed out in page.waitForEvent for the download (alone 31/31). These were filed as TASK-143, which is archived as a duplicate of this task.

Controlled baseline at 9f53a4917a78e0484be631b958afd0326d5638a0: 38 tests passed with five workers while one sibling checkout ran. Three simultaneous checkouts, each with five workers and the same 38-test selection, finished 37 pass and 1 fail each. Two runs reproduced TASK-139: the 5-second map poll retained only t-s1 after Enter. One run reproduced the player 30-second test timeout: the tab and its data had already loaded; the tooltip for Брок intercepted every attempt to click Лиза. Access first-load and Builder download did not fail in this sample. Host top reported 0.4–1.11% idle in the four timed samples on 10 logical cores. This establishes saturation in the reproducer, not a common app defect for the four reported waits. Logs and traces: task142-lanes/default-*.log and task142-lanes/traces-{a,b,c}.

Keyboard event probe in a three-checkout run reproduced five selection failures out of 60 repetitions. In the instrumented failing repeat, focus entered the map toggle, then moved back to the NPC tab as the click arrived. Both Enter events targeted the NPC tab, and the map poll retained only t-s1. This is input timing, not a slow selection write. The player timeout was click actionability, not catch-up. First-load navigation and the download event are separate historical waits; a specific cause for either was not reproduced.

Keyboard-only A/B on the same three checkout paths, five workers each: the two unmodified checkouts failed 6/24 and 5/24 runs of the selection and player interactions. The checkout using locator.press("Enter") on the tab and the map toggle passed 24/24. The same token, sheet, and permissions assertions ran. Host idle was under 2% in every sample. The preceding baseline likewise had at most 1.9% idle, not 1.11%.
<!-- SECTION:NOTES:END -->
