---
id: TASK-119
title: Keep a committed player edit from coming back over a later GM edit
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T06:26:00Z'
updated_date: '2026-11-19T21:27:00Z'
labels: []
dependencies: []
references:
  - formal/edit-delivery
  - .claude/skills/edit-delivery/SKILL.md
priority: low
type: bug
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the commit that answers a player's proposal never reaches the player, the player resends it, and the GM can apply the same edit a second time over a GM edit made in between. Sequence: the player sets `str` to 11 (`pending-edits.ts` `edit`, propose `(k,3,P)`); the GM commits it (`room-protocol.ts` `receiveProposal`, ack in `commit-outbox.ts`); the commit is lost — the send queue gives up on a non-rate-limit error (`send-queue.ts` `sendUntilAnswered`) or the player's AD-5 gate drops it because the GM is not yet in its party list (`room-protocol.ts`); the GM sets `str` to 15; the resend timer (`proposal-queue.ts` `armResend`) sends `(k,3,P)` again; `checkProposal` (`src/core/access.ts`) answers `stale` with the 15 record; `rejected` in `pending-edits.ts` rebuilds the patch on top of it and proposes `(k,5,P)` = 11; the GM commits it and the GM's 15 is lost. `stale` compares version counters only, so neither side can tell "my committed edit was overwritten later" from "my edit lost a race". Without a lost message it does not happen: the GM's send queue delivers the ack before any later reject. Found by the TLA+ model `formal/edit-delivery/` (config `DoubleApply.cfg`, invariant `NoDoubleApply`) and replayed on the real `createPendingEdits`, `checkProposal` and `mergeRecords`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A player edit the GM already committed is never applied again after a later GM edit of the same field, even when the commit that answered it was lost
- [x] #2 A player edit that really lost a race to a GM edit still gets the current behavior (rebuilt and re-proposed, or reported)
- [x] #3 A module test reproduces the lost commit followed by a GM edit and passes
- [x] #4 `formal/edit-delivery/check.sh` reports `DoubleApply.cfg` as passing, and the config and the edit-delivery skill are updated to expect that
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix 1709de4, model 4ab19f2. receiveProposal remembers the generation and (k, c, a) of the newest 1000 proposals it committed and answers the same proposal again with the held record and its echo, ahead of checkProposal. AC #1 holds for the resend this task describes. Paths left: a GM reload before the resend (memory is in RAM), a second GM page (accepted risk), and a later player edit of another field of the same key, which folds the unacknowledged cell into a new (k, c, a): TASK-132. AC #4: DoubleApply.cfg is gone; NoDoubleApply is in EditDelivery.cfg and Refusals.cfg, and broken/ForgetsCommitted.cfg drops the rule. Spec: _bmad-output/implementation-artifacts/spec-task-119-committed-proposal-echoes-once.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A GM client now answers a resend of a player proposal it already committed with its held record and the echo, so a commit lost on the way to the player no longer lets that edit overwrite a later GM edit. A proposal that really lost a race still reads as stale. The edit-delivery model checks NoDoubleApply in both gates. A later edit of another field of the same sheet can still carry the old cell; TASK-132 tracks it.
<!-- SECTION:FINAL_SUMMARY:END -->
