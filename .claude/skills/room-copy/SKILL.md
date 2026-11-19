---
name: room-copy
description: Model-check the AD-8 room copy write loop (src/replica/room-copy-table.ts, its shell room-copy.ts and their engine wiring) with TLA+. Use when a change touches the room copy's write, read-back, pause timer, page hide or return, catch-up end, stop, or the commits that trigger a write; or to answer whether GM writes can race, lose an edit or stay stuck.
---

# Room copy model

`formal/room-copy/RoomCopy.tla` is a TLA+ model of the room copy (see `GLOSSARY.md`) as several GM clients write it into one Owlbear room metadata key. TLC checks every order of edits, page events, timers and port answers within the bounds below. A pass covers the model, not the code: the model is only as true as its code map.

## When a change touches this

Compare the change with the coverage record at the end. A change to a listed function, or to how the engine calls it, needs this check. `formal/room-copy/coverage.txt` lists the covered files, and `formal/drift.sh` fails when one of them changed after the sync commit. Changes to `encodeSnapshot`, `readSnapshot`, generations or imports do not need it: the model leaves them out.

## Run

From the repo root:

```sh
formal/room-copy/check.sh
```

It runs `formal/tlc.sh` on every config in `formal/room-copy/` and prints one line per config. Exit 0 means every result matched what the config expects: the gates pass, and each finding and each broken variant fails on its own property. The run takes about 20 seconds; other TLC runs on the machine make it slower. For one config's full TLC output, run `formal/tlc.sh formal/room-copy/RoomCopy.tla formal/room-copy/<config>.cfg`.

| Config | Expected | Checks |
| --- | --- | --- |
| `RoomCopy.cfg` | pass | safety gate, 2 GMs |
| `liveness.cfg` | pass | `WriteRunEnds`, 1 GM |
| `finding-overwrite.cfg` | `RoomKeepsEdits` fails | finding 1 |
| `finding-silent-loss.cfg` | `NoSilentLossAtRest` fails | finding 2 |
| `finding-lost-for-good.cfg` | `NoLossForGood` fails | finding 3 |
| `broken-*.cfg` | the named property fails | each gate property can fail |

Read every result, pass or fail, with the `/statechart` skill: on a violation it tells the shortest path in plain words, and on a pass it draws how a GM page moves between write phases. Run it in a scratch folder outside the repo.

## Properties

Each is an operator in `RoomCopy.tla`.

| Property | Plain sentence | Harm when broken | Status at sync commit |
| --- | --- | --- | --- |
| `NoFalseSaved` | A write counts as saved only when the room copy holds what it wrote. | The GM sees "saved" for a write Owlbear dropped; players with no GM online read old data. | holds |
| `StopEndsWork` | A closed or stopped page arms no pause timer and sends no metadata write. | A dead page overwrites a newer room copy. | holds |
| `WriteRunEnds` | Every write run ends: the page goes idle or starts the next run. | The copy stays "writing" forever and every later write only sets `rerun`. | holds (fair port answers) |
| `RoomKeepsEdits` | The room copy never loses an edit it held. | Another GM's stale write removes an edit from the room copy. | **fails**, finding 1 |
| `NoSilentLossAtRest` | When nothing more will run, an edit an open GM holds is in the room copy, or an open GM that holds it shows the not-saved notice and owes a write. | Every GM sees no notice, yet the room copy lacks an edit. | **fails**, finding 2 |
| `NoLossForGood` | When nothing more will run, every edit is in the room copy, or an open GM that holds it owes a write. | An edit stays out of the room copy until some GM edits or hides its page again. | **fails**, finding 3 |

"Nothing more will run" is `AtRest`: no write active, no timer armed, no commit in flight, no catch-up open.

## Findings at the sync commit

1. **A second GM's stale write removes an edit.** GM A edits; A's page hides and its write reads an empty room copy; GM B's page hides and B's write also reads it, before A's commit reaches B; A's `setMetadata` lands with the edit; B's lands without it. Owlbear metadata has no compare-and-set. A's read-back then fails (`room-copy-table.ts` `verifyDone`, `readBackHolds`) and shows the notice. It heals when the commit reaches B (`room-protocol.ts` `'commit'` calls `roomCopyEdited`) and B writes again.
2. **No notice, no owed write, edit missing.** A edits; A's page hides; A's read fails (notice on A); B's page returns and its catch-up merges A's state answer (`room-protocol.ts` `receiveState` calls `receiveRecords`, never `roomCopyEdited`); B's catch-up ends with nothing owed (`engine.ts` `performCaughtUp` → `caughtUp(false)`); A's tab closes; A's commit reaches B and changes nothing, so no write. B holds the edit, shows "none", and nothing writes it until B edits or hides.
3. **A closing tab loses its last write; a reopen owes none.** A edits; A's page hides and its write starts reading; the tab closes before the read returns (the abort dispatches `stop`, and the stopped row's `read-done` cell drains the write); B, if any, closes before A's commit arrives. On reopen, `initialPhase()` has `owed: false` and `caughtUp(false)` arms nothing, so the room copy lacks the edit until a GM edits or hides a page.

All three replay on the real `createRoomCopy` with two clients on a shared hand-held metadata fake: the edit is absent from the room copy and no timer or request is pending. They were replayed again on the TASK-115 transition table at `995e1c7`, unchanged.

The owner's verdicts, 2026-11-19. A room has one GM; two GM pages are one GM with two tabs, and that GM owns the result. Findings 1 and 2 need a second GM page, so they are accepted risks: keep their configs as expected failures and do not report them again. Finding 3 happens with one GM, whose last edits in the 3-5 s pause before closing the tab miss the room copy that players read without a GM; it is TASK-118.

## Code map

One TLA+ action is one dispatch of `roomCopyTable` (`room-copy.ts` `dispatch` → `machine.ts` `step`), with every effect it runs, including nested dispatches such as `receive` → `read-done` `merged`. Port answers are separate actions, so any other client's step can fall between a request and its answer. A new `await` inside one of these steps splits its action.

| Model action | Code |
| --- | --- |
| `Edit` | `command-routing.ts` `composeCommand` → `roomCopyEdited` → room-copy `edited` row (`pause`); the commit broadcast to other GMs |
| `Deliver` | `room-protocol.ts` `dispatchRoomMessage` `'commit'`: `receiveRecords(...).length > 0` → `roomCopyEdited` |
| `TimerFires` | the `arm` effect's callback in `room-copy.ts` `run` → `fired` row → `trigger` |
| `PageHidden` | `background-main.ts` `visibilitychange` hidden → `engine.pageHidden` → `page-hidden` row (`hidden`: `pageChanges + 1`, `trigger`) |
| `PageReturned` | `visibilitychange` visible, `resume`, `online` → `engine.catchUp` → `page-returned` row (`pageChanges + 1`), then `enterCatchUp('page-return')`, whose `catch-up-table.ts` `catchUpEnter` leaves `live` |
| `CatchUpEnds` | the catch-up table's exit to `live` emits `caught-up`; `catch-up-effects.ts` `run` calls `engine.ts` `performCaughtUp` in the same run → `caught-up` row (`caughtUp(applied)`); merges the room copy and online GMs' state |
| `ReadDone` | `runPortEffect` answers the ordinary read: `readDone` (gate test, unreadable copy, `receive` → `read-done` `merged` → `encodeWrite`, size check, `write-metadata`), or `failed` for a failed read; on a closed page the stopped row's `read-done` / `failed` cells → `drain` |
| `WriteDone` | `setMetadata` settles: `writeDone`, or `failed` when it throws (writing row, or stopped row → `drain`) |
| `VerifyDone` | the read-back answers: `verifyDone` (`readBackHolds`), or `failed`; on a closed page `stoppedVerifyDone` |
| `Stop` | the tab closes (production never calls `engine.stop`); same effect as `controller.abort()`: the `stop` row (phase `stopped`, `disarm`), the clock's `schedule` cancel on abort, the engine's abort listener unsubscribing from the room |
| `Reopen` | a new page: `startReplicaEngine`, a fresh `createRoomCopy` (`initialPhase()`), the same localStorage |
| `WriteRoomCopy`, `Finish`, `Fail`, `Schedule`, `Writable` | `trigger`; `finish` with its rerun tail, or `drain` on a closed page; `failed` / `publish-status` failed with `owed: true`; `pause`; `engine.ts` `canWriteRoomCopy` |

Two guards keep a closed page from writing at the read answer: the stopped row drains, and `readDone`'s `!env.writable` holds `!signal.aborted`. Either alone suffices, so `broken-no-gate-check.cfg` removes both. Likewise `broken-stop-keeps-timer.cfg` removes both the `stop` row's `disarm` and the clock's abort cancel, and `broken-no-finally.cfg` makes the reading row ignore `failed`.

## Bounds and what is left out

- 2 GM clients (`A`, `B`), 1 edit by `A`; liveness with 1 GM. An edit is an id and merge is set union.
- Left out: generations, import and wipe (`writeImport`, the `imports` queue, `importRead`, `cleanupRead`, `importRejected`, `adoptForOrdinary`, `afterAdoption`; the generation-adoption model covers the import path), `followed` and catch-up reads seen by `observeRead`, `demoted`, players, size numbers, unreadable or older-format copies (folded into a failed read), commit loss between open pages, and a page that crashes without hiding first.
- Left out: a port call or handler that throws. `portThrew` dispatches `failed` with `unexpected`, and `finish` runs with `skipRerun`: no notice, `owed` kept, `rerun` stays set until the next trigger. The code before the table did the same.
- `WriteRunEnds` assumes every port call answers. `room-copy.ts` has no timeout on `getMetadata` or `setMetadata`: one that never answers keeps the phase active for the life of the page.

## Real bug or modeling error

Replay the counterexample on the real code, one step per action, as a scratch Bun test that drives two `createRoomCopy` instances over a hand-held metadata fake. If the code does what the trace says, it is a real bug: report it, keep the property as written, and add a `finding-*.cfg` for it. If the code does not, the model is wrong: fix the action that differs from the code map, then rerun. A broken-variant config that starts to pass means a property can no longer fail; fix the model.

## Update on an intended change

1. Find each changed function in the code map, and change its action so it does what the new code does.
2. When the change fixes a finding, move that property into `RoomCopy.cfg` and delete its `finding-*.cfg` and its `expect` line in `check.sh`.
3. Run `formal/room-copy/check.sh` and read the result with `/statechart`.
4. Update the coverage record, and the file list and sync commit in `formal/room-copy/coverage.txt`.

## Coverage record

- `src/replica/room-copy-table.ts`: `roomCopyTable` rows and `initialPhase`, `pause`, `edited`, `caughtUp`, `hidden`, `returned`, `trigger`, `read`, `finish`, `readDone` (ordinary mode), `encodeWrite`, `write`, `writeDone`, `verifyDone` (ordinary mode), `failed` (ordinary mode), `stop`, `stoppedEdited`, `stoppedVerifyDone`, `drain`
- `src/replica/room-copy.ts`: `createRoomCopy` shell (`dispatch`, `run` for `arm`, `disarm`, `read-metadata`, `write-metadata`, `receive`, `publish-status`; `runPortEffect`, `portThrew`, `readMetadata`, `publishStatus`, the abort listener, and the returned `edited`, `pageHidden`, `pageReturned`, `caughtUp`)
- `src/replica/machine.ts`: `step`
- `src/replica/engine.ts`: `canWriteRoomCopy`, `performCaughtUp`, `enterCatchUp`, the `createRoomCopy` options, the abort listener, the returned `stop`, `catchUp`, `pageHidden`
- `src/replica/catch-up-table.ts`: `catchUpEnter` and the exit to `live` with its `caught-up` effect (when `live` flips)
- `src/replica/catch-up-effects.ts`: `run`, its `caught-up` case
- `src/replica/room-protocol.ts`: `dispatchRoomMessage` `'commit'`, `receiveState`
- `src/replica/command-routing.ts`: `composeCommand`, `uploadPreset` (their `roomCopyEdited` calls)
- `src/replica/background-main.ts`: the `visibilitychange`, `resume` and `online` listeners
- `src/platform/schedule.ts`: `schedule` cancels on abort
- `src/core/snapshot.ts`: `readBackHolds`

`formal/room-copy/coverage.txt` holds the sync commit and the covered file list. Move the sync commit only after you confirm, file by file, that the code map still describes the covered code at the new commit. To list what changed since: `git log --oneline <sync>.. -- <files in coverage.txt>`.
