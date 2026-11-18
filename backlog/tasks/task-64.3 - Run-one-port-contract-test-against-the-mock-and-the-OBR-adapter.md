---
id: TASK-64.3
title: Run one port contract test against the mock and the OBR adapter
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-15T05:37:00Z'
labels:
  - architecture
  - tests
  - platform
dependencies:
  - TASK-64.2
parent_task_id: TASK-64
type: task
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The mock adapter (`src/platform/mock`, about 1750 lines) is a second implementation of the ports with its own room simulation, and the OBR adapter (about 316 lines) is tested only through three pure helpers. Nothing runs the same port scenarios against both, so the mock can drift from Owlbear and the app would still pass every test. CLAUDE.md states the consequence: the mock proves app logic only, and `deferred-work.md` lists many checks the owner must do in a live room. A contract test parametrized by an adapter factory closes part of that gap: on the mock it runs in `bun test`; on the OBR adapter it runs in the Playwright browser suite or in a harness that the owner runs against a live room. Start with the ports the engine depends on most: Storage (read, write, remove, list, failure kinds), Broadcast (LOCAL and REMOTE delivery, arrival order, `rate-limited`) and Metadata.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One contract test module takes an adapter factory and covers Storage, Broadcast and Metadata semantics the engine relies on, each scenario named after the behavior
- [x] #2 The contract runs against the mock adapter in `bun test` and passes
- [x] #3 The contract runs against the OBR adapter in `bun run test:browser` or a documented harness, with the scenarios it cannot run outside a live room listed and the reason recorded
- [x] #4 Every mock divergence the contract finds is fixed in the mock or recorded in `deferred-work.md` with a live-room check
- [x] #5 CLAUDE.md tests block states what the contract proves and what still needs the owner in a live room
- [x] #6 The full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the framework-independent adapter-factory contract and its real mock and Chromium-storage bindings.
2. Keep the opt-in OBR path as a documented paired manual-observation harness; do not treat it as a live run or automatic PASS/FAIL evaluator.
3. Fix demonstrated mock divergence and document the bounded proof, owner comparison steps, relay ambiguity, and explicit live-only limitations.
4. Reuse the accepted targeted, full-suite, static/build, calibration-replay, and confirming-review evidence; close the task only after all acceptance criteria are checked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closeout decision: Ручной стенд (Recommended) (option A). The OBR path is a documented paired manual-observation harness. No live Owlbear room was opened or mutated, and the harness is not an automatic PASS/FAIL evaluator.

Acceptance evidence: AC1 is covered by the shared named adapter-factory scenarios; AC2 by final D6/D7 mock evidence (10/10); AC3 by the documented harness alternative and final Chromium storage evidence (1/1), with unavailable live-host scenarios and reasons recorded in the spec and CLAUDE.md; AC4 by the demonstrated mock fix and the explicit live-check boundary; AC5 by the maintained tests guidance and harness README; AC6 by reused final D6/D7 full suites, final reviewA mock/static/build checks, and replay-2.

Confirming review 02-after-fix completed with exit 0, 2/2 healthy sources, zero blocking findings. The original mixed review completed with 6/6 healthy sources and 9 minor findings. Separately, all three BMAD layers completed, and each finding and deliberate omission remains recorded in the spec. Limitations remain explicit: finite 2-second/100-ms observation windows, coordinator/peer/bridge console inspection, relay-versus-adapter ambiguity, and no live proof of host delivery, timing/order, rate limits or recovery, metadata capacity/drops, bridge lifecycle, or deferred harness polish.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed TASK-64.3 after confirming final review. The shared port contract has accepted mock and Chromium-storage evidence, while the OBR path remains a documented paired manual-observation harness and no live room run is claimed. Final D6/D7 full suites, reviewA mock/static/build checks, and replay-2 were reused; confirming review 02-after-fix exited 0 with 2/2 healthy sources and zero blocking findings. The original mixed review was 6/6 healthy with 9 minor findings. Separately, all three BMAD layers completed, and each finding and deliberate omission remains recorded in the spec rather than erased.
<!-- SECTION:FINAL_SUMMARY:END -->
