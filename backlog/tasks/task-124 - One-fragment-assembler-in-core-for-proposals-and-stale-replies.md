---
id: TASK-124
title: One fragment assembler in core for proposals and stale replies
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T08:34:00Z'
updated_date: '2026-11-19T08:56:00Z'
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
- [ ] #1 Both `propose` assembly in room-protocol and `completeStaleReject` in pending-edits call `createFragmentAssembler` from `src/core/fragment-assembler.ts`; neither module holds a `parts` map of its own
- [ ] #2 `engine-propose` tests at `tests 768-911, 1016` pass unchanged; full check green; engine suite junit list equals the baseline
- [ ] #3 The player side enforces the GM byte, assembly-count and retention limits (no part cap, because a legal stale reply can exceed 32 parts); a unit test shows an oversized and an expired stale reply are dropped and a 33-part one completes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Run through implement-spec: tdd chain (OpenCode test writer then implementer) in worktree task-124/assembler; merge into integration branch task-124-fragment-assembler-implementati; full check; code-review; one PR with auto-merge. Spec: _bmad-output/implementation-artifacts/spec-task-124-fragment-assembler.md
<!-- SECTION:PLAN:END -->
