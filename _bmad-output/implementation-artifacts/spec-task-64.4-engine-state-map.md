---
title: 'TASK-64.4: Map the engine state machines and choose their decision shape'
type: 'feature'
created: '2026-11-15'
status: 'done'
route: 'dispatch'
baseline_commit: '33804c44065fc760f652d4fb2bb5a5248bc8708d'
review_loop_iteration: 0
context: ['GLOSSARY.md', 'docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md', '_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/replica/engine.ts` is 2681 lines, while `startReplicaEngine` spans lines 210-2562. Roll, generation, command, catch-up, proposal, room-message and UI-wiring concerns cross the same closure, so extraction order and ownership are not yet safe.

**Approach:** Produce an exhaustive, disjoint map of the closure's functions and mutable locals, choose one of the three permitted decision shapes for each machine, and, after this spec is approved, draft the final map and update TASK-64 extraction work. Actual owner confirmation of the map remains a separate gate before the first code extraction. The spike changes no production or test code and does not introduce a shared state-machine runtime.

## Boundaries & Constraints

**Always:** Preserve AD-1 through AD-14, the finished TASK-63.2 `RoomCopy` and TASK-63.3 `CatchUp` interfaces, and ADR-0002's pure transitions with effectful callers. The final map names state ownership, effects, cross-machine seams, every function and every `let`, exact extraction order, and an independent AST inventory control.

**Never:** Extract code, add source-shape tests, change runtime interfaces, or infer owner confirmation from this request. The full-check applicability exception remains an owner decision; this documentary spike does not claim runtime proof.

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts:210-2562` -- source of truth. Preliminary lexical controls are evidence only, not the final inventory. Final scope includes every named function declaration, function expression and arrow callback lexically inside the closure, plus every `let`/destructured `let` local, with qualified owner paths and line spans; an independent compiler-AST control reconciles that scope. The working partition is roll (`handleRollRequest`, `prepareRoll`, `rollWithDice`, `gmInRoom`, `presetOf`, `sendRoll`, `replyRoll`, `receiveRoll`); generation/adoption (`handleSnapshotCheck`, `planImport`, `importFromSnapshot`, `wipeRoom`, `replaceGeneration`, `importSuperseded`, `saveGeneration`, `replaceReplica`, `adoptFromCopy`, `seeGeneration`, `dropPendingWork`, `stage`, `saveAdoptionData`, `notifyDataReplaced`); command/pending (`handleCommand`, `runCommand`, `handlePresetDiff`, `uploadPreset`, `handlePlayerCommand`, `queueIntent`, `pendingView`, `composedEntry`, `pendingViewRecords`, `replayPending`, `pendingIdsOf`); all other declarations are named as retained wiring or assigned a follow-up task in the final map.
- `src/replica/catch-up.ts`, `src/replica/room-copy.ts`, `src/replica/pending-edits.ts`, `src/replica/dice-extension.ts` -- existing shape evidence. Reuse their boundaries; do not add a runtime shared by machines.
- `docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md` -- reducer precedent: pure transitions and effectful component caller.
- `backlog/tasks/task-64.5`, `task-64.6`, `task-64.7` -- extraction work to re-scope after spec approval. Working hypotheses are: roll uses injected ports/callbacks for its linear async pipeline; generation uses catch-up-style decisions; command routing uses ADR-0002-style reducer decisions. The final map may confirm or revise each hypothesis, and must explicitly justify each choice and identify wiring that remains in `engine.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `backlog/docs` -- after spec approval, create the draft engine-state map with disjoint ownership of the complete qualified function/callback/local inventory, state/effects, shape rationale, seams and wiring inventory.
- [x] `backlog/tasks/TASK-64.5..64.7` -- after spec approval, draft the reorder, re-scope or additions required by the map; keep code extraction behind actual owner confirmation of the map.
- [x] temporary run controls -- run an independent compiler-AST inventory and reconcile names, locals, callbacks and ownership; keep controls outside the repository.

**Acceptance Criteria:**
- Given the current engine source, when the final map is reconciled with an independent AST inventory, then every nested function and `let` has exactly one owner or is explicitly named wiring.
- Given the three candidate shapes and existing modules, when the map is reviewed, then each machine has one chosen shape and a code-grounded reason without a shared runtime.
- Given the map and its draft task updates, when TASK-64 extraction tasks are read, then their order, scope, dependencies and descriptions cover every mapped machine and every non-wiring function.
- Given the map is ready, when the owner confirms it, then that actual decision is recorded before TASK-64.5 starts.

## Implementation Notes

Planning only. No production or test code is in scope. The current inventory is preliminary lexical evidence; the final map must pass an independent AST reconciliation over qualified nested declarations, callbacks and locals. Approval of this spec permits drafting the final map and updating or adding extraction-task descriptions. Actual owner confirmation of the map is required before code extraction. The owner accepted documentary validation without full runtime checks for this metadata-only turn.

- 2026-11-15: Owner approved this SPEC with documentary validation and accepted the metadata-only exception for full runtime checks. This approves the planning spec, not the engine-state MAP; map confirmation remains required before code extraction.
- 2026-11-15: The checkout already resolves `oxc-parser` and `@babel/parser` through `import.meta.resolve`; compiler-AST reconciliation may use the installed TypeScript-capable parsers without installing dependencies. The confirmed OXC parser entry is `/Users/seigiard/.bun/install/cache/oxc-parser@0.158.0@@@1/src-js/index.js`.
- 2026-11-15: Temporary inventory controls belong under `/Users/seigiard/.claude/artifacts/tdd-20261115-073056/TASK-64.4`.

- 2026-11-15: Owner explicitly answered “Подтвердить карту” after reading the doc-4 link, the 160-function/26-let inventory, all four shapes, the roll injected-port versus pure tradeoff, and extraction order TASK-64.5 → TASK-64.6 → TASK-64.7 → TASK-64.9. This confirms the map separately from planning-spec approval. The frozen-after-approval block is unchanged, and no production extraction started.

## Review Triage Log

Source: `/Users/seigiard/.claude/artifacts/tdd-20261115-073056/TASK-64.4/review-1.md`. All eight findings were independently verified against the cited source ranges and accepted as source-grounded documentary patches. No frozen intent, runtime interface or module shape changed.

| ID | Verdict | Individually verified evidence and patch |
| --- | --- | --- |
| R1 | Accepted; medium / major | `catch-up.ts:76,320-350` calls `saveAdoption(): boolean` synchronously and retains adoption on `false`; `engine.ts:2099-2136` saves/replaces before return. The map and TASK-64.6 now specify the synchronous decision/effect/result bridge; `false` keeps adoption open, with no Promise substitution or CatchUp interface change. |
| R2 | Accepted; medium / major | `engine.ts:587-602` resets `incoming`, and `engine.ts:2287-2335` clears persistence and promotes generation in `changeRole`. The map and TASK-64.6 now name `roleChanged`, `persistence-loaded` and `adoption-started` events; retained `changeRole`/`runCatchUp` forward events instead of mutating generation-owned state directly. |
| R3 | Accepted; medium / major | `engine.ts:1048-1061` stops preset batches by actual apply length, and `engine.ts:1918-1961` composes replay against the replica changed by preceding apply. The map and TASK-64.7 now require stepwise decisions resumed from actual applied records, updated replica and write-failure results; failures stop the correct batch and future effects are not precomputed. |
| R4 | Accepted; medium / major | `engine.ts:810-820` checks stopped/role/live/import before submitting a scene link-clear. The map and TASK-64.7 explicitly exempt this retained `clearDeletedLinks` eligibility guard from command-routing AC while its `link-clear` submission enters the extracted command module; scene ownership stays wiring. |
| R5 | Accepted; medium / major | `engine.ts:2461-2470` defines the serialized chain. The map inventory and TASK-64.9 now assign `roomMessages` plus nested `.then` lines 2466 and `.catch` lines 2467-2469 to the protocol module; only the outer subscription forwarding callback at lines 2464-2470 remains engine wiring. |
| R6 | Accepted; low / minor | The existing sender lookup, arrival-order chain and AD-5 gate in `engine.ts:2348-2562` provide the contracts. TASK-64.9 now requires independent module tests for sender-lookup arrival order, error continuation and admission rejects without handler effects; no tests are authored in this spike. |
| R7 | Accepted; high / major | `engine.ts:1236-1315` performs local import/wipe save → replace → `writeImport` → `reset`; `engine.ts:2099-2136` performs remote adoption save → replace → `roomCopy.replaced`, with no `writeImport` or `reset`. The map and TASK-64.6 now separate these sequences. |
| R8 | Accepted; medium / major | `engine.ts:1665-1685,1701-1708,1773-1812` reads live stopped/role and constructs the message from current generation. The map and TASK-64.5 now specify live getters at the existing readiness, dice-wait, pre-send, message-construction and reported-send recheck points; hidden remains computed once and no new guards are added. |

Review route: documentation-only patch; no new design decision, runtime change or test is warranted.

### Validation corrections after review round 1

- D8 accepted and fixed: doc-4 and TASK-64.6 now make the engine-side synchronous bridge explicit. It requests pure generation decisions, executes storage/replacement effects synchronously, feeds actual success/failure results back into pure generation state, and returns the boolean result to the existing CatchUp callback; `false` keeps adoption open. The core remains pure and no Promise is substituted.
- D9 accepted and fixed: the original AD-13 invariant is restored verbatim in doc-4: `- AD-13 stays event-only. The roll machine never writes records, storage or snapshots.`
- D10 accepted and fixed: TASK-64.9 AC6 still requires independent module tests and now states that TASK-64.4 authors no tests.

### Confirming review

The fresh prose review read the cumulative documentation scope after the patches and returned no findings or open questions. The two initial BMAD edge/verification lenses also returned no findings. All eight blind-hunter findings and the validation corrections are resolved; nothing is deferred. Inventory coverage remains 160 functions and 26 `let` bindings with no duplicate ownership rows. No production or test code changed, and runtime suites were not run under the owner's documentary-validation exception.

## Verification

**Commands:**
- `backlog task view TASK-64.4 --plain` -- expected: dependencies and current planning status are visible.
- independent compiler-AST inventory control -- expected: exact function/local/callback set reconciles with the approved map; no permanent source-shape test.
- `git status --short` and `git rev-parse HEAD` -- expected: only approved documentation/backlog changes and a canonical full SHA.

**Manual checks (if no CLI):**
- Read the map and verify disjoint ownership, all cross-machine effects, extraction order, and the separately recorded owner confirmation before extraction. Do not treat planning validation as runtime proof.
