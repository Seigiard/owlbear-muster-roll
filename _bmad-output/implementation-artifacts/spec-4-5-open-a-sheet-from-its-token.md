---
title: '4.5 Open a Sheet From Its Token'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'b6af5e0b6aef2389869f48aa2476febdc14d5249'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A linked token tells the GM which sheet it is, but nobody can jump from the token to the sheet. Backlog task: TASK-28, whose four acceptance criteria apply in full. It closes Epic 4.

**Approach:** Add "Открыть лист" to the 4.4 token menu owner. A click makes the background `replica` hold the requested sheet, open the action window if needed, and deliver the request once to a window, which selects the tab and scrolls to the sheet.

## Boundaries & Constraints

**Always:** Menu items stay owned by the background menu owner of 4.4, re-created from records and role, `max: 1`. Visibility through `core/visibility`: a player opens only characters. The held request is delivered once and discarded if the sheet is not visible to this role or no longer live. String from the catalog (`menu.openSheet`).

**Never:** Player items on NPC tokens or unlinked tokens. Writing any record. Reading the scene.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GM, character token | "Открыть лист" | Window opens on that character's tab; the tab scrolls into view | N/A |
| Player, character token | "Открыть лист" | Same | N/A |
| GM, NPC token | "Открыть лист" | NPC tab active; that NPC's block scrolls into view | N/A |
| Player, NPC token | Menu | No "Открыть лист" | N/A |
| Player, unlinked token | Menu | No Muster Roll item | N/A |
| GM menu | Linked token | "Открыть лист" and "Отвязать лист" | N/A |
| Window closed | Click | Action window opens; the request is delivered once when it connects | N/A |
| Window open | Click | Delivered at once; the window switches tab and scrolls | N/A |
| Not visible | Role or sheet changes before delivery | Request discarded | N/A |
| Once | Window reloads or a second window connects | The request is not delivered again | N/A |
| Dangling link | Link to a deleted sheet | No "Открыть лист" | N/A |

</frozen-after-approval>

## Code Map

- `src/core/token-links.ts` -- live links and menu filters (4.4); add the open item filters.
- `src/replica/token-menu.ts`, `src/replica/engine.ts` -- menu owner and click handling; held open request.
- `src/platform/ports.ts` -- `ActionPort.open`; mock and OBR adapters.
- `src/core/ui-messages.ts` -- engine → window message for an open request.
- `src/ui/main.tsx`, `src/ui/sheet/npc-tab.tsx` -- active tab, scroll into view.
- `src/core/visibility.ts` -- role rules.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/token-links.ts` -- "Открыть лист" filters: one item with two icons, GM icon on any live-linked token, player icon only on tokens linked to a live character -- AC 3, 4.
- [x] `src/replica/` -- click handler holds `{ sheetId }`, calls `action.open()`, delivers once to the first window that is ready, discards when not visible or not live -- AC 1, 2.
- [x] `src/ui/` -- on an open request select the tab (character tab, or NPC tab and the NPC block) and scroll it into view -- AC 1, 2.
- [x] Mock: record `action.open` calls; tests can click the open item.
- [x] Tests: unit tests for filters; engine tests for hold, deliver once, discard; e2e for GM and player opening a character, GM opening an NPC, the window-closed path -- every matrix row.

**Acceptance Criteria:** the four criteria of TASK-28.

## Implementation Notes

- Core: `tokenMenuEntries(records, role)` now takes the records, as the open item needs sheet kinds. An entry carries `filters` (one per icon). "Открыть лист" (`app.muster-roll/open-sheet`, `/icon.svg`) has a GM icon (`roles: ['GM']`, every live-linked token) then a player icon (`roles: ['PLAYER']`, tokens linked to a live character), each `max: 1`, `every: [layer == CHARACTER]`, ids in `some` joined by `||`. Both icons are built on every client; Owlbear's `roles` picks one. `sheetKindShownTo` in `core/visibility` judges the kind; `rollShownTo` delegates to it. `openTarget(records, tokenId, role)` and `liveSheetShownTo` serve the click and the hold. A link whose data fails `sheetIdSchema` counts as no link in `liveLinks` and `openTarget`. Items are created in the order link, open, unlink, so the harmless item comes before the destructive one.
- Engine: a click resolves the token through `openTarget` on the replica; a token with no live link, or a sheet this role cannot see, opens nothing (no `action.open`). Otherwise the engine holds `{ id, sheetId }` (a newer click replaces it), calls `action.open()`, and sends `open-sheet` on the UI channel at once and again after every projection it sends. A window's `open-sheet-ack { id }` drops the held request. Each delivery first drops a request whose sheet is no longer live or visible, or that is older than `TIMING.openRequestTtlMs` (15 s, read against the clock). A rejected `action.open()` drops it at once. `OpenSheetRequest` is one type in `core/ui-messages`.
- Window: the replica client stores an `open-sheet` only while live (`$openRequest`); the picker stores it and never acknowledges. `main.tsx` takes a request once the first catch-up has ended, so the first-tab rule of a newly opened window does not override it. It selects the character tab or the NPC tab, acknowledges, and scrolls only when a preset lets the target mount (otherwise it selects the tab only). A pending name focus for another tab is cleared. When the focus was on a control of the window, it moves to the opened tab or to the NPC block (`tabIndex={-1}`); otherwise the focus stays. Scrolling: the character tab in the bar via `revealTab`, the NPC block via `NpcTab.revealOf`. `revealElement` uses `scrollIntoView({ block: 'nearest', inline: 'nearest' })`, smooth unless `prefers-reduced-motion: reduce`. A request for a sheet the window does not list is still acknowledged and selects nothing.
- Mock: `actionOpens()` counts `action.open` calls; the open item is clicked with `clickContextMenuItem`.
- Tests: `token-links.test.ts` (filters, `openTarget`), `ui-messages.test.ts`, `visibility.test.ts`, `reveal.test.ts`, `engine-open.test.ts` (hold, deliver at once, deliver on connect, once after ack, replace, discard on delete and on demotion, player and dangling presses), `engine-link.test.ts` and `link.e2e.ts` updated for the third item, `tests/open.e2e.ts` (GM menu filters, GM character, GM NPC, reduced motion, window closed then reload, player character with filters, player press on an NPC token). The e2e scroll and acknowledgement assertions were observed red with the reveal and the acknowledgement removed.
- Two windows open at once before an acknowledgement would both select the sheet. Owlbear has one action window per client, so only a test can make this.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: a held open request never expires, so a window opened later jumps to a forgotten sheet | medium | Patched: 15 s lifetime checked by clock; dropped when `action.open` rejects; tests observed red. |
| Edge: a link whose sheet id fails its schema is offered and resent forever | low | Patched: treated as no link; test. |
| Edge: NPC reveal stays set when the NPC tab cannot mount | low | Patched. |
| Edge: a pending create-name focus survives an open request | low | Patched. |
| Blind: focus drops to body when the tab switches | medium | Patched: focus moves to the tab or NPC block when it was in the window; e2e observed red. |
| Edge claim: "delivers once to the first window" is at-least-once to every window | low | Accepted: Owlbear has one action window per client; recorded in Implementation Notes. |
| Blind and Verification: the NPC-race e2e passes with no press; reload check has no settle | low | Patched. |
| Blind: unlisted-sheet request and the `phase` guard untested | low | Patched; client guard test observed red. |
| Blind: misplaced comment, duplicated type, misleading test name and comment, acting `#then` | low | Patched. |
| Blind: `dropHiddenOpen` in the menu refresh | low | Removed. |
| Blind: "Открыть лист" after the destructive "Отвязать лист" | low | Patched: order link, open, unlink. |
| Implementer: per-icon filters and `roles` can only be confirmed in a live room | gate | Owner check in a live room. |

## Design Notes

- Use the SDK's per-icon filters on one item (`icons[]`, first match shows) with `some` for token ids, as 4.4 did, and `every: [layer == CHARACTER]`.
- With no matching links for an icon, leave that icon out; with no icons, remove the item.
- "Delivered" means the window acknowledged the request; until then a newer click replaces the held request.
- Scroll with `scrollIntoView({ block: 'nearest' })` and respect reduced motion.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: GM and player open a character from its token with the window closed and open; GM opens an NPC; a player sees nothing on an NPC token.
