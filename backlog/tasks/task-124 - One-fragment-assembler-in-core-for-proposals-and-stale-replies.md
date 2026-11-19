---
id: TASK-124
title: One fragment assembler in core for proposals and stale replies
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T08:34:00Z'
updated_date: '2026-11-19T09:43:00Z'
labels:
  - replica
  - architecture
dependencies: []
references:
  - >-
    docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Architecture review 2026-11-18, candidate 4, the one part the owner accepted now (2026-11-19). Two copies of the same algorithm reassemble a record sent in `i`/`n` parts: `src/replica/room-protocol.ts:282-345` for a `propose` on the GM side, with limits `PROPOSAL_MAX_PARTS = 32`, `PROPOSAL_MAX_BYTES = 480_000`, `PROPOSAL_MAX_ASSEMBLIES = 32` (oldest evicted), `PROPOSAL_RETENTION_MS = 60_000` and `Date.now()`; and `completeStaleReject` in `src/replica/pending-edits.ts:345-400` for a `reject stale` on the player side, keyed `[k, c, a]`, with no limit at all. Both: a part count that differs from the open assembly drops it; a repeated part with other content drops it; a repeated identical part is ignored; completion runs `assembleRecords` (core/merge). Decision: one `src/core/fragment-assembler.ts` owns the algorithm and the four limits; both callers use it; the player side gets the GM byte, assembly and retention limits but no part cap: `staleReplyFragments` can legally exceed 32 parts (review finding 2026-11-19), recorded for a GM-side decision in deferred-work. The assembler takes `now` as an argument (no clock inside, so TASK-115.5 has nothing to replace) and answers with a tagged result (`complete`, `waiting`, or `dropped` with a reason), so TASK-115.6 can report the drops at `room-protocol.ts:285, 314, 332` instead of silence. The third, simpler assembly in `catch-up.ts:681` (a `state` answer, parts merged on arrival, only a set of indices) stays. Out of scope: storing commands instead of ProposalPatch (TASK-125), merging the queues (TASK-115.10).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both `propose` assembly in room-protocol and `completeStaleReject` in pending-edits call `createFragmentAssembler` from `src/core/fragment-assembler.ts`; neither module holds a `parts` map of its own
- [x] #2 `engine-propose` tests at `tests 768-911, 1016` pass unchanged; full check green; engine suite junit list equals the baseline
- [x] #3 The player side enforces the GM byte, assembly-count and retention limits (no part cap, because a legal stale reply can exceed 32 parts); a unit test shows an oversized and an expired stale reply are dropped and a 33-part one completes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Run through implement-spec: tdd chain (OpenCode test writer then implementer) in worktree task-124/assembler; merge into integration branch task-124-fragment-assembler-implementati; full check; code-review; one PR with auto-merge. Spec: _bmad-output/implementation-artifacts/spec-task-124-fragment-assembler.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1: room-protocol.ts and pending-edits.ts call createFragmentAssembler; grep for 'parts: new Map|PROPOSAL_MAX_|PROPOSAL_RETENTION' in src/replica prints nothing. AC2: engine-propose.test.ts unchanged; full check green (oxfmt, lint, typecheck, bun test 3504 pass/1 skip, test:browser 583 pass, build); junit names at merged master are a subset of after, difference = 9 new tests. AC3: pending-edits.test.ts 'a 33-part stale reply completes without a player part cap' and 'stale reply limits drop oversized and expired replies before a later two-part reply completes', calibrated by mutation (player maxParts 32, maxBytes/retentionMs Infinity each go red).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
One core module, src/core/fragment-assembler.ts, now reassembles records sent in parts for both the GM (propose) and the player (reject stale). The time comes in as an argument and the answer is a tagged outcome (complete, waiting, ignored, dropped with a reason), so TASK-115.6 can report drops. The GM keeps its four limits; the player gets the GM byte, assembly and retention limits with no part cap, so its stale-reply map is now bounded. Wire format unchanged. Follow-ups in deferred-work.md: the GM sends stale replies with no part cap, and the player's 480 000-byte limit drops a legal stale reply of about 34+ full parts; both wait for one owner decision.
<!-- SECTION:FINAL_SUMMARY:END -->
