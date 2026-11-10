---
title: '1.6 Create and Name Characters'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '4f29e116927e4988a92cee7305050c6fb682e5b8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A room can hold a preset, but the GM cannot create a character, so the party has no place. Backlog task: TASK-8, whose five acceptance criteria apply in full.

**Approach:** Give the GM a "+" that creates a character through a replica command, a tab per character in a scrolling tab bar, and a header whose name the GM renames in place through a second command.

## Boundaries & Constraints

**Always:** Only `src/replica` composes `d` and mints `c`. Commands are intents. Strings come from the copy catalog. Tabs are react-aria tabs. Tab order is `(order, sheetId)` everywhere.

**Never:** Build sheet fields or layout (Stories 1.7, 1.8), NPCs (1.10), delete (1.11), access chips, token status or the `⋯` menu (Epics 2 to 4), the player's own character first, or room sync.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No characters | Preset loaded, no sheet | Bar shows "+", NPC and the gear | N/A |
| Create | GM presses "+" | Sheet `sheet:{nanoid}` with `kind: "pc"`, name "Новый персонаж", next `order`; its tab is selected; the name field has focus | N/A |
| Rename | Name changed, field left | Tab and header show the new name; it stays after a reload | N/A |
| Enter, Escape | Enter in the name field; Escape | Enter saves as leaving does; Escape returns the old name, nothing saved | N/A |
| Empty name | Empty or whitespace only, field left | Old name returns; nothing saved | N/A |
| Surrounding spaces | `"  Брок "` | Saved as `Брок` | N/A |
| Too long | Over 100 characters after trimming, field left | "Слишком длинно" under the field; nothing saved; the text stays for correction | Message |
| Unchanged | Same name, field left | No command | N/A |
| Command checks | Rename of an unknown or deleted sheet; a bad name; create with an existing `sheetId` | Rejected; no data change | No throw |
| Many tabs | More characters than fit | Character tabs scroll with a horizontal gesture and a vertical wheel; NPC and the gear stay visible at the right; "+" follows the last character and scrolls with the tabs | N/A |
| "+" semantics | Accessibility tree | "+" is a button outside the tab list, with an accessible name | N/A |
| Order | Equal `order` values | Ties break by `sheetId`; the same after a reload | N/A |
| Arrow keys | Focus in the tab list | Arrows move focus between all tabs, NPC and the gear included | N/A |
| Header | Character tab open | Name in `sheet-title` with a bottom rule in `line` | N/A |

</frozen-after-approval>

## Code Map

- `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `sheet-create` exists; `composeSheetCreate` and `nextOrder` make the key and order. Only tests call it today.
- `src/core/records.ts` -- `sheetDataSchema`, `hasLiveSheet`.
- `src/ui/main.tsx` -- `WindowRoot` builds the `tabs` layout; the first preset selects Settings.
- `src/ui/shell/tab-bar.tsx`, `window-shell.tsx` -- one `TabList` with `justify-end`; per-tab content exists.
- `src/ui/preset-actions.tsx` -- pattern for a command with its result under the control.
- `src/ui/main.css` -- `text-sheet-title` and the `line` color exist. `copy.valueTooLong` exists.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/sheets.ts` -- `SHEET_NAME_MAX_LENGTH = 100`, `parseSheetName`, `sortSheets` -- AC 3, 4.
- [ ] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `sheet-create` gains `sheetId`; add `sheet-rename { sheetId, name }`; both validate the name; rejection reasons for an existing, unknown or deleted sheet and a bad name -- AC 1, 2, 3.
- [ ] `src/ui/shell/tab-bar.tsx`, `window-shell.tsx` -- scrolling character tabs, "+" after them, NPC and the gear pinned -- AC 4, 5.
- [ ] `src/ui/sheet/character-header.tsx`, `src/ui/main.tsx`, `src/ui/copy.ts` -- create and open, header with rename -- AC 1, 2, 3.
- [ ] Tests beside each core module, engine cases in `src/replica/engine-client.test.ts`, `tests/characters.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-8.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: rejected rename or create leaves stale window state | medium | Confirmed by reading: `sent` and `createdTab` cleared only by a delta. Patched: cleared on a matching rejection; two e2e tests. |
| Edge: second edit back to the projected name sends nothing | low | Direct correction. Patched to compare with the shown name; e2e test. |
| Edge: foreign rename during an own rename | low | Needs two GM clients, which room sync brings. Rejected. |
| Blind and Edge: engine mints a version for an unchanged name | low | The window never sends it; a guard adds a branch. Rejected. |
| Blind and Edge: invisible-only names pass | low | Rare, and the fix needs a character policy. Rejected. |
| Blind and Edge: length counts code points, not graphemes | low | The spec says code points. Comment corrected. |
| Blind: rename skips the id schema | low | Direct correction. Patched with a test. |
| Blind: name rule absent from the record schema | maybe-false | Matters once room sync brings records from other clients. Deferred. |
| Blind: "+" DOM order differs from visual order | low | The spec puts "+" outside the tab list, and the list is one tab stop. Rejected. |
| Blind and Edge: sticky tabs can cover a tab scrolled into view | medium | Confirmed: no end scroll padding. Patched with padding and a reveal on mount; e2e asserts the edge. |
| Blind: sort e2e ids do not separate code unit from locale | medium | False green. Patched with `a` and `B`. |
| Blind: unreachable too-large branch for sheets | low | Kept as the engine-wide fit rule. Rejected. |
| Blind: disappearing selected tab untested | low | Needs delete, Story 1.11. Deferred. |
| Blind: "+" label outside the catalog | low | Direct correction. Patched. |
| Blind: `rejectionOf` hangs on a refused send | low | Direct correction. Patched. |
| Blind: max length test restates the constant | false | The criteria name 100 as a named constant. |
| Verification: NPC-to-gear gap unverified when sticky applies | medium | Filed with a mutation. Patched; it found a 7.56 px gap, fixed with `getBoundingClientRect`. |
| Verification: line-mode wheel untested | medium | Filed with a mutation. Patched; observed red. |
| Verification: rename hold untested | medium | Filed with a mutation. Patched with a closed-background test. |

## Design Notes

- The window generates the `sheetId` with nanoid and sends it, so it can select the new tab when the delta arrives. AD-2 says `sheetId` is client-generated. The engine refuses an id that does not match `^[A-Za-z0-9_-]{1,64}$` or whose key already exists, tombstone included.
- `parseSheetName` trims, refuses an empty result, and counts length in code points. The engine stores the trimmed name.
- Tab ids are the record keys (`sheet:{id}`), so no character tab can collide with `npc` or `settings`. Ties compare `sheetId` by code unit, not by locale.
- After the first projection with a preset, the first tab in order is selected: the first character, otherwise NPC. The first preset still selects Settings. If the selected tab disappears, the first tab becomes selected.
- The name field is a text input styled as `sheet-title`, with the dotted underline of an editable value in `line-strong` and the header's bottom rule in `line`. Its accessible name is the new catalog entry `label.sheetName: 'Имя персонажа'`. The "+" accessible name is the new entry `command.addCharacter: 'Добавить персонажа'`. Add `newCharacter: 'Новый персонаж'`.
- "Слишком длинно" uses `aria-invalid` and `aria-describedby`, and clears on the next valid save.
- Character tab labels truncate with an ellipsis at a maximum width; the full name stays the accessible name.
- Tab bar layout: every tab is in one `TabList`, so arrows cross from characters to NPC and the gear, and "+" is outside it. A known mechanism: one horizontal scroll container holding the `TabList` with `display: contents` and the "+" button, with CSS `order` placing "+" after the characters and NPC and the gear `position: sticky` at the right. Any mechanism is fine if Playwright proves: the tab list's children are only tabs, "+" sits right after the last character, NPC and the gear keep their position after a scroll, the accessibility snapshot lists the tab list with every tab, and arrows reach every tab.
- A vertical wheel over the bar scrolls it horizontally when the wheel has no horizontal delta.
- The content of a character tab is the header only until Story 1.7.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: in a live room create three characters, rename one, reload, and scroll the tabs with the mouse wheel.
