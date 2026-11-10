---
title: '2.1 See Edits From Other GM Tabs Live'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'c346c0b0b1e8849863a59a6a5541eab205296fae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Each GM tab keeps its edits to itself, so a second tab or device shows stale sheets until a reload. Backlog task: TASK-14, whose seven acceptance criteria apply in full.

**Approach:** Add the room channel `app.muster-roll/sync`: every applied GM edit goes out as a `commit` on `REMOTE`, and one gate in `replica` admits inbound messages by the AD-5 table before they merge. Extend the mock so that several clients of one room can run in one browser and in tests.

## Boundaries & Constraints

**Always:** Only `src/replica` sends on or listens to `app.muster-roll/sync`, always with `REMOTE`. Every inbound message is read in this order: envelope `v`, then a zod schema in `core`, then the gate. The gate is a pure function in `core` over `(t, sender role, generation relation)` holding the whole AD-5 table, so later stories add handlers, not rules. Commits go through the existing send queue and the existing size splitter. Merge is the existing `mergeRecords`. A GM client persists every merged remote record through the record store; a player client persists nothing. The mock never enters a production build.

**Never:** Catch-up, `state-request`, `state`, `ping`, `alive`, `gmLink` (Stories 2.2 and 2.4); player views (2.3); the room copy (2.5); `propose`, `reject`, `reset`, `roll`; electing, tracking or waiting for a particular GM client; timers in the commit path other than the queue's own spacing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GM edit goes out | Any applied command that writes records | One `commit` `{ v, g, t: 'commit', records }` on `REMOTE` with the written records, after merge and persist | Over the size limit: split by the existing splitter |
| Coalescing | Two edits of one key while the queue is held | The commit that leaves carries only the newer record of that key; other keys stay | N/A |
| Different rows | Two GM clients edit different rows at once | Both edits on both clients and in storage | N/A |
| Same row | Two GM clients edit one row at once | Both settle on the record with the higher `(c, a)` | N/A |
| Sheet changes | Remote create, rename, delete | Shows on the other client's tab bar and NPC tab | N/A |
| Active sheet deleted remotely | Other client deletes the sheet shown here, with its confirmation open | First available tab becomes active, the confirmation closes | N/A |
| Field focused | Remote change to a field that has focus | Field keeps its text; `Esc` shows the new value | N/A |
| Field not focused | Remote change | Value updates in place | N/A |
| Unknown sender | Connection id not in the party, still missing after one re-read | Dropped; no merge | No throw |
| Player sender | `commit` from a known player | Dropped | N/A |
| GM included | Another GM connection of the same player id | Known; its commits apply | N/A |
| Generation | `commit` with another generation | Dropped | N/A |
| Version | Message with lower `v` | Dropped, no banner | N/A |
| Version | Message with higher `v` | Dropped; banner "Вышла новая версия. Перезагрузите страницу." until reload | N/A |
| Bad message | Right `v`, schema fails, or unknown `t` | Dropped | No throw |
| Player client | Receives a valid GM `commit` | Merges into its replica, persists nothing | N/A |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts` -- command handling, `persist`, merge, deltas to windows, `notice`.
- `src/platform/send-queue.ts` -- serial queue; coalescing lives at or above it.
- `src/core/message-size.ts` -- `splitBatch`, `MESSAGE_BYTE_LIMIT`.
- `src/core/merge.ts`, `src/core/records.ts`, `src/core/storage-key.ts` (`Generation`, `generationSchema`), `src/core/format-version.ts`.
- `src/core/ui-messages.ts` -- `noticeSchema` (add `new-version`), projection notices.
- `src/ui/main.tsx` -- `bannerFor`, tab fallback on a missing sheet, delete confirmation.
- `src/ui/copy.ts` -- `newVersion` exists.
- `src/platform/ports.ts`, `src/platform/mock/index.ts`, `src/platform/mock/local-bus.ts`, `src/platform/obr/index.ts` -- party port, broadcast port.
- `tests/support/room.ts` -- e2e helpers.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/room-messages.ts` -- `SYNC_CHANNEL`, envelope schema, `commit` schema, `parseRoomMessage`, and `admitRoomMessage(t, senderRole, relation)` with the full AD-5 table -- AC 1, 5, 6.
- [x] `src/replica/party-roster.ts` -- connection id to `{ role, playerId }` through the party port, with one re-read on a miss and an update on party change -- AC 5.
- [x] `src/replica/engine.ts` (and a small commit outbox module if it helps) -- send commits after applied writes, coalesce by key, receive and merge commits, persist on a GM client, raise `new-version` -- AC 1 to 4, 6.
- [x] `src/core/ui-messages.ts`, `src/ui/main.tsx` -- `new-version` notice and its banner below `local-save-failed` in priority -- AC 6.
- [x] `src/platform/obr/index.ts` -- party port reads `OBR.party` with connection ids, if not already -- AC 5.
- [x] Mock multi-client room (see Design Notes) with unit tests -- AC 2 to 5.
- [x] Tests: `src/core/room-messages.test.ts` (whole AD-5 table, envelope order), engine tests with two engines on one memory room, `tests/sync.e2e.ts` with two clients' real background and window pages -- every matrix row.

**Acceptance Criteria:** the seven criteria of TASK-14.

## Implementation Notes

- Coalescing: `SendQueue.enqueueComposed` calls its composer when the drain takes the message. `src/replica/commit-outbox.ts` holds records by key and composes one commit per take with `splitBatch`; records past one message wait for the next take. A rate-limit retry resends the composed message as is.
- The party roster reads the party once at start, follows `onChange`, and re-reads once on a miss. A failed read counts as a miss.
- A player client refuses every write command with the rejection `not-allowed`, until Epic 3 brings `propose`. A GM whose storage could not be read sends no commits.
- The roster ignores a party read that started before the last party change, and concurrent misses share one read. Room messages are handled one at a time in arrival order.
- `engine.stop` stops the outbox. On `pagehide` the background hands every held commit to the queue and calls `flushNow`.
- Mock URL params and naming rules live in `src/platform/mock/client-params.ts`, which Playwright helpers import.
- A remote record that fails `recordFitsOneMessage` is dropped with a console error, as a stored one is skipped, so a projection can always split.
- `src/platform/obr/index.ts` already mapped `OBR.party` with connection ids; no change.
- `main.tsx` already moved the selection to the first tab and closed the confirmation when a sheet disappears; `tests/sync.e2e.ts` now proves it for a remote delete.
- Mock: connection id is `mock-connection` for an empty `mock-client`, else `mock-connection-{client}`. A named `mock-device` keeps its keys under `mock-device:{device}:`. The party lives under `mock-party:{roomId}`; the default device lists no `mock-` key. `MockPlatform` gained `joinParty`, `leaveParty` and `sendRemoteAs`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: a stale party read overwrites a newer `onChange` | medium | Confirmed by reading. Patched with an epoch; unit test observed red. |
| Blind and Edge: misses start unbounded party reads | medium | Patched: one shared in-flight read; unit test observed red. |
| Blind: a player client mints local records that can beat GM commits | high | Confirmed by reading: same `c`, higher `a` wins forever on that client. Patched: player write commands rejected as `not-allowed` until Epic 3. |
| Edge: a GM with unreadable storage sends commits | medium | Patched: no commit while persistence is null; test observed red. |
| Blind and Edge: a split failure clears every held record | medium | Patched: only records that do not fit are dropped; outbox unit tests. |
| Blind: `stop` leaves the outbox sending; a closing background loses held commits | medium | Patched: outbox stops with the engine; background `pagehide` flushes. |
| Blind: room messages can overtake each other during a roster lookup | medium | Harmless for commits, wrong for later `state` and `reset`. Patched with a serial chain; test observed red. |
| Blind: `receiveCommit` branches untested; window and background ids differ in unit tests; magic count | low | Patched. |
| Blind: mock constants copied into test helpers | low | Patched: `src/platform/mock/client-params.ts`. |
| Blind and Edge: REMOTE backoff holds LOCAL deltas in the shared queue | low | AD-12 requires one serial queue for both channels. Rejected; listed for the owner as a live-room watch item. |
| Blind and Edge: any connection can raise the new-version banner | low | The spec reads `v` before the gate. A newer build in the room is the signal. Rejected. |
| Edge: a newer record from a neighbour tab is sent on | low | Idempotent merge; the winner is correct data. Rejected. |
| Edge: an unsaved record is still sent | low | Sending keeps the data in the room. Rejected. |
| Blind and Edge: a player stays at the initial generation | low | Generation changes only with import (Epic 5); 2.2 and 2.5 set the player's generation. Deferred. |
| Blind: mock party survives a crash or bfcache | low | Mock only; Playwright contexts are fresh. Rejected. |
| Verification: banner priority between two notices untested | low | Deferred as filed to Story 2.5, which owns the multi-notice banner. |

## Design Notes

- Gate relation: compare the message `g` with the client's own generation using `compareGenerations` and pass `'lower' | 'equal' | 'higher'`. A player client's own generation is `INITIAL_GENERATION` until the room copy exists (2.5).
- The higher-`v` rule reads only `v` from the envelope, so a future message shape cannot break parsing.
- Coalescing: an outbox in `replica` holds commit records by key until the send queue takes the message; a newer record of a key replaces the held one. A record already handed to the platform is not recalled.
- A remote commit never re-broadcasts. Owlbear does not echo `REMOTE` to its sender, so no echo handling is needed beyond idempotent merge.
- Mock room, in mock builds only:
  - URL params on both pages: `mock-client` (default empty, which keeps today's `mock-connection` id), `mock-player` (player id, default `mock-player`), `mock-role`, `mock-name`, `mock-device` (storage namespace; default shared, like two tabs of one browser).
  - LOCAL stays within one client: the page bus channel name includes the client.
  - REMOTE uses a BroadcastChannel per room and reaches every page of every other client, never the sender's client.
  - Party: each client's background page registers `{ id, connectionId, name, role }` in a shared roster (localStorage plus a BroadcastChannel signal) and removes itself on `pagehide`. `getPlayers` omits the caller, as Owlbear does. `onChange` fires on roster changes.
  - Unit tests build several mock platforms on one in-memory room.
  - Playwright helpers in `tests/support/room.ts` open a client as a pair of background and window pages with given params, and can post a raw `REMOTE` message from a given connection id.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: open the room as GM in two browser tabs and on a second device; edit in one, watch the others; edit one field in both at once.
