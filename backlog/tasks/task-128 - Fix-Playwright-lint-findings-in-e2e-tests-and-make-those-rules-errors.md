---
id: TASK-128
title: Fix Playwright lint findings in e2e tests and make those rules errors
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T13:18:00Z'
updated_date: '2026-11-19T21:11:00Z'
labels: []
dependencies: []
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
eslint-plugin-playwright runs on tests/**/*.e2e.ts and tests/support/** with its recommended rules. Two error-level rules were set to warn because they already had findings: prefer-web-first-assertions 7 and no-networkidle 3. Warning-level findings that hide waiting problems: no-wait-for-timeout 15 (fixed sleeps), no-conditional-in-test 11, no-force-option 1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun run lint reports no playwright/prefer-web-first-assertions, playwright/no-networkidle or playwright/no-wait-for-timeout findings
- [x] #2 playwright/prefer-web-first-assertions and playwright/no-networkidle are set to error in .oxlintrc.json, and playwright/no-wait-for-timeout is set to error
- [x] #3 bun run test:browser passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed sleeps became Playwright clock control (field-edit, characters, liveness GM-alone), command or projection barriers (replica, characters, smoke) and web-first waits. Two targeted disables keep a real wait where no barrier exists: liveness (clock.runFor fails after the GM pages close) and field-edit window-close (the closed window cannot send a later barrier). Calibration: the window-close, Escape-name and GM-alone negatives each go red under a production mutation. Follow-up TASK-131: 12 sleeps on client.window receivers that the rule does not detect.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
playwright/prefer-web-first-assertions, no-networkidle and no-wait-for-timeout report nothing and are errors in .oxlintrc.json. Every replaced wait still proves the same behavior; the changed negative tests were calibrated against production mutations. Verified: test:browser 587/587 on the integration branch, lint, typecheck. Remaining fixed sleeps the rule cannot see are tracked in TASK-131.
<!-- SECTION:FINAL_SUMMARY:END -->
