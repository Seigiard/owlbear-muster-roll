---
title: "3.3 Apply a Player's Edit After a GM Check"
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'd16b4c5e378dcd908359c8b9ea87b9d4c476fe54'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-mark-the-owner-of-a-character.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-catch-up-on-join-and-on-return.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A player with access still cannot change anything: player write commands are refused `not-allowed`. Backlog task: TASK-22, whose twelve acceptance criteria apply in full; they define the protocol and are the source of truth where this spec is shorter.

**Approach:** Give the player `replica` a pending queue that proposes field patches and repeat-row adds and removes as `propose` messages with backoff. A GM client that is `live` checks each proposal in `core/access`, merges it unchanged and broadcasts `commit` with an echo of `(k, c, a)`, or answers `reject` (`denied` or `stale`). The player clears, retries or drops each entry only on an answer matching its own `(k, c, a)`.

## Boundaries & Constraints

**Always:** All decisions in `core/access` (pure). The AD-5 gate admits `propose` from a known player at an equal generation, and `commit`/`reject` from a GM at an equal generation. A GM never rewrites a proposal's `d`; two GM clients produce the same record. The player never merges its own edit; the projection carries its pending queue so windows show the typed value. Constants (backoff) in the timing module. Strings from the copy catalog ("Нет прав на правку" through the notification port, background only).

**Never:** The "Ожидает" mark, dimmed removed rows and revoke handling in the UI (Story 3.4). Player writes to any key other than `row:` and `rep:` of a live character with a live `acl:` for them. Changing the GM edit path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Editable | Player with live `acl:` | Fields editable; "Добавить строку" and "Удалить" show | N/A |
| No access | Player without `acl:` | Read-only as in 2.3; engine refuses a command `not-allowed` | N/A |
| Queue | Two edits of one key | One entry; `c` = highest known for the key (pending included) + 1; only the newest is sent | N/A |
| Independent keys | Edits of two keys | Sent and resent independently | N/A |
| Commit | GM `live`, valid `propose`, `c` above current | GM merges with `c`, `a` unchanged; broadcasts `commit` echoing `(k, c, a)`; entry clears | N/A |
| Identical | Proposal equals the current record | `commit` echo | N/A |
| Coalesced | GM edit replaces the player's record in a batch | Batch still echoes the player's `(k, c, a)` | N/A |
| Older commit | `commit` echo for an older `c` | Entry stays | N/A |
| Denied | Tombstoned/`npc` sheet, edit of tombstoned `rep:`, key outside template, unknown field id, wrong JSON type, no `acl:`, GM-only key form, `d: null` on a non-`rep:` key | `reject denied` echo; player drops entry, value returns, notification "Нет прав на правку" | N/A |
| Remove of removed | Remove of a tombstoned `rep:` | `commit` of the existing tombstone echoing the proposer's `(k, c, a)` | N/A |
| Stale | Low `c` | `reject stale` + current record; player applies its patch to it, `c` + 1, proposes again; add keeps cells, remove stays remove | N/A |
| Stale tombstone | Returned record is a tombstone and entry is an edit | Drop with the notification | N/A |
| Both answers | `commit` and `reject` for one edit | `commit` wins; a `commit` after `denied` applies the value | N/A |
| Unmatched reject | No matching entry | Ignored | N/A |
| Unknown sender | Gate drops `propose` | Entry stays pending under backoff | N/A |
| Catch-up, player | Edit during `catching-up` | Takes `c` on exit, then proposed | N/A |
| Catch-up, GM | `propose` reaches a GM in `catching-up` | Neither commit nor reject | N/A |
| No GM | No GM online | Entries stay pending, resent under backoff | N/A |
| Roll | Player rolls with a pending edit in a referenced field | Roll uses the pending value (deferred from 4.2) | N/A |

</frozen-after-approval>

## Code Map

- `src/core/room-messages.ts` -- add `propose`, `reject`; extend `commit` with acks.
- `src/core/access.ts` -- add the proposal check; `canEdit` exists.
- `src/core/merge.ts`, `src/core/records.ts`, `src/core/preset.ts`, `src/core/field-patch.ts` -- versions, key schemas, template lookups, patch composition.
- `src/replica/engine.ts`, `src/replica/composers.ts`, `src/replica/pending-queue.ts`, `src/replica/commit-outbox.ts` -- GM pending queue, outbox coalescing, command handling.
- `src/core/timing.ts` -- backoff constants.
- `src/core/ui-messages.ts`, `src/ui/main.tsx`, `src/ui/sheet/*` -- projection pending queue, editable player fields.
- `src/replica/engine-roll.test.ts` -- the deferred player pending-roll test.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/room-messages.ts` -- `propose { records: [one record] }`, `reject { k, c, a, reason: 'denied' | 'stale', current? }`, `commit` gains `acks: {k,c,a}[]` (default `[]`) -- AC 3 to 9.
- [x] `src/core/access.ts` -- `checkProposal(context, sender, record)` returning commit / commit-existing / denied / stale -- AC 3, 6.
- [x] `src/replica/` -- player pending queue with backoff, answers handling, catch-up rules; GM proposal handling with acks through the outbox -- AC 2 to 12.
- [x] `src/ui/` -- editable player fields and repeat controls when `canEdit`; windows show pending values from the projection -- AC 1, 10.
- [x] Tests: unit for `checkProposal` (every denied reason and the order); engine tests with a GM and a player for every matrix row, two GMs agreeing, catch-up both sides, backoff; e2e for a player editing a field and a repeat row and the GM seeing it, and a denied edit -- every matrix row.

**Acceptance Criteria:** the twelve criteria of TASK-22.

## Implementation Notes

- No format version bump. `commit.acks` defaults to `[]` on read, so a commit from an older build still parses. A GM omits `acks` when the list is empty, so a commit that answers no proposal is the same bytes as before. The outbox measures each part with `acks: []` in the envelope, so a part never outgrows one message.
- `src/replica/proposal-queue.ts` holds the player's entries: one per key, the patch kept so a stale retry or a catch-up exit can apply it to a newer record, and only the newest version composed when the send queue takes it. The backoff starts again on every new version, on a stale retry, and when the GM link comes back online (`resendAll`).
- An entry made during catch-up has no `c`. It shows at once from the view base at `c + 1`, and it is minted over the replica when catch-up ends. An edit of a repeat row that catch-up removed is dropped there with "Нет прав на правку".
- "Once per denied batch" is a quiet window: a `denied` within `timing.editDeniedQuietMs` (2000 ms) of the last notification shown shows nothing new. Only a shown notification starts the window, read on `performance.now()`. A stale answer whose current record is a tombstone, and an edit that would no longer fit one message, count as a denial.
- The projection store no longer drops the pending view on a live delta. The engine names every key that leaves it in `withdrawn`, so a live player's pending edits stay shown.
- A player made GM turns each entry back into its commands (field patches, a row add with its cells, a row removal). They wait in the GM catch-up queue and apply as the client's own GM edits when catch-up ends. A GM demoted to player, `stop`, and the adoption of a higher generation drop the entries.
- Version-free checks on the GM also include: `a` is the sender's connection id, and `c` is at most `PROPOSE_C_MAX_STEP` (1 000 000) above the current record's `c`, or above 0 when there is none. Field ids and JSON types are checked only for the values that the proposal sets or changes against the current record, so values an older preset left do not block every edit of their row.
- Every proposal gets an answer: an oversized proposal is `denied`, and a `stale` answer whose `current` does not fit one message goes out as `denied`. A GM with no persistence still does not answer; the player resends.
- The commit outbox keeps one ack per author of a key, the newest `c`. When a record and its acks do not fit one message, the record goes again in a later part with the acks left over.
- Accepted, not patched:
  - A player with access can add `rep:` instances without limit. The room copy size check is the backstop.
  - With two GM clients, a player's record with a `c` equal to an unseen GM edit can win the author tie on the GM that has not seen that edit.
  - When a GM leaves catch-up with no `gmLink` change, the player's entries wait for their backoff, up to `proposeResendMaxMs`, before they go out again.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: proposal author `a` unchecked, so a player can forge a GM-looking record | high | Patched: `denied` when `a` differs from the sender's connection; test. |
| Blind and Edge: unbounded `c` locks a key at 2^53 | high | Patched: `PROPOSE_C_MAX_STEP`; test. |
| Edge: rows with fields outside the current template deny every player edit | medium | Patched: only changed fields are validated; test. |
| Edge and Blind: oversized proposals or stale answers get no answer; endless resend | medium | Patched: `denied`; player drops an oversized rebuild with the notification. |
| Edge: stale during catch-up mints at once (AD-7) | medium | Patched; test. |
| Edge: pending entries survive a higher generation | medium | Patched: cleared; test. |
| Edge and Verification: promotion to GM drops entries silently; untested | medium | Patched: replayed as own GM edits; tests. |
| Blind: pending view hides newer GM edits of the same key | medium | Patched: patch applied over the current replica record; test. |
| Blind: `queued` never cleared; dead `sheetId` | low | Patched: send token; field removed. |
| Blind and Verification: quiet window slides and uses wall clock; one-sided test | medium | Patched: fixed window, `performance.now()`, injectable; two tests. |
| Edge: outbox acks grow without bound and can drop the record | low | Patched: one ack per author per key; split across parts. |
| Blind: `sameRecord` key-order dependent | low | Patched: `sameJson`. |
| Edge: `rejectMessage('stale')` without `current` | low | Patched: discriminated parameters. |
| Verification: resend on GM return, room-copy scheduling, persistence-null guard, catch-up revocation, generation drop, stale-unchanged untested | medium | Patched: engine tests; mutations observed red. |
| Blind: unbounded `rep:` instances from a player with access | low | Deferred: room-copy size check is the backstop. |
| Blind and Edge: two GMs — a player's equal-`c` record can win the author tie | low | Deferred: documented. |
| Blind: entries wait up to 30 s after a GM leaves catch-up | low | Deferred: documented. |
| Blind: `TIMING` test literal copied in ~14 files | low | Deferred: test fixture refactor. |
| Verification: the `gone` race in `handlePlayerCommand` untested | low | Deferred: narrow commit-order race. |

## Design Notes

- Check order in `core/access` (decided): first the access and shape checks that do not depend on versions (live `pc` sheet, key form `row:`/`rep:` of that sheet, template and field id, JSON type, live `acl:` for the sender's player id, `d: null` only on `rep:`); then AC 6's order: identical → commit; remove of tombstoned `rep:` → commit existing; edit of tombstoned `rep:` → denied; then the `c` check. An identical proposal from a player without access is therefore `denied`.
- `commit.acks`: every `commit` that answers proposals carries their `(k, c, a)` echoes, also when the batch's record for that key is different (coalesced GM edit, existing tombstone). A player clears an entry on an ack or a record that equals its `(k, c, a)`.
- No format version bump: nothing is released yet, and `acks` defaults to `[]`. Record this in Implementation Notes.
- Backoff: first resend after 2000 ms, doubling, capped at 30000 ms (`proposeResendStartMs`, `proposeResendMaxMs`); reset on a stale retry.
- The player computes `c` as the highest known `c` for the key (records and its own pending) + 1; `a` is the client's author id used elsewhere.
- Before queueing, the player engine runs the same version-free checks locally and refuses `not-allowed` at once on failure.
- "Нет прав на правку" is shown once per `denied` answer batch, not per key.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: a player with access edits a field and adds and removes a repeat row; the GM sees it; revoke and edit again gives "Нет прав на правку".
