---
id: TASK-88
title: Reject repeat shapes that the runtime cannot handle (D19)
status: In Progress
assignee: []
created_date: '2026-11-17T03:46:00Z'
updated_date: '2026-11-17T23:10:00Z'
labels:
  - format-v4
  - review-follow-up
  - blocked
dependencies: []
references:
  - TASK-77 AC2
  - TASK-78
  - TASK-79
  - src/core/preset.ts
  - _bmad-output/implementation-artifacts/spec-task-77-preset-format-v4.md
  - /Users/seigiard/.claude/artifacts/tdd-20261116-164705/task-77/ticket.md#L315
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#docs+tests-claude-5
  - docs/preset-format.md
priority: medium
type: bug
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-77 AC2 required a temporary rule check for repeat tabs and nested repeat scopes while their runtime support was absent. The public parsePresetFile probe in diagnosis D19 accepted these shapes; D19 was later removed from the bounded repair without being fixed. TASK-78 now has a repeat-tab implementation candidate, while nested runtime support remains TASK-79. This task tracks the missing validation boundary and its acceptance evidence, not a second implementation of TASK-79. Do not restore an obsolete blanket ban on repeat tabs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At the implemented feature boundary, unsupported repeat shapes are refused by preset upload and Builder validation at their source item paths, without changing room data.
- [ ] #2 Supported ordinary repeat sections and rows remain accepted; repeat-tab support introduced by TASK-78 is not disabled by a blanket temporary check.
- [ ] #3 TASK-77 AC2 records the proven current boundary. If TASK-79 has already supplied verified nested support, the obsolete refusal is explicitly recorded as superseded instead of being claimed as tested or reintroduced.
- [ ] #4 Published and canonical preset documentation describe the verified nesting boundary and do not claim a rejection rule without its passing public validation regression.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closing review follow-up docs+tests-claude-5 is tracked here, not in a duplicate issue. Snapshot 7dcd100 accepts a nested repeat shape despite the published/canonical docs claiming that rule checks reject it. TASK-79 remains unmerged. Keep supported repeat tabs enabled; verify the current supported/refused boundary before changing the claim or validation.

Window 4 evidence commit 41301d9 is merged, but the closing review rejected the complete-support/supersession claim. Section-to-row nesting and other TASK-79 consumers remain unsupported despite parser acceptance. The evidence document now marks its matrix provisional. TASK-88 and TASK-77 AC2 stay open; repair TASK-79 before asserting the final supported/refused boundary. See _bmad-output/implementation-artifacts/task-79-window4-review.md.
<!-- SECTION:NOTES:END -->
