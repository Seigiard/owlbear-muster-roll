---
name: edit-delivery
description: Model-check AD-4/AD-5 edit delivery, a player's pending edit reaching the room through a GM client, with TLA+. Use when a change touches src/replica/pending-edits.ts, proposal-queue.ts, version-minter.ts, commit-outbox.ts, receiveProposal or the player's commit and reject handling in room-protocol.ts, checkProposal in core/access.ts, or their wiring in engine.ts; or to answer whether a player edit can be lost, applied twice, land out of order, or wait forever.
---

# Edit delivery model

`formal/edit-delivery/EditDelivery.tla` is a TLA+ model of one player's pending edit (see `GLOSSARY.md`) of one field, sent as `propose` to one GM client that commits, rejects or drops it. TLC checks every order of edits, sends, resends, losses, GM edits, GM absences and catch-ups within the bounds below. A pass covers the model, not the code: the model is only as true as its code map.

## When a change touches this

Compare the change with the coverage record at the end. A change to a listed function, or to how the engine calls it, needs this check. Changes to composers, presets (`recordsChanged` moves and strips), repeat blocks, fragments or the overlay do not: the model leaves them out.

## Run

From the repo root:

```sh
formal/edit-delivery/check.sh
```

It runs `formal/tlc.sh` on every config in `formal/edit-delivery/` and prints one line per config. Exit 0 means every result matched what the config expects: the gates pass, the finding fails on its own property, and each broken variant fails on its property. The run takes 15 to 45 seconds. Set `OUT=<folder>` to keep each config's TLC output. For one config, run `formal/tlc.sh formal/edit-delivery/EditDelivery.tla formal/edit-delivery/<config>.cfg`.

| Config | Expected | Checks |
| --- | --- | --- |
| `EditDelivery.cfg` | pass | delivery gate: 2 edits, GM edit, GM away and back, catch-up, 1 loss |
| `Refusals.cfg` | pass | revoke, too-large, catch-up, 1 loss |
| `Liveness.cfg` | pass | `EntryResolves`, 1 edit |
| `DoubleApply.cfg` | `NoDoubleApply` fails | finding F1 |
| `broken/*.cfg` | the property its header names | each property can fail |

TLC stops at the first broken rule, so `NoDoubleApply` lives in its own config: in the gates it would hide every rule after it.

Read every result, pass or fail, with the `/statechart` skill: on a violation it tells the shortest path in plain words, and on a pass it draws how the edit moves between states. Run it in a scratch folder outside the repo. Its chart budget is 500 TLC states and the gates have about a million, so chart a copy with smaller constants: one player value, one edit, no GM flips, and a `CONSTRAINT` of two messages in flight still show F1.

## Properties

Each is an operator in `EditDelivery.tla`. Status is at the sync commit.

| Property | Plain sentence | Harm when broken | Status |
| --- | --- | --- | --- |
| `NoSilentLoss` | An accepted edit is still pending, or the GM merged it or a newer edit, or the player saw "Нет прав на правку", or the record the player knows already held its value. | The player believes a value is saved and it never reaches the room, with no notice. | holds |
| `NoDoubleApply` | The GM merges each player edit into the room at most once. | A committed edit comes back later and overwrites whatever came after it, such as a GM's correction. | fails: F1 |
| `OwnOrderKept` | Once the GM merged a newer edit of this player, the room never shows an older one. | The room ends with the player's earlier value though the later one was accepted. | holds |
| `OneVersionOneEdit` | The player never sends two different edits under one `(k, c, a)` (AD-3). | Two clients pick different winners for one version, or an ack clears the wrong edit. | holds |
| `NeverStranded` | A minted entry always has a resend timer; an entry with no version exists only during catch-up, whose end mints it. | An edit waits forever with no resend, even after the GM is back. | holds |
| `EntryResolves` | When the GM ends up live for good, every pending edit is answered. | Same as above, through any path the structural rule misses. | holds (1 edit; 2 edits pass too, in 45 s) |

`NoSilentLoss` counts a `denied` drop as reported when `denial(true)` is asked for, even inside the quiet window where the notice is not shown again.

## Findings at the sync commit

**F1: a lost ack lets a committed edit overwrite a later GM edit** (`NoDoubleApply`, `DoubleApply.cfg`). The steps, in the code's words:

1. The player edits `str` to 11. `edit` mints `c=3` and `sendNow` sends `propose (k, 3, P)`.
2. The GM's `receiveProposal` commits it: `checkProposal` says `commit`, `sendCommits` puts the record and ack `(k, 3, P)` in the outbox.
3. The GM edits `str` to 15 at `c=4`. `commit-outbox.ts` `add` merges it over the held record; the ack stays.
4. The send queue gives up on that commit (`send-queue.ts` `sendUntilAnswered`, a non-rate-limit error), so `answered` never runs on the player. An AD-5 gate drop on the player (`room-protocol.ts:184`, sender not yet in the party) loses it the same way.
5. With no ack, the resend timer of `armResend` sends `(k, 3, P)` again.
6. `checkProposal` (`core/access.ts:225`) sees the held cell at `c=4` and answers `stale` with the record holding 15.
7. The player's `rejected` (`pending-edits.ts:197`) matches its entry, rebuilds the patch over that record with `c=5` and proposes again.
8. The GM commits `(k, 5, P)` with value 11. The GM's 15 is gone from the room.

Replayed against the real `createPendingEdits`, `checkProposal` and `mergeRecords` with the `pending-edits.test.ts` harness: the GM's cell ends as `[11, 5, "player-connection"]` after its own `[15, 4, …]`. With no message lost (`MaxLosses = 0`) the rule holds, because one FIFO send queue on the GM delivers the commit's ack before any later reject. The cause is that neither side can tell "my committed version was overwritten" from "my version lost a race": `stale` only compares counters.

## Code map

| Model action | Code |
| --- | --- |
| `PlayerEdits` | `src/replica/pending-edits.ts` `edit` → `proposeEntry` → `rebuiltRecord`, `proposal-queue.ts` `proposedRecord`, `put` |
| `QueueTakesPropose` | `proposal-queue.ts` `sendNow`'s compose, run by `engine.ts` `enqueue` in `createPendingEdits` (line 203) |
| `ResendFires` | `proposal-queue.ts` `armResend` timer |
| `GmLinkLost`, `GmBack` | `catch-up.ts` `setGmLink` → `gm-back` → `engine.ts` `pendingEdits.gmBack()` → `resendAll`; a live player enters catch-up (`gm-return`) |
| `CatchUpStarts`, `CatchUpEnds` | `catch-up.ts` `leave` → `engine.ts` `performCaughtUp` → `pending-edits.ts` `caughtUp`; the `state` answer merges first through `receiveRecords` |
| `PlayerReceives` (commit) | `room-protocol.ts` `dispatchRoomMessage` `case 'commit'` → `answered`, then `engine.ts` `receiveRecords` → `recordsChanged` for a revoke |
| `PlayerReceives` (reject) | `room-protocol.ts` `receiveReject` → `pending-edits.ts` `rejected` → `proposeEntry` (`put` or `hold`) |
| `GmReceives` | `room-protocol.ts` `receiveProposal` (gate at line 271) with `core/access.ts` `checkProposal`; `apply` merges with `core/merge.ts` `mergeBlock` |
| `GmEdits`, `GmRevokes` | a GM command applied and sent through `engine.ts` `sendCommits` |
| `OutboxAdd` (operator) | `commit-outbox.ts` `add`, `withAck`, `schedule` |
| `GmQueueSends` | `platform/send-queue.ts` `drain`, composing `commit-outbox.ts` `take` → `nextChunk` |
| `ProposeLost`, `AnswerLost` | `send-queue.ts` `sendUntilAnswered` giving up |
| `Mint` (operator) | `version-minter.ts` `mint` |

One atomic step is one synchronous run of one handler: one room message through `dispatchRoomMessage`, one timer callback, one send-queue take, or one engine command. JavaScript runs each to the end before the next event, so nothing interleaves inside it.

## Bounds and what is left out

Gate bounds: player values `{0, 1}`, GM value `{1}`, 2 player edits, 1 GM edit, 2 GM flips (away, back), 1 catch-up, 1 lost message, 1 revoke, too-large allowed (`Refusals.cfg`).

Assumptions and simplifications:

- One player, one GM client, one key with one field. Two GM clients answering one proposal are not modeled.
- The player's `propose` messages are a set: any order, a copy folds into one. Messages to the player are FIFO, as the GM's send queue and one sender's arrival order are.
- An identical message queued twice is queued once; its second copy would find the entry already past it.
- The player's id ranks above the GM's on a tie (the worst case for the GM).
- `gLive` stands for "the GM is live and has persistence": both drop a `propose` with no answer.
- Left out: generations and adoption (`clearPendingEdits`), role changes (`drain`, `clear`), preset changes and template strips, repeat blocks, proposal and stale-reply fragments, the overlay, the `held` stale path (needs an unknown field), `PROPOSE_C_MAX_STEP`, GM-side too-large, and the quiet window of the notice.

## Real bug or modeling error

Replay the path against the real code before calling it a bug: the `pending-edits.test.ts` harness with `checkProposal` from `core/access` and `mergeInto` as the GM covers most paths in a few lines. If the code does not follow the path, the model is wrong: find the action whose guard or effect differs from the code map entry and fix the model. A path that needs a reorder the code cannot make (the GM's FIFO send queue, the outbox slot placed at `add` time) is a modeling error too.

## Update on an intended change

1. Change the model action whose code changed, so it does what the code now does. Keep the action names and the code map in step.
2. Run `formal/edit-delivery/check.sh`.
3. A gate that now fails is either a new bug in the change (report it with the path) or a property the change made untrue on purpose; ask the owner before you change a property.
4. When F1 is fixed, `DoubleApply.cfg` passes and the script reports a mismatch: move `NoDoubleApply` back into the gate configs and drop `DoubleApply.cfg`.
5. Move the sync commit forward only after the check matches and you confirmed the code map describes the code at the new commit.

## Coverage record

Sync commit: `1116e34`. At that commit the model describes:

- `src/replica/pending-edits.ts`: `edit`, `answered`, `rejected`, `caughtUp`, `recordsChanged` (revoke only), `gmBack`, `proposeEntry`, `rebuiltRecord`, `denial`, `deniesEdit`
- `src/replica/proposal-queue.ts`: `sendNow`, `armResend`, `propose`, `put`, `hold`, `drop`, `matching`, `resendAll`, `proposedRecord` (fields only)
- `src/replica/version-minter.ts`: `mint`
- `src/replica/commit-outbox.ts`: `add`, `withAck`, `schedule`, `take`, `nextChunk` (one part)
- `src/replica/room-protocol.ts`: `dispatchRoomMessage` (`commit`, `reject`), `receiveProposal` (one part), `receiveReject`
- `src/core/access.ts`: `checkProposal` (`denied`, `commit`, `commit-existing`, `stale`)
- `src/core/merge.ts`: `mergeBlock`, `compareCells` (one cell)
- `src/replica/engine.ts`: the `createPendingEdits` options, `sendCommits`, `performCaughtUp`, `receiveRecords`, the `gm-back` decision
- `src/platform/send-queue.ts`: `drain`, `sendUntilAnswered` (FIFO, give-up)

To see what changed since: `git log 1116e34..HEAD -- <the files above>`.
