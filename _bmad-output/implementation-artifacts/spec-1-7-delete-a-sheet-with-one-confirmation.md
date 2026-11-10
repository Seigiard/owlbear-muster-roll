---
title: '1.7 Delete a Sheet With One Confirmation'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'd10249f5804d7125ee8b0ecee2e206e586b25e90'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The GM can create characters but cannot remove one, so a mistake stays in the room. Backlog task: TASK-9, whose five acceptance criteria apply in full.

**Approach:** Add "⋯" with "Удалить" to the character header, an inline confirmation at the top of the content area, and a `sheet-delete` command that tombstones the sheet and every dependent record in one batch.

## Boundaries & Constraints

**Always:** Only `src/replica` composes tombstones and mints `c`. Commands are intents. Strings come from the copy catalog. One confirmation block per action, never one per field. The command is kind-agnostic, so Story 1.10 reuses it for NPCs.

**Never:** Build the NPC menu, "Дублировать…", access chips, token status, or removal of tombstones.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ask | GM picks "Удалить" in "⋯" | One block at the top of the content area: "Удалить «{name}»? Это нельзя отменить."; focus on "Отменить" | N/A |
| Cancel | "Отменить" pressed, or Escape in the block | Block closes; no command; no data change | N/A |
| Tab change | Another tab selected while the block is open | Block closes; nothing deleted; returning to the tab shows no block | N/A |
| Target disappears | The sheet is deleted from another window while the block is open | Block closes; no second command | N/A |
| Window closes | Window closed and reopened | No block; nothing deleted | N/A |
| Confirm | "Удалить" in the block | One command; the sheet and its dependents are tombstoned in one delta; the tab closes | N/A |
| Dependents | Sheet with `row:`, `rep:`, `acl:`, `plink:` records and a `link:` whose `d` is the sheet id; a second sheet with its own; `preset` | All five dependent forms of the target are tombstoned; the second sheet, its records and `preset` are unchanged | N/A |
| Already tombstoned dependent | A dependent with `d: null` | Not written again | N/A |
| Reload | After a delete | The sheet does not return | N/A |
| Active tab deleted | The deleted sheet was selected | The first available tab is selected | N/A |
| Command checks | Bad id, unknown sheet, deleted sheet | Rejected; no data change | No throw |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts` -- `compose` returns one record; `handleCommand` persists, merges and calls `emitDelta`. Delete needs a list.
- `src/core/ui-messages.ts`, `src/core/sheets.ts` -- command union, rejection reasons, `sheetIdSchema`, `sheetKey`.
- `src/ui/sheet/character-header.tsx` -- header with the name field; "⋯" goes at its end.
- `src/ui/main.tsx` -- tab selection already falls back to the first tab when the selected sheet is gone.
- `src/ui/primitives/button.tsx` -- `primary` and `secondary` only.
- `src/ui/copy.ts` -- `command.delete`, `command.cancel`, `deleteConfirmation` exist.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/sheets.ts` -- `isSheetDependent(key, record, sheetId)` covering the five forms, `link:` by `d` -- AC 4.
- [ ] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `sheet-delete { sheetId }`; composers return a list; one delta per command -- AC 4.
- [ ] `src/ui/sheet/character-header.tsx`, `src/ui/sheet/delete-confirmation.tsx`, `src/ui/main.tsx`, `src/ui/copy.ts` -- menu, block, closing rules -- AC 1, 2, 3, 5.
- [ ] Tests: `src/core/sheets.test.ts`; the AC 4 seeded test in `src/replica/engine-client.test.ts`; `tests/delete.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-9.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: partial save failure leaves dependents no delete can reach | medium | Confirmed by reading: the sheet tombstone went first. Patched: dependents first, sheet last, and a batch stops at its first failed write; reload-and-retry test. |
| Blind, Edge and Verification: a large delete splits into several deltas untested; comment overclaims | medium | Filed with mutations. Patched with a split test (consecutive `seq`, parts under 15000 bytes) and a corrected comment. |
| Blind: dependent forms list not tied to the key schemas | low | A guard test adds surface for a form no story adds yet. Rejected. |
| Blind and Edge: rejected delete gives no feedback | low | Reachable only when the sheet is already gone, which the GM then sees. Rejected. |
| Blind and Edge: focus falls to body after confirm | medium | Confirmed. Patched: focus moves to the selected tab; keyboard e2e test. |
| Edge: second pick of Удалить keeps focus on ⋯ | low | Direct correction. Patched with a request key; e2e test. |
| Blind and Verification: the no-second-command comment and its test | low | Comment corrected; double-click e2e test added; observed red. |
| Blind: `isSheetDependent` tombstone contract inconsistent | low | Direct correction. Contract limited to live records. |
| Blind: fixed 300 ms waits in negative e2e checks | medium | Patched: a probe command's rejection is the settle signal. |
| Blind: target-disappears test does not check storage | low | Patched: storage compared. |
| Blind: no test for a non-GM delete | false | Only the GM window has the control, and v1 protects honest clients only. |
| Edge: a failed save lets the sheet return after reload | false | The local-save notice covers it, and dependents-first ordering keeps the sheet deletable. |
| Implementer: a window opened with a running background selected NPC | medium | A TASK-8 defect against its first-tab rule. Patched: `seenPresetState` starts `unknown`; e2e test observed red. |

## Design Notes

- "⋯" is a react-aria `MenuTrigger` with a `Menu` holding one item, "Удалить". Its accessible name is the new catalog entry `label.sheetActions: 'Действия с листом'`.
- The block state lives in `WindowRoot` as the sheet id it asks about. It clears when the selected tab changes and when that sheet is no longer live. Nothing persists it, so a closed window has no block.
- The block uses the Confirmation style of DESIGN.md: `surface-bar`, a `line` border, `rounded.md`. It is a `role="group"` labelled by its text. "Отменить" is `button-secondary` and gets focus when the block opens; "Удалить" is `button-primary`. Escape inside the block cancels.
- The name in the text is the current name from the projection.
- `link:` records have the token id in the key, so the engine scans all live `link:` records for `d === sheetId`. Other forms match by the key prefix `{form}:{sheetId}:`, so `sheet:ab` never matches a sheet `a`.
- Each tombstone mints `c` from that key's current counter. The engine persists each record as today; a failed write raises the existing notice.
- The engine already rejects a delete through `sheetIdSchema`, `unknown-sheet` and `deleted-sheet`; add no new reason.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: in a live room delete a character, cancel once, confirm once, reload.
