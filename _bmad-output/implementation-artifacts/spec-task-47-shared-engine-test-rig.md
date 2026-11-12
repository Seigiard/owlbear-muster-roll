---
title: 'TASK-47: share one room test rig across the engine tests'
type: 'refactor'
created: '2026-11-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '999c006d927d4aab7714bea115f130cefa8ac274'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Each of the 18 `src/replica/engine-*.test.ts` files wires the mock platform, the LOCAL bus, the send queues, the engine, the projection store and the window client by hand, repeats a full `Timing` literal, and seeds or reads storage through raw `mr2:{room}:{n}:{a}:{k}` keys, so the AD-11 key format is known to every file. The coming refactoring tasks (TASK-45, 46, 48, 49, 50) need one rig to move tests onto smaller surfaces.

**Approach:** Add one test-support module, `src/replica/room-rig.ts`, that builds a room with GM and player clients on the mock adapter, owns the default test timing and the AD-11 key format, and gives the shared helpers. Move every engine test file onto it. Test bodies keep their assertions; only the wiring under them changes.

## Boundaries & Constraints

**Always:**
- Every test that passed before passes after, with the same name, the same `expect` calls and the same expected values. The baseline is 658 tests and 662 assertions across the 18 files (per-test list in Verification).
- A red test after a move is a defect report: find out why the rig differs from the old wiring and fix the rig or the call. Never delete, skip, loosen or narrow a test to get green.
- The only test-body edits allowed: a call renamed to a rig helper, a raw storage key replaced by `storageKey(...)` (which builds the same string), a local helper replaced by the rig's, and seeding moved from raw keys to records. Any other edit to a test body is reported in Implementation Notes with the reason.
- The rig writes the AD-11 format as its own literal (`mr{format}:{roomId}:{n}:{a}:{key}`). It must not call `buildStorageKey` or other `src/core/storage-key.ts` code: the tests must stay an independent check of the format the engine writes.
- Follow CLAUDE.md test rules (`#given` / `#when` / `#then`, `bun:test`), the oxlint rules (incl. anti-slop) and the TypeScript rules (no `any`, named exports, explicit return types on exports).

**Never:**
- No change to production code under `src/`, except exporting the existing `createMemoryBacking` from `src/platform/mock/index.ts`.
- No fake clock, no change to how long tests wait, no new tests, no merged or split tests.
- Do not touch `src/core/preset.ts`, `src/core/formula.ts`, `docs/`, sheet cells or non-engine test files (`replica-client.test.ts`, `link-picker.test.tsx`, `commit-outbox.test.ts`, e2e): another lane edits nearby.

</frozen-after-approval>

## Code Map

- `src/replica/engine-*.test.ts` (18 files) -- each defines its own `startClient`/`openRoom`/`joinAs`/`createBacking`/`waitUntil`/`pause`/`send`/`shown`/`stored`, a `TIMING` literal and `STORAGE_PREFIX`. `engine-client` uses `createRig`/`startEngine`/`openWindow` (one client, engine started after seeding, several windows); `engine-open` uses `startBackground`/`startGmPeer`/`openWindow` (window opened later); `engine-sync` uses `createMemoryRoom` + `listen`.
- `src/replica/engine.ts:199` -- `ReplicaEngineOptions` (`timing`, `newId`, `newRecordId`, `random`, `diceTiming`, `rollCopy`, `menuCopy`, `editDenied`, `dataReplaced`); `startReplicaEngine(platform, sendQueue, options)`.
- `src/platform/mock/index.ts` -- `createMockPlatform(bus, backing, client)`, `MockPlatform` fault hooks, private `createMemoryBacking` (export it), `MockStorageBacking`.
- `src/platform/mock/room.ts` -- `MockRoom`: `postRemote`, `onRemote`, `join`, metadata, `setScene`. The rig room observes and posts through these, with no observer platform.
- `src/platform/send-queue.ts` -- `createSendQueue(broadcast, timing, wait?)`.
- `src/ui/projection-store.ts`, `src/ui/replica-client.ts` -- the window side.
- `src/core/storage-key.ts` -- the production AD-11 code. Read it to know the format; do not import it into the rig.
- `tests/support/room.ts` -- the e2e analogue, for naming style only.

## Design Notes

Base timing (`RIG_TIMING`, keep the two explanatory comments) is the literal now in `engine-access`: `sendSpacingMs 0, rateLimitBackoffStartMs 1, rateLimitBackoffMaxMs 2, projectionRequestRepeatMs 25, projectionIncompleteTimeoutMs 80, fieldSavePauseMs 1, catchUpTimeoutMs 400, stateAnswerDelayMinMs 0, stateAnswerDelayMaxMs 0, gmLinkTimeoutMs 60000, snapshotPauseMs 60000, snapshotJitterMs 0, openRequestTtlMs 15000, proposeResendStartMs 2000, proposeResendMaxMs 30000, editDeniedQuietMs 2000, pendingMarkDelayMs 1000, presetRequestTimeoutMs 15000, incompleteRequestStartMs 2000, incompleteRequestMaxMs 30000, snapshotImportTimeoutMs 60000`. File deltas: catch-up `stateAnswerDelayMaxMs 5`; client `catchUpTimeoutMs 200`; dice, roll, sync `catchUpTimeoutMs 200, stateAnswerDelayMaxMs 5`; import, wipe `catchUpTimeoutMs 150, stateAnswerDelayMaxMs 5, incompleteRequestStartMs 60, incompleteRequestMaxMs 240`; liveness `catchUpTimeoutMs 150, stateAnswerDelayMaxMs 5`; no-gm `catchUpTimeoutMs 100, stateAnswerDelayMaxMs 5`; preset, propose `proposeResendStartMs 60000, proposeResendMaxMs 60000`; room-copy `stateAnswerDelayMaxMs 5`; window-size `catchUpTimeoutMs 150, proposeResendStartMs 60000, proposeResendMaxMs 60000`; access, duplicate, link, open, scene none.

Required shape of `src/replica/room-rig.ts` (names may be refined, capabilities may not be dropped):

```ts
const rig = createRoomRig({ timing: { catchUpTimeoutMs: 200 }, seeded: BASE, until: 'live',
  engine: { menuCopy: MENU_COPY } });          // file defaults; registers afterEach cleanup
const room = rig.openRoom();                    // { room: MockRoom, heard, events, post, join }
const gm = await rig.startClient(room, 'gm-a'); // engine + window, waits per `until`
const p = rig.createClient(room, 'p', { role: 'PLAYER', seeded: [] }); // not started
p.platform.failNextSends([...]); const page = p.newPage();
await p.startEngine(); const w = await p.openWindow();
expect(storedRecord(gm, 'sheet:brok', { n: 1, a: 'gm-a' })).toEqual(...);
expect(storedKeys(gm)).toEqual([storageKey('#generation', { n: 1, a: 'gm-a' })]);
```

- Timing: rig default, then file `timing`, then client `timing`, merged once; the merged value goes to the engine, the engine queue, the window client and the window queue. (No per-client override in today's tests touches a field the window reads; `engine-client`'s one window with a slower queue backoff uses a window `queueTiming` option.)
- Wait after start, today: `loaded` in access, catch-up, import, link, liveness, no-gm, room-copy, scene, wipe (with an `untilLive` opt-in); `live` in dice, roll, sync; `live` unless opted out in preset, propose, window-size; duplicate waits `live` only when the call sets no `catchUpTimeoutMs`. Keep each call's wait as it is.
- Window queue: the rig sends window commands through the window's own page platform. Most files today send them on the background page's broadcast. A fault set on the background (`failNextSends`, a `platform` wrapper) therefore no longer meets window sends. If a test turns red on that, report it rather than bending the rig.
- Client options: `role`, `name`, `playerId` (default: connection id), `seeded` records and `generation` they are stored under (default `{ n: 0, a: '' }`), `entries` (raw `{ key, value }` storage entries for corrupt records, other formats, other rooms, markers: keys come from `storageKey`), `backing` (reuse a storage for a reload), `timing`, `engine` options, `platform` wrapper for the engine's platform (party join stays on the unwrapped one), `sendWait` for the engine queue, `until: 'loaded' | 'live'`.
- Client exposes `connectionId`, `platform` (unwrapped background page), `backing`, `engine`, `store`, `window`, `local` (every UI-channel message on the client's bus since creation), `writes` (keys set after seeding), `newPage()` (another page of the same client: same bus, backing and identity), `openWindow(options)` returning `{ platform, store, window }` with its own page platform and queue, and `stop`.
- Room: observes SYNC as connection `observer` via `onRemote`; `heard` entries `{ from, data, at }`; `events` = each heard `t` plus `copy` on each metadata change; `post(from, data)` uses `postRemote`; `join(id, role, name?)`; optional scene at open.
- Helpers: `waitUntil(condition)` (2000 ms limit, 2 ms poll), `pause(ms)`, `send(client, command): string`, `shown`, `sync`, `rejection`, `heardOf(room, from, t)`, `requestsOf`, `lastRequest`, `storageKey(key, generation?, place?: { roomId?, format? })`, `storedRecord`, `storedKeys(client)` (sorted), `copyValue` and `roomCopyOf` for the room copy key. Keep file-specific builders (preset, records, wire messages with file defaults) local.

## Tasks & Acceptance

**Execution:**
- [x] `src/platform/mock/index.ts` -- export `createMemoryBacking` -- one storage implementation.
- [x] `src/replica/room-rig.ts` -- create the rig per Design Notes.
- [x] `src/replica/engine-*.test.ts` -- move each file onto the rig in slices of 3-5 files; after each slice run those files and compare with the baseline; commit each slice (`test: ...` subject in the repo's style).

**Acceptance Criteria:**
- Given the 18 engine test files, when searched, then none defines `createBacking`, `startReplicaEngine`, `startReplicaClient`, `createSendQueue`, `createProjectionStore` or `createMockPlatform` calls, and none holds a `Timing` literal or a `mr1:`/`mr2:` string.
- Given the baseline list, when `bun test src/replica/engine-` runs on the branch, then the same 658 test names pass with the same per-test assertion counts, and nothing is skipped.

## Implementation Notes

- Built through `implement` → `tdd` (checks-only path, no new tests) with four implementer turns in batch 1 and one in batch 2 (review fixes). Run directory: `~/.claude/artifacts/tdd-20261112-034131/task-47-shared-engine-test-rig/`; `ticket.md` there lists every rejected attempt (D1-D8) and its evidence.
- Deviation from Design Notes, wait limit: `waitUntil` is not a fixed 2000 ms everywhere. `engine-import`, `engine-liveness` and `engine-wipe` waited up to 3000 ms before the move, so `createRoomRig` takes `waitLimitMs` and those files use `roomRig.waitUntil`. The Boundaries rule "no change to how long tests wait" wins over the Design Notes value. The exported `waitUntil` keeps 2000 ms.
- Rig API additions over Design Notes: `cleanup(fn)` on the rig (registers a teardown that runs after each test, for listeners and fake extensions the files stopped before the move); `waitLimitMs` (above). `engine` options are typed without `timing`; timing comes only from the `timing` options.
- Cleanup: the rig registers its `afterEach` per `createRoomRig` call. A hook at module scope of a shared module runs only in the first test file that loads it, which leaked engines into later files. The hook also calls `mock.restore()`, because leaked `console.error` spies carried call counts into later files under plain `bun test`.
- Test-body edits outside the allowed kinds: `engine-room-copy` "merges the copy … second request" captures storage inside an `onRemote` listener, as before, through `roomRig.cleanup`. No test changed name, assertion or expected value.
- Commits: the per-slice commits were reorganized into two slices at the end (`implement` step 6): the rig with the mock export, then the 18 files.
- No-weakening controls: junit list of the 18 files equals the base (658 tests, 662 assertions, same per-test counts); per-file effective timing and wait limit equal the base; mutations of the storage key format (458 killed), a 20x catch-up timeout and a silent denied proposal (9 killed) kill the same tests per file at the base and after. A mutation of the room copy write guard survives at both (deferred).
- `bun test` wall time: 58.9 s before, 58.6 s after; the 18 engine files: 55.9 s before, 55.7 s after.

## Review Triage Log

- Active layer: `code-review-carryover` only (blind-hunter, edge-case-hunter, verification-gap are off). Code-review rounds 01-initial (mixed-terra, 9/9 sources, 3 major + 9 minor, all fixed in batch 2) and 02-after-fix (final, 2/2 sources, no findings). Carry-over: no open decision, no unresolved critical or major, no finding deferred by code-review, no criterion corrected by code-review. Empty list.

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=/tmp/after.xml src/replica/engine- && python3 <scratchpad>/junit.py /tmp/after.xml > /tmp/after.txt && diff <scratchpad>/baseline.txt /tmp/after.txt` -- expected: no diff. `<scratchpad>` = `/private/tmp/claude-501/-Users-seigiard-Projects-owlbear-muster-roll-prototypes-owlbear-probe/cb274a81-7b80-4b9c-8a25-e8e948de01b1/scratchpad`.
- `rg -n "mr[12]:|createBacking|startReplicaEngine|startReplicaClient|createSendQueue|Timing = \{" src/replica/engine-*.test.ts` -- expected: no match.
- Full check from CLAUDE.md: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test` -- expected: all pass. (The parent runs `test:browser` and `build`.)
