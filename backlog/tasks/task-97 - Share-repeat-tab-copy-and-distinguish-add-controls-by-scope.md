---
id: TASK-97
title: Share repeat-tab copy and distinguish add controls by scope
status: In Progress
assignee:
  - '@t3s2'
created_date: '2026-11-17T11:05:00Z'
updated_date: '2026-11-17T17:51:00Z'
labels:
  - format-v4
  - review-follow-up
  - minor
dependencies: []
references:
  - TASK-78
  - src/ui/main.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#arch+quality-claude-8
priority: low
type: bug
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. The room and Builder duplicate block fallback/add labels outside the shared copy module; two repeat scopes expose indistinguishable plus controls.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: arch+quality-claude-8

> CLAUDE.md requires Russian interface text to live in `src/copy.ts`. The fallback tab label `` `Блок ${rendered.blockIndex ?? index + 1}` `` and the add-tab label `'+'` are inline literals in src/ui/main.tsx:777/787, duplicated in src/builder/preview-pane.tsx:544/553. The two copies can drift apart. With two repeat tabs, both add tabs have the accessible name "+", so they cannot be told apart.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Room and Builder use shared Russian copy for repeat-tab empty-name fallback and add controls, in accordance with src/copy.ts.
- [ ] #2 Two visible repeat scopes have distinct accessible add-control names that identify their target scope.
- [ ] #3 Visible labels, explicit activation, keyboard behavior and GM-only lifecycle policy remain correct in both consumers.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shared copy functions for blank repeat-block tab labels and scoped add-tab accessible names.
2. Pass the scoped accessible name through the shared shell tab seam and adopt it in Room and Builder, preserving the visible + label and existing activation/lifecycle branches.
3. Add one browser regression that renders two visible repeat scopes in Room and Builder, asserts their distinct scoped add-tab names, and activates each control.
4. Run the focused browser regression, then format, lint, typecheck, Bun tests, the serialized full browser suite, and build.
<!-- SECTION:PLAN:END -->
