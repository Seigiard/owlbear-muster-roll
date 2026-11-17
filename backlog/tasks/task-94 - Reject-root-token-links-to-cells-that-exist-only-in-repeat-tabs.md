---
id: TASK-94
title: Reject root token links to cells that exist only in repeat tabs
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-17T11:05:00Z'
updated_date: '2026-11-17T13:04:00Z'
labels:
  - format-v4
  - review-follow-up
  - major
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/core/link-target.ts
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#arch+quality-claude-6
priority: high
type: bug
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. A root-scope link can remain live for a token cell that now exists only inside a repeat tab, leaving an invalid target after a preset change.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: arch+quality-claude-6

> The root branch of `tokenCellPlace` (`repeatSectionId === null`) skips repeat sections and rows, but not repeat tabs. `templateHasToken` (sheets.ts:127) also counts repeat-scope token cells, so `linkable` is true even when the only token cell is in a repeat tab. The rewritten comment at sheets.ts:55 says the token cell "can be linked to the sheet", which is false in that case. Meanwhile `tokenCells` excludes repeat tabs. Failure case: a GM adds `repeat` to a tab that holds a token cell. The docs say its sheet links are removed, but `presetDiff` sees `liveLinkTarget(after, …) !== null` and keeps them. Opening such a token then selects the first block tab, or none, and the reveal finds no root-scope cell. The `link` composer also accepts such a target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A token cell that exists only in a repeat tab cannot be linked without its block scope and instance.
- [ ] #2 Changing an ordinary token-bearing tab into a repeat tab removes or invalidates the obsolete root link through the existing preset-change contract.
- [ ] #3 Root linkability and picker targets do not claim a root token target when only repeated token cells exist.
- [ ] #4 Valid root token cells and properly scoped repeat-tab links remain supported, with public link/preset-change regressions for both.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock public core regressions for root `link-set`, preset-change cleanup and picker targets. Include a root token and a properly scoped repeat-tab token as positive controls.
2. Make root token lookup and sheet linkability exclude repeat-tab cells, while preserving scoped repeat-tab links.
3. Validate locked tests, focused owners, formatter, lint, typecheck, unit tests and build. The parent coordinates the full browser slot and closing review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-17: Started isolated TDD chain from accepted TASK-89 baseline. Scope is limited to root-versus-repeat-tab token targets; TASK-92 visibility and TASK-95 navigation remain out of scope.

2026-11-17: Locked and implemented root-versus-repeat-tab token targets. Stable evidence at 16e8cd2: focused public consumers, format, lint, typecheck, Bun, build, and browser 558/558. Four false-green calibrations passed. Awaiting parent integration and final acceptance; no criteria were checked here.
<!-- SECTION:NOTES:END -->
