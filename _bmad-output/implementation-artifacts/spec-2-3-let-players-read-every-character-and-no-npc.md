---
title: '2.3 Let Players Read Every Character and No NPC'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '38960037ad56beafc0f6e6f7e3bca2c76f3ccd22'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-catch-up-on-join-and-on-return.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A player client stays on "Загрузка…" forever, although it holds every record after catch-up. Backlog task: TASK-16, whose five acceptance criteria apply in full.

**Approach:** Make `core/visibility` apply the player rules, route every view through it, and render a read-only player window: character tabs only, "Только чтение", values as text, no row controls, and the two player empty states.

## Boundaries & Constraints

**Always:** Hiding is at the interface only: a player client still holds and merges NPC records. Every view reads sheets through `core/visibility`; nothing in `ui` filters by kind or role on its own. Strings come from the copy catalog. A role change re-renders from the role in the sync state.

**Never:** Player edits or "Ожидает" (Epic 3), the no-GM banner and the no-data-no-GM state (2.4, 2.6), token menus (Epic 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Player tabs | Player, catch-up done, characters and NPCs exist | A tab per character in `(order, sheetId)` order with its full sheet; no NPC tab, gear or "+" | N/A |
| Visibility | `visibleRecords('PLAYER', records)` | Drops `sheet:` records of `kind: "npc"` and every record that depends on an NPC sheet (`row:`, `rep:`, `link:` of it); keeps `preset`, characters and their dependents | N/A |
| GM visibility | `visibleRecords('GM', records)` | Unchanged | N/A |
| Header | Player on a character | Name as text, not a field; "Только чтение" in the header; no "⋯" | N/A |
| Values | Player sheet | Text, number and check values render read-only and take no focus; a check shows its state without a control | N/A |
| Repeat rows | Player sheet | Rows render; no "Добавить строку" and no "Удалить" | N/A |
| No preset, answered | First catch-up ended with a complete answer, no preset | "ГМ ещё не настроил листы." | N/A |
| No preset, unanswered | First catch-up ended by timeout, no preset | "Загрузка…" stays until Story 2.6 | N/A |
| No characters | Preset, no character | "ГМ ещё не создал персонажей." | N/A |
| Live update | GM edits a character | The player view updates in place | N/A |
| NPC created | GM creates an NPC | Nothing changes in the player window | N/A |
| Demotion | GM on NPC tab, Settings, or with a confirmation open, becomes player | First available tab active; confirmation closed; player view | N/A |
| Promotion | Player becomes GM | GM view with NPC tab, gear and "+" | N/A |

</frozen-after-approval>

## Code Map

- `src/core/visibility.ts`, `src/core/sheets.ts` (`isSheetDependent`, `liveSheets`) -- player rules.
- `src/replica/engine.ts` -- projection and deltas already pass through `visibleRecords`; a role change must re-project.
- `src/core/ui-messages.ts` -- `syncSchema`; add whether the first catch-up was answered.
- `src/ui/main.tsx` -- layouts by role, tab fallback, confirmation close, empty states.
- `src/ui/sheet/sheet-header.tsx`, `sheet-body.tsx`, `preset-section.tsx`, `preset-cell.tsx` -- read-only rendering.
- `src/ui/copy.ts` -- `readOnly` exists; add the two player empty states.
- `tests/catch-up.e2e.ts`, `tests/support/room.ts` -- player client helpers.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/visibility.ts` -- player rules with unit tests -- AC 1.
- [x] `src/replica/engine.ts`, `src/core/ui-messages.ts` -- re-project on a role change; `sync.gmAnswered` -- AC 1, 3, 5.
- [x] `src/ui/` -- player layout, read-only header, values and repeat sections, empty states, demotion fallback -- AC 1 to 5.
- [x] `tests/player.e2e.ts` with a GM client and a player client on real pages -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-16.

## Implementation Notes

- `core/visibility`: for a player, `visibleRecords(role, records, known = records)` drops a `sheet:` record whose data says `kind: "npc"`, and shows a dependent record (`row:`, `rep:`, `acl:`, `plink:`, `link:`) only while `known` holds its sheet as a live character. A row that comes before its sheet, a dependent of a deleted sheet, and a link that points to an NPC stay hidden. A sheet tombstone stays. `visibleRecordMap` returns a GM's map as is; `visibleSheets` is the only way a view lists sheets. `core/sheets` reads a dependent's sheet id through `dependentSheetId` (link data schema for `link:`, the key segment for keyed forms, both checked with `sheetIdSchema`).
- Engine: a player's delta compares the whole visible set with the keys the windows hold (`sentVisible`, set by each projection). It sends records that became visible (a character's rows when its sheet arrives) and withdraws keys that are no longer visible. A GM delta does none of this work. `withdrawn` now drops a key from the window's replica as well as its pending view, before the delta's records apply, and only the first part of a delta carries it; a key that leaves the pending view comes with its replica record again. One delta stream goes to every window, so one held set serves them all.
- Role change: a new engine id and sequence, so every window asks for a fresh projection.
- `sync.gmAnswered` (renamed from the spec's `firstCatchUpAnswered`) is true once a catch-up ends with all parts of one answer, or once a complete answer to the last own `r` arrives after a timeout. It is never reset.
- UI: a player gets `playerLayout()`. Both empty-state texts need `gmAnswered`; otherwise "Загрузка…" stays. Character tabs show `ReadOnlySheetHeader` (name as `h1`, "Только чтение") and `SheetBody` with `editing={null}`. A tab the role does not have falls back to the first tab. A non-GM role clears the confirmation, the settings toggle, waited creations and deletions, and pending focus targets.
- Read-only cells: text and number as a `role="group"` span named by the field label; a check as `role="img"` named like "Устал: отмечено". Repeat sections render through `ReadOnlyRepeatContent` with no row controls.
- Tests: `src/core/visibility.test.ts`, `dependentSheetId` cases in `src/core/sheets.test.ts`, `player visibility` in `src/replica/engine-catch-up.test.ts` (split answer, re-pointed link and late answer observed red under mutation), `tests/player.e2e.ts`. The 2.2 e2e "a player stays on the loading text" was removed, as this story replaces that behavior; its storage assertion moved to `tests/player.e2e.ts`.

## Spec Change Log

- Review: `sync.firstCatchUpAnswered` became `sync.gmAnswered`. It turns true on any catch-up that held a complete GM answer, including a late one, and never resets. Known-bad state avoided: a player stuck on "Загрузка…" after a GM did answer.
- Review: player visibility denies a dependent record unless its sheet is a known live character, and the engine withdraws keys that leave the visible set. Known-bad state avoided: NPC data in a player window.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Verification, Blind and Edge: NPC dependents reach a player when a multi-part answer splits a sheet from its rows | high | Confirmed by reading; breaks FR2. Patched: default-deny player visibility and an engine diff that sends newly visible and withdraws newly hidden keys; test observed red. |
| Blind and Edge: a link re-pointed to an NPC stays in the player window | medium | Patched by the same diff; test observed red. |
| Blind: a full answer after the timeout does not count as answered | medium | Patched; test observed red. Field renamed `gmAnswered`, as it is never reset. |
| Verification: the answered flag's persistence untested | low | Patched with two engine tests. |
| Blind: "no characters" shows without a GM answer | medium | Patched: requires `gmAnswered`. |
| Blind and Edge: demotion keeps create, delete and focus state | medium | Patched. |
| Verification: Settings closed on demotion untested | low | Patched with an e2e case; observed red. |
| Blind: read-only values lose the field name for screen readers | medium | Patched: each value is named by its label; a check reads "Устал: отмечено". |
| Blind: comment claims the window filter hides NPCs during the role gap | low | Comment fixed. |
| Blind: GM deltas do player work | low | Patched. |
| Edge and Blind: link sheet id read with a different rule; `dependentSheetId` untested | low | Patched with unit tests. |
| Edge: removed player storage assertion | low | Restored in `tests/player.e2e.ts`. |
| Blind: tests check one tab only; rename and delete for a player untested; literal string | low | Patched. |

## Design Notes

- New catalog entries: `playerNoPreset: 'ГМ ещё не настроил листы.'`, `playerNoCharacters: 'ГМ ещё не создал персонажей.'`.
- "Только чтение" sits in the header next to the name, in `label-sm` and `text-muted`.
- Read-only values: text and number as plain text in the cell's place (an empty value shows nothing); a check as a non-interactive mark with an accessible state (`role="img"` with a label such as "отмечено" / "не отмечено", added to the catalog). Layout matches the GM grid, so a sheet looks the same for both roles.
- Read-only values are not form controls, so Tab skips them.
- A role change in the engine sends a fresh projection, because visibility changes the record set.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: join the room as a player in a second browser; see characters only; GM edits a value and the player sees it.
