---
title: '4.4 Link a Token to a Sheet'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '25c34b4e98948d8b33d2ae3192418023c4555950'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-duplicate-an-npc.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tokens on the map and sheets in the window are unrelated, so a GM cannot tell which token is which sheet. Backlog task: TASK-27, whose six acceptance criteria apply in full.

**Approach:** The background `replica` owns the Owlbear token context menu and re-creates it from current `link:` and `sheet:` records and the role. "Привязать лист…" opens a small popover page that lists sheets and writes a `link:{tokenId}` record; "Отвязать лист" tombstones it. Sheet headers show the token status.

## Boundaries & Constraints

**Always:** `link:{tokenId}` holds a `sheetId`, is GM-written only, and goes through the normal GM command, persistence, send and room-copy path. Every Muster Roll token menu item has `max: 1`. Only the background page creates or removes context menu items. Status and picker order read `link:` records only, never the scene. A link whose sheet is not live counts as no link everywhere. Strings from the copy catalog (`menu.linkSheet`, `menu.unlinkSheet`, `tokenLinked`, `noToken`, and the empty picker text). The picker is a popover page of the extension that talks to the background like the main window.

**Never:** "Открыть лист" and any player menu item (Story 4.5). Writing item metadata on tokens. Reading the scene to decide link status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unlinked token, GM | GM opens a token's menu, no live link | "Привязать лист…"; it opens a small popover anchored to the token | N/A |
| Linked token, GM | Live link to a live sheet | "Отвязать лист"; no "Привязать лист…" | N/A |
| Several tokens selected | Multi-select | No Muster Roll item (`max: 1`) | N/A |
| Player | Player client | No 4.4 item | N/A |
| Picker order | Sheets exist | Characters, then NPCs; in each group sheets with no token first, then by sheet order | N/A |
| Picker empty | No live sheets | "Сначала создайте лист" | N/A |
| Pick | GM picks a sheet | `link:{tokenId}` = `sheetId` written; popover closes | N/A |
| Many tokens | Two tokens linked to one sheet | Both links kept; a token holds one sheet (relinking overwrites) | N/A |
| Deleted sheet | Link command to a sheet that is not live | Refused; nothing written | Rejection reply |
| Dangling link | `link:` record to a deleted sheet | Menu and status treat it as no link | N/A |
| Unlink | GM picks "Отвязать лист" | `link:` tombstoned; sheet and token stay | N/A |
| Status | Character header and NPC block | "Токен привязан" when a live link points to the sheet, else "Нет токена"; read-only | N/A |
| Absent token | Linked token removed from the scene | Still "Токен привязан" in v1 | N/A |
| Re-create | `link:`/`sheet:` delta, role change, first catch-up end | Menu re-created with filters from current records and role; not re-created when the filters did not change | N/A |
| Sheet delete | GM deletes a sheet with links | Its `link:` records tombstoned (verify the 1.7 path) | N/A |

</frozen-after-approval>

## Code Map

- `src/platform/ports.ts`, `src/platform/obr/index.ts`, `src/platform/mock/index.ts` -- context menu and popover ports; the mock must record created items, let a test invoke an item for a token id, and record opened popovers.
- `src/replica/engine.ts`, `src/replica/composers.ts` -- GM commands (`link-set`, `link-clear`), sheet delete link tombstones.
- `src/replica/background-main.ts` -- background wiring.
- `src/core/records.ts` -- `link:` key and data schemas; `src/core/sheets.ts` -- `dependentSheetId`, `liveSheets`, `sortSheets`.
- `src/ui/sheet/sheet-header.tsx` -- header and NPC block status.
- `vite.config.ts`, `index.html` -- build entries; add a picker page.
- `node_modules/@owlbear-rodeo/sdk` -- `ContextMenuItem`, `KeyFilter`, popover types.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/` -- pure helpers: live links by token and by sheet, picker order, and menu filter building from links and role -- AC 2, 3, 5.
- [x] `src/replica/` -- `link-set { tokenId, sheetId }` and `link-clear { tokenId }` GM commands (refuse a non-live sheet); a menu owner that re-creates items on relevant change; item clicks open the picker popover or send `link-clear` -- AC 1, 3, 4, 5, 6.
- [x] Picker page (`picker.html` + `src/ui/picker/*`) -- reads the token id from its URL, lists sheets, sends `link-set`, closes its popover -- AC 2, 3.
- [x] `src/ui/sheet/sheet-header.tsx` -- read-only token status -- AC 3.
- [x] Mock platform -- context menu and popover recording and invocation for tests.
- [x] Tests: unit tests for helpers and filters; engine tests for commands, refusals, re-creation triggers and sheet-delete tombstones; e2e for the picker (order, empty text, pick) and the header status -- every matrix row.

**Acceptance Criteria:** the six criteria of TASK-27.

## Implementation Notes

- Core: `src/core/token-links.ts` holds `liveLinks` (token id to sheet id, live sheets only), `linkedSheetIds`, `pickerOrder`, `tokenMenuEntries`, `tokenIdSchema` (`^[^:\s]{1,128}$`), `linkKey`, `linkPickerUrl` and the picker constants (`/picker.html`, param `token`, popover id `app.muster-roll/link-picker`). The constants live in core, so the background and the picker page share them without the UI importing `src/replica`.
- Filters: both items have `max: 1`, `roles: ['GM']` and `every: [layer == CHARACTER]`. They show only on tokens of the character layer. Props, mounts and other layers get no Muster Roll item. "Привязать лист…" adds `id != t` for every linked token to `every`, all joined by the default `&&`. "Отвязать лист" puts the linked ids in `some` as `id == t1 ||, …, id == tn`. Each list uses one coordinator only, so the unknown precedence of `&&` and `||` cannot change the match. With `max: 1`, `every` and `some` judge the same one token. Token ids are sorted, so the same links give the same filters. With no live link, the unlink item is removed. `liveLinks` skips a `link:` key whose token id fails `tokenIdSchema`. The port filter type now has the SDK's `min` and `some`.
- Menu owner: `src/replica/token-menu.ts`. It keeps the last filter JSON per item and calls `create` (Owlbear replaces an item by id) or `remove` only when it changes. Port calls run one at a time. A rejected call marks its item stale, and the next update creates or removes it again. The SDK resolves `create` without waiting for the host, so a create the host drops in silence is not detected: that item stays missing until its filter changes. `stop()` removes every item the menu may have left and drops queued creates. Item ids: `app.muster-roll/link-sheet` and `app.muster-roll/unlink-sheet`. Both use `/icon.svg`. The engine takes `menuCopy` (`linkSheet`, `unlinkSheet`, `unlinkFailed`), as it takes `rollCopy`. With none, it makes no menu.
- Re-creation: the engine calls the owner where the replica or role changes: after `apply`, after `receiveRecords` and `mergePersisted` change records, in `changeRole`, and when a catch-up ends. It does so only once the first catch-up has ended, and it reads the replica, not the pending view. A player gets no item. A GM who becomes a player has both items removed. A player who becomes GM gets them.
- Clicks: a click with anything other than one item is ignored. "Привязать лист…" opens the popover (280 × 360) with `anchorElementId` set to the element id Owlbear passes, which is the pressed menu entry at the token. Owlbear has no element id for a token. "Отвязать лист" runs `link-clear` through the engine's own `handleCommand` with a fresh id, so it gets the same GM check, catch-up queue, storage and send as a window command. No window owns that id, so the background shows a refusal as an Owlbear notification: `unlinkFailed: 'Не удалось отвязать лист. Попробуйте ещё раз.'`.
- Commands: `link-set { tokenId, sheetId }` and `link-clear { tokenId }`. New rejection reasons: `invalid-token-id`, and `unknown-link` (a clear with no live link record). `link-set` refuses a sheet that is not live with the existing `deleted-sheet`, `unknown-sheet` or `invalid-sheet-id`. Relinking mints over the old record, so a token holds one sheet. A clear also works on a link whose sheet is gone.
- Absent token: no test covers it. The status and the menu read only `link:` records, and the mock has no scene, so a test would pass whatever the code did.
- Sheet delete: the 1.7 path already tombstones `link:` records found by their data (`dependentSheetId`). The existing engine test `engine-client.test.ts` › sheet-delete covers it. `engine-link.test.ts` also checks that the menu frees the token after the delete.
- Picker: `picker.html` + `src/ui/picker/main.tsx` + `link-picker.tsx`. It starts its own replica client on the UI channel, so it talks to the background like the main window does. A `token` param that fails `tokenIdSchema` shows `linkFailed` at once with no list. A client that is not GM gets no list. Sheets are listed through `visibleSheets` and `pickerOrder`. Characters come first, unlabelled. NPCs follow under an "NPC" heading (`copy.place.npc`). A sheet that has a token shows "Токен привязан". A visually hidden ", " keeps the accessible name "Имя, Токен привязан". While a pick is in flight, the buttons are disabled and the list is `aria-busy`. The picker closes its popover only when `link:{tokenId}` in the replica (the new `$replica` atom of the projection store, without the pending view) shows the picked sheet. A rejection, or no answer within 5 s, shows `linkFailed` and enables the buttons again. A failed `popover.close` resets the pick. `vite.config.ts` builds the page, `public/_headers` serves it with CORS and no-cache, and `tests/build.test.ts` now requires it.
- New catalog strings: `noSheetsToLink: 'Сначала создайте лист'` (UX-DR22), and `linkFailed: 'Не удалось привязать. Попробуйте ещё раз.'` and `unlinkFailed: 'Не удалось отвязать лист. Попробуйте ещё раз.'`, which follow the `duplicateFailed` pattern. None is in the Voice and Tone table.
- Header: `SheetHeader` takes `tokenLinked`, which `main.tsx` computes once with `linkedSheetIds` over the visible records. It shows it as a status `Chip` before "⋯", in the character header and in each NPC block. The player header is unchanged.
- Mock: `contextMenuItems`, `contextMenuCalls`, `failNextContextMenuCalls(kinds)`, `clickContextMenuItem(id, itemIds)`, `openedPopovers` and `closedPopovers`. The mock does not evaluate filters. Tests assert the filters as data, because Owlbear owns how it matches them.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind: the unlink filter chains `'||'` of unknown precedence and lost its layer check; the SDK has `some` | medium | Patched: `some` for ids, `every` for the layer. |
| Edge and Verification: menu port failures are not retried; the comment overclaims; no test | medium | Patched: stale marks for create and remove; honest comment; mock failure switch; tests observed red. |
| Blind and Edge: `stop()` leaves dead items in Owlbear | medium | Patched; test. |
| Blind and Edge: a rejected menu unlink is silent | low | Patched: `unlinkFailed` notification from the background; test. |
| Blind: menu refresh skipped when a delta cannot be split | low | Patched: refresh where replica or role changes. |
| Blind and Edge: the picker can hang with no message; buttons look active | medium | Patched: disabled while in flight, 5 s timeout, `linkFailed`. |
| Blind: picker trusts a missing or bad `token` param and any role | low | Patched. |
| Edge: picker closes on a pending-view link | low | Patched: closes on replica records only. |
| Edge: `popover.close` failure strands the picker | low | Patched. |
| Blind: button name glues sheet and status | low | Patched: separator. |
| Edge: a `link:` key whose token id fails the schema shows an unlink that refuses | low | Patched: skipped in live links. |
| Blind: the "absent token" e2e passes whatever happens | low | Removed; the rule holds by reading `link:` records only. |
| Blind: deleted-sheet pick path untested | low | Patched with an e2e. |
| Blind: PLAYER → GM promotion untested | low | Patched. |
| Edge: tokens on layers other than CHARACTER cannot be linked | low | Accepted for v1; recorded in Implementation Notes. |
| Blind: `link:` records of removed tokens grow without bound | low | Deferred. |
| Implementer: `some` semantics without a coordinator can only be confirmed in a live room | gate | Owner check in a live room. |

## Design Notes

- Filters: SDK filters are static. Build them from the current live links: the "Привязать лист…" item excludes every linked token id; the "Отвязать лист" item matches only linked token ids; both have `roles: ['GM']` and `max: 1`. Check `KeyFilter` semantics (`key`, `value`, `operator`, `coordinator`) in the SDK types, and restrict items to the character layer if the SDK allows; record the choice.
- With no links, the "Отвязать лист" item is removed (a filter cannot match an empty set).
- Popover: small (about 280 × 360), anchored to the token, id under the extension's namespace; one picker at a time.
- The picker closes after the pick is sent; a rejection (for example the sheet was deleted meanwhile) shows a short catalog message in the picker instead of closing.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: the GM menu on an unlinked and a linked token; the picker in a popover; multi-select shows nothing; a player sees no item; header status after link and unlink.
