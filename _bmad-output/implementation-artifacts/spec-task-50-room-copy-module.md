---
title: 'TASK-50: move the room copy write loop out of the replica engine'
type: 'refactor'
created: '2026-11-12'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a514082e5e368ecd813b01d6bb773019ea8f236d'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The AD-8 write loop and the AD-9 import and wipe writes live in `startReplicaEngine` (`src/replica/engine.ts`): 12 `roomCopy*` variables and `pageChanges`, about 460 lines, read and set from 15 engine sites (catch-up exit, role change, adoption save, stop, page hooks, notices, projection, delta, metadata watch, import). Its invariants (one write at a time, owed until a verified write, a page change stops a write, an import waits for the write in flight) are kept by hand at each site: `writeImportCopy` repeats the queue of `writeRoomCopy`. Every test runs full engines, and the mutation probe at the baseline shows rules that no unit test kills (Design Notes).

**Approach:** Add `src/replica/room-copy.ts`, a module over the metadata port that owns the room copy state, the write loop, the catch-up read and the import write. The engine injects what it owns (the AD-8 gate, the role, its generation and records, merge, adoption, the new-version notice, the change signal) and calls the module at each trigger. Behaviour does not change.

## Boundaries & Constraints

**Always:**
- Designed at `a514082`; phase 2 starts after TASK-49 merges and refreshes the Code Map lines. Before phase A, record the `bun test` junit list (file, classname, name, assertions) with the TASK-48 script `junit-list.py` in the scratchpad, and the e2e count.
- Phase A moves code and changes no test file. Its junit list equals the baseline, and every e2e test passes. Phase B adds `src/replica/room-copy.test.ts`. Phase C retires only engine tests that a module test now owns, each mapped in the notes.
- Calibrate each mutation in Verification at the baseline in `engine.ts` and after phase A in `room-copy.ts`: both fail the same tests. After phase B each one fails at least one `room-copy.test.ts` test.
- The order of effects stays: the outcome is set before a merged copy's records reach the windows; a copy of a higher generation is adopted, never written over; the read-back alone decides "saved"; the gate is checked again after every await.
- Module tests use the mock adapter's metadata port (`createMockPlatform(...).metadata` over `createMemoryRoom`, from `@/platform/current`), which drops a write past 16 kB as Owlbear does, wrapped by a test gate for faults: held reads or writes, rejected calls, dropped writes.
- Follow the CLAUDE.md test rules and `~/.claude/shared/testing.md`.

**Never:**
- No change to the room copy format, room traffic, records, storage, `src/core/`, `src/ui/`, `src/platform/`, `catch-up.ts` or e2e tests.
- No call to `setTimeout`, `Math.random`, `catchUp` or the engine's variables inside `room-copy.ts`. No full engine, no `room-rig` and no real-time wait in `room-copy.test.ts`.
- The adoption data (`adoptFromCopy`, `stage`, `saveAdoptionData`), `receiveRecords`, `replaceGeneration` and `importSuperseded` stay in the engine.

## I/O & Edge-Case Matrix

Each row is a group of tests in `room-copy.test.ts`. "Saved", "failed" and "none" are `status().state`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pause | `edited()` by a GM | arms `pauseMs + random * jitterMs`; a second call arms again, one write | not GM: arms nothing |
| Write | writable, copy of own generation | `receive(copy records)`, then one write of every record sorted with the generation; read-back holds: saved, sizes from the read-back, notice off | N/A |
| Lower copy | copy of a lower generation | not received; written over | N/A |
| Higher copy | at the read, or at the read-back | `adopt(copy)`, no write, not failed | N/A |
| Unreadable | invalid / newer build / older format | GM: failed / `newerVersion()` and failed / older-format notice, not failed; no write | not GM: sizes only |
| Size | encoded copy plus all metadata over 15500 bytes | no write, failed, previous copy stays | N/A |
| Port faults | read rejects / write rejects / read-back rejects / write dropped | failed, write owed; the next verified write clears the notice | N/A |
| Page change | `pageReturned()` or `pageHidden()` while the read is held | that write stops; `pageHidden()` writes on its own | N/A |
| Gate | not writable at a trigger | nothing written, owed; `caughtUp(false)` arms only when owed, `caughtUp(true)` always | gate closes during the write or the read-back: no status change, owed |
| One at a time | a trigger during a write | exactly one more write after it; never two writes in flight | N/A |
| Import | `writeImport(g, superseded)` | waits for a write in flight; verified: saved, owed off; writes over a lower, invalid or older-format copy | newer build: `newerVersion()`, failed, copy stays; higher: `adopt`, no write; over limit or failed read-back: failed, a lower readable copy removed, an equal, higher or unreadable one stays; `superseded()` true: no status change |
| Import rerun | a trigger during the import write | one write after it | N/A |
| Catch-up read | `read()` | outcome `none` / `read` (records received after the outcome) / `unreadable` (other generation) / `older` / `newer`; higher: `adopt`, then `read` when it completed | the read rejects: `unreadable` unless an outcome is known |
| Watch | `followed(metadata)` | sizes update; own generation: saved, not merged; higher: `adopt` | N/A |
| Role and stop | `demoted()` / `stop()` | timer, owed and notice cleared / nothing written, merged or adopted after, even from a read in flight | N/A |
| Change signal | any call | `changed()` once when `status()` or `notices()` changed | no change: no call |

</frozen-after-approval>

## Code Map

Line numbers are at `a514082`.

- `src/replica/engine.ts` -- to move: variables 386-408 (`roomCopyNotSaved` to `roomCopyRun`, with `pageChanges`); `writeImportCopy`, `importCopyVerified`, `adoptedHigherCopy`, `removeLowerCopy` 1618-1758; `mergeRoomCopy`, `mergeReadRoomCopy`, `scheduleRoomCopy`, `writeRoomCopy`, `runRoomCopyWrite`, `verifyRoomCopyWrite` 2395-2615; `unreadableRoomCopy`, `failRoomCopy`, `followMetadata`, `noteRoomCopy`, `emitRoomCopyChange`, `roomCopySignature`, `roomCopyStatus` 2746-2820; module-scope `outcomeOf` 3322.
- `src/replica/engine.ts` -- call sites that become one module call: `currentNotices` 446, the `read-room-copy` decision 535-549, projection 709 and delta 829 (`status()`), the five `scheduleRoomCopy()` after applied edits (1206, 1284, 1828, 1877, commit 3117), `replaceGeneration` 1501, `saveAdoptionData` 2739 (`replaced(fromCopy)`), `performCaughtUp` 2877 (`caughtUp(applied)`), `rereadRole` 3006-3008 (`demoted()`), `onMetadataChange` 3220, `stop` 3222, `catchUp` 3249, `pageHidden` 3256.
- `src/replica/engine.ts` -- stays: `canWriteRoomCopy` 2472 (becomes the `writable` option), `adoptFromCopy`, `receiveRecords`, `raiseNewerVersion` 3038, `importSuperseded`. `readMetadata` 3301 moves: the engine reads no metadata after the change.
- `src/core/snapshot.ts` -- `encodeSnapshot`, `readSnapshot`, `roomMetadataBytes`, `roomCopyUsage`, `readBackHolds`, `ROOM_METADATA_BYTE_LIMIT`, `SNAPSHOT_KEY`. Unchanged.
- `src/platform/mock/room.ts` -- `createMemoryRoom`: the metadata adapter for module tests. `src/platform/ports.ts` -- `MetadataPort`.
- `src/replica/catch-up.ts`, `src/replica/pending-edits.ts` -- the precedent: injected queries, small results.
- Tests that stay as evidence: `engine-room-copy.test.ts` (37 tests, 2.96 s), `engine-import.test.ts` (34, 1.72 s), `engine-wipe.test.ts` (8, 0.22 s), `tests/room-copy.e2e.ts`, `tests/snapshot.e2e.ts`, `tests/wipe.e2e.ts`, `tests/no-gm.e2e.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] Baseline -- after the merge of master with TASK-49: junit list, per-file wall time, e2e count, and mutations R1-R16 again (the design-pass probe ran at `a514082`).
- [ ] `src/replica/room-copy.ts` -- create the module per Design Notes from the moved code -- phase A.
- [ ] `src/replica/engine.ts` -- route every call site in the Code Map and delete the moved code -- phase A. Commit when the junit list equals the baseline.
- [ ] `src/replica/room-copy.test.ts` -- one test per matrix row and per error case, over `createMemoryRoom` and a fault gate -- phase B.
- [ ] `src/replica/engine-room-copy.test.ts`, `src/replica/engine-import.test.ts` -- retire only the tests whose whole assertion a module test now owns; in the notes map each to its owner -- phase C.
- [ ] Spine -- the structural seed names `room copy` in place of `snapshot writer`, and AD-8 names `src/replica/room-copy` as the owner of the write loop. Its own commit.

**Acceptance Criteria:**
- Given phase A, when `bun test` runs, then its junit list equals the baseline.
- Given the branch, when `rg -n "roomCopyOwed|roomCopyRerun|roomCopyWriting|roomCopyRun|roomCopyTimer|pageChanges|setMetadata|getMetadata" src/replica/engine.ts` runs, then nothing matches.
- Given `room-copy.test.ts`, when it runs, then no test starts an engine, imports `room-rig` or waits on real time.

## Design Notes

**Cut line.** The module owns the state that only room copy rules read: not saved, exists, sizes, outcome, older format, owed, timer, writing, rerun, page changes, the run in flight. It owns every metadata read and write. The engine keeps what other rules share: the gate, the role, the replica and generation, adoption, persistence and the notices that are not the room copy's. TASK-48 made the gate one query (`catchUp.live()`), so the module needs no adoption state. Rejected cuts:
- Only the write loop moves, the status stays. Every outcome of the loop sets the status, so the interface would grow `fail` and `note` callbacks back into the engine.
- The import write stays. It shares the one-at-a-time queue with the loop; split, `writeImportCopy` keeps its hand-made wait.

**Interface** (names may change; capabilities may not be dropped):

```ts
createRoomCopy(options: {
  metadata: Pick<MetadataPort, 'getMetadata' | 'setMetadata'>;
  timing: Pick<Timing, 'snapshotPauseMs' | 'snapshotJitterMs'>; random(): number;
  schedule(delayMs: number, run: () => void): () => void; // returns cancel
  writable(): boolean;  // !stopped && GM && persistence && catchUp.live()
  gm(): boolean; generation(): Generation; records(): readonly VersionedRecord[];
  receive(records): void; adopt(copy: Snapshot): void; newerVersion(): void; changed(): void;
}) => {
  edited(); pageHidden(); pageReturned(); caughtUp(applied: boolean);
  read(): Promise<void>; followed(metadata); replaced(fromCopy: boolean); demoted(); stop();
  writeImport(generation, superseded: () => boolean): Promise<void>;
  status(): RoomCopyStatus; notices(): Notice[];
}
```

- `adopt` may finish an adoption at once and change `generation()`. `read` asks `generation()` again after it.
- `changed()` compares the module's own `[status(), notices()]`. Today the signature also holds the engine's notices; a delta that only repeated an identical state may go. Phase A records any such test, and nothing else may differ.
- The engine's `changed` sends `emitDelta([])` when a projection was sent.

**Why it pays (design pass, AC #1).** The interface is 25 names, each a one-line call with one ordering fact (`adopt` may change `generation()`). Behind it sit about 300 code lines (463 with comments), 16 matrix rows and 15 engine sites. The width TASK-50 feared came from `adoptTarget` and the catch-up state; TASK-48 reduced them to `writable()`. The mutation probe at the baseline (`bun test src/replica`, 822 tests; the probe ran no e2e test, and no e2e test name covers these rules) shows the gap. R1, R2, R9, R12, R13 and R16 fail 1-2 tests each. R3, R4, R5, R6, R7, R8, R10, R11, R14 and R15 fail none. R3 (an older-generation write lands after the import copy) and R15 (an import that a higher copy replaced still counts as saved) break AD-9. R5 is near-equivalent: `writeRoomCopy` sets owed before the write.

**TASK-49 overlap.** TASK-49 replaces `emitDelta([])` with one change signal and one publisher. Here that touches `emitRoomCopyChange`, `roomCopySignature`, the `projectionSent` check, `roomCopyStatus()` in the projection and delta, and `currentNotices`. After TASK-49 merges, refresh this spec: `changed` maps to its signal, and the module keeps its own comparison only if the publisher does not diff. The `emitDelta([])` calls in `replaceGeneration` stay in the engine.

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=<scratch>/after.xml` -- phase A: equal to the baseline; after phase C: only the named retirements and the new tests differ.
- Mutations, one at a time, reverted (script `/private/tmp/claude-501/-Users-seigiard-Projects-owlbear-muster-roll-prototypes-owlbear-probe/cb274a81-7b80-4b9c-8a25-e8e948de01b1/scratchpad/task50-mutate.py`, baseline results `task50-mutations.txt` beside it; after phase A, rewrite its patterns for `room-copy.ts`): R1 a trigger during a write is lost; R2 a page change does not stop a write; R3 the import does not wait for a write in flight; R4 the gate is not checked after the write; R5 a failure leaves nothing owed; R6 a higher read-back counts as a failure; R7 a failed read is silent; R8 the import removes a copy of its own generation; R9 the import writes over a newer build's copy; R10 a trigger during the import write is lost; R11 a verified import leaves the write owed; R12 catch-up's end ignores an owed write; R13 a demotion keeps the owed write and notice; R14 the import read-back accepts any copy; R15 the import does not adopt a higher read-back; R16 a failed import copy shows no notice.
- Wall time of the three engine test files, before and after.
- Full check: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.

## Implementation Notes

## Spec Change Log

## Review Triage Log
