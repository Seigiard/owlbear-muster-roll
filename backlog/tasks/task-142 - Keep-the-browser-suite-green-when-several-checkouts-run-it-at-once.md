---
id: TASK-142
title: Keep the browser suite green when several checkouts run it at once
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-20T06:52:00Z'
updated_date: '2026-11-20T16:37:00Z'
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
- [x] #1 The cause of the load failures is named in the task notes with evidence: which waits time out, and whether the cause is test timing, the app, or machine saturation
- [x] #2 With at least three checkouts running `bun run test:browser` at the same time, the suite passes in repeated runs, or the documented way to run it under load does
- [x] #3 A browser test that fails only under load can be told apart from a real failure without re-running the whole suite by hand
- [x] #4 TASK-139 is closed by this work or still names a cause this task does not cover
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the reported waits with the existing command and compare default and capped workers under concurrent checkout load.
2. Record which waits fail and why. Use the smallest fix the evidence supports, without extending timeouts.
3. Prove repeated concurrent runs and document a focused failure diagnosis command.

4. Retire the out-of-scope two-window snapshot test. Reproduce the stale room-copy wait, then make it wait for the edited value before switching devices. Run the full checks and verify repeated capped three-checkout runs before closing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Further cases of the same pattern, 2026-11-20, from the TASK-108 lane (one timeout per full run, each in a different test, each green when its file ran alone): tests/player.e2e.ts:145 hit the 30 s test timeout (alone 15/15); tests/builder.e2e.ts:415 timed out in page.waitForEvent for the download (alone 31/31). These were filed as TASK-143, which is archived as a duplicate of this task.

Controlled baseline at 9f53a4917a78e0484be631b958afd0326d5638a0: 38 tests passed with five workers while one sibling checkout ran. Three simultaneous checkouts, each with five workers and the same 38-test selection, finished 37 pass and 1 fail each. Two runs reproduced TASK-139: the 5-second map poll retained only t-s1 after Enter. One run reproduced the player 30-second test timeout: the tab and its data had already loaded; the tooltip for Брок intercepted every attempt to click Лиза. Access first-load and Builder download did not fail in this sample. Host top reported at most 1.9% idle across the sampled intervals on 10 logical cores. This establishes saturation in the reproducer, not a common app defect for the four reported waits. Logs and traces: task142-lanes/default-*.log and task142-lanes/traces-{a,b,c}.

Keyboard event probe in a three-checkout run reproduced five selection failures out of 60 repetitions. In the instrumented failing repeat, focus entered the map toggle, then moved back to the NPC tab as the click arrived. Both Enter events targeted the NPC tab, and the map poll retained only t-s1. This is input timing, not a slow selection write. The player timeout was click actionability, not catch-up. First-load navigation and the download event are separate historical waits; a specific cause for either was not reproduced.

Keyboard-only A/B on the same three checkout paths, five workers each: the two unmodified checkouts failed 6/24 and 5/24 runs of the selection and player interactions. The checkout using locator.press("Enter") on the tab and the map toggle passed 24/24. The same token, sheet, and permissions assertions ran. Host idle was under 2% in every sample.

The documented --last-failed command selected exactly one red player test, passed it with one worker, and produced a trace. A later retry selected exactly the Builder clear-preset test from the mixed-load run and passed it. Neither focused result changes the original red. Copy the original log and test-results/ before that command because Playwright replaces its output directory. The focused review and its confirmation both had two reporting reviewers.

Full runs with one worker per checkout: a mixed-load run at 7711fd3c942fd9c2374cd9c7350ca014aae2b0cd overlapped up to ten more sibling workers. Two checkouts passed 588/588; one passed 587/588, timing out on the Builder clear-preset menu at tests/builder.e2e.ts:542. The exact test passed on the focused retry. At 08f15404296c961273967f5900962a60baec0a46 two controlled rounds each had two green checkouts (589/589) and one red (588/589). The red cases were tests/snapshot.e2e.ts:458 (confirmation did not reopen after another GM window changed the preset) and tests/room-copy.e2e.ts:73 (the next GM device loaded value 14 instead of 17). Those files passed 13/13 and 4/4 when run separately at the same revision. The corrected TASK-139 test passed all its focused comparison repeats and all nine capped full runs. The two newly observed red cases are outside the approved one-GM, one-window scope. Leave AC #2 open; do not turn either red run green with a focused retry.

Non-browser local checks at 08f15404296c961273967f5900962a60baec0a46 passed: full format, lint (354 warnings and no errors), typecheck, Bun unit tests (3672 pass, one skip, no failures), mutation tests (55 killed), and build. No retry, timeout, Vite flag, app code, or formal-model changes are included in the TASK-142 diff.

Open hypotheses, not fixes: snapshot.e2e.ts:458 waits for the second window’s preset confirmation to close, but does not wait for the updated preset to reach the first window before confirming the import. That can let the old confirmation proceed instead of reopening with the new count. room-copy.e2e.ts:73 waits for blk:brok to exist in the room copy. The key exists with the original value 14, so the wait does not prove that 17 was copied before the first device closes. Neither mechanism was confirmed with a failing trace. The orchestrator approved shipping the two proven fixes separately. Keep TASK-142 in progress and AC #2 unchecked.

Owner decision, 2026-11-20: "142 закрыть, тесты убрать". Removed the failing browser test that required a second GM window to change the preset while snapshot confirmation was open in the first. The suite no longer checks that exact sequence in Chromium: recalculating the dropped-field count, reopening the confirmation with focus on Отменить, and leaving the room unchanged until a second confirmation. The owner accepted this coverage loss because the scenario is outside the one-GM, one-window scope. No app behavior was changed. The one-GM device switch remains in scope under TASK-32 AC #3. In a Chromium probe that first observed the initial room copy, the old key wait succeeded with str still 14 in all four runs. The test now waits for 17 in the room copy before closing the first device and still checks 17 through the second device UI. No timeouts changed.

Final verification, 2026-11-20: at 8210fa8, three checkouts ran bun run test:browser --workers=1 simultaneously in each of two rounds. The rounds ran at 16:05–16:21 UTC and 16:21–16:36 UTC. All six runs completed with exit 0 and 591 passing tests each, with no retries, skips, or failures. The two affected browser files also passed 16/16. The engine import test still checks stale-count rejection without room changes. The snapshot actions reducer test still checks that the updated count reopens confirmation. Neither unit test covers two-window delivery or browser focus.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PR #114 fixed the keyboard timing in the player and repeat-block selection tests and documented how to run the browser suite under load. The follow-up removes one out-of-scope two-window test and preserves the GM device-switch test with a wait for the new room-copy value. Two complete three-checkout rounds passed, 591 tests in each of six runs. No app behavior, retries, or timeouts changed.
<!-- SECTION:FINAL_SUMMARY:END -->
