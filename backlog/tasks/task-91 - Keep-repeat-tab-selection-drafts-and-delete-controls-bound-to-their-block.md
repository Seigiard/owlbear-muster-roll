---
id: TASK-91
title: Keep repeat-tab selection, drafts and delete controls bound to their block
status: Done
assignee:
  - '@openai'
created_date: '2026-11-17T11:03:00Z'
updated_date: '2026-11-17T14:18:00Z'
labels:
  - format-v4
  - review-follow-up
  - critical
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/ui/main.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#adversarial-claude-1
  - src/ui/sheet/sheet-body.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#adversarial-claude-2
priority: high
type: bug
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. Changing the tab list on another client can move the open view and send an existing draft to a different block. Local deletion can leave the next block's confirmation stuck.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: adversarial-claude-1

> `chosenTemplateTabs` stores a bare number. That number now indexes `visibleTemplateTabs(...)`. This list grows and shrinks with the repeat blocks in records. The content panel is keyed by `templateTabKey(index)`, `SheetSection` by `${sourceIndex}.${sectionIndex}`, and rows and cells by field id. None of these keys contains the block's instanceId.

> Remote delete: the tabs are [Overview, A, B, C, Notes]. A user edits a field of B (index 2). Before the typing-pause save fires, another client deletes A. Index 2 now selects C, and every React key stays the same. `useTextFieldEdit` keeps B's draft and refreshes `latest.current.place` on each render. The timer then sends a `field-patch` with B's value to C's record. This breaks the rule "a vanished repeat instance takes nothing".

> Remote add: a user has Notes open at index 3, and another GM adds a block. Index 3 is now a block tab, so the view silently jumps from Notes. A delete before the open tab shifts it the other way. The AD-26 contract that the chosen tab "stays" no longer holds, and no e2e test changes blocks while a later tab is open.

Review finding: adversarial-claude-2

> `TabBlockControls` keeps `asking` and `waiting` in local state. On a successful delete it is expected to unmount, but it does not when the deleted block has a later sibling. The chosen index now points at the next block, the panel key is unchanged, and the element has no key. In the e2e fixture [Overview, Alpha, Блок 2, Notes], deleting Alpha shows the confirmation for 'Блок 2' with `asking=true, waiting=true`. Удалить returns early, and Отмена and Escape do nothing, so the dialog is stuck until the GM leaves the tab. The e2e test at repeat-tabs.e2e.ts:343 checks only that Alpha is gone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A remote add or delete before the selected tab preserves the selected source tab or block while that target still exists.
- [x] #2 With B being edited, deleting preceding block A cannot save B's draft into C; a removed draft target never writes into another block.
- [x] #3 A non-repeat Notes tab stays open when another GM adds a preceding repeat-tab block.
- [x] #4 After deleting a non-final block, the next block's delete controls start outside confirmation/waiting state and remain usable.
- [x] #5 Browser regressions cover remote lifecycle changes during a delayed field save and consecutive local deletion/cancel flows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock focused browser regressions for selected repeat-block/source-tab identity, delayed-save target loss, and successor delete/cancel.
2. Use the existing pure navigation reducer to store stable rendered identity; derive identity-based shell/content keys so a removed target unmounts rather than redirects a draft.
3. Validate focused browser ownership, then source checks; leave TASK-95/96/97 unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TDD chain recorded: locked browser regressions at 43e889182dbfb5b878ef8437aae31fe9c81108c0; production fix at 3e31b0110b6ca6637d3f610aa4ff86b49888453b. Focused browser 20 passed; full browser with 2 workers 562 passed. Five browser assertions calibrated against positional-identity, redirected-draft, Notes-selection, and inherited delete-control mutations. Parent owns final acceptance and integration review.

2026-11-17: Accepted in the integration branch. Final integration evidence on clean 738bbf20a2193cd92d3d39c9a467398be9db1ea8: format, lint, typecheck, unit (3401 pass, 1 skip), browser (563 pass, workers=2), and build all exit 0. Closing review: mixed 6/6, two major fixes; final 2/2, no findings or open questions. See _bmad-output/implementation-artifacts/spec-task-77-98-completion.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Remote block changes preserve the selected live tab and delayed drafts stay with their block. Removed targets discard drafts; successor delete controls reset. Review fix 738bbf2 also preserves stable selection after local plus creation. Browser owners and mutations cover these paths.

Final integration evidence on clean 738bbf20a2193cd92d3d39c9a467398be9db1ea8: format, lint, typecheck, unit (3401 pass, 1 skip), browser (563 pass, workers=2), and build all exit 0. Closing review: mixed 6/6, two major fixes; final 2/2, no findings or open questions. See _bmad-output/implementation-artifacts/spec-task-77-98-completion.md.
<!-- SECTION:FINAL_SUMMARY:END -->
