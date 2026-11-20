---
id: TASK-99
title: Preserve newer fields when a GM has not received their preset
status: To Do
assignee: []
created_date: '2026-11-17T20:14:00Z'
updated_date: '2026-11-20T13:25:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - TASK-82
  - src/replica/composers.ts
  - src/replica/engine.ts
  - _bmad-output/implementation-artifacts/deferred-work.md
  - _bmad-output/implementation-artifacts/spec-task-82-preserve-cell-versions.md
priority: low
type: bug
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Window-3 reviews of a6af377 found a code-traced data-loss risk in persisted reconciliation. A GM can hold an older preset and a newer block containing a newly added field. Editing another field strips the unknown field and mints a winning null. Reviewers traced two triggers: cross-sender block delivery before the defining preset, and a failed preset send followed by later block commits. Neither trigger has a runtime reproduction yet. TASK-82 covers removal under an already-current preset; its calibrated interrupted-upload owner requires clearing an obsolete cell even when its version is newer than the preset. A blanket cell/preset counter cutoff would violate that accepted recovery case. This follow-up owns the opposite arrival state and its contract; it is outside TASK-79/80/88/77.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A public engine/runtime regression establishes the stale-preset/newer-field failure, or recorded evidence disproves the traced path without presenting a synthetic source assertion as runtime proof.
- [ ] #2 When a GM holds a newer field value before its defining preset, an edit to another field preserves that value and its cell version; later preset delivery makes it available unchanged.
- [ ] #3 Interrupted removal recovery still emits a versioned null for a genuinely removed field, including when the obsolete cell version exceeds the preset version; pending player proposals remain limited to their valid intent.
- [ ] #4 The reconciliation contract distinguishes supported preservation and removal cases, and docs and acceptance claims match the proven delivery behavior.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner scope decision, 2026-11-18: multiple GMs and multiple windows of one GM are outside current acceptance. This optional follow-up must establish relevance to one GM in one window before implementation; cross-sender constructions alone do not justify work. No dependency or blocker for preset-v4 completion.

Archived 2026-11-20 by the owner's decision ("99 архивируй"). With one GM in one window the GM creates every preset, so it cannot hold an older preset than a block it receives; the path needs a second GM (outside scope) or a failed storage write between the preset and block writes. No live-room occurrence is known.
<!-- SECTION:NOTES:END -->
