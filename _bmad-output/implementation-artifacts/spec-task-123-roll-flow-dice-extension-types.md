---
title: 'TASK-123: Roll flow uses the DiceExtension types instead of its own copies'
type: 'refactor'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/replica/roll-flow.ts` declares `RollDiceReadiness`, `RollDiceFailure`, `RollDiceRequest` and `RollDicePort`, field for field equal to `DiceExtensionReadiness`, `DiceExtensionFailure`, `DiceExtensionRoll` and the `ready`/`roll` members of `DiceExtension` in `src/replica/dice-extension.ts`. The engine passes its one `diceExtension` as `dice`, so the copies are a hypothetical seam with one adapter.

**Approach:** Delete the four roll-flow types, type `RollFlowPorts.dice` as `Pick<DiceExtension, 'ready' | 'roll'>`, and point the test's references at `DiceExtensionFailure` from `dice-extension.ts`. No behaviour change: the engine suite's junit test list equals the baseline.

</frozen-after-approval>

## Implementation Notes

- `src/replica/roll-flow.ts`: deleted the four `RollDice*` types; `RollFlowPorts.dice` is `Pick<DiceExtension, 'ready' | 'roll'>`. The now-unused `DicePlusTarget`, `DiceTerm` and `DieFace` imports went with them.
- `src/replica/roll-flow.test.ts`: the two deferred dice results use `DiceExtensionFailure` from `./dice-extension`.
- `roll-flow.ts` is in no `formal/*/coverage.txt`, so no model changed.
- Engine suite (`bun test src/replica/engine- src/replica/roll-flow`, junit): 765 tests before and after, sorted testcase lists identical, 0 failures.

## Review Triage Log

- Blind Hunter: leaked tool-call markup under Implementation Notes — high, real (the spec write swallowed a shell call). Patched: section rewritten.
- Blind Hunter: the union `DiceExtensionFailure` (dice-extension.ts:53) shares its name with the class in platform/ports.ts:133; the test now imports the union under that name — low, real, pre-existing collision. Deferred: deferred-work.md and TASK-138.
- Blind Hunter: no AC #2 baseline evidence — false at triage: the baseline and after lists were recorded in the scratchpad and compare equal (see Implementation Notes and the task notes).
- Blind Hunter: spec lacks Code Map, Tasks and Verification and has empty `context` — false: the oneshot route deletes those sections by design; the changed-path checks come from CLAUDE.md.
