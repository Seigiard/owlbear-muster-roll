---
name: generation-adoption
description: Model-check AD-9 generation and adoption (snapshot import, wipe, `reset`, staging, `saveAdoption`) with TLA+. Use when a change touches src/replica/generation-flow.ts or generation-table.ts, the adopting phase of src/replica/catch-up.ts or catch-up-table.ts, the import write of room-copy.ts or room-copy-table.ts, or their wiring in engine.ts, catch-up-effects.ts, room-protocol.ts or command-routing.ts; or to answer whether a client can end behind, mix two generations, lose saved data, or stay stuck adopting.
---

# Generation and adoption model

A TLA+ model of AD-9 in `formal/generation-adoption/GenerationAdoption.tla`. TLC checks every order of the modeled steps for two clients. It answers four questions: can a client end on a generation older than one it heard, mix records of two generations, lose a GM's saved data before the new generation is saved, or stay stuck adopting or importing.

## Does my change touch the verified code?

Run `formal/drift.sh generation-adoption`. It lists the covered files that changed after the sync commit in `formal/generation-adoption/coverage.txt`. Any change in a function the record names needs a model check. A change elsewhere in those files needs a read of the code map to confirm that no modeled step changed.

## Run

```sh
formal/generation-adoption/check.sh
```

It runs every config in `formal/generation-adoption/` in about 45 seconds and prints one line per config. Exit 0 means that every config ended as expected:

| Config | Expected | Checks |
| --- | --- | --- |
| `GenerationAdoption.cfg` | pass | all safety rules; 1 import, 1 role change, 1 page close, 1 failed save, 1 failed copy write |
| `TwoImports.cfg` | pass | all safety rules; 2 imports (two GMs mint at once, superseded import), 1 failed save, 1 failed copy write |
| `Promoted.cfg` | pass | all safety rules; GM `a` and player `b`; 1 import, 1 role change (a promotion or a demotion), 1 page close, 1 failed save, 1 failed copy write. Here and in `LivenessPromoted.cfg`, a promoted client holds an old-generation `state` that retries a failed adoption save |
| `Liveness.cfg` | pass | `EventuallySettled`, `EventuallyAgreed`; 1 role change, 1 failed save, no close, no copy failure |
| `LivenessCopyFails.cfg` | pass | the same two; 1 failed save, 1 failed copy write, no role change, no close |
| `LivenessPromoted.cfg` | pass | the same two; GM `a` and player `b`, 1 import, 1 role change (a promotion or a demotion), 1 failed save, no close, no copy failure. A promoted `b` reaches the retry of a failed adoption save |
| `importer-leaves.cfg`, `importer-leaves-player.cfg` | pass | all safety rules, `EventuallySettled` and `EventuallyAgreed`; 1 import, 1 page close, a GM peer or a player peer: the importer closes while it writes the room copy, and the open peer settles (former finding 1, TASK-117) |
| `finding-*.cfg` | fail | the open findings below |
| `bug-*.cfg` | fail | broken variants (`Bug` constant) that prove each rule can fail; `bug-no-retry.cfg` (a pending adoption is never saved again) and `bug-importer-answers.cfg` (the importer answers during its copy write, the TASK-117 bug) break the liveness rules |

To see TLC's output for one config: `formal/generation-adoption/check.sh <name>.cfg`. The first run installs Java and TLC through `formal/tlc.sh` and needs the network.

Read every result with the `/statechart` skill. On a violation it gives the shortest path in plain words. On a pass it draws how the clients move between states. Run it in a scratch folder outside the repo with a view module in reader words.

## Rules

Each rule is an invariant or a temporal property in the spec. Harm is what a user loses when the rule breaks.

| Rule | Plain sentence | Harm |
| --- | --- | --- |
| `ReplicaOneGeneration` | A client's replica holds records of its own generation only. | Replaced sheets come back, or the windows show a mix of the old and the imported room. |
| `StagedIsTarget` | Staged records belong to the generation being adopted, and none stay staged when nothing is adopted. | The next adoption saves records of an older generation into the new one. |
| `CopyOneGeneration` | The room copy holds records of the generation it is labeled with. | A player with no GM online reads the wrong data; a client that adopts from the copy takes it in. |
| `NotBehindUnlessAdopting` | A client whose highest heard generation is above its own is adopting exactly that generation. | A client keeps working on replaced data, and its edits never reach the room. |
| `PersistIsOwn` | A GM client writes its records under its own generation. | localStorage mixes generations; the next start loads the wrong records. |
| `NoStoreRegress` | A client's storage never loses its highest complete generation. | The GM's localStorage, the only full copy of their data, loses its newest data. |
| `WorkingGenerationSaved` | The generation a GM client writes under is saved complete, except between a promotion and its catch-up exit. | A reload finds no complete generation for the records the GM edits. |
| `EventuallySettled` | Every open client leaves adoption and import for good. | A GM is stuck in catch-up: edits queue and never apply. |
| `EventuallyAgreed` | The open clients end on one generation. | The room splits: one client sees data nobody else gets. |

## Model

### One atomic step

One action is one synchronous run of JavaScript between two `await`s, because the background page is single-threaded. Examples: `Import` is the `import` or `wipe` event of `generation-table.ts` with the effects that `generation-flow.ts` `run` applies, up to `await ports.roomCopy.writeImport` in `writeImport`; `Deliver` is one room message from the admission gate to the end of its handler, including the synchronous `saveAdoption` that `catch-up.ts` `feed` calls after a `state-merged` event. The `adopt` decision runs `clearStaged` inside the same step as `seeGeneration` or `adoptFromCopy`, because `catch-up-effects.ts` `run` handles it before its first await.

Two actions span awaits on purpose. `ImportCopyWritten` is the whole import copy write in `room-copy-table.ts` (read, write, read-back, cleanup), and `Deliver` of a `request` includes the GM's answer timer.

### Abstractions

- A generation `{ n, a }` is the number `n * 10 + Idx[a]`; `INITIAL_GENERATION` is `0`. Integer order is `compareGenerations` order.
- Records are reduced to the generation they belong to. `replica`, `staged`, a `state` message and the room copy each hold a set of generation tags. Two tags, or a tag that is not the holder's generation, is a mix.
- Storage is the set of complete generations (`complete`). A failed save writes nothing complete and `removeGeneration` removes the attempted one. `hi` is a ghost: the highest complete generation the storage ever held.
- Each client has one inbox in arrival order. With two clients, that is Owlbear's one-sender order. Identical messages waiting in one inbox count once.
- Catch-up phases: `live`, `catching` (ordinary catch-up) and `adopting` with `target`. Nonces are left out: an answer of the adopted generation counts as the answer to the current request.
- `pending` is the catch-up table's `pendingAdoption` after a failed save: `copy` or `answer`, by the save's `fromCopy`. While it is set, any `state` the client merges retries the save with that `fromCopy`: a `state` of its own generation, or one of the target that the model may also count as an answer. A new target and a role change drop it.
- A message's sender role is read when the message arrives (`senderOf`); a closed client is no longer in the party.

### Code map

| Action or operator | Code |
| --- | --- |
| `Import` | `command-routing.ts` `decideCommandRoute` (GM, not importing, live); `generation-flow.ts` `importFromSnapshot` / `wipe` -> `dispatch` -> `generation-table.ts` `importGeneration`, then `storeWritten` (local) or `storeFailed`; `generation-flow.ts` `run` and `saveGeneration` up to `await ports.roomCopy.writeImport` in `writeImport` |
| `ImportCopyWritten` | `room-copy.ts` `writeImport` -> `room-copy-table.ts` `edited` (import, queued behind a write in flight), `importRead` (superseded check, `adopt` of a higher copy, `recheck-import`), `encodeWrite`, `writeDone`, `verifyDone`, `importRejected`, `cleanupRead` (removes a lower copy when the copy does not fit or fails read-back) |
| `ImportFinished` | `generation-flow.ts` `writeImport` after the await -> `generation-table.ts` `copyWritten` with `written` (`importSuperseded`, the `reset` effect, `removeOld`), then with `finished` |
| `Superseded` | `generation-table.ts` `importSuperseded` |
| `Deliver` | `room-protocol.ts` `handleRoomMessage` (generation gate, `seeGeneration` for a higher GM message), `admitRoomMessage` in `core/room-messages.ts`, `dispatchRoomMessage`, `receiveState` (`stageGeneration`); `catch-up.ts` `feed` (saves a pending adoption after `state-merged`); `catch-up-table.ts` `catchUpStateMerged`, `catchUpStateRequested`, `catchUpFired` case `answer`; `catch-up-effects.ts` `run` case `answer` -> `engine.ts` `sendStateAnswer` |
| `SeeGeneration` | `generation-table.ts` `seeGeneration` / `adoptFromCopy` -> `catch-up-table.ts` `enterFromGeneration` via `catchUpGenerationHeard` / `catchUpGenerationRead`; `catch-up-effects.ts` `run` case `adopt` -> `generation-flow.ts` `clearStaged` -> `generation-table.ts` `clearStaged` |
| `SaveAdoption` | `catch-up.ts` `feed` -> `generation-flow.ts` `saveAdoption` -> `generation-table.ts` `saveAdoption`, `storeWritten`, `storeFailed`, and `saveGeneration`; `catch-up-table.ts` `catchUpAdoptionSaved` |
| `Leave` | `catch-up-table.ts` `leave`; `engine.ts` `performCaughtUp` (`persistAllOnExit`) |
| `ReadCopy`, `ReadCopyInto` | `room-copy.ts` `read` -> `room-copy-table.ts` `observeRead` -> `mergeReadRoomCopy`, and `followed` -> `followMetadata`; `generation-table.ts` `adoptFromCopy` (`afterRead`); `catch-up-table.ts` `catchUpAdoptionStaged` |
| `WriteCopy` | `room-copy-table.ts` `trigger`, `readDone`, `encodeWrite`, `verifyDone` (ordinary) with `engine.ts` `canWriteRoomCopy` |
| `Ask` | `catch-up-table.ts` `request`, `ask`, `catchUpRoomCopyRead`, and `catchUpFired` case `catch-up` while adopting |
| `SpeakAlive` | `catch-up-table.ts` `catchUpPing` / `canAnswer`; `catch-up-effects.ts` `run` case `alive` -> `engine.ts` `sendAlive` |
| `Vouches` | `engine.ts` `vouches` for `createCatchUp`: saved records, and not `generationFlow.importing()` |
| `Timeout` | `catch-up-table.ts` `catchUpFired` case `catch-up` (ordinary), `catchUpPartyRead` alone |
| `RoleChange` | `engine.ts` `changeRole` -> `generation-flow.ts` `roleChanged` -> `generation-table.ts` `roleChanged`; `catch-up-table.ts` `catchUpEnter` with `role` (drops `pendingAdoption`) |
| `Close` | `engine.ts` `stop` (`controller.abort()`) |

### Bounds and what is left out

Two clients `a` and `b`; the bounds per config are in the table under Run. A pass covers those bounds only.

Left out: page reload and start (`loadReplica`), more than two clients and cross-sender reordering, nonces and partial `state` answers (the `replica-catch-up` skill covers nonces, including an own answer from a higher generation while adopting), held requests of a GM that cannot answer yet, drift catch-ups, commits and player proposals, pending edits and the outbox (`flush`, `drop`), the routine room-copy write race (the `room-copy` skill covers it), failures of `removeGeneration`, `removeGenerationsBelow`, the AD-11 persist-all writes and storage reads, too-large records, and older storage formats. The importer's own `ping` and dice rolls are left out: during an import `engine.ts` `sendPing` sends nothing and `roll-flow.ts` `sendRoll` ends with `failed`, so neither names the new generation. A request that reaches an importer is held, as by any GM that cannot answer, until its next catch-up ends. A wipe and an import are one action, because both run `replaceGeneration`.

Fairness for the liveness rules: a waiting message arrives, a catch-up timer fires, a copy read ends and an import's copy write ends. A GM's choices (import, role change, close, routine copy writes, `alive`) are not forced.

The retry of a failed save on a `state` of the client's own generation is not needed for the liveness rules: with that retry removed, `LivenessPromoted.cfg` still passes, because the client asks again and reads the room copy. Its safety is checked in `Promoted.cfg`, and `bug-retry-stages-equal.cfg` breaks it. Liveness with a demotion and a failed copy write is not checked: that room is finding 1.

## Open findings

Each `finding-*.cfg` reproduces one. They were replayed against the real `createCatchUp` and `createGenerationFlow` in a scratch bun test at `19232ad`; finding 3 was replayed again at `995e1c7`.

1. **The only holder of a new generation is demoted while the room has no copy of it** (`finding-holder-demoted.cfg`, `EventuallySettled`). The import's copy does not fit, so `removeLowerCopy` leaves the room with no copy. The importer sends `reset`, a GM peer adopts, then the importer becomes a player. A player never answers (`canAnswer`), so the peer stays adopting until the importer is a GM again.
2. **An importer demoted mid-import sends `reset` as a player** (`finding-importer-demoted.cfg`, `EventuallyAgreed`). `generation-table.ts` `copyWritten` checks `importSuperseded`, not the role, after the await, so it sends `reset` and replies `wiped` or `snapshot-imported`. Every receiver drops a `reset` from a player (`ADMISSION.reset` in `core/room-messages.ts`). When the copy does not fit, the demoted client stays on the new generation and the room on the old one, for good.

The owner's verdicts, 2026-11-19. Findings 1 and 2 are accepted: a room has one GM, generations change only while the preset format settles, and a GM is not demoted mid-import. Keep their configs as expected failures and do not report them again.

Fixed: the importer leaked the new generation before its room copy and `reset` (TASK-117). During `await ports.roomCopy.writeImport` it answered `ping` and `state-request` under the new generation; a peer that heard it adopted, and if the importer's page closed before the copy landed, the peer stayed adopting. Fixed in `20de031`: an importing GM does not vouch, so it answers nothing until the copy is written. Its config is now `importer-leaves.cfg`, with `importer-leaves-player.cfg` for a player peer; `bug-importer-answers.cfg` brings the leak back. Since then an importer hears a newer generation only after that generation's copy is written, so `bug-copy-ignores-superseded.cfg` needs one failed copy write to reach the superseded check.

When a fix lands, its finding config must pass: move it to the pass list in `check.sh` (rename it without the `finding-` prefix) and update this section.

## Real bug or modeling error?

When a config ends against expectation, read the path with `/statechart`, then replay it on the real code, one step per action: a scratch bun test on `createCatchUp` and `createGenerationFlow` (see the `createSubject` harness in `src/replica/generation-flow.test.ts`) or an engine test on `tests/support/room-rig.ts`. Delete the scratch test after.

- The replay shows the same state: a real bug. Report it with the steps in the code's words. Change no product code unless the user asks.
- The replay cannot take a step: the model allows something the code does not. Fix that action against the code map, and say what was wrong.
- Never weaken a rule or tighten a bound to make a config pass.

## Updating the model on an intended change

1. Find each changed function in the code map and change the matching action or operator. Keep one action per synchronous run between awaits: a new `await` inside a modeled step splits that action in two.
2. A new state the code keeps becomes a field of the client record `cl[c]`, a new message type a value of `Msg`'s `t`.
3. A changed rule of AD-9 changes the matching rule only after the owner accepts it; write the new plain sentence and harm in the table above.
4. Run `formal/generation-adoption/check.sh`. Each `bug-*.cfg` must still fail; when a change removes the code a variant breaks, replace the variant with a break of the new code.
5. Keep the full run under about 60 seconds. Lower a bound before you remove a rule.

## Coverage record

Sync commit: `1709de4` (also in `formal/generation-adoption/coverage.txt`). Move it forward only after you confirm that the model describes the covered functions at the new commit.

- `src/replica/generation-flow.ts`: `createGenerationFlow` (`dispatch`, `run`, `writeImport`), `importFromSnapshot`, `wipe`, `adoptFromCopy`, `seeGeneration`, `stage`, `clearStaged`, `saveAdoption`, `roleChanged`, `saveGeneration`
- `src/replica/generation-table.ts`: `generationTable`, `importGeneration`, `importSuperseded`, `seeGeneration`, `adoptFromCopy`, `stage`, `clearStaged`, `saveAdoption`, `storeWritten`, `storeFailed`, `copyWritten`, `removeOld`, `roleChanged`, `installed`, `rememberGeneration`, `withStaging`
- `src/replica/catch-up.ts`: `createCatchUp` (`feed` and its pending-adoption save), `live`, `adopting`
- `src/replica/catch-up-table.ts`: `catchUpTable` rows, `catchUpEnter`, `catchUpRoomCopyRead`, `catchUpPartyRead`, `catchUpGenerationHeard`, `catchUpGenerationRead`, `catchUpAdoptionStaged`, `catchUpStateRequested`, `catchUpPing`, `catchUpStateMerged`, `catchUpFired` (`catch-up`, `answer`), `catchUpAdoptionSaved`, `enterFromGeneration`, `leave`, `ask`, `request`, `canAnswer`, `scheduleAnswer`
- `src/replica/catch-up-effects.ts`: `run` (`adopt`, `alive`, `answer`, `request`, `read-room-copy`, `caught-up`)
- `src/replica/engine.ts`: `changeRole`, `performCaughtUp`, `canWriteRoomCopy`, `sendStateAnswer`, `sendAlive`, `stop`, the `createGenerationFlow`, `createCatchUp`, `createCatchUpEffects` and `createRoomCopy` (`adopt`) wiring
- `src/replica/room-protocol.ts`: `handleRoomMessage`, `dispatchRoomMessage`, `receiveState`
- `src/replica/room-copy.ts`: `writeImport`, `read`, `followed`, `mergeReadRoomCopy`, `followMetadata`
- `src/replica/room-copy-table.ts`: `edited`, `trigger`, `finish`, `nextImport`, `observeRead`, `readDone`, `importRead`, `adoptForOrdinary`, `afterAdoption`, `cleanupRead`, `encodeWrite`, `writeDone`, `verifyDone`, `importRejected`, `failed`
- `src/replica/command-routing.ts`: `decideCommandRoute`
- `src/replica/record-store.ts`: `readHighestGeneration`, `removeGeneration`, `removeGenerationsBelow`
- `src/core/room-messages.ts`: `ADMISSION`, `admitRoomMessage`, `generationRelation`
