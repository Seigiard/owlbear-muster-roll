---
title: '2.6 Read Characters With No GM Online'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'eed51cbec78df66affb30f07acf427d2e1bd38cb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-let-players-read-every-character-and-no-npc.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** With no GM online, a player stays on "Загрузка…" even when the room copy holds every character. Backlog task: TASK-19, whose five acceptance criteria apply in full. It closes Epic 2.

**Approach:** Treat a readable room copy as a data source for the player window after a catch-up that timed out, add the two no-GM player states, and make a player catch up when a GM starts answering again.

## Boundaries & Constraints

**Always:** Players read the copy through the 2.5 path and `core/visibility`; NPCs never show. The no-GM banner rule of 2.4 stays. Strings come from the copy catalog. A player never writes the copy and sends no edits.

**Never:** Player edits (Epic 3), writing metadata from a player, changing the 2.5 writer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Copy, no GM | Player, catch-up timed out, readable copy with a preset and characters | Every character from the copy, read-only; no NPC; no-GM banner | N/A |
| Copy, no characters | Readable copy with a preset and no character | "ГМ ещё не создал персонажей." with the no-GM banner | N/A |
| Copy, no preset | Readable copy with no preset | "ГМ ещё не настроил листы." with the no-GM banner | N/A |
| No copy, no GM | Catch-up timed out, no copy | "ГМ ещё не заходил. Листов пока нет." with the no-GM banner | N/A |
| Higher `v` | Copy written by a newer build | New-version banner; copy not read; panel keeps "Загрузка…" | N/A |
| Undecodable | Copy does not decode | "Копия в комнате не читается. Дождитесь ГМ." with the no-GM banner | N/A |
| No live edits | Player with no GM | Sends no commits and no edits | N/A |
| GM returns | First GM-origin message after `gmLink` was offline | Player enters `catching-up` with a new `r`; on a complete answer the banner goes and sheets show current data | N/A |
| GM present | Catch-up answered | Unchanged 2.3 behavior | N/A |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts` -- catch-up copy read for players, `roomCopy` status, `gmLink` transitions.
- `src/core/ui-messages.ts` -- the projection's `roomCopy` must reach player windows, including an `unreadable` and a `newer` outcome.
- `src/ui/main.tsx` -- `playerLayout` empty states and their conditions.
- `src/ui/copy.ts` -- `roomCopyUnreadable` exists; add `playerNoGmNoData`.
- `tests/player.e2e.ts`, `tests/room-copy.e2e.ts`, `tests/support/room.ts` -- player and metadata helpers.

## Tasks & Acceptance

**Execution:**
- [x] `src/replica/engine.ts`, `src/core/ui-messages.ts` -- player-visible copy outcome: `read`, `none`, `unreadable`, `newer`; catch-up on GM return -- AC 1 to 5.
- [x] `src/ui/main.tsx`, `src/ui/copy.ts` -- player states by data source (GM answer or readable copy) -- AC 1 to 4.
- [x] Tests: engine tests for every matrix row; `tests/no-gm.e2e.ts` with a player alone and a seeded room copy (readable, absent, higher `v`, undecodable), then a GM joining -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-19.

## Implementation Notes

- Projection: `roomCopy.outcome` is `'read' | 'none' | 'unreadable' | 'newer' | null` (`roomCopyOutcomeSchema` in `src/core/ui-messages.ts`), with `.default(null)` so windows and backgrounds of adjacent builds still parse. `null` until a catch-up has read the room metadata. Only the catch-up merge (`mergeRoomCopy`) sets it. `read` means the copy's records were merged; `none` means no copy; `unreadable` covers a copy that does not decode, a copy of another generation the client does not take, and a failed read while no outcome is known yet (a failed read later keeps the last outcome). The outcome is set before the copy's records merge, so the delta that brings them carries it.
- UI: `dataSourceKnown = sync.gmAnswered || roomCopy.outcome === 'read'` gates both 2.3 player empty states. With no data source, `noSourceContent()` shows `playerNoGmNoData` for `none` and `roomCopyUnreadable` for `unreadable`, only once the first catch-up ended and while `gmLink` is `offline`; a GM that is online but has not answered shows "Загрузка…". `newer` and `null` keep "Загрузка…". New catalog entry `playerNoGmNoData`.
- GM return: `setGmLink` enters catch-up with the trigger `gm-return` (new `r`) when the link goes `offline` to `online` on a live player. The request waits `random() × stateAnswerDelayMaxMs`, so players that heard one GM do not ask in one burst. A `state` for the client's last `r` never starts it, so a late complete answer still sets `gmAnswered`. "Not on the first `online` after start" is read as "not during the start catch-up": a player whose start catch-up timed out before any GM spoke still catches up when the first GM joins (AC 5).
- Lost requests: a client still catching up whose request is out and unanswered asks again with the same `r` when `gmLink` turns `online`, as its request may have gone out before that GM was there. A GM that cannot answer (in its start, role, generation or page-return catch-up) remembers each requested `r` (bounded by `RECENT_NONCE_LIMIT`) and, on leaving catch-up, answers those not answered meanwhile through the normal delay and suppression.
- The catch-up trigger `'return'` is renamed `'page-return'`.
- Tests: `src/replica/engine-no-gm.test.ts` covers every matrix row, the re-ask with the same `r`, a GM joining during a player's start catch-up, a `gm-return` request reaching a GM still in its start catch-up, a live GM that hears a new GM tab, a late answer from an unheard GM, a failed read and a copy of another generation; each new rule observed red under mutation. `tests/no-gm.e2e.ts` covers readable, no characters, no preset, absent, higher `v`, undecodable, a refused edit sent through the window command path with a ping waited for, a GM joining with newer data or with no copy, and a GM that speaks without answering (red without the `gmLink` guard). Existing tests: the 2.3 e2e "keeps the loading text" now expects `playerNoGmNoData`; the player drift test and the player "refuses as not allowed" test avoid or wait out a `gm-return` catch-up; `syncRead` moved to `tests/support/room.ts`; fixtures carry `outcome`.

## Spec Change Log

- Review: the `gm-return` trigger fires for player clients only. The Design Note called it harmless for a GM client; it is not: a live GM tab that hears a new GM tab would wait out `catchUpTimeoutMs` with its edits pending, no `alive` and no room copy writes. Known-bad state avoided: GM edits delayed by up to 4 s whenever another GM tab opens.
- Review: a GM in catch-up keeps the requests it could not answer and answers them when it leaves; a catching-up client asks again with the same `r` when a GM comes online. Known-bad state avoided: a player whose request reached a joining GM, or went out before it joined, never gets its state.
- Review: a copy of another generation, and a failed read with no outcome yet, report `unreadable`, not `none`/`null`. Known-bad states avoided: "ГМ ещё не заходил" over a copy that exists; "Загрузка…" forever after a failed read.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind, Edge and claim check: a GM in its start catch-up drops a player's request and nobody asks again, so AC 5 held only on lucky timing | high | Confirmed by reading. Patched: a GM remembers requests it could not answer and answers on exit; a client re-asks with the same `r` when a GM comes online; tests observed red. |
| Blind and Edge: `gm-return` sends a live GM into a timeout-long catch-up when another GM tab opens | medium | Patched: players only; Spec Change Log corrects the Design Note. |
| Blind and Edge: `gm-return` requests from all players burst at once | low | Patched with jitter. |
| Blind: a late complete answer that is the first GM message no longer counts | medium | Patched; the 2.3 tests restored to their meaning and observed red. |
| Blind and Edge: a failed metadata read leaves the outcome unknown forever | medium | Patched: `unreadable`; test. |
| Blind and Edge: a copy of another generation reads as "no copy" | low | Patched: `unreadable`; test. |
| Blind and Edge: a strict schema breaks adjacent builds | low | Patched with a default. |
| Verification: the `gmLink` guard of the player empty state is untested | medium | Patched with an e2e case; observed red. |
| Blind and Edge: the no-commit e2e passes whatever happens | low | Patched with a real command and a ping wait. |
| Blind: `return` and `gm-return` names; missing `mock.restore`; timing-fragile ghost pings | low | Patched. |
| Blind: a test rewritten so "while live" is no longer live | low | Restored. |
| Verification: outcome `read` and the copy's records arrive in order, untested | low | Deferred as filed: a two-delta gap needs a delta-recording harness. |
| Edge: a GM online that never answers keeps the player on "Загрузка…" | low | With remembered requests the GM answers on exit; a GM with unreadable storage never answers by design. Rejected. |

## Design Notes

- New catalog entry: `playerNoGmNoData: 'ГМ ещё не заходил. Листов пока нет.'`.
- A player's data source is known when `gmAnswered` is true or its last catch-up read a copy of its generation. The 2.3 player empty states then apply with that source.
- "GM returns" adds an AD-7 entry trigger for a client whose `gmLink` goes from `offline` to `online`. A GM client gets the same trigger; it is harmless and keeps one rule. It does not fire on the first `online` after start, which the start catch-up covers.
- A higher-`v` copy keeps "Загрузка…" in the panel, because the banner already asks for a reload.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: GM edits and closes every GM tab; a player opens the room and reads characters with the banner; the GM comes back and the banner goes.
