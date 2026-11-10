---
title: '1.10 Keep a Different Number of Rows per Character'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'd9e3883428613787c3e333a4bfa75555768c9fa8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A repeat section shows only rows that already exist, so the GM cannot give a character its own number of rows. Backlog task: TASK-12, whose five acceptance criteria apply in full.

**Approach:** Add "Добавить строку" under each repeat section and "Удалить" on each repeat row, backed by two replica intents, and add the id resolution rule of FR5 to `core/preset` for the formulas of Epic 4.

## Boundaries & Constraints

**Always:** Only `src/replica` composes `d` and mints `c`. Commands are intents. Strings come from the copy catalog. Rows of one character never affect another. The Story 1.9 field patch and its errors stay as they are.

**Never:** Player edit rights (Epic 3), a confirmation for a row delete, reordering rows, evaluating formulas (Epic 4), NPC rendering (Story 1.11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | GM presses "Добавить строку" | `rep:{sheetId}:{sectionId}:{instanceId}` with a nanoid id, `order` above the section's highest, empty `cells`; the row appears last; its first field has focus | N/A |
| Per character | Two characters, rows added to one | The other keeps its own count | N/A |
| Delete | GM presses a row's "Удалить" | The record becomes a tombstone; the row disappears; focus goes to the next row's "Удалить", else "Добавить строку" | N/A |
| Edit | Field in a repeat row saved; field cleared | Merged into `cells`; a cleared field has no key; `order` kept; 1.9 errors apply | N/A |
| Ties | Two rows with one `order` | Ordered by `instanceId`; the same after a reload | N/A |
| Resolution | Id in the same repeat row and elsewhere on the sheet | The same row wins | N/A |
| Resolution | Id only in the sheet's non-repeat scope | Resolves there | N/A |
| Resolution | Id only in another repeat section, or on another character | Does not resolve | N/A |
| Reload | After adds and deletes | Same rows | N/A |
| Command checks | Unknown or deleted sheet; section not a repeat section of that sheet's template; existing or bad `instanceId` on add; unknown or deleted row on delete | Rejected; no data change | No throw |

</frozen-after-approval>

## Code Map

- `src/core/sheet-values.ts` -- `repeatInstances` orders by `(order, instanceId)` and skips tombstones.
- `src/core/preset.ts` -- `firstFieldId`, template types.
- `src/core/field-patch.ts` -- how a patch finds its field and record; reuse the template lookup.
- `src/replica/engine.ts`, `src/core/ui-messages.ts` -- composers, `liveSheetRecord`, preset cache, rejection reasons.
- `src/ui/sheet/preset-section.tsx`, `preset-cell.tsx`, `use-field-edit.ts` -- rows, `data-row`, field hooks.
- `src/ui/copy.ts` -- `command.addRow`, `command.delete`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/preset.ts` -- `resolveFieldReference(template, from, id)` -- AC 5.
- [ ] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `repeat-row-add { sheetId, sectionId, instanceId }` and `repeat-row-delete { sheetId, sectionId, instanceId }` -- AC 1, 2.
- [ ] `src/ui/sheet/preset-section.tsx`, `src/ui/copy.ts` -- add and delete controls, focus rules -- AC 1, 2.
- [ ] Tests: `src/core/preset.test.ts`, engine cases in `src/replica/engine-client.test.ts`, `tests/repeat-rows.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-12.

## Implementation Notes

## Spec Change Log

- Review: the Design Note on `order` said "live or tombstoned", but a tombstone has `d: null` and holds no `order`. Amended reading: `order` is the highest among live rows plus 1. A row added after the last row was deleted still sorts last. Known-bad state avoided: a rule that cannot be computed.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Verification and Blind: the moved-on focus guard is untested | medium | Filed with a mutation. Patched with add and delete cases; observed red. |
| Blind: `order` counts live rows only, unlike the Design Notes | low | A tombstone has `d: null` and holds no order, so the note could not be built. Spec Change Log records it; a test proves a new row after deleting the last sorts last. |
| Blind: delete finds its row by index | low | Direct correction. Patched to pass the instance id. |
| Blind and Edge: rejected add or delete gives no feedback | low | Only races reach it. Rejected. |
| Blind: delete path lacks rejection tests | low | Patched with three cases. |
| Blind: ref callbacks are new each render | low | Cost only, at this scale. Rejected. |
| Blind: the `rep:` prefix is built in three places | low | Direct correction. Patched: `repKeyPrefix`. |
| Blind: `resolveFieldReference` test gaps and a redundant check | low | Patched: bounds cases, check removed, a misleading test replaced. |
| Blind: delete names change after a delete | low | The spec sets the name format. Listed for the owner. |
| Blind: column count hard-coded in a test | low | Patched. |
| Edge: order overflow near 2^53 | low | Unreachable in practice. Rejected. |
| Edge: second delete rejected in the removing render skips focus | low | Rare. Rejected. |
| Edge: unsaved text lost when another window deletes the row | low | Needs two GM windows editing one row. Rejected. |
| Edge: a repeat section with no field falls to plain rendering | false | The preset schema refuses such a section. |
| Edge: an id in another repeat section does not resolve | false | The Design Notes set this rule. |

## Design Notes

- The window generates the `instanceId` with nanoid, so it can focus the new row when its delta arrives. The engine refuses an id that fails the `sheetIdSchema` pattern or whose key exists, tombstone included.
- `order` is the highest `order` among this sheet's records of that section, live or tombstoned, plus 1, so a new row never sorts before an old one.
- `resolveFieldReference` returns where an id resolves from a cell: `{ scope: 'row' }` for a field of the same row (for a repeat row, the same instance), `{ scope: 'sheet', rowId }` for a field of the template's non-repeat scope, or `null`. A field in another repeat section never resolves from outside its row. The caller reads values only from the same sheet, so an id never crosses characters.
- "Добавить строку" is `button-secondary` under the section body. Each repeat row ends with a "Удалить" `button-secondary`; its accessible name is the new catalog entry `deleteRow: (n) => \`Удалить строку ${n}\``, with `n` the row's position from 1. In a `columns` section the control sits in one extra track after the grid.
- Edit rights in Epic 1 mean the GM; the controls render for the GM window only.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: in a live room add and delete rows on two characters, reload.
