---
id: TASK-131
title: Replace the fixed sleeps that playwright/no-wait-for-timeout does not detect
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T19:14:00Z'
updated_date: '2026-11-20T04:37:00Z'
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
- [ ] #1 No waitForTimeout call remains in tests/ without a targeted disable that states why
- [ ] #2 A lint rule or check reports a waitForTimeout call on any receiver
- [ ] #3 bun run test:browser passes
<!-- AC:END -->
