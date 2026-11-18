---
id: TASK-109
title: Open a copied nested block from its own token
status: To Do
assignee: []
created_date: '2026-11-18T08:10:00Z'
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
- [ ] #1 Opening the token of a copied nested child reveals and focuses that child rather than the source child when both are on the same plain tab.
- [ ] #2 The source and duplicate remain distinguishable by their complete paths through the existing open-sheet flow.
<!-- AC:END -->
