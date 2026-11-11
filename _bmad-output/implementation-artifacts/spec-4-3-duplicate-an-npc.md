---
title: '4.3 Duplicate an NPC'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'e9c13b0ceeec5f324257f1c4af1232a444adae8f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11-keep-npcs-on-their-own-tab.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A GM who needs nine skeletons must create and fill nine NPCs by hand. Backlog task: TASK-26, whose five acceptance criteria apply in full.

**Approach:** Add "Дублировать…" to the NPC block's "⋯" menu. It opens an inline count field; on a valid count the GM's `replica` writes, in one batch, full independent copies of the NPC under new `sheetId` values, named by the numbering rule and placed at the end.

## Boundaries & Constraints

**Always:** GM only. One command from the window; the engine builds every record. Copies are new `sheet:`, `row:` and `rep:` records at `c: 1` under new nanoid ids (new `sheetId`, and new `rep:` instance ids), with no `link:` record. Live (non-tombstone) source records only. Strings from the copy catalog (`menu.duplicate`, `badDuplicateCount`). The commit goes through the existing batch, persistence and send path, so other clients and the room copy get it like any GM edit. No browser dialog.

**Never:** Copying `link:` records, tombstones or versions. Renaming the source. Player access.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | GM picks "Дублировать…" in an NPC's "⋯" | Inline number field in the NPC block, 1 to 50, default 1, focused; confirm and cancel controls | N/A |
| Bad count | Empty, non-number, fractional, < 1, > 50 | "Нужно число от 1 до 50" under the field; nothing written; field stays open | N/A |
| Numbered source | "Скелет 1", count 9, no other skeletons | "Скелет 2" … "Скелет 10" at the end, same values | N/A |
| Higher exists | "Скелет 1", "Скелет 7" exist, count 2 | "Скелет 8", "Скелет 9" | N/A |
| Unnumbered source | "Скелет", count 2, no numbered skeletons | "Скелет 1", "Скелет 2"; source stays "Скелет" | N/A |
| Different base | "Скелет-лучник 3" exists | Not counted for "Скелет" | N/A |
| Repeat rows | Source has repeat rows | Each copy has the same rows in the same order, new instance ids | N/A |
| Independent | GM edits one copy | Source and other copies unchanged | N/A |
| Cancel | `Esc` or cancel control | Field closes; nothing written; focus returns to "⋯" | N/A |
| Catch-up | GM in `catching-up` | Command waits in the pending queue like other GM intents, or is refused like preset upload — follow how 1.11 "Добавить NPC" behaves | N/A |
| Long name | Base + number exceeds the sheet name limit | Base is shortened so the name fits | N/A |
| Player | Player window | No "⋯", no command; engine refuses a duplicate command from a player | N/A |

</frozen-after-approval>

## Code Map

- `src/ui/sheet/npc-tab.tsx` -- NPC blocks and their "⋯" menu (1.11).
- `src/ui/copy.ts` -- `menu.duplicate`, `badDuplicateCount`.
- `src/core/ui-messages.ts` -- window commands; add a duplicate command `{ sheetId, count }`.
- `src/core/sheets.ts` -- `parseSheetName`, `SHEET_NAME_MAX_LENGTH`, `sortSheets`, `liveSheets`, dependent-key helpers.
- `src/core/records.ts` -- `row:` and `rep:` key helpers.
- `src/replica/engine.ts`, `src/replica/composers.ts` -- GM command handling and record composition (see how "Добавить NPC" and sheet delete compose batches).

## Tasks & Acceptance

**Execution:**
- [x] `src/core/` -- pure `duplicateNames(sourceName, existingNpcNames, count)` and `parseDuplicateCount(text)`; unit tests for every naming row and every bad count -- AC 2, 4.
- [x] `src/replica/` -- duplicate command: compose the copy batch from the source's live records with new ids at `c: 1`, `order` after the current last NPC, no `link:` -- AC 3, 5.
- [x] `src/ui/sheet/npc-tab.tsx` -- "Дублировать…" menu item; inline count block on `surface-bar` with a `line` border and `md` radius; error text under the field -- AC 1, 2.
- [x] Tests: engine tests for the batch shape and independence; e2e on the mock room for open, bad count, nine copies with names and values, unnumbered source, edit independence, cancel -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-26.

## Implementation Notes

- The code map names `src/ui/sheet/npc-tab.tsx` for the UI, but the UI lives in `src/ui/sheet/sheet-header.tsx`: it owns the "⋯" menu and renders the count block from `src/ui/sheet/duplicate-count.tsx` under the NPC header. `npc-tab.tsx` only widens its `store` type to pass `$records`.
- New catalog strings: `command.confirmDuplicate: 'Дублировать'` labels the confirm control. It is the menu verb with no ellipsis, as no further step follows; no existing verb fits. `label.duplicateCount: 'Количество копий (1–50)'` names the field and the block and states the range for sight and assistive tech. `duplicateFailed: 'Не удалось дублировать. Попробуйте ещё раз.'` shows under the field when the send fails or the engine rejects the command. None is in the Voice and Tone table.
- `menu.duplicate` in this spec is `copy.command.duplicate`, which already held "Дублировать…".
- Core: `src/core/npc-duplicate.ts` holds `duplicateNames`, `parseDuplicateCount` and `isDuplicateCount`. The base drops trailing spaces when parsed and compared. Numbers are bigints. A number whose fitted name a live NPC already has is skipped, so a shortened base never repeats names. A long base is cut between graphemes (`Intl.Segmenter`) to fit 100 code points. A number that cannot fit alone returns `name-too-long`, which the engine rejects as `invalid-name`.
- Command: `{ type: 'sheet-duplicate', sheetId, count }`. New rejection reasons: `invalid-count` (the engine checks the count again) and `not-npc` (a character is never duplicated).
- Composer: rows and repeat rows are copied from live records only. Each copy's `sheet:` record goes after its rows, so a storage failure part way leaves no half-visible copy (orphan `row:`/`rep:` records show nowhere). `ComposeContext.newId` takes a role: `sheet:{copy index}` and `rep:{copy index}:{section}:{source instance}`.
- Catch-up: the command waits in the pending queue like "Добавить NPC". The engine keeps each pending intent's ids by command id and role, so every pending view and the replay use the same keys even when source rows arrive between them. The ids clear on replay.
- The block stays open after confirm until a new NPC sheet shows (as a record or in the pending view), so a send failure or a rejection shows `duplicateFailed` under the field. Confirm, `Esc` and "Отменить" return focus to "⋯". Picking "Дублировать…" again focuses the field.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind, Edge and Verification: reserved ids taken by call order shift roles when catch-up changes the source's rep rows | high | Confirmed by a probe. Patched: ids keyed by role; catch-up test observed red. |
| Blind and Edge: `"Скелет  1"` keeps a trailing space in the base; shortened bases repeat names | medium | Patched: trimmed base; taken names skipped; tests. |
| Edge: base cut splits graphemes | low | Patched: `Intl.Segmenter`. |
| Blind: a number that cannot fit returns an invalid name | low | Patched: `name-too-long` → `invalid-name`. |
| Blind: any non-duplicate menu key runs delete | medium | Patched: explicit delete key. |
| Blind and Edge: re-picking "Дублировать…" does not focus the field | low | Patched; e2e observed red. |
| Blind and Edge: a rejection after confirm is silent | medium | Patched: block stays open; catalog `duplicateFailed` on failure. |
| Blind: the 1–50 range shows only after an error | low | Patched: label "Количество копий (1–50)". |
| Blind: "whole copies only" comment overclaims | low | Reworded. |
| Blind: compose sorts the whole replica | low | Patched: filter first. |
| Blind: composer rejections and count 50 untested | low | Patched with tests. |
| Blind: copies share one parsed `d` object | low | Rejected: records are treated as immutable across the engine. |
| Blind: e2e checks only sheet id format | low | Rejected: instance id reuse is covered in engine tests. |
| Edge claim: code map names `npc-tab.tsx` | low | Recorded in Implementation Notes. |
| Implementer: the block closes when any new NPC appears, so another GM's add can close it early | low | Deferred. |

## Design Notes

- Base name = source name without a trailing ` <digits>`. The highest number is taken over live NPCs whose name is exactly `base` + space + digits. The source's own number counts.
- The count field accepts only a whole number written in digits, 1 to 50; it uses its own parse, not the 1.9 number parser.
- The control to confirm is labelled by its job (interface-copy rule); reuse an existing catalog verb if one fits, else add one string and record it in Implementation Notes.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: duplicate an NPC 9 times; a second GM device sees the copies; reload keeps them.
