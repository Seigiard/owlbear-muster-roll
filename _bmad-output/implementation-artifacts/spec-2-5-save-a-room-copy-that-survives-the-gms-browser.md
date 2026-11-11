---
title: "2.5 Save a Room Copy That Survives the GM's Browser"
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'c7babfe34e88357ff3aa50a8549ff19093d9be89'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-catch-up-on-join-and-on-return.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Room data lives only in GM browsers, so a GM on a new device, or a room with no GM online, has nothing to read. Backlog task: TASK-18, whose twelve acceptance criteria apply in full. AC 12 is a measurement with a human gate.

**Approach:** Add the AD-8 room copy: `core/snapshot` encodes and decodes it; `replica` on a live GM reads, merges, encodes, measures, writes and reads back after an edit pause and when the page hides; every catch-up merges it first. Show its state in Settings and a not-saved notice in the banner.

## Boundaries & Constraints

**Always:** Only `replica` on a GM client that is not `catching-up` writes. Every read parses through `core`. The size check covers all room metadata with this key replaced, as UTF-8 JSON, against 15500 bytes. A write is verified by an immediate read-back. Timing lives in `TIMING`. Strings come from the copy catalog. The room copy is not the export file format; only it holds `acl:`, `plink:`, tombstones and versions.

**Never:** Snapshot export or import files (later stories), `reset` or generation change (Epic 5), the player no-GM empty state (2.6), timers that must run in a hidden tab (the hide trigger writes at once).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pause trigger | Live GM, edits stop for `snapshotPauseMs` plus jitter | Read, merge, encode, measure, write, read back | N/A |
| Hide trigger | Live GM page becomes hidden | Same steps at once | N/A |
| Encode | All records, tombstones and versions, generation | Sorted by key, deflated, base64; value `{ v, data }` under `app.muster-roll/snapshot` | N/A |
| Too large | All metadata with this key replaced over 15500 bytes | No write; previous copy stays; notice `room-copy-not-saved` | N/A |
| Higher `v` / undecodable | Read copy | Stop; notice | N/A |
| Higher generation | Read copy | No merge, no write; enter `catching-up` | N/A |
| Lower generation | Read copy | Not merged; overwritten on the next write | N/A |
| Interrupted | `resume` or visibility change between read and write | Stop | Rescheduled |
| Rescheduled | Skipped or stopped write, or trigger during catch-up | Scheduled again when catch-up ends or on the next trigger | N/A |
| Read-back fails | Lacks a written record at an equal or higher version and no higher generation | Notice | N/A |
| Verified write | After a notice | Notice clears | N/A |
| Catch-up | Any client, a copy exists | Merges the copy (equal generation) before `state-request`; an alone GM merges it before leaving | N/A |
| New device | GM with empty storage, copy exists, no other GM | Gets the data from the copy | N/A |
| Player generation | Player with no data, copy of a higher generation | Adopts that generation and merges | N/A |
| Settings saved | Copy verified | "Копия в комнате" after "Снимок" or "Пресет": "Сохранена" with used and available size | N/A |
| Settings none | No copy yet | "Не сохранена" with the available size: 15500 minus all room metadata bytes | N/A |
| Settings failed | Notice active | The not-saved message | N/A |
| Banner priority | Several notices | local save failed, room copy not saved, new version, no GM | N/A |
| Measurement | 6 characters and 60 NPCs, Russian text, larger 1.11 fixture | Encoded size recorded in the story notes | Over 15500 or margin under 1500: human gate |

</frozen-after-approval>

## Code Map

- `src/core/deflate.ts`, `src/core/records.ts`, `src/core/storage-key.ts`, `src/core/format-version.ts` -- encoding parts, generation.
- `src/replica/engine.ts`, `src/replica/background-main.ts` -- catch-up steps (leave the hook from 2.2), triggers, notices.
- `src/platform/ports.ts` (`MetadataPort`), `src/platform/mock/index.ts`, `src/platform/mock/room.ts` -- metadata; the mock must share room metadata across clients of one room and across pages.
- `src/core/ui-messages.ts`, `src/ui/banner-message.ts`, `src/ui/settings/*`, `src/ui/copy.ts` -- notice, banner, Settings section.
- `tests/fixtures/presets/` -- the 1.11 fixtures for the measurement.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/snapshot.ts` -- encode, decode (`{ v, data }`, higher `v` refused without decoding `data`), measure all metadata with the key replaced, read-back check -- AC 1 to 5, 8.
- [x] `src/core/timing.ts` -- `snapshotPauseMs`, `snapshotJitterMs` -- AC 1.
- [x] `src/platform/mock/*` -- room metadata shared by every client and page of a room, with change events -- AC 9.
- [x] `src/replica/` -- writer with triggers, interruption, rescheduling, notice; catch-up merge before `state-request` and before an alone GM leaves; player generation adoption -- AC 1 to 9, 11.
- [x] `src/core/ui-messages.ts`, `src/ui/` -- `room-copy-not-saved` notice and banner priority; the room-copy status in the projection; the Settings section -- AC 10, 11.
- [x] `src/core/snapshot-size.test.ts` -- builds the AC 12 party from the larger fixture and prints the encoded size; asserts nothing about the limit -- AC 12.
- [x] Tests: core unit tests; engine tests on the in-memory room for every matrix row; `tests/room-copy.e2e.ts` with real pages: a GM writes, a GM on a new device (other `mock-device`, no other GM) loads from it, Settings text, the too-large notice -- every matrix row.

**Acceptance Criteria:** the twelve criteria of TASK-18.

## Implementation Notes

- `src/core/snapshot.ts`: `SNAPSHOT_KEY`, `ROOM_METADATA_BYTE_LIMIT`, `encodeSnapshot`, `readSnapshot` (reads `v` first and refuses a higher one before touching `data`; inflate capped at 64 x the limit), `roomMetadataBytes`, `roomCopyUsage` (`usedBytes` = metadata JSON with the key less without it; `freeBytes` = limit less all metadata, not below 0), `readBackHolds`.
- Engine writer (`writeRoomCopy`): runs only when the client is GM, live and has readable storage. Triggers: own GM edits (debounced by `snapshotPauseMs` + `random()` x `snapshotJitterMs`), `pageHidden()` (at once), and catch-up exit when a write is owed or pending edits replayed. Each non-verified run leaves the write owed. A counter of `catchUp()` and `pageHidden()` calls taken before the read stops the write when it changed. Higher generation: `noteHigherGeneration`, so catching-up is entered once per newly seen generation. The notice clears on a verified write; a demoted client drops it.
- Catch-up merge: every catch-up, the start included, arms the timeout, reads metadata, merges the copy (also when an answer ended catch-up during the read), then decides whether to ask and checks for an alone GM. `startReplicaEngine` waits for its start entry no longer than `catchUpTimeoutMs`, so an alone GM is live when it resolves and a read that never ends cannot hold the engine back past the timeout.
- Writer: single-flight; a trigger during a write marks it owed and runs once more after. After every await it stops unless still a live GM with persistence. A failed read, a thrown write, an unreadable copy, a size skip or a failed read-back raises the notice, the failed state and the owed mark. A higher generation in the read or the read-back always enters catch-up and never reports saved. A copy of a higher `v` also raises `new-version`. The engine follows `onMetadataChange` for the Settings sizes, and a merged remote commit schedules a write.
- Mock: a room metadata write past 16 kB is dropped in silence, as Owlbear does. The pause and jitter params refuse values past the longest timer delay.
- Projection and delta carry `roomCopy`; the window store keeps it in `$roomCopy` (`setRoomCopy`). Settings shows "Копия в комнате" after "Пресет" through `src/ui/settings/room-copy-text.ts`. Banner priority: local save failed, room copy not saved, new version, no GM.
- Mock: `MockRoom` holds room metadata. Memory rooms share it across clients; page rooms keep it in localStorage under `mock-metadata:{roomId}`, outside device namespaces, with a BroadcastChannel for change events. Mock pages read `mock-snapshot-pause-ms` and `mock-snapshot-jitter-ms`.
- `background-main.ts` calls `engine.pageHidden()` on `visibilitychange` to hidden. Closing a page fires it, so a closing GM background writes the copy and may send one more status delta; `tests/repeat-rows.e2e.ts` now takes the last delta after the close.
- AC 12: `snapshot bytes: 15138, margin: 362` (433 records on `d20.json`). The margin is under 1500, so the human gate applies: TASK-34 created, TASK-20 depends on it.

## Spec Change Log

- Implementation: a GM client that holds no record also takes a room copy of a higher generation, as the matrix says for a player. AD-9 says a client takes the highest generation of its persisted records and the room copy on start, and without this a GM on a new device after an import would never load the copy. A GM that holds records keeps its generation (Epic 5).
- Review: start no longer blocks on a metadata read; the read sits inside catch-up, bounded by its timeout.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: start blocks on a metadata read that may never end | medium | Patched: the copy is read inside catch-up, bounded by its timeout; test with a held read. |
| Edge: overlapping writes can land an older copy last | medium | Patched: single-flight writer with an owed rerun. |
| Edge and Verification: a demotion during a write raises a notice nothing clears | medium | Patched: role and state re-checked after each await; demotion test. |
| Blind and Edge: a null read or a thrown write is silent | medium | Patched: notice, failed state, owed; rejected-write test observed red. |
| Edge: a read-back of a higher generation reports saved | medium | Patched: catch-up, never saved. |
| Blind and Edge: a higher generation seen before leaves the writer stuck silent | medium | Patched; test. |
| Edge: slow read past the timeout skips merge and request; an answer during the read skips merge | medium | Patched: merge after any read, ask decided after it. |
| Blind: a higher-`v` copy does not raise `new-version` | low | Patched. |
| Blind: an unreadable copy shows "Не сохранена" | low | Patched: the failed state; test. |
| Blind: Settings status goes stale without `onMetadataChange` | low | Patched; test. |
| Edge: only the editing GM schedules a write | low | Patched: a merged remote commit schedules one; test. |
| Blind: the mock accepts writes past 16 kB | low | Patched to drop silently, as Owlbear does. |
| Edge: mock pause param above the timer limit | low | Patched. |
| Verification: replayed catch-up edits, jitter, adopted-generation prefix, demotion clear and rejected write untested | medium | Patched with tests; each observed red by mutation. |
| Blind: the resume test passes without the page-change guard | low | Patched: GM alone. |
| Blind: player with no GM reading the copy untested | low | Patched with an engine test, NPCs excluded. |
| Blind: GM adopts a higher generation from the copy, not from `state` | low | Documented in a code comment and the change log. |
| Blind: shared `heldRead`; duplicate imports | low | Patched. |
| Security review: any party member can write a forged room copy that GMs merge | medium | Owlbear metadata carries no writer identity, and no key can be shared between GM devices without a server. Deferred as an owner decision. |
| AC 12 measurement: 15138 bytes, margin 362 | gate | Under the 1500-byte margin. TASK-34 created; TASK-20 depends on it. Owner decides before Epic 3. |

## Design Notes

- Timing: `snapshotPauseMs = 3000`, `snapshotJitterMs = 2000`; jitter uses the engine's injected `random`.
- Stored value: `{ v: FORMAT_VERSION, data }`, where `data` is base64 of deflated JSON `{ g, records }`, records sorted by `k`. Inflate is capped like `state`.
- Size shown in Settings, in kB of 1000 bytes with one decimal and a comma: saved "Сохранена. Занято {used} кБ, свободно {free} кБ."; none "Не сохранена. Свободно {free} кБ."; failed: the not-saved text. `used` is this key's bytes in the metadata JSON; `free` is 15500 minus all metadata bytes, not below 0. New catalog entries hold these.
- The projection carries `roomCopy: { state: 'saved' | 'none' | 'failed', usedBytes, freeBytes }`, updated by the engine after each read or write. Players do not need it.
- The measurement test prints `snapshot bytes: N, margin: M` so the number can be copied into the task notes.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: edit as GM, wait, open the room on another device as GM with no other GM tab open, and see the data; check Settings "Копия в комнате".
