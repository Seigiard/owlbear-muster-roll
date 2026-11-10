---
title: '2.2 Catch Up on Join and on Return'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'c0fb7c11e2e38eba31c922dcc24e16bbdbe2d3cf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-see-edits-from-other-gm-tabs-live.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client that joins, or comes back after sleep or a network gap, sees only the commits sent while it listened, so its sheets stay incomplete. Backlog task: TASK-15, whose eight acceptance criteria apply in full.

**Approach:** Add the AD-7 catch-up to `replica`: a `catching-up` state with its entry triggers, `state-request` and `state` on the room channel, the exit rules, and a pending queue for GM intents made meanwhile. Carry the state to windows, which show "Загрузка…" until the first catch-up ends and disable preset upload and download during any catch-up.

## Boundaries & Constraints

**Always:** Catch-up is full state, never a diff. `state-request` and `state` go through the 2.1 gate, schemas in `core`, the shared send queue and the size splitter. Every `state` message merges whenever it arrives, in any state. No code elects or waits for a specific GM client; the answer delay is random. New timeouts and delays go into `TIMING` and are injectable. Inputs stay enabled during catch-up.

**Never:** `ping`, `alive`, digest, `gmLink` (2.4); the room copy (2.5; leave a clear hook where its merge goes); player sheet views (2.3); full AD-9 adoption for a client that holds persisted data of a lower generation (Epic 5); `propose`, `reject`, `reset`, `roll`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start | Any client starts | Enters `catching-up`; a GM merges its persisted records of the current generation first; broadcasts `state-request { r }` | N/A |
| Re-entry triggers | Page visible, `resume`, `online` while live | Enters `catching-up` with a new `r` | N/A |
| Re-entry while catching up | Same triggers while `catching-up` | Keeps `r`; no new request unless the old one is unanswered and a new broadcast is needed | N/A |
| Role change or higher generation | While catching up or live | New `r`; partial answers discarded | N/A |
| Answer | GM client, live, gets `state-request` | After a random delay in `[stateAnswerDelayMinMs, stateAnswerDelayMaxMs]`, sends `state { r, i, n, records }` messages, each under the limit, records deflated | N/A |
| Answer suppressed | GM client saw another `state` for that `r` before its delay ends | Sends nothing | N/A |
| Not answering | GM client in `catching-up` gets `state-request` | Sends nothing | N/A |
| Exit, complete | Holds all `n` of one responder for its own `r` | Leaves `catching-up` | N/A |
| Exit, partial | Holds some messages only | Merges them; stays until complete or timeout | N/A |
| Exit, timeout | No complete answer within `catchUpTimeoutMs` | Leaves `catching-up` | N/A |
| Alone GM | Confirmed party read shows no other GM connection | Merges persisted records, leaves at once, no timeout wait | Party read fails: wait for answers or timeout |
| Late `state` | `state` for an old `r`, or while live | Merged | N/A |
| Pending edit | GM edits during `catching-up` | Shows at once with no mark; waits; takes `c` on exit; no commit before exit | N/A |
| Pending combine | Two field patches of one record key | One pending entry; both fields apply | N/A |
| Pending order | Create, rename, patch, row add during catch-up | Replay on exit in arrival order | A replay refusal sends a rejection with the original command id |
| Pending create | "+" or "Добавить NPC" during catch-up | Sheet shows at once and its name has focus | N/A |
| Window, first catch-up | Not ended | Tab bar from known data and "Загрузка…"; never an empty or no-preset state; role read before data | N/A |
| Window, no preset | First catch-up ended, no preset | Story 1.5 no-preset state | N/A |
| Player | Catch-up ended | Stays on "Загрузка…" until 2.3 | N/A |
| Settings during catch-up | GM, `catching-up` | Upload buttons and "Скачать пресет" disabled, showing "Загрузка…" | `replica` refuses `preset-upload` as `catching-up` |
| Role becomes GM | Player promoted | Catch-up runs; on exit all held records persist under the current generation | Write failure: existing `local-save-failed` |
| Player and generation | Player at the initial generation gets `state` for its `r` with a higher `g` | Adopts that generation and merges; it holds no persisted data | N/A |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts`, `src/replica/commit-outbox.ts`, `src/replica/party-roster.ts`, `src/replica/background-main.ts` -- engine, commits, sender lookup, page lifecycle hooks.
- `src/core/room-messages.ts` -- envelope, gate table; add `state-request` and `state` schemas.
- `src/core/message-size.ts`, `src/core/preset.ts` (deflate and base64 helpers to reuse or move) -- splitting and encoding.
- `src/core/ui-messages.ts`, `src/ui/projection-store.ts` -- projection and delta shapes; add the sync state and pending view.
- `src/ui/main.tsx`, `src/ui/preset-actions.tsx`, `src/ui/settings/*` -- loading state, Story 1.5 gate, upload and download controls.
- `src/core/timing.ts` -- new constants.
- `src/platform/ports.ts`, `src/platform/obr/index.ts`, `src/platform/mock/*` -- player role re-read on party change; page lifecycle events are DOM events in the background page.
- `tests/support/room.ts`, `tests/sync.e2e.ts` -- multi-client helpers.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/room-messages.ts` -- `state-request { r }` and `state { r, i, n, records }` schemas; records travel deflated and base64-encoded -- AC 2.
- [x] `src/core/timing.ts` -- `catchUpTimeoutMs`, `stateAnswerDelayMinMs`, `stateAnswerDelayMaxMs` -- AC 2, 3.
- [x] `src/replica/` -- catch-up state machine, triggers, answering, exit rules, alone-GM exit, role re-read, player generation adoption, persist-on-promotion -- AC 1 to 4, 8.
- [x] `src/replica/` -- pending queue with in-place combining and replay on exit; the projection shows the pending view -- AC 5.
- [x] `src/replica/engine.ts` -- refuse `preset-upload` while `catching-up` -- AC 7.
- [x] `src/core/ui-messages.ts`, `src/ui/` -- sync state in the projection; loading state replaces the Story 1.5 gate; Settings controls disabled during catch-up -- AC 6, 7.
- [x] Tests: core schema tests; engine tests on the in-memory room for every matrix row with injected timing; `tests/catch-up.e2e.ts` with real pages for start, a late joiner, timeout, pending edits and create, Settings during catch-up -- every matrix row.

**Acceptance Criteria:** the eight criteria of TASK-15.

## Implementation Notes

- Composers moved from `engine.ts` to `src/replica/composers.ts`. Each takes a `ComposeContext` of records and a mint function. The engine passes its replica and minter; the pending view passes the replica with the queued intents applied and a mint of `c + 1` that records nothing.
- `src/replica/pending-queue.ts` holds `intent` entries and `patches` entries (one per record key). A newer value of one field replaces the older patch in place. On replay a `patches` entry composes all its fields over the current record and mints once. A patch that changes nothing at replay is skipped with no rejection; any other refusal names its own command id.
- Projection and delta carry `pending` (pending view records) and `sync`. The window store keeps the replica and the pending view apart and shows the view over the replica. A delta in `live` drops the view. A key that leaves the view is sent once more as the replica's record, so the window holds no stale view value.
- `src/core/deflate.ts` holds the deflate and base64 helpers that `preset.ts` had. `src/core/state-records.ts` encodes, decodes and splits `state` records: groups of up to 4 x the limit of JSON, halved until each encoded message fits. A record that does not fit alone is skipped and its key logged.
- `startReplicaEngine(platform, sendQueue, { timing, newId, random })`. It awaits the start catch-up entry, so an alone GM is live when the promise resolves. The exit delta is skipped while no projection has been sent, because no window holds state yet.
- A GM answers only when it is live and its storage was readable, as with commits. A GM never merges a `state` of a higher generation (Epic 5); it enters catch-up once per higher generation seen from a GM sender. A player adopts the generation of a `state` that answers its own `r`.
- Role: the engine re-reads its role on every party change and on a new port event `player.onRoleChange`. The OBR adapter maps it to `OBR.player.onChange`, filtered to a changed role, because a party change may not fire for the client's own role. Promotion probes the storage of the current generation; on failure the GM gets the unreadable mark and persists nothing.
- Mock builds read `mock-catch-up-timeout-ms`, `mock-state-answer-delay-min-ms` and `mock-state-answer-delay-max-ms` from the page URL; `@/platform/current` exports `timing`, which the OBR adapter sets to `TIMING`. The party storage key and channel prefixes moved to `client-params.ts` for the e2e helper `addPartyMember`.
- UI: until `firstCatchUpDone`, the tab bar shows known sheets and every panel shows "Загрузка…"; "+" is hidden. `uploadDisabledReason` puts "Загрузка…" on the upload in Settings and in the no-preset view; "Скачать пресет" is disabled with the same text. `preset-errors` shows no message for a `catching-up` rejection.
- Not done: a window reads the role once, so a promoted player's open window stays on "Загрузка…" until it is reopened.

## Spec Change Log

- Implementation: the player port gained `onRoleChange`, because an Owlbear party change may not report the client's own role. The window now renders from the role in the sync state. Known-bad state avoided: a promoted or demoted client that never re-reads its role.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: suppression runs before decode and the generation check | high | Confirmed by reading: a bad `state` silences valid answers. Patched; test observed red. |
| Verification and Edge: a kept-`r` re-ask is never answered; each return re-arms the timeout | high | Confirmed by reading. Patched: a new request clears the seen mark; the timer arms once. Tests observed red. |
| Blind and Edge: a promoted player persists under its own, not the highest stored, generation | medium | Patched as `loadReplica`; test observed red. |
| Verification, Blind and Edge: withdrawn pending keys stay in the window; live projections carry pending | medium | Patched with `withdrawn` keys in the delta and no pending while live; test observed red. |
| Edge: `pagehide` during catch-up loses pending intents | medium | Patched: replay before flush; test observed red. |
| Blind and Edge: start awaits an unbounded party read | medium | Patched: not awaited. |
| Blind and Edge: inflate has no output cap | medium | Patched: 8 × message limit for `state`, the file limit for presets; test. |
| Edge: a high-entropy record fits as JSON but not as an encoded `state` | medium | Reproduced by the reviewer. Patched: the input check also measures the encoded `state`; test. |
| Blind: windows never learn a role change | medium | Patched: the role travels in the sync state; e2e. |
| Verification: `onRoleChange` path untested | medium | Patched with a role-only mock change; observed red. |
| Verification: `visibilitychange` trigger untested | low | Patched with an e2e case. |
| Verification: unreadable-storage GM answering and demoted replay untested | low | Patched with two engine tests. |
| Blind: player and edit-during-catch-up e2e tests are weak or time-dependent | low | Patched with projection evidence and an explicit catch-up check. |
| Blind and Edge: empty mock params become 0; unused params | low | Patched. |
| Blind: every visible return runs a full catch-up | low | AD-7 lists page visible as a trigger; edits still show at once. Rejected; listed for the owner as a live-room watch item. |
| Blind: `state` chunks share the queue with deltas and commits | low | AD-12 requires one serial queue. Rejected. |
| Blind: a GM on a higher-generation trigger waits the full timeout and replays commits peers drop | low | Generation changes only with import. Deferred to Epic 5. |
| Blind: a `catching-up` refusal of a racing preset upload is silent | low | The control is disabled during catch-up; the race is narrow and a message needs new copy. Rejected; listed for the owner. |
| Blind: untested `persistAllOnExit` winner branch and a responder changing `n` | low | Rejected. |

## Design Notes

- Default timing: `catchUpTimeoutMs = 4000`, `stateAnswerDelayMinMs = 20`, `stateAnswerDelayMaxMs = 300`. In mock builds a page URL param may shorten them for tests; production reads only `TIMING`.
- `r` is a nanoid. A responder is identified by the sender connection id. Messages of one answer are counted by `i` per responder, duplicates ignored.
- `state` chunking: split records so that each encoded message, measured after deflate and base64, is under `MESSAGE_BYTE_LIMIT`. One record that cannot fit is skipped with a console error; it was refused at input.
- Pending view: the queue holds intents, not records. The projection's records are the replica with the pending intents applied by the same composers in a dry mode that mints nothing, persists nothing and sends nothing. On exit the view is dropped and the intents run for real in order. A dry-run refusal at enqueue time rejects the command at once.
- Combining: a field patch for a record key that already has a pending field patch merges into that entry, keeping its first position in the order.
- Projection gains `sync: { state: 'catching-up' | 'live', firstCatchUpDone: boolean }`. A window that opens during a later catch-up still shows sheets; only the first catch-up shows "Загрузка…".
- Role: the engine reads its own role from the player port at start and again on each party change. Windows read the role before rendering data, as today.
- The background page listens to `visibilitychange` (visible), `resume` and `online` on its own document and window.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: GM edits on device A while device B is closed; open B and see the edits; put a tab to sleep and wake it.
