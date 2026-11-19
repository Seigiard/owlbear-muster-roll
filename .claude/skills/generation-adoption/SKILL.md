---
name: generation-adoption
description: Model-check AD-9 generation and adoption (snapshot import, wipe, `reset`, staging, `saveAdoption`) with TLA+. Use when a change touches src/replica/generation-flow.ts, the adopting phase of src/replica/catch-up.ts, or their wiring in engine.ts, room-protocol.ts, room-copy.ts or command-routing.ts; or to answer whether a client can end behind, mix two generations, lose saved data, or stay stuck adopting.
---

# Generation and adoption model

A TLA+ model of AD-9 in `formal/generation-adoption/GenerationAdoption.tla`. TLC checks every order of the modeled steps for two clients. It answers four questions: can a client end on a generation older than one it heard, mix records of two generations, lose a GM's saved data before the new generation is saved, or stay stuck adopting or importing.

## Does my change touch the verified code?

Run `git diff --stat 1116e34 -- <coverage files>` with the files in the coverage record below. Any change in a function the record names needs a model check. A change elsewhere in those files needs a read of the code map to confirm that no modeled step changed.

## Run

```sh
formal/generation-adoption/check.sh
```

It runs every config in `formal/generation-adoption/` in about 40 seconds and prints one line per config. Exit 0 means that every config ended as expected:

| Config | Expected | Checks |
| --- | --- | --- |
| `GenerationAdoption.cfg` | pass | all safety rules; 1 import, 1 role change, 1 page close, 1 failed save, 1 failed copy write |
| `TwoImports.cfg` | pass | all safety rules; 2 imports (two GMs mint at once, superseded import), 1 failed save, 1 failed copy write |
| `Liveness.cfg` | pass | `EventuallySettled`, `EventuallyAgreed`; 1 role change, 1 failed save, no close, no copy failure |
| `LivenessCopyFails.cfg` | pass | the same two; 1 failed save, 1 failed copy write, no role change, no close |
| `finding-*.cfg` | fail | the open findings below |
| `bug-*.cfg` | fail | broken variants (`Bug` constant) that prove each rule can fail |

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

One action is one synchronous run of JavaScript between two `await`s, because the background page is single-threaded. Examples: `Import` is `replaceGeneration` up to `await ports.roomCopy.writeImport`; `Deliver` is one room message from the admission gate to the end of its handler, including a synchronous `saveAdoption` inside `finishAdoption`. The `adopt` decision runs `clearStaged` inside the same step as `seeGeneration` or `adoptFromCopy`, because `runCatchUp` handles it before its first await.

### Abstractions

- A generation `{ n, a }` is the number `n * 10 + Idx[a]`; `INITIAL_GENERATION` is `0`. Integer order is `compareGenerations` order.
- Records are reduced to the generation they belong to. `replica`, `staged`, a `state` message and the room copy each hold a set of generation tags. Two tags, or a tag that is not the holder's generation, is a mix.
- Storage is the set of complete generations (`complete`). A failed save writes nothing complete and `removeGeneration` removes the attempted one. `hi` is a ghost: the highest complete generation the storage ever held.
- Each client has one inbox in arrival order. With two clients, that is Owlbear's one-sender order. Identical messages waiting in one inbox count once.
- Catch-up phases: `live`, `catching` (ordinary catch-up) and `adopting` with `target`. Nonces are left out: an answer of the adopted generation counts as the answer to the current request.
- A message's sender role is read when the message arrives (`senderOf`); a closed client is no longer in the party.

### Code map

| Action or operator | Code |
| --- | --- |
| `Import` | `command-routing.ts` `decideCommandRoute` (GM, not importing, live); `generation-flow.ts` `importFromSnapshot` / `wipe` -> `replaceGeneration` up to `await ports.roomCopy.writeImport`, with `saveGeneration` |
| `ImportCopyWritten` | `room-copy.ts` `writeImportCopy` -> `runImportCopy` -> `importCopyVerified` (superseded check, `adoptedHigherCopy`, `setMetadata`), `removeLowerCopy` when the copy does not fit or fails read-back |
| `ImportFinished` | `generation-flow.ts` `replaceGeneration` after the await: `importSuperseded`, `ports.sendRemote(resetMessage(...))`, `store.removeGenerationsBelow` |
| `Superseded` | `generation-flow.ts` `importSuperseded` |
| `Deliver` | `room-protocol.ts` `handleRoomMessage` (generation gate, `seeGeneration` for a higher GM message), `admitRoomMessage` in `core/room-messages.ts`, `dispatchRoomMessage`, `receiveState` (`stageGeneration`); `catch-up.ts` `stateMerged`, `stateRequested`; `engine.ts` `runCatchUp` case `answer` |
| `SeeGeneration` | `catch-up.ts` `enterFromGeneration` via `generationHeard` / `generationRead`; `engine.ts` `runCatchUp` case `adopt` -> `generation-flow.ts` `clearStaged` |
| `SaveAdoption` | `catch-up.ts` `finishAdoption` -> `generation-flow.ts` `saveAdoption` and `saveGeneration` |
| `Leave` | `catch-up.ts` `leave`; `engine.ts` `performCaughtUp` (`persistAllOnExit`) |
| `ReadCopy`, `ReadCopyInto` | `room-copy.ts` `read` -> `mergeReadRoomCopy`, and `followMetadata`; `generation-flow.ts` `adoptFromCopy`; `catch-up.ts` `adoptionStaged` |
| `WriteCopy` | `room-copy.ts` `runRoomCopyWrite` with `engine.ts` `canWriteRoomCopy` |
| `Ask` | `catch-up.ts` `request`, `ask`, and `fired` case `catch-up` while adopting |
| `SpeakAlive` | `catch-up.ts` `pingReceived` / `canAnswer`; `engine.ts` `runCatchUp` case `alive` |
| `Timeout` | `catch-up.ts` `fired` case `catch-up` (ordinary), `partyRead` alone |
| `RoleChange` | `engine.ts` `changeRole` -> `generation-flow.ts` `roleChanged`; `catch-up.ts` `enter('role')` |
| `Close` | `engine.ts` `stop` |

### Bounds and what is left out

Two clients `a` and `b`; the bounds per config are in the table under Run. A pass covers those bounds only.

Left out: page reload and start (`loadReplica`), more than two clients and cross-sender reordering, nonces and partial `state` answers, held requests of a GM that cannot answer yet, drift catch-ups, commits and player proposals, pending edits and the outbox (`flush`, `drop`), the routine room-copy write race (the `room-copy` skill covers it), failures of `removeGeneration`, `removeGenerationsBelow`, the AD-11 persist-all writes and storage reads, too-large records, and older storage formats. A wipe and an import are one action, because both run `replaceGeneration`.

Fairness for the liveness rules: a waiting message arrives, a catch-up timer fires, a copy read ends and an import's copy write ends. A GM's choices (import, role change, close, routine copy writes, `alive`) are not forced.

## Open findings

Each `finding-*.cfg` reproduces one. They were replayed against the real `createCatchUp` and `createGenerationFlow` in a scratch bun test at the sync commit.

1. **The importer leaks the new generation before its room copy and `reset`** (`finding-importer-leaves.cfg`, `EventuallySettled`). During `await ports.roomCopy.writeImport`, the importer is a live GM, so `pingReceived` answers `alive` and `stateRequested` answers `state`, both with the new generation (`engine.ts` `runCatchUp` cases `alive` and `answer`). A peer that hears it adopts. If the importer's page then closes before the copy lands, nothing holds the new generation: the peer stays in `catching-up/adopting` and its retries never end. AD-9 says the importer writes the copy and only then sends `reset`; the code keeps that order for `reset` only. With the leak removed in the model, this config passes.
2. **The only holder of a new generation is demoted while the room has no copy of it** (`finding-holder-demoted.cfg`, `EventuallySettled`). The import's copy does not fit, so `removeLowerCopy` leaves the room with no copy. The importer sends `reset`, a GM peer adopts, then the importer becomes a player. A player never answers (`canAnswer`), so the peer stays adopting until the importer is a GM again.
3. **An importer demoted mid-import sends `reset` as a player** (`finding-importer-demoted.cfg`, `EventuallyAgreed`). `replaceGeneration` checks `importSuperseded`, not the role, after the await, so it sends `reset` and replies `wiped` or `snapshot-imported`. Every receiver drops a `reset` from a player (`ADMISSION.reset` in `core/room-messages.ts`). When the copy does not fit, the demoted client stays on the new generation and the room on the old one, for good.

The owner's verdicts, 2026-11-19. Finding 1 is TASK-117. Findings 2 and 3 are accepted: a room has one GM, generations change only while the preset format settles, and a GM is not demoted mid-import. Keep their configs as expected failures and do not report them again.

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

Sync commit: `1116e34`. Move it forward only after you confirm that the model describes the covered functions at the new commit.

- `src/replica/generation-flow.ts`: `importFromSnapshot`, `wipe`, `replaceGeneration`, `importSuperseded`, `nextGeneration`, `adoptFromCopy`, `seeGeneration`, `stage`, `clearStaged`, `saveAdoption`, `saveGeneration`, `roleChanged`
- `src/replica/catch-up.ts`: `enterFromGeneration`, `finishAdoption`, `leave`, `enter`, `canAnswer`, `stateMerged`, `stateRequested`, `pingReceived`, `fired` (`catch-up`, `answer`), `adoptionStaged`, `generationRead`, `generationHeard`
- `src/replica/engine.ts`: `runCatchUp` (`adopt`, `alive`, `answer`, `request`), `changeRole`, `performCaughtUp`, `canWriteRoomCopy`, the `createGenerationFlow` and `createCatchUp` wiring
- `src/replica/room-protocol.ts`: `handleRoomMessage`, `dispatchRoomMessage`, `receiveState`
- `src/replica/room-copy.ts`: `mergeReadRoomCopy`, `followMetadata`, `runRoomCopyWrite`, `writeImportCopy`, `runImportCopy`, `importCopyVerified`, `adoptedHigherCopy`, `removeLowerCopy`
- `src/replica/command-routing.ts`: `decideCommandRoute`
- `src/replica/record-store.ts`: `readHighestGeneration`, `removeGeneration`, `removeGenerationsBelow`
- `src/core/room-messages.ts`: `ADMISSION`, `admitRoomMessage`, `generationRelation`
