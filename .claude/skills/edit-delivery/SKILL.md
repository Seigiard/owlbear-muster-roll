---
name: edit-delivery
description: Model-check AD-4/AD-5 edit delivery, a player's pending edit reaching the room through a GM client, with TLA+. Use when a change touches src/replica/pending-edits.ts, proposal-queue.ts, commit-outbox.ts, src/core/version-minter.ts, receiveProposal or the player's commit and reject handling in room-protocol.ts, checkProposal in core/access.ts, the `gm-back` and `caught-up` effects of catch-up-table.ts and catch-up-effects.ts, or their wiring in engine.ts and command-routing.ts; or to answer whether a player edit can be lost, applied twice, land out of order, or wait forever.
---

# Edit delivery model

`formal/edit-delivery/EditDelivery.tla` is a TLA+ model of one player's pending edit (see `GLOSSARY.md`) for one block key, sent as `propose` to one GM client that commits, rejects or drops it. Field-indexed cells let the existing configs retain one field and `TwoFields.cfg` check two fields on one key. TLC checks every order of edits, sends, resends, losses, GM edits, GM absences and catch-ups within the bounds below. A pass covers the model, not the code: the model is only as true as its code map.

## When a change touches this

Compare the change with the coverage record at the end. A change to a listed function, or to how the engine calls it, needs this check. `formal/drift.sh edit-delivery` lists the covered files that changed after the sync commit in `formal/edit-delivery/coverage.txt`. The model leaves out preset moves and strips, repeat blocks, fragments, and the overlay. It models field commands as sparse cells on one block key, not full preset composition.

## Run

From the repo root:

```sh
formal/edit-delivery/check.sh
```

It runs `formal/tlc.sh` on every config in `formal/edit-delivery/` and prints one line per config. Exit 0 means every result matched what the config expects: the gates pass, and each broken variant fails on its property. Set `OUT=<folder>` to keep each config's TLC output. For one config, run `formal/tlc.sh formal/edit-delivery/EditDelivery.tla formal/edit-delivery/<config>.cfg`.

| Config | Expected | Checks |
| --- | --- | --- |
| `EditDelivery.cfg` | pass | delivery gate: 2 edits, GM edit, GM away and back, catch-up, 1 loss |
| `Refusals.cfg` | pass | revoke, too-large, catch-up, 1 loss |
| `Liveness.cfg` | pass | `EntryResolves`, 1 edit |
| `TwoFields.cfg` | pass | two fields on one key: a committed cell loses its ACK, the GM edits it, and a later field edit advances after the merge |
| `StagedRefusals.cfg` | pass | two fields and two edits; a staged entry reaches a matching denied reply or revoke with 1 loss |
| `StagedReturn.cfg` | pass | two fields and two edits; 1 loss and 2 GM flips, with `EntryResolves` under weak fairness |
| `broken/ReloadReplayAfterLostAck.cfg` | expected failure, known current-code limit | one lost ACK, same-field GM correction, and reload before resend violate `NoOldCellReplayAfterLostAck` |
| `broken/*.cfg` | the property its header names | each property can fail |

Read every result, pass or fail, with the `/statechart` skill: on a violation it tells the shortest path in plain words, and on a pass it draws how the edit moves between states. Run it in a scratch folder outside the repo. Its chart budget is 500 TLC states and the gates have about a million, so chart a copy with smaller constants. For the old folding bug, use two fields, two player edits, one GM edit, and one lost message with `broken/FoldsUnackedCells.cfg`.

## Properties

Each is an operator in `EditDelivery.tla`. Status is at the sync commit.

| Property | Plain sentence | Harm when broken | Status |
| --- | --- | --- | --- |
| `NoSilentLoss` | An accepted edit is still pending, or the GM merged it or a newer edit, or the player saw a denial notice ("Правка слишком большая" for too-large, "Нет прав на правку" otherwise), or the record the player knows already held its value. | The player believes a value is saved and it never reaches the room, with no notice. | holds |
| `NoDoubleApply` | The GM merges each player field edit into the room at most once. | A committed edit comes back later and overwrites whatever came after it, such as a GM's correction. | holds (the former F1, fixed by TASK-119) |
| `NoOldCellReplayAfterLostAck` | After a committed cell's ACK is lost and the GM changes that field, a later edit of another field does not apply the old cell again. | A new field edit restores an old value over the GM's correction. | holds in `TwoFields.cfg`; `broken/FoldsUnackedCells.cfg` and `broken/ReloadReplayAfterLostAck.cfg` fail it |
| `OwnOrderKept` | For each field, once the GM merged a newer edit of this player, the room never shows an older one. | The room ends with the player's earlier value though the later one was accepted. | holds |
| `OneVersionOneEdit` | The player never sends two different edits under one `(k, c, a)` (AD-3). | Two clients pick different winners for one version, or an ack clears the wrong edit. | holds |
| `NeverStranded` | A minted entry always has a resend timer; an entry with no version exists only during catch-up, whose end mints it. | An edit waits forever with no resend, even after the GM is back. | holds |
| `EntryResolves` | When the GM ends up live for good, every pending edit is answered. | Same as above, through any path the structural rule misses. | holds (1 edit; 2 edits pass too, in 45 s) |

`NoSilentLoss` counts a drop as reported when `denial(cause)` is asked for with a cause, even inside the quiet window where the notice is not shown again. The cause only picks the text (`engine.ts` `notifyDenied`, since `8c7ff9f`), so the model does not tell the two notices apart.

## Findings at the sync commit

None open.

Fixed: former F1, TASK-119, **a lost ack let a committed edit overwrite a later GM edit**. The GM committed the player's `(k, 3, P)`; the commit never reached the player (the send queue gave up, or the player's AD-5 gate dropped it); the GM edited the field at `c=4`; the player's resend of `(k, 3, P)` read as `stale`, and `rejected` rebuilt it at `c=5`, which the GM committed over its own edit. `stale` compares counters only, so neither side could tell "my committed version was overwritten" from "my version lost a race". Now `receiveProposal` remembers the generation and `(k, c, a)` of each proposal it commits (`committedEdits`, the newest 1000), and answers the same proposal again with its held record and the echo, ahead of `checkProposal`. The player's `answered` clears its entry and merges the GM's record. A proposal that really lost a race carries a `(k, c, a)` the GM never committed, so it still reads as `stale`. In the model, `GmReceives` answers a counter in `committed` that way; `broken/ForgetsCommitted.cfg` removes it and fails `NoDoubleApply`, and `NoDoubleApply` is in both one-field gates. Two paths still apply the player's edit twice outside the model:
- `broken/ReloadReplayAfterLostAck.cfg` records this five-step limit: the GM commits a player edit; its ACK is lost; the GM corrects that same field; reload clears in-memory committed history while retaining the saved correction; then the resent proposal reaches the GM after return, is rejected as stale and rebased with the staged edit, which overwrites the correction. TLC may queue the resend before reload because the model abstracts messages; its trace is described by the delivery after return. The real-engine replay with the player offline reproduced the sequence and lost the GM correction. The config violates `NoOldCellReplayAfterLostAck` in 16 transitions. This models the lost ACK, correction and history reset; reload startup, flush and saved-record persistence failures are outside the model.
- a second GM page that did not commit the proposal: it answers `stale` and may answer first (two GM clients are not modeled; the owner's verdict counts two GM pages as one GM's accepted risk).
The old folding path is now in the model: a later player edit of another field of the same key can put an unacknowledged cell in a new `(k, c, a)`. `TwoFields.cfg` keeps the fixed behavior in the shared model, and `broken/FoldsUnackedCells.cfg` makes it fail `NoOldCellReplayAfterLostAck`.

TASK-132 code map: `ProposalEntry.commands` is the current batch and `laterCommands` is staged behind a sent version. A command for the only active field replaces the sent batch. A command for another field is staged when `rc # 0 /\ sent`, including during catch-up; staging keeps the active record, `rc` and timer. Only a non-stage edit during catch-up clears `rc`. `sendNow` marks the entry sent and returns the stored record that the queue takes. `composePending` checks whether any command changes a value, then stamps all commands when one changes or `force` is true. An exact ACK promotes the later commands, then `engine.receiveRecords` merges all records and calls `pendingEdits.advance`, even when none changed. During catch-up, commands with no record wait for `caughtUp`; it mints above the merged block counter and inherits `entry.sent` to force an explicit restoration when no later batch exists. A matching stale reply combines both command groups and rebases them over the GM's current record.

## Code map

| Model action | Code |
| --- | --- |
| `PlayerEdits` | `command-routing.ts` `handlePlayerCommand` → `pending-edits.ts` `edit` → `proposeEntry` → `rebuiltRecord` → `core/compose.ts` `composePending` in pending mode. The entry keeps the active batch and later commands separate after a sent version. During catch-up, staging keeps the active record; a non-stage edit clears it. `proposal-queue.ts` `put` stores it. |
| `QueueTakesPropose` | `proposal-queue.ts` `sendNow` marks the entry sent and returns its stored record when the `enqueue` callback runs. It does not recompose the commands. |
| `ResendFires` | `proposal-queue.ts` `armResend` timer, through `platform/schedule.ts` `schedule` |
| `GmLinkLost` | `catch-up-table.ts` `livenessFired` on `gm-silence` when `silenceAnswered` |
| `GmBack` | `catch-up.ts` `heard` → `catch-up-table.ts` `livenessHeard` emits `gm-back` → `catch-up-effects.ts` `run` → `pendingEdits.gmBack()` → `resendAll`; in the same run `catchUpHeard` enters `gm-return` for a live player |
| `GmFlips`, `GmReload` | `GmFlips` models an interruption with in-memory state intact. `GmReload` models the resent proposal reaching the GM after return and resets in-memory `committedEdits`, transient outbox and queue on reload while keeping saved records. Reload startup, flush and saved-record persistence failures are outside the model |
| `CatchUpStarts`, `CatchUpEnds` | `engine.ts` `enterCatchUp` → `catchUpEnter`; `catch-up-table.ts` `leave` emits `caught-up` → `catch-up-effects.ts` → `engine.ts` `performCaughtUp` → `pending-edits.ts` `caughtUp`; the `state` answer merges first in the same handler (`room-protocol.ts` `receiveState`: `receiveRecords`, then `stateMerged`) |
| `PlayerReceives` (commit) | `room-protocol.ts` `dispatchRoomMessage` `case 'commit'` → `answered`, then `engine.ts` `receiveRecords` merges the records and calls `advance`, including when none changed; it calls `recordsChanged` for a revoke |
| `PlayerReceives` (reject) | `room-protocol.ts` `receiveReject` → `pending-edits.ts` `rejected` → `proposeEntry`. `rejected` combines both command groups over the newer base before `put` or `hold`. |
| `GmReceives` | `room-protocol.ts` `receiveProposal` (gate at line 285; `committedEdits` answers a committed `(k, c, a)` before `checkProposal`, and `rememberCommitted` records each `commit` and `commit-existing`) with `core/access.ts` `checkProposal`; `apply` merges each proposed field with `core/merge.ts` `mergeBlock` |
| `GmEdits`, `GmRevokes` | a GM command (`command-routing.ts` `composeCommand`) applied and sent through `engine.ts` `sendCommits` |
| `OutboxAdd` (operator) | `commit-outbox.ts` `add`, `withAck`, `schedule` |
| `GmQueueSends` | `platform/send-queue.ts` `drain`, composing `commit-outbox.ts` `take` → `nextChunk` |
| `ProposeLost`, `AnswerLost` | `send-queue.ts` `sendUntilAnswered` giving up |
| `Mint` (operator) | `src/core/version-minter.ts` `mint` |

One atomic step is one synchronous run of one handler: one room message through `dispatchRoomMessage` (with the catch-up decisions it runs through `catch-up-effects.ts` `run`), one timer callback, one send-queue take, or one engine command. JavaScript runs each to the end before the next event, so nothing interleaves inside it.

## Bounds and what is left out

Gate bounds: one-field configs use player values `{0, 1}` and GM value `{1}`. `TwoFields.cfg` uses fields `str` and `note`, player values `{0, 1}`, and GM value `{2}`. `EditDelivery.cfg` allows 2 player edits, 1 GM edit, 2 GM flips, 1 catch-up and 1 loss. `Refusals.cfg` allows 2 player edits, 1 GM edit, 1 revoke, 1 catch-up and 1 loss, and permits too-large edits. `Liveness.cfg` allows 1 player edit, 1 GM edit, 2 GM flips and 1 loss. `TwoFields.cfg` allows 2 player edits, 1 GM edit, 1 catch-up and 1 loss; it has no flips, revokes or too-large edits and does not check liveness. `StagedRefusals.cfg` uses two fields, player and GM values `{1}`, 2 player edits, 1 revoke and 1 loss; it has no GM edits, flips, catch-ups or too-large edits. `StagedReturn.cfg` uses two fields, player values `{1}`, GM values `{2}`, 2 player edits, 2 GM flips and 1 loss; it has no GM edits, revokes, catch-ups or too-large edits. `broken/ReloadReplayAfterLostAck.cfg` uses two fields, player values `{1}`, GM values `{2}`, 2 player edits, 1 GM edit, 2 GM flips and 1 loss; it has no revokes, catch-ups or too-large edits.

On the final configs, `StagedRefusals.cfg` completed in 1 second with 37,421 distinct states. Independent calibration makes `NoSilentLoss` fail when the staged batch is dropped, and a separate trace reaches a staged entry before denial or revoke. `StagedReturn.cfg` completed in 7 seconds with 52,270 distinct states. Independent calibration makes `EntryResolves` fail when the staged timer is omitted after reload, and a separate trace reaches stage, GM absence, offline status, return, `gmBack`, loss, then the staged entry's timer. `broken/ReloadReplayAfterLostAck.cfg` completed in 2 seconds with 214,335 distinct states and a 16-transition counterexample. These are TLC's whole-second runtimes from the final full check and these bounds, not runtime guarantees.

`StagedReturn.cfg` uses weak fairness for taking a queued proposal, firing its resend, `gmBack`, ending catch-up, draining the GM send queue, and delivering queued player/GM messages. Edits, losses and GM availability changes are bounded and are not fair actions. `EntryResolves` applies when the GM is eventually live forever; it does not promise progress while the GM keeps leaving.

Assumptions and simplifications:

- One player, one GM client, one key. Each config has one field, except `TwoFields.cfg`, `broken/FoldsUnackedCells.cfg` and `broken/StaleLosesActive.cfg`, which use `str` and `note`. `entry.active` and `entry.later` are per-field command maps. `entry.rc` versions the active batch. Two GM clients answering one proposal are not modeled.
- `committed` is unbounded; the code keeps the newest 1000 committed proposals, and a resend comes within the 30-second backoff cap.
- The player's `propose` messages are a set: any order, a copy folds into one. Messages to the player are FIFO, as the GM's send queue and one sender's arrival order are.
- An identical message queued twice is queued once; its second copy would find the entry already past it.
- The player's id ranks above the GM's on a tie (the worst case for the GM).
- `gLive` stands for "the GM is live and has persistence": both drop a `propose` with no answer.
- Left out: generations and adoption (`clearPendingEdits`), role changes (`drain`, `clear`), preset changes and template strips, repeat blocks, proposal and stale-reply fragments, the overlay, the `held` stale path (needs an unknown field), `PROPOSE_C_MAX_STEP`, GM-side too-large, the quiet window of the notice, `stop` (the engine's `AbortSignal` cancels resend timers and clears the outbox), and a closing page's `flushNow` (`outbox.flush`, `sendQueue.flushNow` send without the FIFO wait). The staged refusal and return checks cover a live interruption with GM memory intact. Reload is modeled separately in `broken/ReloadReplayAfterLostAck.cfg`; it preserves saved records but clears in-memory committed history. It does not model reload startup, flush, or failures to persist or restore saved records.

## Real bug or modeling error

Replay the path against the real code before calling it a bug: the `pending-edits.test.ts` harness with `checkProposal` from `core/access` and `mergeInto` as the GM covers most paths in a few lines. If the code does not follow the path, the model is wrong: find the action whose guard or effect differs from the code map entry and fix the model. A path that needs a reorder the code cannot make (the GM's FIFO send queue, the outbox slot placed at `add` time) is a modeling error too.

## Update on an intended change

1. Change the model action whose code changed, so it does what the code now does. Keep the action names and the code map in step.
2. Run `formal/edit-delivery/check.sh`.
3. A gate that now fails is either a new bug in the change (report it with the path) or a property the change made untrue on purpose; ask the owner before you change a property.
4. Move the sync commit forward only after the check matches and you confirmed the code map describes the code at the new commit.

## Coverage record

The sync commit and the covered file list live in `formal/edit-delivery/coverage.txt`. At that sync commit the model describes:

- `src/replica/pending-edits.ts`: `edit`, `answered`, `rejected`, `caughtUp`, `recordsChanged` (revoke only), `gmBack`, `proposeEntry`, `rebuiltRecord`, `denial`, `deniesEdit`, `recheckFailureCause`
- `src/replica/proposal-queue.ts`: `combineCommands` (one field), `sendNow`, `armResend`, `propose`, `put`, `hold`, `drop`, `matching`, `resendAll`
- `src/core/compose.ts`: `composePending` (one field), including the unchanged check before mint and the record built by `mintedBlock`
- `src/core/version-minter.ts`: `mint`
- `src/replica/commit-outbox.ts`: `add`, `withAck`, `schedule`, `take`, `nextChunk` (one part)
- `src/replica/room-protocol.ts`: `receive`, `handleRoomMessage`, `dispatchRoomMessage` (`commit`, `reject`), `receiveProposal` (one part, with `committedEdits` and `rememberCommitted`), `receiveReject`, `receiveState` (merge, then `stateMerged`)
- `src/core/room-messages.ts`: `admitRoomMessage` (a dropped commit or reject counts as a loss)
- `src/core/access.ts`: `checkProposal` (`denied`, `commit`, `commit-existing`, `stale`)
- `src/core/merge.ts`: `mergeBlock`, `compareCells` (one cell)
- `src/replica/engine.ts`: the `createPendingEdits` options, `sendCommits`, `performCaughtUp`, `receiveRecords`, `enterCatchUp`, `notifyDenied`, the `gmBack` and `caughtUp` ports of `createCatchUpEffects`
- `src/replica/command-routing.ts`: `handlePlayerCommand`, `composeCommand` (a GM edit to `addCommits`)
- `src/replica/catch-up.ts`: `heard` and the decision order of `feed`
- `src/replica/catch-up-table.ts`: `livenessHeard` (`gm-back`), `livenessFired` (`gm-silence`), `catchUpHeard` (`gm-return`), `catchUpEnter`, `leave` (`caught-up`)
- `src/replica/catch-up-effects.ts`: `run` (`gm-back`, `caught-up`)
- `src/replica/machine.ts`: `step`
- `src/platform/send-queue.ts`: `drain`, `sendUntilAnswered` (FIFO, give-up)
- `src/platform/schedule.ts`: `schedule` (the resend timer fires unless stopped)

To see what changed since: `formal/drift.sh edit-delivery`, or `git log <sync>..HEAD -- <the files above>`.
