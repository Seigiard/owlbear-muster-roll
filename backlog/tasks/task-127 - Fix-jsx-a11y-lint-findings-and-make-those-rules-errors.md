---
id: TASK-127
title: Fix jsx-a11y lint findings and make those rules errors
status: To Do
assignee: []
created_date: '2026-11-19T13:18:00Z'
labels: []
dependencies: []
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Oxlint's built-in jsx-a11y plugin was enabled with every rule that already had findings set to warn. The open findings: prefer-tag-over-role 19 (role on a div where a native element exists), no-autofocus 14, no-noninteractive-element-interactions 7, aria-role 2, no-noninteractive-element-to-interactive-role 2, role-has-required-aria-props 1, heading-has-content 1. Autofocus in the extension popover may be deliberate; decide per case. Run better-accessibility on the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bun run lint reports no findings from the seven jsx-a11y rules listed in the description, except targeted disables that state why
- [ ] #2 Those seven rules are set to error in .oxlintrc.json
- [ ] #3 bun run test:browser passes
<!-- AC:END -->
