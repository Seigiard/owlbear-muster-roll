---
title: 'TASK-118: Write the room copy of edits a GM made just before closing the tab'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Closing the tab hides the page, and the room copy write starts reading metadata. The tab dies before the read answers, so nothing is written. The owed write lives only in memory, so when the GM opens the room again `caughtUp(false)` arms nothing. Players who open the room before the GM edits again read the old values (formal finding `finding-lost-for-good.cfg`, TASK-118).

**Approach:** The room copy the GM reads in catch-up shows the loss. When that copy lacks a record the GM stores, the GM owes a write, and catch-up end schedules it. No persistent marker is needed. Pin it with a module test and an engine test of the closed tab, and change the room-copy model so `NoLossForGood` holds with one GM.

</frozen-after-approval>

## Implementation Notes

- `room-copy-table.ts` `observeRead`: on a GM's `catch-up` read, `owed` is also set when the copy reads OK and `readBackHolds({ g: env.generation, records: env.records }, copy)` is false, and the GM holds at least one record. So it is set for:
  - a copy of the same generation that lacks a stored record or holds an older version of it;
  - a copy of a lower generation;
  - no copy, while the GM holds records.
- It is not set for:
  - a copy of a higher generation (catch-up adopts it);
  - an unreadable copy or an older-format copy (the old rule decides);
  - a player;
  - a `followed` read.
- `caughtUp(false)` then calls `pause`, and the write follows the usual path.
- The catch-up timer can end catch-up before the copy read answers. Such a late read finds the write gate open, and `observeRead` arms the pause itself when it newly owes a write. During catch-up the gate is closed, so `caughtUp` arms it as before. This also covers a late unreadable copy.
- Two module tests read the copy with the gate open, which catch-up never does. They now close the gate during the read.
- A GM whose records do not fit the room copy writes again on each catch-up and shows the not-saved notice. Routine edits already retry the same way, so this is accepted.
- Four engine tests asserted "no write" in a room with no room copy. Each now seeds a copy that holds the GM's records, so only the step under test could owe a write.
- Two browser tests in `tests/room-copy.e2e.ts` read the state before any copy, then wrote with a 100 ms pause. A GM with records now writes at catch-up end, so the copy was there before the test's step. They now use the 10-minute pause, and a page hide starts the write.
- Review: Blind Hunter, 6 findings.
  - Patched:
    - a late catch-up read set `owed` with no timer (above);
    - module rows for a lower-generation copy and an older-format copy;
    - the skill's bounds bullet;
    - the skill's claim about when the code compares.
  - Already handled: the sync moves for the three models that list `room-copy-table.ts`, and the browser run.
- Model (`formal/room-copy/RoomCopy.tla`):
  - `CatchUpEnds` owes a write when the GM's records are not all in the copy. It compares them before the merge.
  - The code compares at the read answer. A commit that arrives before catch-up end schedules its own write, and a read that answers after it arms the write itself, so the fold hides no loss.
  - `NoLossForGood` used to cover every edit made. An edit that only a closed page holds cannot be written by any code, so it now covers the edits an open GM holds.
  - The owner's verdict scopes the finding to one GM. `one-gm.cfg` checks every safety property with one GM that closes and reopens.
  - With two GMs, finding 2 (accepted risk) still breaks `NoLossForGood`. So the property is not added to `RoomCopy.cfg`.
  - `finding-lost-for-good.cfg` is replaced by `one-gm.cfg` (pass) and `broken-catch-up-ignores-copy.cfg` (the old rule, which fails `NoLossForGood` after Edit, PageReturned, PageHidden, Stop, Reopen, CatchUpEnds).
- Room-copy skill:
  - Finding 3 becomes a "Fixed" paragraph.
  - The verdict, the `CatchUpEnds` code map row, the bounds, the coverage record (`observeRead`) and the fixed-finding procedure are updated.
- The other models:
  - The generation-adoption `WriteCopy` has no `owed` guard, and the catch-up model does not read `observeRead`. So their sync moves with no model change.
- Mutants: R5's anchor moved past the new clause; R21 drops the owed write for a copy behind the GM, and R22 drops the arm of a late read.
- Checks: `oxfmt`, lint, typecheck, `bun test` (3628 pass), `test:browser` (587 pass), `mutants` (room-copy 21 of 21 killed; the full run killed every other mutant), build, `formal/room-copy/check.sh` (every config as expected), `formal/drift.sh`. Removing the rule fails the engine test, the module rows for a copy that lacks a record and for no copy, and `broken-catch-up-ignores-copy.cfg`; removing the late arm fails the late-read test.
