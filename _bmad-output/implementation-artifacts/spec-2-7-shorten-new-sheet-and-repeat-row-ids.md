---
title: 'Shorten New Sheet and Repeat-Row Ids'
type: 'chore'
created: '2026-11-11'
status: 'done'
baseline_commit: '128797ffe4879d7b815cdd085eab6a660bb97328'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-duplicate-an-npc.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The room copy of the worst-case party takes 15138 of 15500 bytes, a margin of 362 against the required 1500. About half of it is random 21-character ids, which deflate cannot compress. Backlog task: TASK-37, whose four acceptance criteria apply in full. Owner decision recorded in TASK-34.

**Approach:** Generate new sheet ids with 12 characters and new repeat-row instance ids with 8 characters from one place in `core`, and use that in every site that makes these ids. Leave stored ids as they are.

## Boundaries & Constraints

**Always:** Same URL-safe nanoid alphabet. Schemas keep accepting 1 to 64 characters, so existing 21-character ids keep working with no migration. One module owns id lengths. A generated id that already exists live in its scope (sheet ids in the room; instance ids in that sheet row) is never written over: the existing refusal path applies, or the id is drawn again.

**Never:** Rewriting existing ids. Changing record keys, the snapshot layout or the format version.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create sheet | "Добавить персонажа"/"Добавить NPC" | `sheetId` of 12 characters | N/A |
| Add row | "Добавить строку" | Instance id of 8 characters | N/A |
| Duplicate NPC | Count N | Each copy: 12-character sheet id, 8-character instance ids | N/A |
| Old data | Records with 21-character ids | Load, merge, sync and room copy unchanged | N/A |
| Collision | Generated id equals a live id in scope | Not written over the live record | Refused or redrawn |
| Size | Worst-case party with new lengths | `snapshot-size.test.ts` prints margin ≥ 1500 | N/A |

</frozen-after-approval>

## Code Map

- `src/ui/main.tsx` -- sheet create id.
- `src/ui/sheet/use-repeat-rows.ts` -- repeat row instance id.
- `src/replica/composers.ts`, `src/replica/engine.ts` -- NPC duplicate ids (`newId` by role).
- `src/core/sheets.ts`, `src/core/records.ts` -- id schemas.
- `src/core/snapshot-size.test.ts` -- the AC 12 measurement; generate ids with the new lengths.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/ids.ts` -- `newSheetId()` (12) and `newInstanceId()` (8) -- AC 1.
- [x] Every generation site uses them -- AC 1.
- [x] Collision handling at each site -- AC 4.
- [x] `src/core/snapshot-size.test.ts` -- generate with the new lengths; assert margin ≥ 1500 and print it -- AC 3.
- [x] Tests: id lengths at every site; old 21-character ids still load and sync (existing fixtures may cover this — point to them) -- AC 1, 2, 4.

**Acceptance Criteria:** the four criteria of TASK-37.

## Implementation Notes

- `src/core/ids.ts`: `SHEET_ID_LENGTH = 12`, `INSTANCE_ID_LENGTH = 8`, `newSheetId()`, `newInstanceId()`, and `newRecordId(kind)` with `RecordIdKind = 'sheet' | 'instance'`. All draw from `nanoid(size)`, so the alphabet stays the URL-safe one. Schemas are unchanged (1 to 64 characters).
- Sites: `src/ui/main.tsx` (create) calls `newSheetId()`; `src/ui/sheet/use-repeat-rows.ts` (add row) calls `newInstanceId()`. The NPC duplicate gets its ids from the engine: `ComposeContext.newId` is now `newRecordId(kind, role)`, and the engine draws them with a new `ReplicaEngineOptions.newRecordId` (default `newRecordId` from `core/ids`). The engine's own `newId` (engine id, nonces, roll ids) keeps 21 characters: those ids never reach a record key.
- Collision: create and add row already refused a taken key, tombstones included (`sheet-exists`, `instance-exists`). Create now also refuses a sheet id that a live dependent record names (`row:`, `rep:`, `acl:`, `plink:`, `link:`, found with `dependentSheetId`), so a new sheet never takes over an orphan. The duplicate takes a sheet id only when its sheet key is free, no live dependent names it, no row key the copy writes is a tombstone, and no other copy of the batch has it; it takes an instance id only when its `rep:` key is free, tombstones included. A taken id is drawn again at most 5 times (`MAX_ID_REDRAWS`), each redraw under its own role (`<role>:redraw:<n>`), so the pending view and the replay draw the same ids; a sixth taken draw refuses the command and writes nothing.
- Old ids: `src/core/sheets.test.ts` accepts `V1StGXR8_Z5jdHi6B-myT`. A new engine test in `src/replica/engine-room-copy.test.ts` ("ids made before TASK-37") loads records under 21-character ids, merges competing versions of two old-id keys from the room copy (the higher one wins each way), syncs them to a second GM, takes an edit that raises an old-id row's counter, and finds the result in the room copy.
- AC 3: `bun test src/core/snapshot-size.test.ts` prints `snapshot bytes: 12214, margin: 3286` and asserts the margin is at least 1500. It also prints, and does not assert, the size with the old 21-character ids: `snapshot bytes: 15138, margin: 362`. Rooms built before TASK-37 keep their old ids and that thin margin. GM author ids stay 21 characters, as Owlbear makes them. The number differs from the TASK-34 scratch measurement (12158) because fewer random draws change the seeded values.
- E2E: `tests/characters.e2e.ts` and `tests/npc.e2e.ts` expect 12-character sheet keys, `tests/repeat-rows.e2e.ts` 8-character instance ids, and `tests/duplicate.e2e.ts` both.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: a drawn sheet id with orphan dependents (row ids the source lacks, `rep:`, `acl:`, `plink:`) is adopted by create and duplicate | medium | Patched: any live dependent blocks the id; tests observed red. |
| Blind: a duplicate refuses on a collision the GM did not cause, and replay repeats it | low | Patched: up to 5 redraws, cached by role. |
| Verification: catch-up duplicate ids unchecked for length | low | Patched; observed red. |
| Verification: the in-batch sheet-key check is not pinned | low | Patched with a value-less source; observed red. |
| Blind: AC 2 test merges no old-id key | low | Patched: competing versions and an edit of an old-id row. |
| Blind: `newId` names two things; comments name the wrong instance scope; header contradicts the assertion | low | Patched. |
| Blind: rooms built before this keep 21-character ids and the thin margin | low | Recorded in the size test header, which prints both sizes. |
| Blind: row collision reports `sheet-exists` | low | Rejected: a taken key under a sheet id means the sheet id is taken. |
| Edge: two clients can draw one id concurrently | low | Accepted: 72 and 48 bits; a local check cannot see it. |

## Design Notes

- 8 characters over 64 symbols is 48 bits; uniqueness is needed only within one sheet row. 12 characters is 72 bits for a room.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.
