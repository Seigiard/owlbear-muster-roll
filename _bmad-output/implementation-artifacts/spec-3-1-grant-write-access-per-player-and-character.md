---
title: '3.1 Grant Write Access per Player and Character'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'abdc59cfa558458f8d886659ffde13294ffd60ae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Players can only read. Before any player edit can exist, the GM needs a way to say which player may edit which character. Backlog task: TASK-20, whose five acceptance criteria apply in full. It opens Epic 3.

**Approach:** Add a "Доступ" chip to the GM character header that opens an inline access panel with one row per player and a "Может править" checkbox writing or tombstoning `acl:{sheetId}:{playerId}`. Show the player's own access in their header.

## Boundaries & Constraints

**Always:** `acl:` holds `{ name }` and is a GM-only write through the normal GM command, persistence, send and room-copy path. Access on = a live `acl:` record; off = its tombstone. Strings from the copy catalog. Players never see the chip or the panel. Sheet delete already tombstones `acl:` (verify).

**Never:** The owner radio group and `plink:` writes (Story 3.2). Player edits, `propose`, `commit`/`reject` from players, editable player fields (Story 3.3). Changing access for NPCs (characters only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | GM presses "Доступ" in a character header | Panel inline under the header: `surface-bar`, `line` border, `md` radius; chip shows pressed state | N/A |
| Rows | Players in the room and players holding `acl:` or `plink:` for this sheet | One row per player id, GMs excluded, ordered by name | N/A |
| Name | Player in the room | Current party name | N/A |
| Name, absent | Player only in records | Name from the `acl:` record, else `plink:` | N/A |
| Guest note | Any panel | "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова." | N/A |
| Empty | No players | "Пока никого нет" with the guest note | N/A |
| Grant | GM checks "Может править" | `acl:{sheetId}:{playerId}` = `{ name }` written at once | N/A |
| Revoke | GM unchecks | `acl:` tombstoned at once | N/A |
| Player header | Player with a live `acl:` for that sheet | "Можно править"; otherwise "Только чтение" | N/A |
| Sheet delete | Sheet with `acl:` records | Records tombstoned | N/A |
| Player command | Player sends an `acl:` command | Refused `not-allowed` | N/A |
| NPC | NPC block | No chip | N/A |

</frozen-after-approval>

## Code Map

- `src/ui/sheet/sheet-header.tsx` -- character header; existing chips and status ("Токен привязан").
- `src/ui/copy.ts` -- access strings (check which exist).
- `src/core/ui-messages.ts`, `src/replica/composers.ts`, `src/replica/engine.ts` -- GM commands; add `acl-set { sheetId, playerId, name, on }`.
- `src/core/records.ts` -- `acl:` key and data schemas.
- `src/core/visibility.ts` -- players already receive `acl:`/`plink:` of their characters.
- `src/platform/ports.ts` -- party port for players in the room.
- `src/platform/mock/*` -- mock party members for tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/` -- pure panel row builder from party members and records (ids, names, GMs excluded, order) -- AC 2, 3.
- [x] `src/replica/` -- `acl-set` GM command; player refused; the projection carries the party list the panel needs -- AC 4, 5.
- [x] `src/ui/sheet/` -- "Доступ" chip and inline access panel; player header access text -- AC 1 to 4.
- [x] Tests: unit tests for rows; engine tests for grant, revoke, refusal, sheet delete; e2e with a GM and a player for open, rows, empty, grant and revoke changing the player header -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-20.

## Implementation Notes

- Core: `src/core/records.ts` holds `playerIdSchema` (`^[^:\s]{1,128}$`), and the `acl:` and `plink:` key schemas are built from the same pattern, so one rule decides every player id. `src/core/access.ts` holds `PartyEntry`, `AccessRow`, `aclKey`, `canEdit`, `playerName` (trimmed, at most 100 code points), `partyEntries`, `accessRows` and `shownName`. Rows come from valid non-GM party ids and live `acl:`/`plink:` records of the sheet. A player id that the party lists as a GM, or this client's own id, gets no row, also when only records name it. The name is the first non-blank of party, `acl:`, `plink:`; with none it is `null` and the row shows the id. Order: `Intl.Collator('ru')`, ties by player id.
- Command: `acl-set { sheetId, playerId, name, on }`. On: a live `acl:` with `{ name }`, the name trimmed and cut to 100 code points, `""` when blank or unknown. Off: a tombstone. New rejection reasons: `invalid-player-id` and `not-character` (NPC); sheet data that fails its schema is `unknown-sheet`. A grant already live with that name, or a revoke with no live record, is `unchanged`. A player gets `not-allowed` from the existing role check.
- Party in the projection: `projection` and `delta` carry `party`, built by `partyEntries`: one entry per valid player id (a GM when any connection is one), sorted by id, at most 100, names cut to 100 code points. The schema enforces the same bounds, with `.default([])` so a newer window reads an older background. Only a GM engine fills it. The engine creates the roster after the state its callback reads and sends a delta when the list changes. The window keeps it in `$party`.
- UI: the "Доступ" chip is the `Chip` primitive, which now takes `pressed`, `expanded`, `controls` and `ref` (`Pressable` passes `aria-expanded`/`aria-controls`). `SheetHeader` takes an explicit `kind`; only `kind="pc"` (with this client's `playerId`) shows the chip. `AccessPanel` is a `region` named "Доступ" right after the `header`, on `surface-bar`, `line` border, `rounded-md`. Each row is a `group` named by the player; its checkbox is named "{name}: может править". The panel keeps the latest sent change per player and shows it at once. A change ends only when a rejection names its own command id, or an `acl:` record with a version newer than the one at send time shows its state. A rejection, a send failure, or no answer within `ACCESS_CHANGE_TIMEOUT_MS` (5 s, `core/timing`) drops it and shows `aclFailed` in a `status` live region. `Esc` closes the panel and focuses the chip.
- Player header: `ReadOnlySheetHeader` takes `canEdit`. The window reads its own player id from the player port at start and checks `canEdit` over its visible records.
- Copy: `label.mayEdit: 'Может править'`, `label.mayEditFor`, `noPlayers: 'Пока никого нет'` and `aclFailed: 'Не удалось изменить доступ. Попробуйте ещё раз.'`. None is in the Voice and Tone table. `guestNote`, `place.access`, `status.canEdit` and `status.readOnly` already existed.
- Sheet delete: verified. The 1.7 path already tombstones `acl:` (`engine-client.test.ts` › sheet-delete). `engine-access.test.ts` and `access.e2e.ts` also check it for records the panel wrote or seeded.
- Tests: `src/core/access.test.ts`, `src/replica/engine-access.test.ts`, `tests/access.e2e.ts`. `tests/support/room.ts` `addPartyMember` takes an optional player id and name. `tests/field-edit.e2e.ts` tab order now includes "Доступ" after the name field, as UX-DR10 orders the header.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind, Edge and Verification: a rejected or lost `acl-set` silently reverts or sticks; fast toggles settle early | medium | Patched: per-command settle, 5 s timeout, `aclFailed` message; e2e observed red. |
| Blind and Edge: player id rules disagree between key schemas, `canEdit` and the panel | medium | Patched: one `playerIdSchema`. |
| Edge claim: GMs or this client named only in records get rows | low | Patched: excluded. |
| Blind and Edge: the player id stored as a name; `acl-set` name unchecked | low | Patched: unknown name sends `''`; trimmed and capped in the composer. |
| Edge: `partySchema` unbounded in every envelope | low | Patched: capped, deduped, sorted. |
| Edge and Blind: adjacent-build claim holds one way only; untested | low | Comment fixed; default tested. |
| Blind: `followParty` depends on declaration order | low | Patched. |
| Blind: every checkbox has the same accessible name | low | Patched: named by player. |
| Blind: chip class copied; chip keyed off an `access` prop | low | Patched: `Chip` primitive extended; explicit `kind`. |
| Blind: "Можно править" before player edits exist | low | Accepted: Story 3.3 follows in this run. |

## Design Notes

- The last known name written into `acl:` is the party name at the moment of the change; the record name is not rewritten later unless the GM changes access again.
- The panel lists every player id once even with several connections (one id, many connection ids).
- The chip is a toggle button with `aria-expanded` and `aria-controls`; `Esc` in the panel closes it and returns focus to the chip.
- Player header text sits where the "Только чтение" header text already is (Story 2.3).

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: GM grants and revokes access for a player in another browser; the player's header changes.
