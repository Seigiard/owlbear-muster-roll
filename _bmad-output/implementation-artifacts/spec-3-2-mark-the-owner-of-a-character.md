---
title: '3.2 Mark the Owner of a Character'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '70c30645501e71253b961a2691390cf32eccd5eb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-grant-write-access-per-player-and-character.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The GM can grant access, but a player's own character is not marked, so a player with many characters has to search the tab bar. Backlog task: TASK-21, whose eight acceptance criteria apply in full.

**Approach:** Add the radio group "Его персонаж" to the 3.1 access panel. Picking a player writes their `plink:` and `acl:` and tombstones every other live `plink:` of the sheet in one batch; "Никто" tombstones all `plink:` and leaves `acl:` alone. Every client derives one owner per sheet as the live `plink:` with the highest `(c, a)`. The owner's tab bar shows owned characters first, marked "вы".

## Boundaries & Constraints

**Always:** `plink:` holds `{ name }` and is a GM-only write through the normal GM command path, in one batch with the `acl:` write and the tombstones. Owner = the live `plink:` with the highest `(c, a)`, computed by a function in `core/merge` (AD-3: only `core/merge` compares versions). Clearing "Может править" never touches `plink:`; picking a new owner never touches the previous owner's `acl:`. Strings from the copy catalog.

**Never:** Player edits (Story 3.3). Owners for NPCs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick owner | GM picks player B in "Его персонаж" | `plink:{sheet}:{B}` written, `acl:{sheet}:{B}` written (if not live), every other live `plink:` of the sheet tombstoned, one batch | N/A |
| Previous owner | A owned, GM picks B | A's `plink:` tombstoned; A's `acl:` stays | N/A |
| Никто | GM picks "Никто" | All live `plink:` of the sheet tombstoned; `acl:` unchanged | N/A |
| Revoke owner edit | GM clears "Может править" for the owner | `acl:` tombstoned; `plink:` stays; radio still on the owner | N/A |
| Two GMs | Concurrent picks merge two live `plink:` | Every client shows the one with highest `(c, a)` as owner; the next pick tombstones all others | N/A |
| Absent player | `acl:` or `plink:` holder not in the room | Row kept under last known name | N/A |
| Sheet delete | Sheet with `plink:` | Tombstoned | N/A |
| Tab bar | Player owns one character | That character first, marked "вы" | N/A |
| Several owned | Player owns several | Owned first by `(order, sheetId)`, then the rest by `(order, sheetId)` | N/A |
| Radio a11y | Panel | One radio group per sheet named "Его персонаж", options "Никто" + one per row | N/A |
| Player command | Player sends an owner command | `not-allowed` | N/A |

</frozen-after-approval>

## Code Map

- `src/ui/sheet/access-panel.tsx`, `src/core/access.ts` -- the 3.1 panel and rows.
- `src/core/merge.ts` -- add the owner pick.
- `src/core/ui-messages.ts`, `src/replica/composers.ts`, `src/replica/engine.ts` -- add `owner-set { sheetId, playerId | null, name }`.
- `src/ui/main.tsx`, tab bar component -- tab order and the "вы" mark.
- `src/ui/copy.ts` -- strings.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/merge.ts` -- `ownerOf(records, sheetId)` -- AC 2.
- [x] `src/replica/` -- `owner-set` GM command composing one batch -- AC 1, 4, 6, 7.
- [x] `src/ui/sheet/access-panel.tsx` -- radio group "Его персонаж" with "Никто" -- AC 1, 3, 5, 6, 7.
- [x] Tab bar -- owned characters first with "вы" -- AC 8.
- [x] Tests: unit for `ownerOf` and tab order; engine for batch shape, "Никто", concurrent owners, delete; e2e for picking, switching, "Никто", revoke keeping the owner, the player's tab bar -- every matrix row.

**Acceptance Criteria:** the eight criteria of TASK-21.

## Implementation Notes

- Core: `plinkPrefix(sheetId)` in `src/core/records.ts` is the one `plink:` prefix rule. `src/core/merge.ts` holds `ownerOf(records, sheetId)` and `ownersBySheet(records)`, which finds every sheet's owner in one pass. The owner is the live `plink:` with the highest `(c, a)`, then the higher key, so equal versions never depend on the record order. A `plink:` whose data is not `{ name }` or whose player id fails `playerIdSchema` is skipped. `src/core/access.ts` adds `plinkKey`, `ownedSheetIds` (through `ownersBySheet`) and `ownedFirst`, which puts owned sheets first and orders both parts by `(order, sheetId)`.
- Command: `owner-set { sheetId, playerId: string | null, name }`. The batch is, in order: the picked player's `acl:` when it is not live, the tombstones of every other live `plink:` of the sheet, and the picked player's `plink:` when it is not live. A live `plink:` keeps its name. The `plink:` goes last, so a batch cut short never shows a new owner without its `acl:`. "Никто" tombstones every live `plink:` of the sheet. An empty batch is `unchanged`. A player id that the party lists as a GM, or the engine's own player id, is `invalid-player-id` (`ComposeContext.isGmPlayer`). A player gets `not-allowed`. No new rejection reason and no format version change.
- Panel: the radio group "Его персонаж" stands apart from the rows. It holds "Никто" and one option per row, named by the player's name, and uses roving `tabIndex` on `role="radio"` buttons. The arrow keys, Home and End move the focus only. Space, Enter or a click picks. The panel state is one reducer. An owner pick ends when its own rejection arrives, or when the sheet's `plink:` versions and the picked `acl:` version have moved past the versions at send time, whoever's pick won. An `unchanged` rejection counts as success for owner picks and for `acl-set`. A timeout fails only the change it was started for. A failure shows the existing `aclFailed`. A pick shows the player's "Может править" checked at once, and drops a pending `acl-set` of that player.
- Tab bar: only a player's characters are reordered. A GM owns none. `ShellTab.mark` shows after the label and is never cut. `TabBar` names such a tab "{label}, {mark}", for example "Брок, вы".
- Copy: `label.owner: 'Его персонаж'`, `label.noOwner: 'Никто'`, `ownMark: 'вы'`. The owner-pick failure reuses `aclFailed`.
- Accepted: when two GMs pick different owners at once, the losing player's `acl:` stays live. The GM clears it in the panel.
- Sheet delete: already tombstones `plink:` through `isSheetDependent`. `engine-access.test.ts` and `owner.e2e.ts` cover it.
- Tests: `src/core/merge.test.ts`, `src/core/access.test.ts`, `src/core/ui-messages.test.ts`, `src/replica/engine-access.test.ts`, `tests/owner.e2e.ts`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: arrow keys in the owner radios grant edit access to every player passed | high | Patched: roving focus; commit on Space, Enter or click; e2e. |
| Blind: the radiogroup wraps the access rows | low | Patched: separate group. |
| Blind and Edge: a losing or `unchanged` pick shows a false failure; timers can fail the wrong pick | medium | Patched: settle on version change; `unchanged` is success; reducer with per-command timers. |
| Verification: owner-pick rejection, timeout-free success and instant checkbox untested | medium | Patched with e2e; rejection test observed red. |
| Edge: equal `(c, a)` owners depend on iteration order | low | Patched: key tie-break. |
| Blind: owner lookup is sheets × records per change | low | Patched: `ownersBySheet`. |
| Blind and Edge: `owner-set` accepts a GM or the sender's own id | low | Patched: `invalid-player-id`; tests observed red. |
| Blind: concurrency test passes with any deterministic rule | low | Patched: owner computed from stored records. |
| Blind: hand-built `plink:` prefixes | low | Patched: `plinkPrefix`. |
| Blind: tab mark name only by contract; GM own-plink path untested | low | Patched: `TabBar` builds the name; e2e. |
| Blind: unreachable rename branch | low | Removed. |
| Blind: two GMs picking at once leave the loser's `acl:` live | low | Accepted; recorded in Implementation Notes. |

## Design Notes

- Failure handling in the panel follows 3.1 (`aclFailed`-style message, 5 s timeout); reuse it for the radio group.
- The "вы" mark is part of the tab's accessible name (for example "Брок, вы").

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.
