---
title: "1.3 Keep the GM's Records Safe in the Browser"
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '4ed4bee01586e0c55b0ee5186881bc65dcddfcb2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing defines a record, compares versions or stores data, so a stale tab could overwrite newer data. Backlog task: TASK-5, whose six acceptance criteria apply in full.

**Approach:** Add the record schemas and one merge to `src/core`, a version minter and a record store to `src/replica`, and make the storage port report failures as results.

## Boundaries & Constraints

**Always:** Rules AD-2, AD-3, AD-9 (generation value) and AD-11 of the architecture spine apply exactly. Only `core/merge` compares versions. `core` stays pure and returns results for expected failures. One synchronous step reads, merges and sets a record. Device time never enters a version.

**Never:** Build the replica engine, the projection, notices, room sync, snapshots or preset parsing. Use `Date`, `eval` or `new Function`. Throw for an expected storage failure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Counter wins | `c` 10 against `c` 9 | `c` 10 wins; numeric, not string, comparison | N/A |
| Author breaks a tie | Same `c`, `a` "b" against "a" | "b" wins | N/A |
| Merge laws | Generated records | Commutative, associative, idempotent, also for equal `(c, a)` with different `d` | N/A |
| Valid keys | Each of the seven AD-2 forms with its data | Parses | N/A |
| Tombstone | Any valid key, `d: null` | Parses | N/A |
| Invalid record | Unknown prefix, missing or extra segment, wrong data shape, `c` not a positive integer | Failure result | No throw |
| Invalid field value | `null`, object, array, `""`, non-finite number | Failure result | No throw |
| Mint | Highest known `c` is 7 | `c` 8 with this connection as `a` | N/A |
| Mint twice with stale knowledge | Known `c` stays 7 across two mints of one key | `c` 8, then `c` 9 | N/A |
| Stale tab | Stored `c` 5, write `c` 3 | Stored record stays `c` 5 | N/A |
| Storage key | Room "r", generation 2 "x", key `preset` | `mr1:r:2:x:preset` | N/A |
| Corrupt stored value | Unparseable JSON or invalid record at the key | Incoming record is written | N/A |
| Write fails | `setItem` throws quota error | Failure result | No throw |
| Read fails | Storage access throws | Failure result | No throw |
| No generation stored | No persisted record for the room | `{ n: 0, a: "" }` | N/A |
| Stored generations | Records in generations 1 and 2 | Highest generation; other rooms ignored | N/A |

</frozen-after-approval>

## Code Map

- `src/platform/ports.ts` -- `StoragePort` is synchronous; change it to return results.
- `src/platform/obr/index.ts`, `src/platform/mock/index.ts` and its test -- adapter and callers of the port.
- `src/core/json.ts` -- shared JSON types.
- `deferred-work.md` -- the first 1.1 entries name this failure contract.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `bun.lock` -- add `fast-check` 4.10.2 as an exact dev dependency -- AC 1.
- [x] `src/core/result.ts` -- shared result type.
- [x] `src/core/records.ts` -- zod schemas for the seven key forms and their data; strict objects; no empty key segment and no `:` inside one -- AC 2.
- [x] `src/core/merge.ts` -- version and generation comparison, record merge; string comparison by code unit -- AC 1.
- [x] `src/core/storage-key.ts` -- generation type, initial value, build and parse of the AD-11 key -- AC 4 and 6.
- [x] `src/platform/ports.ts`, `src/platform/obr/browser-storage.ts`, `src/platform/obr/index.ts`, `src/platform/mock/index.ts` -- result-returning port; the browser adapter has no SDK import, so a test can drive it; the mock can simulate failure -- AC 5.
- [x] `src/replica/version-minter.ts` -- per-connection minter that remembers the last `c` per key -- AC 3.
- [x] `src/replica/record-store.ts` -- write in one synchronous step, load a generation, read the highest generation -- AC 4 to 6.
- [x] `src/core/*.test.ts`, `src/replica/*.test.ts`, `src/platform/obr/browser-storage.test.ts` -- every matrix row; expected values are literals.

**Acceptance Criteria:** the six criteria of TASK-5.

## Implementation Notes

- `core/merge` also owns `nextCounter`, because taking the higher of two counters is a version comparison and only `core/merge` may compare versions.
- `buildStorageKey` returns a result and refuses a room id with `:`. AD-11 exists to keep rooms apart, and a colon would let one room's key parse as another's.
- A stored record whose `k` differs from its storage key counts as corrupt. Otherwise it could stand in for the record of the key it is filed under.
- A write that loses to the stored record calls no `setItem`, so a full quota cannot fail a write that changes nothing.
- `loadGeneration` skips a corrupt value and returns the valid records. It returns a failure if any read fails, because a partial load looks like lost records. `readHighestGeneration` does not count a generation that holds only corrupt values.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Edge: minter accepts NaN or a fractional known counter | false | Callers pass a parsed positive integer or 0. No such input reaches it. |
| Edge and Blind: counter ceiling at 2^53 | low | Reproduced with a forged value only. Counters grow by one, and v1 protects honest clients only (architecture Deferred table). A failure path guards an unreachable state. |
| Edge and Blind: `write` persists records that reads refuse | medium | Reproduced with `{k:'row:s:r', d:{x:''}}`. Patched: `write` validates first. |
| Edge and Blind: invalid room id reads as an empty room | low | Rejected: the room id is an opaque Owlbear id, `write` already fails loudly, and the fix adds branches. |
| Edge and Blind: `__proto__` field id silently dropped | low | Reproduced. Field ids come from the preset. Deferred to Story 1.5, whose schema owns them. |
| Edge and Blind: cross-tab race in the write step | false | AD-11 states this guards stale tabs, not a race inside one millisecond. |
| Verification and Blind: tombstones never reach the store | medium | Regression gap. Patched with three store tests; each observed red. |
| Verification and Blind: identical re-write under full quota unpinned | low | Patched with a store test; observed red with `>`. |
| Verification: production wiring of browser storage unverified | low | Deferred as filed. TASK-6 is the first production caller. |
| Blind: corrupt value dropped with no signal | low | Rejected: no client writes one, and a skipped-key channel adds surface with no consumer. |
| Blind: literal U+FFFD in a test | low | Direct correction. Patched with an escape. |
| Blind: delivered item still listed in deferred-work.md | false | That file is append-only under the build workflow. |

## Design Notes

- Equal `(c, a)` with different `d` needs a deterministic winner, or merge is not commutative. Compare the JSON text of `d`. A correct client never produces this case.
- A generation author goes into a colon-separated key, so its schema refuses `:`.
- An empty `text` value is the absence of the key, so `""` is invalid as a stored value.

## Verification

**Commands:**
- `bun run lint`, `bun run typecheck`, `bun test` -- expected: exit 0.
