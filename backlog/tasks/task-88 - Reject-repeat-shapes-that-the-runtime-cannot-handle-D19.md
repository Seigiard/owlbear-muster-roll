---
id: TASK-88
title: Reject repeat shapes that the runtime cannot handle (D19)
status: Done
assignee: []
created_date: '2026-11-17T03:46:00Z'
updated_date: '2026-11-18T10:06:00Z'
labels:
  - format-v4
  - review-follow-up
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
- [x] #1 At the implemented feature boundary, unsupported repeat shapes are refused by preset upload and Builder validation at their source item paths, without changing room data.
- [x] #2 Supported ordinary repeat sections and rows remain accepted; repeat-tab support introduced by TASK-78 is not disabled by a blanket temporary check.
- [x] #3 TASK-77 AC2 records the proven current boundary. If TASK-79 has already supplied verified nested support, the obsolete refusal is explicitly recorded as superseded instead of being claimed as tested or reintroduced.
- [x] #4 Published and canonical preset documentation describe the verified nesting boundary and do not claim a rejection rule without its passing public validation regression.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closing review follow-up docs+tests-claude-5 is tracked here, not in a duplicate issue. Snapshot 7dcd100 accepts a nested repeat shape despite the published/canonical docs claiming that rule checks reject it. TASK-79 remains unmerged. Keep supported repeat tabs enabled; verify the current supported/refused boundary before changing the claim or validation.

Window 4 evidence commit 41301d9 is merged, but the closing review rejected the complete-support/supersession claim. Section-to-row nesting and other TASK-79 consumers remain unsupported despite parser acceptance. The evidence document now marks its matrix provisional. TASK-88 and TASK-77 AC2 stay open; repair TASK-79 before asserting the final supported/refused boundary. See _bmad-output/implementation-artifacts/task-79-window4-review.md.

Window5: previous runtime failures were repaired at 3d0c96a, but confirming round03 leaves ordinary token reveal blocker TASK-109. Complete-support supersession and TASK-77 AC2 remain open. The boundary evidence record now points to task-79-window5-review.md; no temporary blanket ban was introduced.

Window6 proves the current supported boundary at 6695d234. TASK-109 repairs the remaining ordinary navigation blocker and TASK-80 completes Builder support. Invalid structure/scoped ids/name fields remain refused with item paths and no room write; supported repeat tabs and nesting remain accepted. All required combined checks pass (3455 unit pass/1 environment skip, 583 browser pass). TASK-77 AC2 temporary blanket rejection is explicitly superseded by verified support, not claimed as tested. Published/canonical docs match this boundary. Evidence: _bmad-output/implementation-artifacts/task-88-boundary-evidence.md. Previous provisional/blocked verdicts are historical.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validation now has an evidenced v4 boundary shared by upload and Builder. Supported repeat tabs and nested scopes remain enabled. TASK-77 AC2 records the old temporary refusal as superseded. Current parser, Builder and runtime owners pass together; live host verification remains TASK-86.
<!-- SECTION:FINAL_SUMMARY:END -->
