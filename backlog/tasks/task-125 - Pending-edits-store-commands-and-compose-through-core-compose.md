---
id: TASK-125
title: Pending edits store commands and compose through core/compose
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-19T08:34:00Z'
updated_date: '2026-11-20T07:51:00Z'
labels:
  - replica
  - architecture
dependencies:
  - TASK-119
  - TASK-115.10
priority: low
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Architecture review 2026-11-18, candidate 4, deferred by the owner on 2026-11-19 until TASK-119 and TASK-115.10 land. Today a player edit is composed (`compose(view, command)` in `pending-edits.ts` `edit`), reduced to a `ProposalPatch` by `patchOf` (`pending-edits.ts:573`: loses `target.rowId`, keeps the normalised value), stored in `proposal-queue.ts`, and rebuilt into a record by `proposedRecord` (`proposal-queue.ts:239-301`), a second composer beside `core/compose`; on promotion `commandsOf` (`:592`) guesses the rowId back through `plainRowIdOf`. The wire does not change: `propose` carries a `VersionedRecord` (`room-messages.ts:81-92`). Target: the queue entry holds the original commands; every record comes from `compose` in mode `pending` (core/compose.ts:74); `patchOf`, `commandsOf` and `proposedRecord` go; `combinePatches`, `strippedPatch`, `movedPatches` are rewritten over commands and their tests (only in `proposal-queue.test.ts`) move with them. Must update the TLA+ mapping in `.claude/skills/edit-delivery/SKILL.md:70-84` (`proposedRecord`, `rebuiltRecord`). Why deferred: TASK-119 fixes the double-apply bug in `rejected`/`rebuiltRecord`/`armResend` on the current form with a module test and `DoubleApply.cfg`; changing the form in the same move leaves the fix without an oracle. TASK-115.10 judges whether pending-edits becomes a table.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No `ProposalPatch` type exists; the queue entry carries `Command` values and every proposed record is produced by `compose`
- [ ] #2 The `combinePatches`, `strippedPatch` and `movedPatches` cases of `proposal-queue.test.ts` have equivalents over commands
- [ ] #3 `formal/edit-delivery/check.sh` passes with the SKILL.md mapping updated; engine suite junit list equals the baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture the clean origin/master engine JUnit inventory.
2. Store player commands in the proposal queue, compose the wire record in core, and port the existing helper cases.
3. Verify JUnit parity and the edit-delivery mapping, then run the changed-path checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Engine baseline: origin/master 342fb1ad34cbbe62b9a3593b095b46430cfbe67b, clean; 745 passed, no skips. JUnit from bun test --reporter=junit --reporter-outfile=<file> src/replica/engine-*.test.ts. Inventory uses testcase (file, classname, name) with duplicate counts.
<!-- SECTION:NOTES:END -->
