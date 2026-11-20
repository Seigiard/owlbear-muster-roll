---
title: 'TASK-138: Distinguish the dice extension roll failure type'
type: 'refactor'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
baseline_commit: '9f53a4917a78e0484be631b958afd0326d5638a0'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** The replica's dice extension roll failure type shares the name `DiceExtensionFailure` with the tagged error that roll flow reports.

**Approach:** Rename the return type to `DiceExtensionRollFailure` in `src/replica/dice-extension.ts` and update its type references there and in `src/replica/roll-flow.test.ts`. Keep the tagged class, its tag, the result variants, and all runtime behavior unchanged.

</frozen-after-approval>

## Implementation Notes

- Renamed the union and its type references only. Reversing the identifier substitution reproduces both original files exactly.
- Bun emitted identical JavaScript for both files. The dice extension and roll flow suites passed all 83 tests before and after the rename.
- Neither source file is listed in `formal/*/coverage.txt`. `formal/drift.sh` passed.
- The full Bun suite passed with 3,672 passing tests and one skip. All 55 mutation checks passed.
- Browser checks reproduced two existing load failures tracked in TASK-142. The access file passed all 16 tests alone. The selection file passed all eight tests alone.
- After merging `master`, the full Chromium run passed all 589 tests with four workers and one retry allowed. No test needed a retry.
