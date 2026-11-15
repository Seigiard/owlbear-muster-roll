---
id: doc-4
title: 'TASK-64.4: Engine state-machine map and extraction order'
type: architecture-map
created_date: ''
updated_date: '2026-11-15T08:12:00Z'
status: confirmed-owner-approved
source: src/replica/engine.ts:210-2562
spec: _bmad-output/implementation-artifacts/spec-task-64.4-engine-state-map.md
---

# Engine state-machine map

**Gate:** The owner confirmed this exact map on 2026-11-15 with the decision **«Подтвердить карту»** after reading the linked map, the 160-function/26-let inventory, all four shapes, the roll injected-port versus pure tradeoff, and extraction order TASK-64.5 → TASK-64.6 → TASK-64.7 → TASK-64.9. Planning-spec approval and map confirmation are separate decisions. This confirmation authorizes the extraction order; it does not start TASK-64.5.

**Revision 2026-11-15, generation shape.** After an architecture validation the owner reopened the generation/adoption shape and chose the injected-port module over catch-up-style decisions. The generation row, extraction step 2, the seams and the `performCaughtUp` ownership below carry that choice; the rest of the map is unchanged.

## Scope and inventory rule

The source of truth is the complete lexical closure of `startReplicaEngine` in `src/replica/engine.ts:210-2562`. The inventory includes every named function declaration, function expression and arrow callback inside that closure, plus every `let` declaration (including destructured bindings if any are added later). A callback is qualified by its containing function and its source span. Functions outside the closure (for example `settledWithin`, `loadReplica`, `rollFailure` and `evaluatedWith`) are not nested closure symbols and remain ordinary module helpers.

The independent compiler-AST control used for this map is recorded outside the repository:

- Control: `/Users/seigiard/.claude/artifacts/tdd-20261115-073056/TASK-64.4/controls/engine-inventory-reconcile.txt`.
- Babel compiler-AST inventory: 160 nested functions and 26 `let` declarations.
- Independent OXC compiler-AST inventory: 160 nested functions and 26 `let` declarations.
- Reconciliation: function kind plus line span **PASS**; binding text plus line span **PASS**.

This corrects the earlier approximate counts in backlog prose. The approximate count is not the acceptance scope. The lists below are complete and disjoint: each qualified function path and each `let` appears in exactly one section.

## Shape and ownership summary

| Machine / owner | State it owns | Effects and seams | Decision shape and reason |
| --- | --- | --- | --- |
| Roll | The roll request/roll-display work represented by `recentRollRequestIds` and `recentRollIds` (the bounded sets are existing engine state); per-request local `roller` and `evaluated` bindings | Reads the pending view and preset; reads player name; calls the existing dice-extension port; sends one remote roll; sends the window outcome; shows a received roll through the notification port. Live getters are read at the existing source points: `stopped` before readiness, `role` and `stopped` across readiness and the dice wait, `role` before send, the current generation while constructing the message, and `stopped` after the reported send; `hidden` is computed once during preparation. | **Module with injected ports/callbacks**, like `dice-extension` and `room-copy`. The flow is a linear async pipeline (prepare → optional extension access → roll → send), so effect data would add ceremony without improving the boundary. The module must not import a platform adapter. |
| Generation/adoption | `persistence`, `ownGeneration`, `highestSeenGeneration`, `incoming`, `importing`; generation replacement and adoption staging | Record-store writes/removals, room-copy import/replacement, CatchUp seams (`adopting`, `replicaReplaced`, `generationRead`, `generationHeard`, `adoptionStaged`), outbox flush, pending-work drop, replica swap with publisher restart, notices, the remote `reset` and the window replies. The module keeps the existing synchronous `saveAdoption` callback that CatchUp calls; `false` keeps adoption open, `true` lets CatchUp continue. | **Module with injected ports/callbacks**, like `room-copy` and `pending-edits`. The pure decisions are four predicates (next generation, schema check, `importSuperseded`, generation relation) and live as small pure functions the module calls; everything else is two linear effect sequences with early exits on a failed write, which injected ports express directly. AD-9 is proven by call-order tests on fake store, room-copy and CatchUp seams, as `room-copy.test.ts` proves its port. No shared machine runtime and no second effect interpreter. |
| Command/pending | `pendingIds` and the local upload batch binding `complete`; the pending intent overlay and replay routing around the existing `pending` and `pendingEdits` modules | Composer/pending-edits calls, record apply/persist, command rejection/completion, publisher updates, outbox and room-copy edit notifications | **ADR-0002 reducer shape**: explicit role/import/catch-up context in, pure route/overlay/replay decisions out, effectful caller in the engine. Decisions are stepped: the caller applies one returned step, feeds the actual applied records or updated replica and any write-failure result into the next decision, and only then continues a preset batch or replayed command. A failure stops the correct batch; the reducer never precomputes a future effects list. |
| Room protocol/proposal | No new durable room state; it owns the protocol decision boundary over sender, role, generation relation and CatchUp liveness. It also owns the `roomMessages` promise, sequencing and recovery callbacks at lines 2466 and 2467-2469; the engine retains only the subscription forwarding callback at lines 2464-2470. | Party sender lookup, AD-5 admission, CatchUp event calls, proposal checks/rejections, record reception, roll delivery and remote sends | **Module with injected ports/callbacks**. The boundary is an async serialized protocol adapter around the existing CatchUp and party-roster ports. It should not duplicate CatchUp or become a shared runtime. This is an added TASK-64 extraction after the three planned machines. |
| Retained wiring | Engine lifecycle and adapter state: `decodedPreset`, `sizedFor`, `role`, `stopped`, `catchUp`, `newerVersionSeen`, open-request, scene-watch, persistence helpers, cached digest, RoomCopy, WindowPublisher and the event-subscription lifecycle | Timer ownership, existing module construction, UI projection, token menu, scene watch, party/role subscriptions, storage reads, send queues, and stop/flush/page lifecycle. `clearDeletedLinks` retains its stopped/role/live/import scene-eligibility guard; the submitted `link-clear` enters the extracted command module without moving scene ownership. | **No new machine**. These functions compose already-owned modules and execute effects. Keeping them in `startReplicaEngine` preserves the explicit port/adaptor boundary and avoids inventing a generic state-machine runtime. Any later extraction is separately scoped, not hidden in TASK-64.5–64.7. |

## Extraction order and task graph

1. **TASK-64.5 — roll**, after this map is confirmed. Extract only the Roll machine rows below. Inject preset/pending-view, role, party/GM presence, player-name, dice-extension, remote-send, notification and window-reply seams. `presetOf` stays shared wiring because command, generation and roll callers use the same decoded-preset cache; it is not silently duplicated.
2. **TASK-64.6 — generation/adoption**, after TASK-64.5 and the completed TASK-63.2/TASK-63.3 phase work. Keep CatchUp and RoomCopy interfaces. Extract the generation rows below, including import/wipe planning and adoption staging, into one injected-port module. Inject the record store or its absence, room copy, the CatchUp seams, outbox flush, remote send, replica swap, pending-work drop, notices, window replies, `connectionId` and a `stopped` getter. The module exposes `generation()`, `highestSeen()`, `importing()`, `persistence()` for the engine's readers, and `importFromSnapshot`, `wipe`, `checkSnapshot`, `adoptFromCopy`, `seeGeneration`, `stage`, `clearStaged`, `saveAdoption` and `roleChanged`. Local import/wipe is `flush → save → replace → writeImport → reset`; remote adoption is `save → replace → roomCopy.replaced`, with no `writeImport` or `reset`. `runCatchUp` stays the CatchUp effect interpreter and calls the module's `saveAdoption`, `stage` and `clearStaged`; no generation interpreter is added.
3. **TASK-64.7 — command/pending**, after TASK-64.6. Extract command routes, preset diff/upload routes and pending overlay/replay rows. Keep composer, pending queue and pending-edits modules as ports; do not move room-message admission into this task.
4. **TASK-64.9 — room protocol/proposal**, after TASK-64.7. Extract AD-5 dispatch, sender lookup sequencing and proposal/reject/state protocol rows. It owns the protocol role/liveness branches that TASK-64.7 explicitly defers to TASK-64.9.
5. **TASK-64.8** remains the independent builder/lint task. It is under TASK-64 but is not in this engine extraction order.

TASK-64.5–64.7 descriptions are updated to this map. TASK-64.9 is added for the protocol/proposal machine. Retained wiring is named below and is not an untracked extraction gap.

## Complete qualified function inventory

Callbacks are listed as symbols, not treated as incidental syntax. Their qualified paths and line spans make ownership disjoint and independently checkable.

### Roll machine

- `startReplicaEngine > handleRollRequest` — FunctionDeclaration, lines 1574-1598
- `startReplicaEngine > prepareRoll` — FunctionDeclaration, lines 1602-1633
- `startReplicaEngine > rollWithDice` — FunctionDeclaration, lines 1640-1743
- `startReplicaEngine > sendRoll` — FunctionDeclaration, lines 1773-1813
- `startReplicaEngine > replyRoll` — FunctionDeclaration, lines 1815-1819
- `startReplicaEngine > replyRoll > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1816-1818
- `startReplicaEngine > receiveRoll` — FunctionDeclaration, lines 1825-1844
- `startReplicaEngine > receiveRoll > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1841-1843

### Generation/adoption machine

- `startReplicaEngine > handleSnapshotCheck` — FunctionDeclaration, lines 1088-1133
- `startReplicaEngine > handleSnapshotCheck > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1130-1132
- `startReplicaEngine > planImport` — FunctionDeclaration, lines 1136-1163
- `startReplicaEngine > importFromSnapshot` — FunctionDeclaration, lines 1169-1206
- `startReplicaEngine > importFromSnapshot > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1202-1204
- `startReplicaEngine > wipeRoom` — FunctionDeclaration, lines 1211-1229
- `startReplicaEngine > wipeRoom > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1225-1227
- `startReplicaEngine > replaceGeneration` — FunctionDeclaration, lines 1236-1316
- `startReplicaEngine > replaceGeneration > roomCopy.writeImport callback#2` — ArrowFunctionExpression, lines 1284-1284
- `startReplicaEngine > replaceGeneration > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1298-1300
- `startReplicaEngine > importSuperseded` — FunctionDeclaration, lines 1319-1323
- `startReplicaEngine > saveGeneration` — FunctionDeclaration, lines 1329-1373
- `startReplicaEngine > replaceReplica` — FunctionDeclaration, lines 1377-1398
- `startReplicaEngine > adoptFromCopy` — FunctionDeclaration, lines 2014-2034
- `startReplicaEngine > adoptFromCopy > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2022-2024
- `startReplicaEngine > adoptFromCopy > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2030-2032
- `startReplicaEngine > seeGeneration` — FunctionDeclaration, lines 2041-2050
- `startReplicaEngine > seeGeneration > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2047-2049
- `startReplicaEngine > dropPendingWork` — FunctionDeclaration, lines 2054-2065
- `startReplicaEngine > dropPendingWork > MemberExpression.map callback#1` — ArrowFunctionExpression, lines 2056-2056
- `startReplicaEngine > stage` — FunctionDeclaration, lines 2079-2090
- `startReplicaEngine > saveAdoptionData` — FunctionDeclaration, lines 2099-2137

### Command/pending machine

- `startReplicaEngine > pendingIdsOf` — FunctionDeclaration, lines 873-888
- `startReplicaEngine > pendingIdsOf > callback@874` — ArrowFunctionExpression, lines 874-887
- `startReplicaEngine > handleCommand` — FunctionDeclaration, lines 923-930
- `startReplicaEngine > runCommand` — FunctionDeclaration, lines 932-991
- `startReplicaEngine > handlePresetDiff` — FunctionDeclaration, lines 995-1025
- `startReplicaEngine > handlePresetDiff > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1022-1024
- `startReplicaEngine > uploadPreset` — FunctionDeclaration, lines 1032-1084
- `startReplicaEngine > uploadPreset > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1081-1083
- `startReplicaEngine > handlePlayerCommand` — FunctionDeclaration, lines 1402-1419
- `startReplicaEngine > queueIntent` — FunctionDeclaration, lines 1848-1873
- `startReplicaEngine > pendingView` — FunctionDeclaration, lines 1878-1891
- `startReplicaEngine > composedEntry` — FunctionDeclaration, lines 1893-1906
- `startReplicaEngine > pendingViewRecords` — FunctionDeclaration, lines 1910-1914
- `startReplicaEngine > pendingViewRecords > ArrayExpression.filter callback#1` — ArrowFunctionExpression, lines 1913-1913
- `startReplicaEngine > replayPending` — FunctionDeclaration, lines 1918-1962
- `startReplicaEngine > replayPending > MemberExpression.map callback#1` — ArrowFunctionExpression, lines 1923-1923
- `startReplicaEngine > replayPending > refusals.map callback#1` — ArrowFunctionExpression, lines 1943-1943
- `startReplicaEngine > replayPending > MemberExpression.flatMap callback#1` — ArrowFunctionExpression, lines 1954-1954

### Room-protocol/proposal follow-up machine

- `startReplicaEngine > proposalContext` — FunctionDeclaration, lines 1421-1423
- `startReplicaEngine > receiveProposal` — FunctionDeclaration, lines 1430-1503
- `startReplicaEngine > unlinkRemovedBlock` — FunctionDeclaration, lines 1507-1521
- `startReplicaEngine > sendRoom` — FunctionDeclaration, lines 1523-1533
- `startReplicaEngine > sendRoom > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1530-1532
- `startReplicaEngine > receiveReject` — FunctionDeclaration, lines 1535-1556
- `startReplicaEngine > receiveState` — FunctionDeclaration, lines 2233-2264
- `startReplicaEngine > receiveState > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2252-2254
- `startReplicaEngine > receiveState > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2261-2263
- `startReplicaEngine > handleRoomMessage` — FunctionDeclaration, lines 2348-2396
- `startReplicaEngine > handleRoomMessage > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2390-2392
- `startReplicaEngine > dispatchRoomMessage` — FunctionDeclaration, lines 2399-2459
- `startReplicaEngine > dispatchRoomMessage > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2430-2432
- `startReplicaEngine > dispatchRoomMessage > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2438-2440
- `startReplicaEngine > dispatchRoomMessage > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2443-2445
- `startReplicaEngine > MemberExpression.onMessage callback#2 > roomMessages.then callback#1` — ArrowFunctionExpression, lines 2466-2466
- `startReplicaEngine > MemberExpression.onMessage callback#2 > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2467-2469

### Retained wiring and existing module adapters

- `startReplicaEngine > createWindowSizer callback#2` — ArrowFunctionExpression, lines 241-243
- `startReplicaEngine > createCommitOutbox callback#2` — ArrowFunctionExpression, lines 256-256
- `startReplicaEngine > records callback` — ArrowFunctionExpression, lines 266-266
- `startReplicaEngine > catchingUp callback` — ArrowFunctionExpression, lines 267-267
- `startReplicaEngine > compose callback` — ArrowFunctionExpression, lines 269-269
- `startReplicaEngine > now callback` — ArrowFunctionExpression, lines 271-271
- `startReplicaEngine > enqueue callback` — ArrowFunctionExpression, lines 272-283
- `startReplicaEngine > enqueue callback > sendQueue.enqueueComposed callback#2` — ArrowFunctionExpression, lines 275-281
- `startReplicaEngine > createDiceExtension callback#4` — ArrowFunctionExpression, lines 299-299
- `startReplicaEngine > unlink callback` — ArrowFunctionExpression, lines 308-313
- `startReplicaEngine > now callback` — ArrowFunctionExpression, lines 356-356
- `startReplicaEngine > role callback` — ArrowFunctionExpression, lines 357-357
- `startReplicaEngine > vouches callback` — ArrowFunctionExpression, lines 358-358
- `startReplicaEngine > generation callback` — ArrowFunctionExpression, lines 359-359
- `startReplicaEngine > commitsUnsent callback` — ArrowFunctionExpression, lines 361-361
- `startReplicaEngine > hasData callback` — ArrowFunctionExpression, lines 362-362
- `startReplicaEngine > schedule callback` — ArrowFunctionExpression, lines 379-383
- `startReplicaEngine > schedule callback > callback@382` — ArrowFunctionExpression, lines 382-382
- `startReplicaEngine > gm callback` — ArrowFunctionExpression, lines 385-385
- `startReplicaEngine > generation callback` — ArrowFunctionExpression, lines 386-386
- `startReplicaEngine > records callback` — ArrowFunctionExpression, lines 387-387
- `startReplicaEngine > changed callback` — ArrowFunctionExpression, lines 391-391
- `startReplicaEngine > state callback` — ArrowFunctionExpression, lines 398-407
- `startReplicaEngine > merge` — FunctionDeclaration, lines 410-418
- `startReplicaEngine > currentNotices` — FunctionDeclaration, lines 420-430
- `startReplicaEngine > send` — FunctionDeclaration, lines 432-434
- `startReplicaEngine > catchUpTimerKey` — FunctionDeclaration, lines 436-440
- `startReplicaEngine > disarmCatchUpTimer` — FunctionDeclaration, lines 442-450
- `startReplicaEngine > armCatchUpTimer` — FunctionDeclaration, lines 452-477
- `startReplicaEngine > armCatchUpTimer > setTimeout callback#1` — ArrowFunctionExpression, lines 461-474
- `startReplicaEngine > armCatchUpTimer > setTimeout callback#1 > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 471-473
- `startReplicaEngine > runCatchUp` — FunctionDeclaration, lines 479-607
- `startReplicaEngine > runCatchUp > CallExpression.then callback#1` — ArrowFunctionExpression, lines 508-515
- `startReplicaEngine > runCatchUp > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 516-518
- `startReplicaEngine > runCatchUp > CallExpression.then callback#1` — ArrowFunctionExpression, lines 526-532
- `startReplicaEngine > runCatchUp > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 533-535
- `startReplicaEngine > runCatchUp > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 542-544
- `startReplicaEngine > runCatchUp > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 554-556
- `startReplicaEngine > runCatchUp > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 565-567
- `startReplicaEngine > runCatchUp > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 570-572
- `startReplicaEngine > runCatchUp > CallExpression.then callback#1` — ArrowFunctionExpression, lines 606-606
- `startReplicaEngine > reject` — FunctionDeclaration, lines 610-633
- `startReplicaEngine > reject > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 620-622
- `startReplicaEngine > reject > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 630-632
- `startReplicaEngine > commandDone` — FunctionDeclaration, lines 638-646
- `startReplicaEngine > commandDone > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 643-645
- `startReplicaEngine > openFromToken` — FunctionDeclaration, lines 651-673
- `startReplicaEngine > openFromToken > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 667-670
- `startReplicaEngine > deliverOpen` — FunctionDeclaration, lines 677-687
- `startReplicaEngine > deliverOpen > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 684-686
- `startReplicaEngine > dropStaleOpen` — FunctionDeclaration, lines 689-693
- `startReplicaEngine > openTargetShown` — FunctionDeclaration, lines 696-700
- `startReplicaEngine > dropOpen` — FunctionDeclaration, lines 702-706
- `startReplicaEngine > followParty` — FunctionDeclaration, lines 709-715
- `startReplicaEngine > refreshTokenMenu` — FunctionDeclaration, lines 720-724
- `startReplicaEngine > followWindowSize` — FunctionDeclaration, lines 729-751
- `startReplicaEngine > followReplica` — FunctionDeclaration, lines 754-757
- `startReplicaEngine > followScene` — FunctionDeclaration, lines 761-774
- `startReplicaEngine > unlinkRemoved` — FunctionDeclaration, lines 776-796
- `startReplicaEngine > forgetPresent` — FunctionDeclaration, lines 799-805
- `startReplicaEngine > clearDeletedLinks` — FunctionDeclaration, lines 810-821
- `startReplicaEngine > persist` — FunctionDeclaration, lines 823-842
- `startReplicaEngine > liveContext` — FunctionDeclaration, lines 844-846
- `startReplicaEngine > isGmPlayer` — FunctionDeclaration, lines 850-855
- `startReplicaEngine > isGmPlayer > CallExpression.some callback#1` — ArrowFunctionExpression, lines 853-853
- `startReplicaEngine > dryContext` — FunctionDeclaration, lines 858-868
- `startReplicaEngine > dryContext > mint callback` — ArrowFunctionExpression, lines 861-864
- `startReplicaEngine > apply` — FunctionDeclaration, lines 894-913
- `startReplicaEngine > sendCommits` — FunctionDeclaration, lines 917-921
- `startReplicaEngine > notifyDenied` — FunctionDeclaration, lines 1558-1566
- `startReplicaEngine > notifyDenied > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 1563-1565
- `startReplicaEngine > gmInRoom` — FunctionDeclaration, lines 1745-1747
- `startReplicaEngine > gmInRoom > CallExpression.some callback#1` — ArrowFunctionExpression, lines 1746-1746
- `startReplicaEngine > presetOf` — FunctionDeclaration, lines 1750-1769
- `startReplicaEngine > mergePersisted` — FunctionDeclaration, lines 1965-1993
- `startReplicaEngine > enterCatchUp` — FunctionDeclaration, lines 1995-2003
- `startReplicaEngine > canWriteRoomCopy` — FunctionDeclaration, lines 2007-2009
- `startReplicaEngine > notifyDataReplaced` — FunctionDeclaration, lines 2067-2075
- `startReplicaEngine > notifyDataReplaced > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2072-2074
- `startReplicaEngine > performCaughtUp` — FunctionDeclaration, lines 2139-2184 (moved from the generation machine in the 2026-11-15 revision: it is the catch-up exit orchestration, replaying the command machine and notifying pending-edits, the publisher and the room copy)
- `startReplicaEngine > receiveRecords` — FunctionDeclaration, lines 2188-2225
- `startReplicaEngine > ownDigest` — FunctionDeclaration, lines 2227-2231
- `startReplicaEngine > rereadRole` — FunctionDeclaration, lines 2266-2285
- `startReplicaEngine > changeRole` — FunctionDeclaration, lines 2287-2336
- `startReplicaEngine > raiseNewerVersion` — FunctionDeclaration, lines 2338-2345
- `startReplicaEngine > MemberExpression.onMessage callback#2` — ArrowFunctionExpression, lines 2464-2470
- `startReplicaEngine > MemberExpression.onMessage callback#2` — ArrowFunctionExpression, lines 2472-2497
- `startReplicaEngine > MemberExpression.onChange callback#1` — ArrowFunctionExpression, lines 2499-2502
- `startReplicaEngine > MemberExpression.onRoleChange callback#1` — ArrowFunctionExpression, lines 2504-2506
- `startReplicaEngine > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2514-2516
- `startReplicaEngine > stop callback` — ArrowFunctionExpression, lines 2522-2542
- `startReplicaEngine > flushNow callback` — ArrowFunctionExpression, lines 2543-2553
- `startReplicaEngine > flushNow callback > CallExpression.catch callback#1` — ArrowFunctionExpression, lines 2546-2548
- `startReplicaEngine > catchUp callback` — ArrowFunctionExpression, lines 2554-2557
- `startReplicaEngine > pageHidden callback` — ArrowFunctionExpression, lines 2558-2560

## Complete `let` inventory

### Roll machine

- `roller: string` — lines 1645-1645; owner: **Roll machine** (qualified lexical owner: `startReplicaEngine > rollWithDice`)
- `evaluated: Result<EvaluatedRoll, RollOutcome>` — lines 1725-1725; owner: **Roll machine** (qualified lexical owner: `startReplicaEngine > rollWithDice`)

### Generation/adoption machine

- `persistence` — lines 251-251; owner: **Generation/adoption machine** (qualified lexical owner: `startReplicaEngine`)
- `ownGeneration` — lines 254-254; owner: **Generation/adoption machine** (qualified lexical owner: `startReplicaEngine`)
- `highestSeenGeneration` — lines 255-255; owner: **Generation/adoption machine** (qualified lexical owner: `startReplicaEngine`)
- `incoming` — lines 347-347; owner: **Generation/adoption machine** (qualified lexical owner: `startReplicaEngine`)
- `importing` — lines 350-350; owner: **Generation/adoption machine** (qualified lexical owner: `startReplicaEngine`)

### Command/pending machine

- `ids` — lines 875-875; owner: **Command/pending machine** (qualified lexical owner: `startReplicaEngine > pendingIdsOf > callback@874`)
- `complete` — lines 1046-1046; owner: **Command/pending machine** (qualified lexical owner: `startReplicaEngine > uploadPreset`)

### Room-protocol/proposal follow-up machine

- `roomMessages: Promise<void>` — lines 2462-2462; owner: **Room-protocol/proposal follow-up machine** (qualified lexical owner: `startReplicaEngine`)

### Retained wiring and existing module adapters

- `decodedPreset: DecodedPreset | null` — lines 235-235; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `sizedFor: string | null` — lines 239-239; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `role` — lines 250-250; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `stopped` — lines 257-257; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `catchUp: CatchUp` — lines 258-258; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `newerVersionSeen` — lines 287-287; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `sceneWatch: SceneWatch | null` — lines 319-319; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `heldOpen: OpenSheetRequest | null` — lines 332-332; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `heldOpenUntil` — lines 334-334; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `persistAllOnExit` — lines 337-337; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `roleReads` — lines 338-338; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `cachedDigest: number | null` — lines 344-344; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `roomCopy: RoomCopy` — lines 345-345; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `publisher: WindowPublisher` — lines 366-366; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine`)
- `winner` — lines 2200-2200; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine > receiveRecords`)
- `next: PlayerRole` — lines 2270-2270; owner: **Retained wiring and existing module adapters** (qualified lexical owner: `startReplicaEngine > rereadRole`)

## Cross-machine seams and invariants

- The engine owns no shared machine runtime. Existing `CatchUp`, `RoomCopy`, `pending-edits`, `dice-extension`, `window-publisher` and `party-roster` boundaries remain the seams.
- AD-5 stays one gate. The protocol/proposal machine calls `admitRoomMessage` once before dispatch; command and roll machines do not re-check sender admission.
- AD-7/AD-9 ordering stays explicit. Local import/wipe saves the new generation, replaces the replica, writes the room copy with `writeImport`, and then sends `reset`. Remote adoption saves the staged generation, replaces the replica, and calls `roomCopy.replaced`; it does not call `writeImport` or send `reset`. The synchronous save result `false` leaves adoption open. CatchUp remains the owner of catch-up/liveness decisions.
- AD-4 stays in `pending-edits` and `core/access`. The command machine routes the result; the protocol/proposal machine validates admitted proposals and sends the resulting commit/reject. Retained `changeRole` hands the re-read store to the generation module through `roleChanged`, and `runCatchUp` calls its `saveAdoption`, `stage` and `clearStaged`; nothing outside the module writes generation-owned state.
- The command reducer resumes from actual apply results and the updated replica before the next preset batch or replayed command step; failures stop the correct batch. `clearDeletedLinks` keeps its scene eligibility guard in retained wiring, while its `link-clear` submission enters the command module.
- AD-13 stays event-only. The roll machine never writes records, storage or snapshots.
- The decoded-preset cache is one shared wiring helper. Extraction tasks receive it as an injected resolver instead of creating a second cache.

## Retained wiring inventory

The retained-wiring section above is the explicit disposition for every callback and function that is not assigned to one of the four extraction tasks. In particular, it covers timer interpretation (`catchUpTimerKey`, `armCatchUpTimer`, `disarmCatchUpTimer`, `runCatchUp`), command/window replies (`reject`, `commandDone`, `apply`, `sendCommits`), open requests, token menu and scene watch, record/persistence helpers, role changes, publisher/room-copy adapters, the outer `onMessage` subscription forwarding callback at lines 2464-2470, and stop/flush/page lifecycle callbacks. `clearDeletedLinks` keeps the scene eligibility guard in this wiring; its `link-clear` command enters the command module. `performCaughtUp` stays wiring too: it reads the generation module's `persistence()` and otherwise composes the command replay, pending-edits, publisher and room-copy calls. These are wiring by intent, not omitted symbols.

## Confirmation record

- Map status: **confirmed by owner on 2026-11-15**.
- Owner decision: **«Подтвердить карту»**.
- Evidence: the owner read the doc-4 link, the 160-function/26-let inventory, all four shapes, the roll injected-port versus pure tradeoff, and extraction order TASK-64.5 → TASK-64.6 → TASK-64.7 → TASK-64.9.
- Confirmation effect: TASK-64.5 may start after the caller's review; no production extraction was performed in TASK-64.4.
