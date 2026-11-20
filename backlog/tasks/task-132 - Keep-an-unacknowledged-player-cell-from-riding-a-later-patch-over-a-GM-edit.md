---
id: TASK-132
title: Keep an unacknowledged player cell from riding a later patch over a GM edit
status: To Do
assignee: []
created_date: '2026-11-19T21:21:00Z'
labels: []
dependencies:
  - TASK-119
references:
  - formal/edit-delivery
  - .claude/skills/edit-delivery/SKILL.md
priority: low
type: bug
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-119 made a GM client answer a resend of a proposal it already committed with its held record and the echo, so a lost commit no longer lets the same `(k, c, a)` overwrite a later GM edit. One path remains. A sheet is one key, so the player's edits of different fields share one pending entry (AD-4: one entry per key, `pending-edits.ts` `combinePatches`). Sequence: the player sets `str` to 11 and proposes `(k,3,P)`; the GM commits it (`room-protocol.ts` `receiveProposal`); the commit is lost (`send-queue.ts` gives up, or the player's AD-5 gate drops it); the GM sets `str` to 15 at `c=4`; before the resend the player edits `dex` on the same sheet; `combinePatches` folds the unacknowledged `str=11` into a new version `(k,4 or 5,P)` the GM never committed; it is committed outright (if the player knew `c=4`) or answered `stale` and rebuilt, and either way `str=11` overwrites the GM's 15. The GM cannot tell a carried cell from a deliberate re-set by versions, so the fix belongs on the player side (for example, keep the in-flight version's cells apart from the new delta until its ACK). The edit-delivery model has one field, so it cannot show this path; the model would need a second field of the same key. TASK-125 reworks how pending edits store and compose, so plan the two together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A player cell whose proposal the GM committed but whose ACK was lost does not overwrite a later GM edit of that field when the player edits another field of the same key before the resend
- [ ] #2 A player edit that really lost a race to a GM edit still gets the current behavior (rebuilt and re-proposed, or reported)
- [ ] #3 A module or engine test reproduces the lost commit, the GM edit and the other-field player edit, and passes
<!-- AC:END -->
