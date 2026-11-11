---
title: 'TASK-43 Mirror Token Selection Between the Map and the Window'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'e8287fc01d83d57576d74d222bc5405c7d4a3905'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** With many linked tokens on the map, a GM cannot tell which sheet or repeat block a token belongs to without opening it, and cannot find a sheet's tokens without hunting on the map. Backlog TASK-43; its AC 1–6 apply, AC 7 is the owner's live-room check.

**Approach:** The window reads this client's map selection through a new selection port and marks the tab of every sheet a selected token links to, and every linked repeat block. A GM gets a toggle "Выделить на карте" on a linked sheet's header and on each linked repeat block, which selects its linked tokens on the open scene, or deselects them when all are already selected. As in simple-hp-tracker: read `OBR.player.getSelection` and `OBR.player.onChange`, write `OBR.player.select(ids, false)` and `OBR.player.deselect(ids)`, highlight only.

## Boundaries & Constraints

**Always:**
- Owner decisions: the window marks and never switches tabs or scrolls by itself (AC1); selecting from the window is GM-only, players see marks for their own selection (AC5).
- Selection is this client's own state, read and written by the window through the port; it never enters records, messages, storage or the replica.
- Marks come from live links of the records the role sees (`visibleRecordMap`, `liveLinks`), so a player never gets a mark for a hidden template.
- Only tokens in the open scene are selected or deselected; an absent one is skipped with no error (AC4).
- Only `src/platform/obr/` imports the SDK; both adapters implement the port. Copy in `src/ui/copy.ts`.

**Never:** switching or scrolling tabs on a selection; replacing the map selection (`replace` stays false); a player-side select control; changing the token menu, the link picker or the replica.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One token | Token linked to sheet A selected | Tab A marked; selected tab unchanged | N/A |
| Repeat block | Token linked to block B of NPC | NPC tab and block B marked | N/A |
| Several | Tokens of A and of block B | Both marked | N/A |
| Cleared | Selection empty | No mark | N/A |
| Unlinked or inert | Selected token has no live link | No mark | N/A |
| GM toggle | A has tokens t1, t2 on scene, none selected | Press: t1, t2 added to the selection | Port rejects: logged, state unchanged |
| GM toggle again | t1, t2 both selected | Press: t1, t2 deselected, other selected items stay | Same |
| Partly selected | t1 selected, t2 not | Toggle not pressed; press selects t2 too | N/A |
| Off scene | A linked to t1 (scene) and t9 (other scene) | Press selects t1 only | N/A |
| None on scene | Every linked token off scene, or scene not ready | No toggle shows | N/A |
| Player | Player selects a token of a visible sheet | Its tab marked; no toggle anywhere | N/A |

</frozen-after-approval>

## Code Map

- `src/platform/ports.ts` -- add `SelectionPort` (`getSelection`, `onChange`, `select`, `deselect`) and `Platform.selection`.
- `src/platform/obr/index.ts` -- adapter over `OBR.player` selection; `onChange` calls back only when the list changes.
- `src/platform/mock/index.ts`, `room.ts`, `client-params.ts` -- per-client selection shared by the client's pages (localStorage under `mock-selection:` + BroadcastChannel); `setMapSelection(ids)` stands for a user's map click.
- `src/core/token-links.ts` -- `liveLinks`, `linkedTargetKeys`; reuse. `src/core/link-target.ts` -- `linkTargetKey`.
- `src/ui/main.tsx` -- computes `linkedTargets`; tabs via `barItems`; the GM header and `BlockTools`.
- `src/ui/shell/tab-bar.tsx` -- `ShellTab.mark` pattern ("вы") to extend with the selection mark.
- `src/ui/sheet/sheet-header.tsx` -- GM token status chip; the toggle goes after it.
- `src/ui/sheet/preset-section.tsx` -- `Blocks` (group per repeat block, `aria-label` = name) and `BlockSlot` (GM token chip); `ReadOnlyRepeatContent` serves players.
- `tests/support/room.ts`, `tests/link.e2e.ts`, `tests/open.e2e.ts` -- seeding of links and scene; follow their shape.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/token-selection.ts` (+ test) -- pure: marks from live links and a selection; a target's linked tokens on the scene; the toggle's step (select missing / deselect all).
- [x] `src/platform/ports.ts`, `obr/index.ts`, `mock/*` (+ mock test) -- the selection port and both adapters.
- [x] `src/ui/map-selection.ts` (+ test) -- window store: selection and scene item ids from the ports, as atoms, unchanged lists ignored, failed reads logged as empty.
- [x] `src/ui/copy.ts`, `tab-bar.tsx`, `main.tsx`, `sheet-header.tsx`, `preset-section.tsx`, `main.css` if needed -- tab mark, repeat block mark, GM toggle.
- [x] `tests/selection.e2e.ts`, `tests/support/room.ts` -- both directions, several, cleared, off scene, player.

**Acceptance Criteria:**
- Given a GM window on tab X and a token linked to sheet Y selected on the map, then tab Y carries the mark and tab X stays selected.
- Given a linked sheet with tokens on the scene, when the GM presses "Выделить на карте" twice, then the map selection gains and then loses exactly those tokens.
- Given a player window, then no "Выделить на карте" shows and the player's own selection marks visible targets only.

## Design Notes

- Mark: a tab gets an accent dot after its name and ", выделен на карте" in its accessible name; a repeat block gets an accent bar on its left edge and the same suffix in its group name. The dot avoids a word that would not fit a 160 px tab.
- The toggle is a react-aria `ToggleButton`: pressed when every linked token on the scene is selected. It shows only while at least one linked token is on the open scene, so it never does nothing.
- Selection adds (`replace: false`), as the reference does, so a GM can gather tokens of several targets.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build` -- all pass.

## Implementation Notes

- Implemented in this session from the spec, not by a dispatched child, because the build agent itself was the delegated worker. The owner was asleep and had asked for autonomous work, so checkpoint 1 was passed without a halt.
- Spec, UX and architecture docs went to master ahead of the code (62bdeb2 → 67ef955, 2b19cc5 → 141da7a). They add CAP-32, the marks and «Выделить на карте». After review, the mark's accessible name became «{name}, токен выделен», and GLOSSARY.md gained "map selection" and "selection mark".
- `selectionStep` passes every on-scene token to `select`, not only the missing ones. `replace: false` makes a repeat harmless.
- The repeat block toggle sits in an `aria-live="off"` span inside the slot's live region, so scene changes are not announced.
- Mutation checks: removing the scene filter turns two e2e tests red, and removing the stale-read guards turns two store tests red.
- Full check: oxfmt clean, lint exit 0, typecheck clean, `bun test` 2465 pass, `bun run test:browser` 451 pass, build ok.

## Spec Change Log

## Review Triage Log
| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | verification-gap | No test for a change heard before the first selection or scene read lands | medium | Gap filed with a demonstration: removing the `selectionStarted` guard leaves every test green | patch: race tests in `map-selection.test.ts` |
| 2 | verification-gap | No test for a player's own tab that is also selected ("вы" and the selection mark) | low | No fixture sets an owner and a selection on one tab | patch: player e2e with an owner |
| 3 | edge-case | Marks stay for selected ids no longer on the open scene | maybe-false | Depends on whether Owlbear clears the selection on a scene switch; if not, a stale mark lasts until the next click, which is low | reject: low if true; settle in the owner's live check (AC7) |
| 4 | edge-case | A second press before the first write's change lands selects again | low | Real for a double click inside one Owlbear round trip; the fix needs in-flight state | reject: rare, fix adds state |
| 5 | edge-case | A focused toggle that unmounts drops focus to the body | low | Real only when the last token leaves the scene while the toggle has focus | reject: rare, fix adds focus routing |
| 6 | edge-case + blind | Repeat block toggle mounts inside the `aria-live` slot, so a scene change announces it | medium | `BlockSlot` is `aria-live="polite"`; a toggle appearing there is announced for every block | patch: an `aria-live="off"` wrapper that mounts with the token chip |
| 7 | edge-case | OBR adapter's first `onChange` can repeat the selection `getSelection` read, against the port comment | low | `last` starts `null`; the store dedupes, so no user effect | patch: port comment says a repeat can come |
| 8 | edge-case | A failed scene item read leaves toggles hidden until the next item change | low | Owlbear reports items on every update, so the next change heals it | reject: rare, fix adds a retry |
| 9 | blind | GLOSSARY.md lacks "map selection" and "selection mark" | low | CLAUDE.md asks new terms to land in the glossary | patch: glossary entries |
| 10 | blind | Spine CAP-32 row omits `core` and holds prose in the decision column | low | `src/core/token-selection.ts` is new core | patch: row reads `core, ui, platform` with AD ids only |
| 11 | blind | Build spec says failed reads log "as empty"; code keeps the ids | false | The ids start empty and a failed first read leaves them empty; later reads keep the last ids, which is what "logged" covers; fix would edit this spec | reject |
| 12 | blind | "{name}, выделен на карте" is masculine and says the sheet is selected | low | "Аня, выделен на карте" disagrees in gender; the token is what is selected | patch: "{name}, токен выделен", the result word of «Выделить» |
| 13 | blind | Dot and bar vanish in forced-colors mode | low | `bg-*` and `box-shadow` are dropped by forced colors | patch: dot drawn as a border, bar gets a forced-colors outline |
| 14 | blind | A failed write is silent to the GM | low | Spec matrix says logged; the toggle keeps its state, so nothing false shows | reject: matches the spec; owner may ask for a message |
| 15 | blind | `MapToggle` copies the secondary button classes | low | A restyle of `button-secondary` in `button.tsx` would miss the toggle | patch: share the class from `button.tsx` |
| 16 | blind | Every selection change re-renders every repeat block | low | Context value changes on any click; React re-renders 60 blocks cheaply | reject: no measured harm, fix adds memo state |
| 17 | blind | Player block mark, toggle hidden on scene close, mixed tokens in header not tested in the window | low | Block mark shares `Blocks` with the GM path and `selectionMarks` is unit-tested with player visibility; scene close is unit-tested in the store; mixed tokens are checked through the resulting selection | reject |
| 18 | blind | The refused-write e2e reads state before the refusal is observable | low | It reads right after `click()`, so a write that lands later would pass | patch: wait for the logged refusal first |
| 19 | blind | `settle()` comment says two turns, `MockRoom` comment says all of it is shared | low | Comments disagree with the code | patch: fix both comments |
