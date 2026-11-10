---
title: '1.11 Keep NPCs on Their Own Tab'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '2591ad94df4284baadb7240be30a34e626a6939a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The NPC tab shows "Загрузка…", so the GM has nowhere to keep NPCs. Backlog task: TASK-13, whose six acceptance criteria apply in full. It closes Epic 1.

**Approach:** Fill the NPC tab with "Добавить NPC" and one block per NPC from the short template, reusing the create, rename, delete, field edit and repeat row paths of Stories 1.6 to 1.10, and prove two different game systems work with no code change.

## Boundaries & Constraints

**Always:** Characters and NPCs never share a list. Every behavior reuses the existing commands and components; the engine already picks the template by `kind`. Strings come from the copy catalog.

**Never:** "Дублировать…" (Epic 4), token status (Epic 4), player visibility (Epic 2), dice rolls.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tab bar | Preset loaded, with and without characters | Character tabs, "+", then NPC and the gear pinned right; NPCs never get tabs | N/A |
| No NPCs | NPC tab, no `npc` sheet | Only "Добавить NPC" | N/A |
| Add | GM presses "Добавить NPC" | Sheet `kind: "npc"`, name "Новый NPC", next NPC `order`; its block appears last; its name has focus and is scrolled into view | N/A |
| Block | An NPC | Name in `section-heading` with a left rule in `line`; click to rename with the 1.6 rules; "⋯" with "Удалить"; the NPC template below, editable in place | N/A |
| Order | NPCs with tied `order` | `(order, sheetId)` order, the same after a reload | N/A |
| Delete | "Удалить" in an NPC's "⋯" | The 1.7 confirmation at the top of the NPC tab; confirm tombstones the NPC and its dependents; cancel, tab change or the NPC's disappearance closes it | N/A |
| Focus after delete | NPC deleted | Focus goes to the next NPC's "⋯", else the previous one's, else "Добавить NPC" | N/A |
| Repeat rows | Repeat section in the NPC template, rows added to one NPC | Each NPC keeps its own rows | N/A |
| Reload | After NPC changes | Same NPCs, names, values and rows | N/A |
| Two systems | Two preset fixtures of different game systems, each in a fresh room | Each gives a working character and NPC: create, rename, edit, add a row, reload | N/A |

</frozen-after-approval>

## Code Map

- `src/ui/main.tsx` -- tab layout, NPC tab content is `loading`; create, delete confirmation and focus state for characters.
- `src/ui/sheet/character-header.tsx` -- name rename, "⋯" menu, focus props.
- `src/ui/sheet/sheet-body.tsx` -- takes any template.
- `src/ui/sheet/delete-confirmation.tsx`, `use-repeat-rows.ts`, `use-field-edit.ts` -- reused.
- `src/core/sheets.ts` -- `liveSheets`, `sortSheets`.
- `src/ui/copy.ts` -- `command.addNpc` exists.
- `docs/example-preset.json`, `tests/support/room.ts` -- first preset and e2e helpers.

## Tasks & Acceptance

**Execution:**
- [x] `src/ui/sheet/character-header.tsx` -- a `variant` for the NPC block name (`section-heading`, left rule) and its own accessible name -- AC 4.
- [x] `src/ui/sheet/npc-tab.tsx`, `src/ui/main.tsx`, `src/ui/copy.ts` -- NPC tab content, create, delete with the shared confirmation, focus rules -- AC 1 to 5.
- [x] `tests/fixtures/presets/` -- two presets of different game systems, each with a character template, an NPC template with a repeat section, `columns`, all three field types and a dice cell -- AC 6.
- [x] `tests/npc.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the six criteria of TASK-13.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: a rejected or failed delete leaves `deleting` set | medium | Confirmed by reading; affects characters too. Patched with the command id; e2e observed red. |
| Edge: asked NPC deleted elsewhere drops focus to the body | low | Patched with the next/previous/add rule; e2e observed red. |
| Edge: focus target set on a hidden tab, and a created NPC pulls the tab back | low | Patched: one focus-after-loss state; the tab does not change for an NPC. |
| Blind: confirmation stays open while adding an NPC | low | Default chosen: "Добавить NPC" closes it. Patched; e2e observed red. |
| Blind: `CharacterHeader` name is stale | low | Renamed to `SheetHeader` with `variant: 'character' | 'npc'`. |
| Blind: NPC blocks lack list semantics; test-only `data-npc` | low | Patched: `ul`/`li`, hook removed. |
| Blind: e2e helpers copied four times | low | Patched: moved to `tests/support/room.ts`. |
| Blind: AC 5 removal untested; scroll test without precondition; tab order untested | low | Patched. |
| Blind: two-systems test skips checks and dice | low | Patched; fixtures adjusted so a dice cell shows its formula. |
| Blind: fixtures not decoded in a unit test | low | Patched; observed red. |
| Blind: comment says "last" for "only remaining" | low | Patched. |
| Blind: region name lags a rename | low | Brief window until the echo. Rejected. |
| Blind: duplicate NPC names are ambiguous | low | A product question. Listed for the owner. Rejected here. |
| Blind: `NpcTab` takes many props | low | Refactor only. Rejected. |
| Blind: NPC rename length and Escape not retested | low | Shared code, covered by the character tests. Rejected. |
| Edge: both neighbours deleted elsewhere skip remaining NPCs | low | Rare race. Rejected. |
| Edge: second confirm before the first lands | low | Rare race. Rejected. |
| Verification: neighbour fallback when the next is also gone | low | Deferred as filed: needs a two-window race. |

## Design Notes

- New catalog entries: `newNpc: 'Новый NPC'` and `label.npcName: 'Имя NPC'`. The "⋯" accessible name stays `label.sheetActions`.
- The NPC tab content: "Добавить NPC" (`button-secondary`) at the top, then a list of blocks separated by `spacing.4`. Each block is a `section` labelled by its name field's value through `aria-label`, so screen readers can move between NPCs.
- The delete confirmation state in `WindowRoot` already keys by sheet id; reuse it for NPCs, and render the block at the top of the NPC tab's content area when the asked sheet is an NPC.
- Two fixtures: one d20-style (abilities in `columns`, attacks as `repeat`, `1d20+str` dice), one d6 pool style (attributes inline, `2D6 >= skill` dice, gear as `repeat` in the NPC template). They are test fixtures, not documentation; the docs keep `docs/example-preset.json`.
- After Epic 1 closes, the owner's live-room checklist covers all of Epic 1.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: in a live room add two NPCs, rename and edit one, delete the other, reload.
