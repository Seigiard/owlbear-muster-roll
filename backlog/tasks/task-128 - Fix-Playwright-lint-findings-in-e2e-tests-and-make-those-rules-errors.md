---
id: TASK-128
title: Fix Playwright lint findings in e2e tests and make those rules errors
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T13:18:00Z'
updated_date: '2026-11-19T16:02:00Z'
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
- [ ] #1 bun run lint reports no playwright/prefer-web-first-assertions, playwright/no-networkidle or playwright/no-wait-for-timeout findings
- [ ] #2 playwright/prefer-web-first-assertions and playwright/no-networkidle are set to error in .oxlintrc.json, and playwright/no-wait-for-timeout is set to error
- [ ] #3 bun run test:browser passes
<!-- AC:END -->
