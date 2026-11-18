---
id: TASK-109
title: Open a copied nested block from its own token
status: Done
assignee:
  - '@openai'
created_date: '2026-11-18T08:10:00Z'
updated_date: '2026-11-18T10:06:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - TASK-79
  - src/ui/navigation.ts
  - src/ui/sheet/sheet-body.tsx
priority: high
type: bug
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remaining TASK-79 blocker from runtime review 03-after-fix, adversarial-2, at 3d0c96a. In one GM window, duplicate a repeat section containing a nested token row on a plain tab, link a token to the copied child, then open its sheet. Duplication preserves child instance ids; navigation discards the parent path and reveal selects the first matching child. Parent executed the real navigation reducer with group:g1:move:m1 and group:g2:move:m1: both produced identical blockReveal values. The DOM consumer uses the leaf id; full browser reproduction remains to be added. This owned ordinary flow remains blocked after the two permitted review-fix rounds; no third fix was attempted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening the token of a copied nested child reveals and focuses that child rather than the source child when both are on the same plain tab.
- [x] #2 The source and duplicate remain distinguishable by their complete paths through the existing open-sheet flow.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock a real one-GM browser reproduction that opens the copied nested child from its own token. 2. Preserve complete block identity through navigation and reveal consumers. 3. Run focused/full checks and independent review, then integrate and close TASK-109 without reopening TASK-79.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Window6 authorized by owner: execute TASK-109 and TASK-80, confirm checks, close TASK-88 and TASK-77 AC2. Started08:45Z,90-minute budget. TASK-109 isolated at task109-w6-20261118 from d66fb1a; test writer t472. Existing accepted behavior and optional follow-ups remain outside scope.

Window6 accepted at 6695d2346fbd2a0107e2fb24e19c9473bb28bf54. Complete paths now survive navigation and DOM reveal, including the repeat-tab wrapper. Copied-child and below-fold repeat-tab owners pass; leaf-only mutation fails at the copied-child assertion. Independent final review: 2/2 sources, no findings or degradation. All required combined checks pass: 3455 unit pass/1 existing environment skip; 583 browser pass/0 skips/0 flaky/0 errors; format/lint/types/build exit0. Evidence: _bmad-output/implementation-artifacts/task-80-window6-review.md. Earlier blocked notes are historical.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Copied nested child tokens reveal and focus the intended child, even when the source shares its leaf id. Full-path identity remains intact through navigation and rendering. Verified by calibrated browser coverage, the full combined checks and independent review. TASK-79 stays Done; live Owlbear acceptance remains TASK-86.
<!-- SECTION:FINAL_SUMMARY:END -->
