---
id: TASK-132
title: Keep an unacknowledged player cell from riding a later patch over a GM edit
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-19T21:21:00Z'
updated_date: '2026-11-20T12:25:00Z'
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
- [x] #1 A player cell whose proposal the GM committed but whose ACK was lost does not overwrite a later GM edit of that field when the player edits another field of the same key before the resend
- [x] #2 A player edit that really lost a race to a GM edit still gets the current behavior (rebuilt and re-proposed, or reported)
- [x] #3 A module or engine test reproduces the lost commit, the GM edit and the other-field player edit, and passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock a lost-ACK regression and preserve the genuine-stale case.
2. Keep sent commands apart from later commands and promote them after the matching answer.
3. Extend EditDelivery to two fields on one key; verify the broken variant and fixed model.
4. Run changed-path checks, sync formal coverage, and open the PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- The lost-ACK engine regression was red on both clients (`str=11` instead of the GM correction `str=15`). It is green with the fix, and the genuine stale reply still rebuilds and proposes the edits.
- `formal/edit-delivery/check.sh` passed four gates and failed all nine broken controls as expected. The old-folding control reproduced the 11-step replay. The catch-up, generation-adoption, and room-copy suites and all four coverage checks passed.
- Format, lint, typecheck, build, and 3,672 Bun tests passed, with one existing environment skip. Chromium passed 588 tests. The mutation suite killed all 55 mutants. The confirming review reported no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A lost acknowledgement no longer lets a later edit of another field overwrite the GM correction. A genuine stale reply still retries or reports failure. Engine and two-field model regressions cover the difference. TASK-147 tracks GM promotion, and TASK-148 tracks two-field refusal and GM-return checks.
<!-- SECTION:FINAL_SUMMARY:END -->
