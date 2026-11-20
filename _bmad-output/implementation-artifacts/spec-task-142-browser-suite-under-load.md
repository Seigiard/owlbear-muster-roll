---
title: 'TASK-142: Keep browser checks reliable across checkouts'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '9f53a4917a78e0484be631b958afd0326d5638a0'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Playwright starts a Vite server and several Chromium workers in every checkout. Concurrent runs have reported timeouts on first navigation, a Builder download, a player sheet click, and a GM's keyboard token selection. Browser checks run locally, so repeated full-suite retries can hide a regression.

**Approach:** Fix the two reproduced test interactions at the point where they fail. Keep the same outcomes under test. Document a lower worker count for concurrent full-suite runs and a traced rerun of just the failures. Verify the documented command twice across at least three concurrent checkouts.

Leave app behavior, Playwright timeouts, retries, and the Node 26 Vite flag unchanged. Add no scenarios for rare races or additional GM windows. Leave the first navigation and Builder download steps unchanged unless a trace identifies a specific faulty wait.

</frozen-after-approval>

## Implementation Notes

- `tests/selection.e2e.ts`, keyboard repeat-block test: on the failed trace, the focus moved to the map toggle and then back to the NPC tab when the click arrived. Enter reached the tab. Use keyboard activation for the setup tab and send Enter through the map toggle locator. Keep both token IDs and the rendered mark in the assertions.
- `tests/player.e2e.ts`, first player test: the selected sheet tooltip for `Брок` intercepted clicks on `Лиза`. Use keyboard activation to visit each tab. Keep all assertions for sheet names, values, permissions, and storage.
- `CLAUDE.md`, local browser checks: use one Playwright worker per checkout when browser suites overlap. Use `--last-failed --workers=1 --trace=on` to diagnose a test failure after the other suites finish. A passing rerun alone does not prove load caused the failure.
- Verify the existing tests rather than add a duplicate. Run the full local checks for the test paths. For the load check, run the full suite with one worker in each of three checkouts twice. Record the aggregate results and the focused retry result in TASK-142.
- The corrected interactions passed 24 of 24 repeats under load. The unchanged controls failed 11 of 48. The modified tests passed in all six full runs with one worker per checkout, but two of the six runs failed in other scenarios. One run did not reopen snapshot confirmation after a second GM window changed the preset. The other loaded a stale room copy on a new GM device. The concurrent full-suite criterion remains open.

## Review Triage Log

- The focused review found that Playwright replaces the original `test-results/` directory and may record no failed tests for a startup error. The check rules now preserve original artifacts and reserve `--last-failed` for completed runs that list failed tests. Both confirming reviewers reported no remaining finding.
