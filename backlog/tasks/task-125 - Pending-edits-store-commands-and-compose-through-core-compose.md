---
id: TASK-125
title: Pending edits store commands and compose through core/compose
status: To Do
assignee: []
created_date: '2026-11-19T08:34:00Z'
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
