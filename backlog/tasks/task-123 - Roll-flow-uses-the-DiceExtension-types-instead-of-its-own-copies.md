---
id: TASK-123
title: Roll flow uses the DiceExtension types instead of its own copies
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T08:23:00Z'
updated_date: '2026-11-20T06:39:00Z'
labels:
  - replica
dependencies: []
priority: low
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/replica/roll-flow.ts:43-57` declares `RollDiceReadiness`, `RollDiceFailure`, `RollDiceRequest` and `RollDicePort`, field for field equal to `DiceExtensionReadiness`, `DiceExtensionFailure`, `DiceExtensionRoll` and the `ready`/`roll` members of `DiceExtension` in `src/replica/dice-extension.ts:32-66`; the engine passes `diceExtension` as `dice` (`engine.ts:460-466`). One adapter, one hypothetical seam (codebase-design). Delete the four roll-flow types and type `dice` as `Pick<DiceExtension, "ready" | "roll">`; update the 3 outside references. Architecture review 2026-11-18, candidate 2, the one part that does not touch ADR-0004. Land after TASK-115.10 has judged roll-flow, or coordinate with that branch: it edits the same file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `grep -rn "RollDicePort\|RollDiceReadiness\|RollDiceRequest\|RollDiceFailure" src` is empty and `createRollFlow` takes `Pick<DiceExtension, "ready" | "roll">`
- [x] #2 Full check passes with no behaviour change; the engine suite junit list equals the baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete RollDiceReadiness, RollDiceFailure, RollDiceRequest, RollDicePort from src/replica/roll-flow.ts.
2. Type RollFlowPorts.dice as Pick<DiceExtension, 'ready' | 'roll'> (type import from @/replica/dice-extension).
3. roll-flow.test.ts: use DiceExtensionFailure type from dice-extension in place of RollDiceFailure.
4. Run the full check; compare the engine suite junit list with the master baseline.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20: Deleted RollDiceReadiness/RollDiceFailure/RollDiceRequest/RollDicePort from src/replica/roll-flow.ts; RollFlowPorts.dice is Pick<DiceExtension, 'ready' | 'roll'>; roll-flow.test.ts uses DiceExtensionFailure from ./dice-extension. roll-flow.ts is in no formal/*/coverage.txt (grep empty), so no model work.
Evidence: grep -rn 'RollDicePort\|RollDiceReadiness\|RollDiceRequest\|RollDiceFailure' src is empty. Engine suite junit (bun test src/replica/engine- src/replica/roll-flow): 765 tests on master and on the branch, sorted testcase lists identical, 0 failures. oxfmt check, lint (0 errors), typecheck, bun test (3632 pass, 0 fail), bun run mutants (55 killed, 0 survived), bun run build: green.
Review (Blind Hunter): the dice-extension union DiceExtensionFailure shares its name with the ports.ts class; pre-existing, deferred to deferred-work.md and TASK-138.

bun run test:browser: 583 passed, 4 failed in tests/access.e2e.ts (navigation-to-finish timeouts on the first page load while 13 parallel lanes ran); re-run of tests/access.e2e.ts alone: 16/16 passed. The diff is types only and erased at build.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Roll flow's dice port is now typed from the dice extension itself: RollFlowPorts.dice is Pick<DiceExtension, 'ready' | 'roll'>, and the four field-for-field copies (RollDiceReadiness, RollDiceFailure, RollDiceRequest, RollDicePort) are gone, so a change to the extension's contract reaches roll-flow through the type checker. No behaviour change: the engine suite's junit testcase list equals the master baseline (765, 0 failures), and the full check passes (browser suite green after one load-related re-run of access.e2e.ts). Follow-up: TASK-138 renames the dice-extension union DiceExtensionFailure, which shares its name with the ports.ts failure class.
<!-- SECTION:FINAL_SUMMARY:END -->
