---
title: 'TASK-82: Preserve cell versions during preset reconciliation'
type: 'bugfix'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 2
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-76-block-records.md'
---

<frozen-after-approval reason="parent resumed the approved preset-v4 ticket graph">

## Intent

**Problem:** A preset change can reissue an unchanged cell with the uploader's new version and defeat
a concurrent GM edit. A later persisted GM reconciliation can also omit a removed field, allowing a
stale record to restore that old value through merge.

**Approach:** Preserve an already-current cell tuple while composing a preset upload, and emit a
versioned null only for persisted GM reconciliation. Keep player pending proposals limited to their
valid requested fields.

## Boundaries & Constraints

**Always:** Exercise the public engine/runtime path through `room-rig`, use two actual GM clients for
the upload/edit race, and assert literal stored tuples. The upload confirmation recomputes its
migration over the latest local replica. A removed field is cleared with the same version as the
persisted GM write that reconciles its block. A player proposal must not acquire a removed-field
clear that the player did not request.

**Never:** Do not treat the former self-origin mock frame as regression evidence. Do not change
TASK-97 or TASK-98 UI paths, invent host-runtime claims from the mock, or preserve an old candidate
without fresh calibration. Do not change the meaning of pending edits, proposal authorization, or
the preset loss confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Confirmed concurrent preset change | GM A gets an armor-removal diff; GM B saves `hp=20`; GM A receives that commit then confirms | Stored root has `hp: [20,4,"gm-b"]` and the upload's own removal tuple for `armor` | The test must be red on the integration base for the tuple overwrite, then green |
| Interrupted removal reconciled by GM | The current preset lacks armor, persisted root still has `armor: [5,2,"seed"]`, and a GM saves `hp=11` | Persisted root has `hp: [11,3,"gm-a"]` and `armor: [null,3,"gm-a"]`; a stale old record cannot restore armor | Preserve normal merge behavior |
| Player proposal over stale root | A player proposes a valid field while the loaded row also contains a field absent from the preset | The outbound proposal carries only the requested valid field | Do not send an unknown removed field |

</frozen-after-approval>

## Code Map

- `src/replica/composers.ts` -- creates preset-upload batches and normal or combined field patches;
  this is the persisted-write boundary.
- `src/replica/pending-edits.ts` -- calls `compose` for player intent and turns its output into a
  proposal patch; it must not receive reconciliation clears.
- `src/replica/command-routing.ts` -- applies the already-composed upload batch in ordered groups and
  composes pending GM field patches through `composePatches`.
- `src/core/preset-migrate.ts` -- provides migration writes, including retained field tuples and
  removed cells represented as nulls before minting.
- `src/replica/engine-preset.test.ts` -- owns public engine regressions with storage and room traffic.
- `tests/support/room-rig.ts` -- runs real mock platform clients, remote delivery and persisted
  storage; it is the permitted public-runtime oracle for this ticket.

## Tasks & Acceptance

**Execution:**
- [x] `src/replica/engine-preset.test.ts` -- replace the uncalibrated concurrent fixture with two
  actual GM clients, and preserve the interrupted-upload and player-proposal owners -- establish
  red/green evidence at the public engine boundary.
- [x] `src/replica/composers.ts` -- retain current tuples for unchanged migration cells and emit
  removed-field nulls only from persisted GM composition -- preserve merges without contaminating
  pending proposals.
- [x] `src/replica/engine.ts` context factories -- make the persisted
  versus pending boundary explicit if the public regression proves it is required -- retain player
  proposal semantics.
- [x] `backlog/tasks/task-82 - Preserve-untouched-cell-versions-during-preset-reconciliation.md`
  through the Backlog CLI -- record the calibrated outcome and any remaining blocker.

**Acceptance Criteria:**
- Given GM B commits `hp=20` after GM A requested, but before GM A confirms, an armor-removing
  preset change, when GM A receives the commit and runs the confirmed upload, then the persisted
  `hp` tuple is exactly `[20,4,"gm-b"]`.
- Given a current preset no longer contains armor and storage still has armor, when a GM writes hp,
  then the persisted record includes `armor: [null,3,"gm-a"]` and a stale armor record cannot
  restore it.
- Given a player makes a valid field proposal over a row with an obsolete field, when its proposal
  is sent, then that proposal contains only the valid requested field.

## Design Notes

The migration carries the latest tuple for cells that survive the new template. Re-minting every
cell makes an unchanged value look newer than a concurrent GM value. The persisted composer may add
a null for a cell that `stripToTemplate` removes because this null is merge data. The pending
composer is a display and proposal path: its output is later reduced to player intent, so it must
not manufacture a clear outside that intent.

## Implementation and Review Outcome

- Integrated at `9f6f5b3`; final reviewed source `a6af377`. The two-GM owner preserves
  `hp: [20,4,"gm-b"]`. The strengthened interrupted-upload owner uses an obsolete cell newer
  than the preset and requires `armor: [null,4,"gm-a"]`. This is the recorded D1 fixture
  correction to the earlier version-3 example, not a change to the versioned-clear contract.
- `ComposeContext.mode` separates persisted writes from pending views and player proposals.
  Both owners and the existing proposal owner passed mutation calibration.
- All six required checks passed: 3415 unit tests, one DOM-precondition skip, 572 browser tests.
  Review coverage was `mixed` 6/6 followed by `final` 2/2.
- Deferred review risk: a GM may receive a block with a newly added field before receiving the
  preset that defines it, then edit another field. The local strip treats that field as absent;
  persisted reconciliation can write a winning null and lose the newer value. Reviewers traced
  cross-sender reordering and a failed preset send followed by later block sends; neither was
  reproduced at runtime. This opposite preset/block arrival state is outside the recorded
  removal scenarios. The final review still reports it.
- The current repair prioritizes required recovery under the current local preset. A simple
  cell/preset counter cutoff would break the calibrated interrupted-removal owner. Distinguishing
  a genuine removal from a not-yet-received addition needs a separate provenance contract.
  See `deferred-work.md`, TASK-77–98 window 3. Stale-preset writes are not claimed safe.

## Verification

**Commands:**
- `bun test src/replica/engine-preset.test.ts` -- expected: the calibrated concurrent, interrupted
  and player-proposal owners pass; estimated 1 minute.
- `bunx oxfmt --ignore-path .gitignore --check src/replica/composers.ts src/replica/engine-preset.test.ts` -- expected: format passes; estimated under 1 minute.
- `bun run lint` -- expected: no lint errors; estimated 1 minute.
- `bun run typecheck` -- expected: typecheck passes; estimated 1 minute.
- `bun test` -- expected: all unit tests pass; estimated 5 minutes.
- `bun run test:browser` -- expected: mock browser suite passes with two workers after parent grants the shared slot; estimated 8 minutes.
- `bun run build` -- expected: production build passes; estimated 1 minute.
