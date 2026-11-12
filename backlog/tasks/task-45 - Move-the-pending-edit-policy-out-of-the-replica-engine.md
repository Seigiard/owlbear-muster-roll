---
id: TASK-45
title: Move the pending edit policy out of the replica engine
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-12T07:28:00Z'
labels: []
dependencies: []
references:
  - src/replica/proposal-queue.ts
  - src/replica/engine.ts
  - src/replica/engine-propose.test.ts
priority: medium
type: task
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The player side of AD-4 is split across a seam that does not hold. `src/replica/proposal-queue.ts` is a container (`get/put/hold/drop/matching/resendAll`), and every decision about a pending edit lives in `startReplicaEngine` in `src/replica/engine.ts`: about 13 functions from `handlePlayerCommand` to `recheckProposal` rebase on `stale`, strip fields the template no longer has, run the write access pre-check, combine patches, move patches after a preset change, hold during catch-up and send the denied notice. The pure helpers in proposal-queue.ts are sequenced by the engine; `dropDisallowed` even combines patches inline instead of calling `combinePatches`. Commit 50437a2 had to change both files for one rule. The only tests for the policy are in `engine-propose.test.ts` (1821 lines, 55 tests, 25 real-time `pause()` calls through two full engines), because the policy has no interface of its own. Found in the architecture review of 2026-11-12 (candidate 1, Strong).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The pending edit decisions (rebase on stale, strip to template, move after a preset change, combine patches, hold during catch-up, write access pre-check, denied notice once per quiet window) live in one module outside `engine.ts`; the engine passes it events and executes what it returns
- [ ] #2 That module has its own `*.test.ts` that covers each decision with a fake minter and clock, with no full engine and no real-time waits
- [ ] #3 `engine-propose.test.ts` keeps only round-trip tests that need two engines; every behavior it covered before is still covered
- [ ] #4 `core/access` stays the only judge of write access, and AD-4, AD-7 and AD-14 behavior is unchanged: the full check in CLAUDE.md passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. bmad-build spec _bmad-output/implementation-artifacts/spec-task-45-pending-edits-module.md (module interface, decisions matrix, test split, proof of unchanged behaviour). 2. implement skill: phase A extracts src/replica/pending-edits.ts and rewires engine.ts with every test untouched; phase B adds pending-edits.test.ts and thins engine-propose.test.ts. 3. code-review against the spec. 4. Architecture spine names the module (own docs commit). 5. Full check, merge master, check again.
<!-- SECTION:PLAN:END -->
