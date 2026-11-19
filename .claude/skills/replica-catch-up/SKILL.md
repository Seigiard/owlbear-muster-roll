---
name: replica-catch-up
description: Model-check catch-up and the GM link (AD-6, AD-7; src/replica/catch-up.ts and its engine wiring) with TLA+. Use when a change touches catch-up phases, enter/leave, state requests and answers, held requests, ping, alive, gm-silence or `gmLink`, the catch-up timers in engine.ts, or room-protocol admission; or to answer whether a client can stay in catch-up forever, lose a request, or show a GM online who is gone or offline who answers.
---

# Catch-up and GM link model

A TLA+ model of one room in `formal/catch-up/CatchUp.tla`: a player `p` and a GM `g`, each running the real `createCatchUp` logic, plus an importer `x` (a GM of a higher generation). TLC checks every order of the modeled steps. The model answers: can a client stay in catch-up with no exit, lose a state request a GM could answer, or show the GM link wrong.

## 1. Does my change touch the verified code?

Run `git diff --stat 19232ad -- src/replica/catch-up.ts src/replica/engine.ts src/replica/room-protocol.ts src/core/room-messages.ts src/replica/generation-flow.ts src/replica/room-copy.ts`. Then read the coverage record below. A change in a function that the record names needs a model check. For a change elsewhere in those files, read the code map and confirm that no modeled step changed.

## 2. Run

From the repository root:

```sh
formal/catch-up/check.sh
```

The script runs every configuration and checks its outcome. It takes about 2.5 minutes; each TLC run takes under 60 seconds. Exit 0 means every outcome is as expected:

- `formal/catch-up/*.cfg` must hold (TLC exit 0): `CatchUp.cfg` (open, catch up, page return, close), `adoption.cfg` (importer, `reset`, room copy), `return.cfg` (a client closes and opens again), `role.cfg` (one role change each).
- `findings/*.cfg` must fail on the invariant in its `INVARIANT` line. These are the open findings below. When a fix lands, the finding config holds: move it next to the others, so that it must hold from then on.
- `mutations/*.cfg` must fail on their invariant. Each one switches on a scratch break through the `Mutation` constant and proves that its invariant can fail.

`formal/catch-up/check.sh holds` runs only the configurations that must hold. To run one configuration: `formal/tlc.sh formal/catch-up/CatchUp.tla formal/catch-up/<name>.cfg`. The script keeps each TLC log in the folder it prints.

## 3. Read the result

Read every result with the `/statechart` skill: for a violation, it gives the shortest path in plain words; for a pass, it draws how the client moves between states. Give it a copy of `CatchUp.tla` and a configuration in a scratch folder outside the repository. With the full model above its state budget, add a `VIEW` that keeps only the player's phase and link and the GM's presence.

Then tell a real bug from a modeling error. Replay the path against the real module, one model step for each module call, with a `createCatchUp` harness like the one in `src/replica/catch-up.test.ts`. Keep the replay test out of the commit.

- **Real bug**: every step is a call the engine can make in that state, in that order, and the module returns what the model says.
- **Modeling error**: a step needs an order that real delays forbid, a message the engine never sends, or a decision the module does not return. Check `TimingOK` (delay order of ping and gm-silence), `Collect` (what the model forgets), and the operator for that function. Fix the model and say why in a comment.

Report a real bug as a finding. Keep the invariant as it is.

## 4. Update the model on an intended change

Each operator carries the name of the function it mirrors (code map below). Change that operator so that it says what the code now says, in the same order of decisions. Keep each step atomic in the way the code is. When the change is meant to change a property, the owner decides; write the new property as a new invariant beside the old one. Add a mutation config for a new invariant, and see it fail. Run `check.sh`.

When the model describes the code again and `check.sh` passes, move the sync commit in this file and in the coverage command to the commit you checked.

## Invariants

| Invariant | Property | Harm if it breaks | Status |
| --- | --- | --- | --- |
| `TimeoutArmed` | A client in catch-up always has its catch-up timeout armed. | The client never leaves catch-up: «Синхронизация» forever, its edits held. | holds |
| `SilenceArmed` | A client that shows the GM online has gm-silence armed. | A GM who left shows online forever; players wait for nobody. | holds |
| `PingArmed` | An open client always has its ping armed. | A GM that answers but sends nothing itself stays offline. | holds |
| `NoPrematureOfflineVisible` | A running page marks the GM offline only after its ping went out and every GM reply came back. | A GM who answers shows offline; a live player starts a needless catch-up. Holds by the delay order in `watch()` and `pingDelay()`, which `TimingOK` encodes. | holds |
| `AnswerKept` | A GM that can answer keeps every request whose asker still waits in its generation: an answer timer is armed or the request is held. | The asker waits out the timeout and ends unanswered while a GM could answer. | holds, except the path of `NoAnswerDroppedInAdoption` |
| `NoPrematureOffline` | The same as `NoPrematureOfflineVisible`, also after the page's timers stopped for a while. | As above, after a frozen tab or a sleeping laptop. | fails: finding 1 |
| `NoAnswerDroppedInAdoption` | A GM does not lose a request because its answer timer fired while it adopted. | As `AnswerKept`. | fails: finding 2 |
| `OnlineGmAnswers` | A client shows the GM online only while the GM that keeps it online can answer. | A GM whose saved records cannot be read never answers, yet players see it online. | fails: finding 3 |
| `AdoptionCanComplete` | A client that adopts a generation can still get it: from the room copy or a GM of that generation. | The client stays in catch-up forever. | fails: finding 4 (known, `deferred-work.md`, TASK-31) |

## Open findings

1. **Offline after a pause** (`findings/hidden-page-offline.cfg`). A player is live and hears the GM: `watch()` arms ping and gm-silence. The page's timers stop longer than `gmLinkTimeoutMs`. When they run again, `fired('ping')` sends a ping and `fired('gm-silence')` runs at once, so `setGmLink('offline')`. The GM's `alive` comes back, `heard` sets `online` and, as the player is live, `enter('gm-return')` starts a catch-up. Replayed on the module.
2. **Answer dropped during adoption** (`findings/answer-dropped-in-adoption.cfg`). The GM is live and arms an answer to the player's request; the player has already adopted generation 1 from the room copy and asked in it. The GM follows the copy and adopts. `fired('answer')` runs while it adopts: `canAnswer()` is false and the phase is not ordinary, so it neither answers nor holds (`catch-up.ts` fired, case `answer`). The GM finishes adoption and goes live in generation 1; the player still waits on that `r` and ends unanswered. Replayed on the module. `catch-up.test.ts` "an answer timer held during adoption is not armed after adoption completes" asserts the drop on purpose, for a request of the old generation.
3. **Unreadable GM shows online** (`findings/unreadable-gm-online.cfg`). `heard` counts every admitted GM message, and a GM with unreadable storage still sends pings from its ping timer. It answers no ping and no request (`canAnswer()` needs `vouches()`), but players keep `gmLink` online. Replayed on the module.
4. **Adoption with no source** (`findings/adoption-without-source.cfg`). Known: the importer leaves and its room copy did not fit.

The owner's verdicts, 2026-11-19. Finding 1 is TASK-120, low. Findings 2-4 are accepted: generations will settle once the preset format does, an unreadable GM storage is rare, and finding 4 is covered by TASK-117. Keep their configs as expected failures and do not report them again.

## Code map

One step is one event that the engine hands to the module, together with the synchronous interpretation of the decision list it returns (`ApplyAll` = `runCatchUp` in `engine.ts`). Room copy and party reads are separate steps when they end; either may never end. A room message is one step after the sender lookup in `room-protocol.ts` `receive`. Timers have no clock: an armed timer can fire at any step, except where `TimingOK` keeps the order that the real delays give.

| Model | Code |
| --- | --- |
| `CanAnswer`, `ScheduleAnswer`, `RequestR`, `Ask`, `Leave`, `Enter`, `Watch`, `SetGmLink`, `EnterFromGeneration`, `FinishAdoption`, `RoomCopyRead`, `PartyRead`, `MarkSeen`, `StateMerged`, `Heard`, `StateRequested`, `Fired` | `catch-up.ts` `createCatchUp`: `canAnswer`, `scheduleAnswer`, `request`, `ask`, `leave`, `enter`, `watch`, `setGmLink`, `enterFromGeneration`, `finishAdoption`, `roomCopyRead`, `partyRead`, `markAnswerSeen`, `stateMerged`, `heard`, `stateRequested`, `fired` |
| `Apply1`, `ApplyAll`, `RunWithD` | `engine.ts` `runCatchUp`, `armCatchUpTimer`, `disarmCatchUpTimer`, `catchUpTimerKey` |
| `Open` | `engine.ts` startup: `enterCatchUp('start')`, then `runCatchUp(catchUp.watch())` |
| `Close` | `engine.ts` `stop()` (clears `catchUpTimers`); `flushNow` → `closing()` has no lasting effect |
| `PageHidden` | browser pauses the page's timers; `engine.ts` `pageHidden` touches only the room copy |
| `PageReturn` | `engine.ts` `catchUp()` → `enterCatchUp('page-return')` |
| `RoleChange` | `engine.ts` `changeRole` → `catchUp.replicaReplaced()`, `enterCatchUp('role')` |
| `Fire` | `engine.ts` `armCatchUpTimer` callback → `catchUp.fired` |
| `Deliver`, `Receive`, `Admit`, `Dispatch` | `room-protocol.ts` `receive` (`seeGeneration` → `generationHeard`, `admitRoomMessage`, `heard`), `dispatchRoomMessage`, `receiveState`; `room-messages.ts` `ADMISSION` |
| `CopyReadDone`, `AdoptFromCopy` | `runCatchUp` `read-room-copy` → `room-copy.ts` `read` → `generation-flow.ts` `adoptFromCopy` (`generationRead`, `adoptionStaged`) → `catchUp.roomCopyRead` |
| `PartyReadDone` | `runCatchUp` `read-party` → `platform.party.getPlayers` → `catchUp.partyRead` |
| `FollowCopy` | `room-copy.ts` `followMetadata` → engine `adopt` → `adoptFromCopy` |
| `XImport`, `XReceive`, `XLeave` | another GM client of a higher generation: writes the copy, sends `reset`, answers on receipt, leaves |

Ghost variables (`pinged`, `owed`, `dropped`, `lastHeard`, `badOffline`) record history for the invariants; no code holds them.

## Bounds and what is left out

- Two clients (player `p`, GM `g`) and the importer `x`. Two GMs answering one request, and the suppression between their answers, are not checked.
- Per configuration: up to 3 catch-up ids per client (2 in `adoption.cfg`, findings and mutations), 2 messages in flight, 1 page return, 1 reopen, 1 role change, and `saveAdoption` always succeeds (the `generation-adoption` skill covers failed saves).
- Answers are one message (`n = 1`). Partial answers, lost and duplicated messages, and unknown senders are left out. Messages can arrive in any order.
- Drift (`aliveReceived` digests, `DRIFT_ALIVE_COUNT`, ignored digests) is left out: `alive` only refreshes the link.
- The held-request limit (256) is left out.
- `Collect` forgets what no later step reads: reads and request timers of an old `r`, `answeredNonces` entries with no armed answer or held request, the trigger apart from `gm-return` and `drift`, and the view flags `firstCatchUpDone` and `gmAnswered`.
- Commits, proposals, pending edits and room copy writes belong to the `edit-delivery`, `room-copy` and `generation-adoption` skills.
- Safety only. `TimeoutArmed` stands in for "every catch-up ends", as an ordinary catch-up leaves when its timeout fires.

## Coverage record

Sync commit: `19232ad`. At that commit the model describes:

- `src/replica/catch-up.ts`: all of `createCatchUp` apart from the drift part of `aliveReceived` and `partyChanged`.
- `src/replica/engine.ts`: `catchUpTimerKey`, `disarmCatchUpTimer`, `armCatchUpTimer`, `runCatchUp`, `enterCatchUp`, `changeRole` (the catch-up part), the startup lines that enter `start` and watch, `stop`, `flushNow`, `catchUp`.
- `src/replica/room-protocol.ts`: `receive`, `dispatchRoomMessage` (`state-request`, `state`, `ping`, `alive`, `reset`), `receiveState`.
- `src/core/room-messages.ts`: `admitRoomMessage` and `ADMISSION`.
- `src/replica/generation-flow.ts`: `seeGeneration`, `adoptFromCopy`, the result of `saveAdoption`.
- `src/replica/room-copy.ts`: `read` and `followMetadata`, as far as they adopt.
