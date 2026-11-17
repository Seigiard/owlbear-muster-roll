---
id: TASK-78
title: 'Repeat tab: one tab per block'
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-17T10:38:00Z'
labels:
  - format-v4
  - blocked
  - review-blocked
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT STATUS — 2026-11-17, after closing review:
REVIEW BLOCKED. The implementation is merged, but the complete 6/6-source closing review found 3 critical and 6 major defects. Critical: repeat-tab fields leak into root migration maps and can silently clear values; the receiving GM accepts player tab-block creation/deletion; index-based selection can retarget a pending draft after a remote add/delete. Also open: hidden-section authorization, dice rolls, root token links, role-filtered token opening, Builder/reveal DOM context and delete-control state. The branch is NOT release-ready. Correct these public behavior owners before another repair attempt. Review snapshot: 7dcd100; fixed base: ffd1051; review-01.md and review-01.json in preset-v4-78-87-20261117 contain all findings. No review fixes were started after the global finish-mode boundary.

Earlier progress below is historical; the current status above supersedes it.

Bounded run stopped after about 90 minutes at clean candidate e3ab0d423e970c77729c7f7682a9ed1fbca39288. Blocking D6: when a repeat-tab scope has zero blocks, including after the last block is deleted, extension and Builder preview derive the add action from rendered block tabs, so the GM has no plus action. Derive actions from visible source repeat scopes, then observe zero-block and last-delete behavior. No scoped review ran. Actual output artifacts show Bun3377 pass/1 environment skip/0 fail and browser552 passed including all10 repeat-tab owners, but final-state attribution is report-only; final format artifact is missing and exact final lint/typecheck/build logs and exits are unavailable. Do not treat this candidate as six-check verified or accepted. Lock6e44fa3122cd8aedeac0099422c9ab2190307c64 is enforced; initial lock and candidate remain reachable. Four phase turns; no live workload, push or deployment. TASK79/80 implementation has not started. Evidence: /Users/seigiard/.claude/artifacts/tdd-20261116-235951/task-78-repeat-tab/ticket.md and implementer-1.report.md.

CURRENT: Implementation merged into feature/preset-v4-tasks-77-80 at e53781794550125c0feab568ac55a4015c97b0b7. The earlier zero-block and automatic-add blockers are repaired. All six checks pass at e0a332d; full browser recovery passed 558 tests. One earlier NPC focus failure did not reproduce and remains disclosed. Remaining: the single closing integration review and final acceptance. No deployment.
<!-- SECTION:NOTES:END -->
