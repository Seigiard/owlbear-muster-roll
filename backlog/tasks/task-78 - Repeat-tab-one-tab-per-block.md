---
id: TASK-78
title: 'Repeat tab: one tab per block'
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-16T23:57:00Z'
labels:
  - format-v4
dependencies:
  - TASK-77
references:
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
type: feature
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A GM wants an NPC sheet where each NPC is a tab with its own sections, not a row in a stacked list and not a sheet of a set with its own sidebar entry. In format v4 `repeat` on a tab means one tab per block. Story 10 of _bmad-output/specs/spec-muster-roll/stories.yaml; CAP-41. Removes the temporary refusal of `repeat` on a tab from the previous task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A tab accepts `repeat: {id, nameField}`; the tab row shows one tab per block titled by the block name field value, with the empty-name fallback
- [ ] #2 The GM sees a "+" tab last that adds an empty block and opens its tab; players see the block tabs and no "+"
- [ ] #3 A GM-only delete inside the tab removes the block with its values and its token links after the same confirmation a sheet deletion uses
- [ ] #4 The open tab stays client-local and `openTabIndex` counts block tabs; a token cell inside a block tab opens and marks that tab (CAP-14, CAP-32)
- [ ] #5 The builder preview and the extension draw the repeat tab through the one frame component; e2e covers add, open, delete and the player view
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the prepared spec with the committed TASK77 row-scope and visibility repair. 2. Project stored repeat-tab blocks into stable rendered tabs shared by extension and preview. 3. Extend GM-only add/delete and token open/map marks with exact block context. 4. Verify core/engine and browser behavior through the TDD chain, then run required full checks and one scoped review. 5. Update release-boundary documentation and record acceptance evidence. Source dependency is available; TASK77 AC2 temporary-guard history stays explicit rather than falsely checked.
<!-- SECTION:PLAN:END -->
