---
id: TASK-131
title: Replace the fixed sleeps that playwright/no-wait-for-timeout does not detect
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T19:14:00Z'
updated_date: '2026-11-20T05:15:00Z'
labels: []
dependencies:
  - TASK-128
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
playwright/no-wait-for-timeout reports only some receivers, such as page.waitForTimeout and background.waitForTimeout. It does not report calls on a client page held in a field, such as gm.window.waitForTimeout or player.window.waitForTimeout. After TASK-128, 12 such fixed sleeps remain in tests/: catch-up.e2e.ts:153, cell-name.e2e.ts:167, 210, 278, 282, owner.e2e.ts:452, pending.e2e.ts:169, 406, repeat-tabs.e2e.ts:220, 259, 419, wipe.e2e.ts:95. tests/liveness.e2e.ts:100 keeps a targeted disable: Playwright's clock.runFor fails after the GM pages close, so that window still waits in real time. Replace each sleep with a wait on an observable condition, a command barrier (see tests/replica.e2e.ts) or the Playwright clock (see tests/field-edit.e2e.ts). Each test keeps asserting the same behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No waitForTimeout call remains in tests/ without a targeted disable that states why
- [x] #2 A lint rule or check reports a waitForTimeout call on any receiver
- [x] #3 bun run test:browser passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced all 12 sleeps: Playwright clock for the delay checks (installed before pages open; context-wide), condition polls and afterSettling barriers for the others. Lint: no-restricted-properties reports waitForTimeout on any receiver in tests/ (probe a.window.waitForTimeout(5) reports it); playwright/no-wait-for-timeout is off; the two justified disables (liveness.e2e.ts:100, field-edit.e2e.ts:357) name the new rule. Calibration: 7/7 negative assertions red under production mutation. Review (revmux focused): one minor load-race in pending.e2e.ts deferred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The 12 fixed sleeps in tests/ that playwright/no-wait-for-timeout missed are gone: delay checks advance the Playwright clock, the rest wait on conditions or command barriers, and each test keeps its expected values. A core no-restricted-properties rule now reports waitForTimeout on any receiver; the two remaining real-time waits keep targeted disables with reasons. Evidence: changed files 565/565 at --repeat-each=5 --workers=4, full bun run test:browser 587/587, lint/typecheck/format pass, 7/7 calibration rows red under mutation. Deferred: a load-only clock race in tests/pending.e2e.ts:168 (deferred-work.md).
<!-- SECTION:FINAL_SUMMARY:END -->
