---
name: replica-catch-up
description: Model-check catch-up and the GM link (AD-6, AD-7; src/replica/catch-up.ts, catch-up-table.ts, catch-up-effects.ts and their engine wiring) with TLA+. Use when a change touches catch-up phases, enter/leave, state requests and answers, held requests, ping, alive, gm-silence or `gmLink`, the catch-up timers in engine.ts, or room-protocol admission; or to answer whether a client can stay in catch-up forever, lose a request, or show a GM online who is gone or offline who answers.
---

# Catch-up and GM link model

A TLA+ model of one room in `formal/catch-up/CatchUp.tla`: a player `p` and a GM `g`, each running the real `createCatchUp` logic (its `catchUpTable` and `livenessTable`), plus an importer `x` (a GM of a higher generation, which can import more than once). TLC checks every order of the modeled steps. The model answers: can a client stay in catch-up with no exit, lose a state request a GM could answer, drop an answer to its own request, or show the GM link wrong.

## 1. Does my change touch the verified code?

Run `formal/drift.sh catch-up`. It lists the covered files that changed after the sync commit in `formal/catch-up/coverage.txt`. Then read the coverage record below. A change in a function that the record names needs a model check. For a change elsewhere in those files, read the code map and confirm that no modeled step changed.

## 2. Run

From the repository root:

```sh
formal/catch-up/check.sh
```

The script runs every configuration and checks its outcome. It takes about 6 minutes on a busy machine. Most TLC runs take under 60 seconds; `imports-gm.cfg` (1.4 million states) and `role.cfg` take 1 to 2 minutes when other jobs share the CPU. Exit 0 means every outcome is as expected:

- `formal/catch-up/*.cfg` must hold (TLC exit 0): `CatchUp.cfg` (open, catch up, page return, close), `adoption.cfg` (importer, `reset`, room copy), `imports.cfg` (the importer imports twice; player only), `imports-gm.cfg` (the importer imports twice with the GM `g` too, no ping traffic), `return.cfg` (a client closes and opens again), `role.cfg` (one role change each), `save-fails.cfg` (the room of `adoption.cfg`, the GM's `saveAdoption` can fail, no ping traffic), `hidden-page.cfg` (both pages' timers can stop, the player's page returns once; about 1 million states, about a minute).
- `fixes/*.cfg` must hold. Each one switches on a proposed code fix through the `Mutation` constant and shows that its finding holds with that fix. Create the folder when a fix is proposed; none is open now.
- `findings/*.cfg` must fail on the invariant in its `INVARIANT` line. These are the open findings below. When a fix lands, the finding config holds: move it next to the others, so that it must hold from then on.
- `mutations/*.cfg` must fail on their invariant. Each one switches on a scratch break through the `Mutation` constant and proves that its invariant can fail. `save-fail-reenters.cfg` breaks the retry of a failed save (a failed save takes a new `r` and asks again); only a room with `SaveCanFail = TRUE` reaches it. `answers-own-ordinary-only.cfg` brings back the TASK-129 regression: `answersOwn` counts only an ordinary catch-up. `silence-ignores-pause.cfg` brings back the TASK-120 bug: a late gm-silence takes the link offline. `silence-ignores-ping-age.cfg` drops the ping-age half of the fix.

`formal/catch-up/check.sh holds` runs only the configurations that must hold. To run one configuration: `formal/tlc.sh formal/catch-up/CatchUp.tla formal/catch-up/<name>.cfg`. The script keeps each TLC log in the folder it prints.

## 3. Read the result

Read every result with the `/statechart` skill: for a violation, it gives the shortest path in plain words; for a pass, it draws how the client moves between states. Give it a copy of `CatchUp.tla` and a configuration in a scratch folder outside the repository. With the full model above its state budget, add a `VIEW` that keeps only the player's phase and link and the GM's presence.

Then tell a real bug from a modeling error. Replay the path against the real module, one model step for each module call, with a `createCatchUp` harness like the one in `src/replica/catch-up.test.ts`. Keep the replay test out of the commit.

- **Real bug**: every step is a call the engine can make in that state, in that order, and the module returns what the model says.
- **Modeling error**: a step needs an order that real delays forbid, a message the engine never sends, or a decision the module does not return. Check `TimingOK` (delay order of ping and gm-silence), `Collect` (what the model forgets), and the operator for that function. Fix the model and say why in a comment.

Report a real bug as a finding. Keep the invariant as it is.

## 4. Update the model on an intended change

Each operator carries the name of the function it mirrors (code map below). Change that operator so that it says what the code now says, in the same order of decisions. Keep each step atomic in the way the code is. When the change is meant to change a property, the owner decides; write the new property as a new invariant beside the old one. Add a mutation config for a new invariant, and see it fail. Run `check.sh`.

When the model describes the code again and `check.sh` passes, move the sync commit in this file and in `formal/catch-up/coverage.txt` to the commit you checked.

## Invariants

| Invariant | Property | Harm if it breaks | Status |
| --- | --- | --- | --- |
| `TimeoutArmed` | A client in catch-up always has its catch-up timeout armed. | The client never leaves catch-up: «Синхронизация» forever, its edits held. | holds |
| `SilenceArmed` | A client that shows the GM online has gm-silence armed. | A GM who left shows online forever; players wait for nobody. | holds |
| `PingArmed` | An open client always has its ping armed. | A GM that answers but sends nothing itself stays offline. | holds |
| `NoPrematureOfflineVisible` | A running page marks the GM offline only after its ping went out and every GM reply came back. | A GM who answers shows offline; a live player starts a needless catch-up. Holds by the ping-age check in `silenceAnswered` and the delay order that `TimingOK` and `PingCanBeOld` encode. | holds; `mutations/silence-not-after-ping.cfg` and `mutations/silence-ignores-ping-age.cfg` break it |
| `AnswerKept` | A GM that can answer keeps every request whose asker still waits in its generation: an answer timer is armed or the request is held. | The asker waits out the timeout and ends unanswered while a GM could answer. | holds, except the path of `NoAnswerDroppedInAdoption` |
| `NoPrematureOffline` | The same as `NoPrematureOfflineVisible`, also after the page's timers stopped for a while. | As above, after a frozen tab or a sleeping laptop. | holds in `hidden-page.cfg` since the TASK-120 fix; `mutations/silence-ignores-pause.cfg` breaks it |
| `NoAnswerDroppedInAdoption` | A GM does not lose a request because its answer timer fired while it adopted. | As `AnswerKept`. | fails: finding 1 |
| `OnlineGmAnswers` | A client shows the GM online only while the GM that keeps it online can answer. | A GM whose saved records cannot be read never answers, yet players see it online. | fails: finding 2 |
| `AdoptionCanComplete` | A client that adopts a generation can still get it: from the room copy or a GM of that generation. | The client stays in catch-up forever. | fails: finding 3 (known, `deferred-work.md`, TASK-31) |
| `OwnAnswerKeepsRequest` | A `state` that answers a client's active request keeps that request: the client does not take a new `r` and ask again. The promise is the comment in `room-protocol.ts` `handleRoomMessage`: "An answer to this client's own request keeps that request." | Every GM sends its full state once more, and adoption ends one answer delay later. No data is lost. | holds in `CatchUp.cfg`, `adoption.cfg`, `imports.cfg`, `imports-gm.cfg`, `return.cfg`, `role.cfg` and `save-fails.cfg` since the TASK-129 fix; `mutations/answers-own-ordinary-only.cfg` breaks it |

## Open findings

1. **Answer dropped during adoption** (`findings/answer-dropped-in-adoption.cfg`). The GM is live and arms an answer to the player's request; the player has already adopted generation 1 from the room copy and asked in it. The GM follows the copy and adopts. `fired('answer')` runs while it adopts: `canAnswer()` is false and the phase is not ordinary, so it neither answers nor holds (`catch-up-table.ts` `catchUpFired`, case `answer`). The GM finishes adoption and goes live in generation 1; the player still waits on that `r` and ends unanswered. Replayed on the module. `catch-up.test.ts` "an answer timer held during adoption is not armed after adoption completes" asserts the drop on purpose, for a request of the old generation.
2. **Unreadable GM shows online** (`findings/unreadable-gm-online.cfg`). `heard` counts every admitted GM message, and a GM with unreadable storage still sends pings from its ping timer. It answers no ping and no request (`canAnswer()` needs `vouches()`), but players keep `gmLink` online. Replayed on the module.
3. **Adoption with no source** (`findings/adoption-without-source.cfg`). Known: the importer leaves and its room copy did not fit.

The owner's verdicts, 2026-11-19. Findings 1-3 are accepted: generations will settle once the preset format does, an unreadable GM storage is rare, and finding 3 is the known TASK-31 case of a room copy that does not fit (`deferred-work.md`). TASK-117 did not change it: that fix stops an importer from naming its generation before the copy is written, and `XImport` already writes the copy and sends `reset` in one step. Keep their configs as expected failures and do not report them again.

Fixed: former finding 1, TASK-120. A page whose timers stopped longer than `gmLinkTimeoutMs` ran `fired('ping')` and `fired('gm-silence')` back to back on wake, so `livenessFired` set the link offline before the GM could answer; its `alive` then brought it back and a live player started a needless `gm-return` catch-up. Fixed in `a20f769`: the online liveness phase keeps `silenceDue` and `pingSentAt`, and gm-silence takes the link offline only when `silenceAnswered`: it fires at most a quarter of the timeout late and its last ping is at least a quarter old. Otherwise `recheckGm` keeps the link, pings and arms gm-silence for a quarter of the timeout. In the model, `Fire` passes `hidden[c]` as `late` and chooses `pingOld` within `PingCanBeOld`; a gm-silence ends `hidden`, as the page runs again. The model assumes a page whose timers stopped wakes more than a quarter of the timeout after gm-silence came due; one that wakes sooner is treated as running, and its queued replies may still wait behind the silence. Its finding config became `mutations/silence-ignores-pause.cfg`; `mutations/silence-ignores-ping-age.cfg` checks lateness only and breaks `NoPrematureOfflineVisible` after a wake just before the silence; `hidden-page.cfg` checks `NoPrematureOffline` with every invariant.

Fixed: former finding 5, TASK-129, introduced by `79c879a` (TASK-115.1). `answersOwn` counted only an ordinary catch-up, so a client that adopted generation 1 and got a generation 2 `state` for its own `r` took a new `r`, dropped the answer and asked again. Fixed in `064e178`. Its finding config became `mutations/answers-own-ordinary-only.cfg`, which brings the regression back, and `imports.cfg` and `imports-gm.cfg` now check `OwnAnswerKeepsRequest`.

## Code map

One step is one event that the engine hands to the module, together with the synchronous interpretation of the decision list it returns (`ApplyAll` = `catch-up-effects.ts` `run`). `createCatchUp` `feed` steps `catchUpTable`, saves a pending adoption, then steps `livenessTable` for `heard`, `fired` and `watch`, and orders the two decision lists. Room copy and party reads are separate steps when they end; either may never end. A room message is one step after the sender lookup in `room-protocol.ts` `handleRoomMessage`. Timers have no clock: an armed timer can fire at any step, except where `TimingOK` keeps the order that the real delays give.

| Model | Code |
| --- | --- |
| `CanAnswer`, `ScheduleAnswer`, `RequestR`, `Ask`, `Leave`, `Enter`, `EnterFromGeneration`, `RoomCopyRead`, `PartyRead`, `MarkSeen`, `StateMergedStep`, `StateRequested` | `catch-up-table.ts`: `canAnswer`, `scheduleAnswer`, `request`, `ask`, `leave`, `catchUpEnter`, `enterFromGeneration`, `catchUpRoomCopyRead`, `catchUpPartyRead`, `markAnswerSeen`, `catchUpStateMerged`, `catchUpStateRequested` |
| `Watch`, `SetGmLink`, `Heard`, `Fired` | `catch-up-table.ts` `livenessWatch`, `livenessHeard`, `livenessFired` (with `silenceAnswered` and `recheckGm`), `catchUpHeard`, `catchUpFired`; `catch-up.ts` `feed` orders their decisions |
| `SavePending`, `AdoptionStaged`, `StateMerged` | `catch-up.ts` `feed` (`isPendingAdoption`, `options.saveAdoption`, the `adoption-saved` event), `catch-up-table.ts` `catchUpAdoptionStaged`, `catchUpAdoptionSaved` |
| `AnswersOwn`, `ActiveR` | `catch-up.ts` `answersOwn` |
| `Apply1`, `ApplyAll`, `RunWithD` | `catch-up-effects.ts` `createCatchUpEffects`: `run`, `arm`, `disarm`, `timerKey` |
| `Open` | `engine.ts` startup: `enterCatchUp('start')`, then `catchUpEffects.run(catchUp.watch())` |
| `Close` | `engine.ts` `stop()` aborts the signal, which cancels every catch-up timer; `flushNow` → `closing()` has no lasting effect |
| `PageHidden` | browser pauses the page's timers; `engine.ts` `pageHidden` touches only the room copy |
| `PageReturn` | `engine.ts` `catchUp()` → `roomCopy.pageReturned()`, `enterCatchUp('page-return')` |
| `RoleChange` | `engine.ts` `changeRole` → `catchUp.replicaReplaced()`, `enterCatchUp('role')` |
| `Fire` | `catch-up-effects.ts` `arm` callback → `catchUp.fired` |
| `Deliver`, `Receive`, `Admit`, `Dispatch` | `room-protocol.ts` `handleRoomMessage` (`seeGeneration` → `generation-table.ts` `seeGeneration` → `generationHeard`, `admitRoomMessage`, `heard`), `dispatchRoomMessage`, `receiveState`; `room-messages.ts` `ADMISSION` |
| `CopyReadDone`, `AdoptFromCopy` | `catch-up-effects.ts` `read-room-copy` → `room-copy.ts` `read` → `mergeReadRoomCopy` → engine `adopt` → `generation-flow.ts` `adoptFromCopy` (`generation-table.ts` `adoptFromCopy`: `generationRead`, then `adoptionStaged`) → `catchUp.roomCopyRead` |
| `PartyReadDone` | `catch-up-effects.ts` `read-party` → `platform.party.getPlayers` → `catchUp.partyRead` |
| `FollowCopy` | `room-copy.ts` `followMetadata`, or the write loop's read-back (`room-copy-table.ts` `adoptForOrdinary`) → engine `adopt` → `adoptFromCopy` |
| `XImport`, `XReceive`, `XLeave` | another GM client of a higher generation: writes the copy, sends `reset`, answers on receipt, imports again, leaves |

Ghost variables (`owed`, `dropped`, `lastHeard`, `badOffline`, `ownDropped`) record history for the invariants; no code holds them. `pinged` is both: `pingSentAt !== null` in the online liveness phase, and the ghost that `badOffline` reads.

## Bounds and what is left out

- Two clients (player `p`, GM `g`) and the importer `x`. Two GMs answering one request, and the suppression between their answers, are not checked.
- Per configuration: up to 3 catch-up ids per client (2 in `adoption.cfg`, `save-fails.cfg`, most findings and mutations; 4 in `imports.cfg`), 2 messages in flight, 1 page return, 1 reopen, 1 role change. `saveAdoption` always succeeds, except in `save-fails.cfg` and `mutations/save-fail-reenters.cfg` (`SaveCanFail = TRUE`): there a GM's save can fail any number of times, and the next `state` or room copy saves again (`SavePending` keeps `pend`). These two run with `NoPingTraffic` (below), as with pings the room took 2.6 million states and over 3 minutes. The `generation-adoption` skill covers what a failed save does to storage.
- `NoPingTraffic` is an extra `CONSTRAINT`: TLC does not explore a state with a ping or `alive` on its way, so the configurations that use it leave out pings and gm-silence (a gm-silence fires only after a ping that reached nobody). They still check the answers, requests, adoption and saves.
- Two imports (`Imports = 2`) with the player alone (`imports.cfg`) keep pings, page return and 4 ids; `mutations/answers-own-ordinary-only.cfg` uses that room with 3 ids and no page return. With the GM `g` too (`imports-gm.cfg`), the room has 3 ids, no page return and `NoPingTraffic`. With pings, the same room passed 5 million states in 3 minutes and was still growing. A VIEW that drops the answer ghosts saved only about 10 %, so no configuration uses one.
- A page whose timers stopped (`hidden`) wakes more than a quarter of the timeout after its gm-silence came due, so that gm-silence is late; a page that wakes sooner is treated as running. A page whose timers stay slow, as in Chrome's intensive throttling of a tab hidden for 5 minutes, fires every gm-silence late and keeps the GM online until its timers run on time again; the model has no clock for that.
- Answers are one message (`n = 1`). Partial answers, lost and duplicated messages, and unknown senders are left out. Messages can arrive in any order.
- Drift (`aliveReceived` digests, `DRIFT_ALIVE_COUNT`, ignored digests) is left out: `alive` only refreshes the link.
- The held-request limit (256) is left out.
- `Collect` forgets what no later step reads: reads and request timers of an old `r`, `answeredNonces` entries with no armed answer or held request, the trigger apart from `gm-return` and `drift`, and the view flags `firstCatchUpDone` and `gmAnswered`.
- Commits, proposals, pending edits and room copy writes belong to the `edit-delivery`, `room-copy` and `generation-adoption` skills.
- Safety only. `TimeoutArmed` stands in for "every catch-up ends", as an ordinary catch-up leaves when its timeout fires.

## Coverage record

Sync commit: `1709de4` (also in `formal/catch-up/coverage.txt`). At that commit the model describes:

- `src/replica/catch-up.ts`: `createCatchUp` (`feed`, `answersOwn`, `adopting`, `live`).
- `src/replica/catch-up-table.ts`: `catchUpTable` and `livenessTable`, apart from the drift part of `catchUpAlive`, `rememberAlive`, `catchUpPartyChanged`, `catchUpReplicaReplaced` and multi-part answers.
- `src/replica/catch-up-effects.ts`: `createCatchUpEffects`.
- `src/replica/engine.ts`: `enterCatchUp`, `changeRole` (the catch-up part), the startup lines that enter `start` and watch, `stop`, `flushNow`, `catchUp`, the `adopt` callback.
- `src/replica/room-protocol.ts`: `receive`, `handleRoomMessage`, `dispatchRoomMessage` (`state-request`, `state`, `ping`, `alive`, `reset`), `receiveState`.
- `src/core/room-messages.ts`: `admitRoomMessage` and `ADMISSION`.
- `src/replica/generation-flow.ts` and `generation-table.ts`: `seeGeneration`, `adoptFromCopy`, the result of `saveAdoption`.
- `src/replica/room-copy.ts` and `room-copy-table.ts`: `read` (`mergeReadRoomCopy`), `followMetadata` and `adoptForOrdinary`, as far as they adopt.
