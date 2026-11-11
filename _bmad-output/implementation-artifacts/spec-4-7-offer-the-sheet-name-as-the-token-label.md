---
title: '4.7 Offer the Sheet Name as the Token Label'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '98c4490606ce9bf82b46fca6178ea9d63198c809'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-unlink-a-sheet-when-its-token-is-deleted.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A link changes nothing on the map, so a GM still cannot tell which token is which sheet without opening the menu. Owlbear shows a text label under a token from the item itself. Backlog task: TASK-35, whose five acceptance criteria apply in full.

**Approach:** The link picker (spec 4.4) reads the token's current label when it opens and shows a checkbox "Подписать токен именем листа" with the current label under it. When the GM picks a sheet with the box checked, the picker first waits for the link as today, then sets the token's label to the sheet name, then closes. The label is an Owlbear item property, written by the picker page through a new write on the scene port. It is not a Muster Roll record and is not synced by the replica.

## Boundaries & Constraints

**Always:**
- The label is the item's plain text: for an `IMAGE` item, `text.plainText` with `text.type` set to `PLAIN`. Read the SDK types in `node_modules/@owlbear-rodeo/sdk` before writing; keep every other item field as it is.
- The scene port gets two small methods: read one item's label (`null` when the item is missing or has no text) and set one item's label. Only the picker calls them, and only on a GM client.
- Box default: checked when the token has no label (empty after trim), unchecked when it has one. The GM can toggle it.
- The hint under the box shows the current label: "Сейчас: «{label}»", or "Сейчас подписи нет" when it is empty. A label that cannot be read (port error, item missing) shows no hint and leaves the box unchecked.
- Order: link first. The label write starts only after the link is in the replica (the existing `arrived` path). The picker closes after the label write settles, success or failure.
- A failed label write keeps the link and shows an Owlbear notification "Не удалось подписать токен" (variant `ERROR`) before the picker closes.
- Strings go to the copy catalog (`src/ui/copy.ts`).
- Spec 4.4's "Never: writing item metadata on tokens" still holds: no `metadata` write. This spec writes only the label, which the owner asked for in TASK-35.

**Never:**
- Changing the label on unlink, on sheet rename, or on sheet delete.
- Any label write from a player client, from the background page, or from the replica.
- Writing the label before the link arrived, or when the box is unchecked.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token with no label | GM opens the picker | Box checked; hint "Сейчас подписи нет" | N/A |
| Token with a label | Label "Гоблин 2" | Box unchecked; hint "Сейчас: «Гоблин 2»" | N/A |
| Label unreadable | Port read rejects or item missing | Box unchecked; no hint; picking still links | Error logged |
| Pick, box checked | GM picks "Арагорн" | Link written; then label "Арагорн"; picker closes | N/A |
| Pick, box unchecked | GM picks a sheet | Link written; label unchanged; picker closes | N/A |
| Label write fails | Port write rejects | Link stays; notification "Не удалось подписать токен"; picker closes | Error logged |
| Link refused | Sheet deleted meanwhile | No label write; existing refusal message | Existing path |
| Unlink | GM picks "Отвязать лист" | Label unchanged | N/A |
| Player | Player client | No picker content; no label read or write | N/A |
| Sheet renamed later | Name changes after linking | Label unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/platform/ports.ts`, `src/platform/obr/index.ts`, `src/platform/mock/index.ts`, `src/platform/mock/room.ts` -- `ScenePort` (spec 4.6); add the label read and write; the mock keeps a label per item id and exposes it to tests.
- `src/ui/picker/link-picker.tsx`, `src/ui/picker/main.tsx` -- the checkbox, the hint, the write after `arrived`, the notification.
- `src/ui/copy.ts` -- new strings.
- `src/ui/primitives/` -- reuse an existing checkbox primitive if there is one; otherwise use `react-aria-components` `Checkbox` styled like the existing controls.
- `tests/link.e2e.ts` -- picker e2e.

## Tasks & Acceptance

**Execution:**
- [x] Scene port: `getItemLabel(itemId)` and `setItemLabel(itemId, label)` in the port, the OBR adapter (`OBR.scene.items.getItems([id])`, `OBR.scene.items.updateItems([id], draft => …)`), and the mock (with a test hook to set and read a label).
- [x] Picker: read the label on open (GM only, after the first catch-up), the checkbox with its default, the hint, and the label write after the link arrives; close after it settles; notification on failure.
- [x] Copy strings: `linkLabel` "Подписать токен именем листа", `linkLabelNow` "Сейчас: «{label}»", `linkLabelNone` "Сейчас подписи нет", `linkLabelFailed` "Не удалось подписать токен".
- [x] Tests: unit for the mock label hooks and the adapter's draft update (a non-image item is left as it is); component or e2e tests for every matrix row the mock can reach; the player row asserts no label call.

**Acceptance Criteria:** the five criteria of TASK-35.

## Implementation Notes

- Port: `ScenePort.getItemLabel(itemId)` answers the label, `""` for an empty one, and `null` for an item that is missing or has no label text. `ScenePort.setItemLabel(itemId, label)` rejects for such an item and on a client that is not GM. The port header now says it also reads and writes one item's label.
- Adapter: `src/platform/obr/item-label.ts` holds `itemLabel(items, itemId)` and `writeItemLabel(draft, label)`. An item counts only when it is `type: 'IMAGE'` and its `text` has a string `plainText`, a `richText` array of Slate nodes and a `type` of `PLAIN` or `RICH` (a zod check on the item itself, so the write goes to the draft). The read takes the one item with the asked id (another id, or the id twice, reads `null`) and answers `plainText`, or for `RICH` the text of `richText`, one line per block. The write sets `plainText`, sets `richText` to one paragraph with the label, so a later switch to `RICH` does not bring the old name back, and sets `type` to `PLAIN`. Every other field stays. `setItemLabel` refuses when `OBR.player.getRole()` is not GM, then runs `updateItems([id], …)`; the SDK runs the draft update locally before it resolves, so the callback records whether a draft was written, and the call throws after `updateItems` when none was (the item vanished or stopped counting).
- Mock: `MockScene` now has `labels` (item id to label, `null` for an item with no label text, as a shape). The page room keeps them in localStorage with the scene, so the picker page writes and every page reads one value. A label lives in its item: an item that leaves the scene and comes back (a scene switch, an undo) keeps it. A label write is one `items` change with the same list, as Owlbear reports an item update. As the adapter, the mock write rejects for a player and for an item that is missing or has `null`. Test hooks: `setSceneItemLabel` (a label or `null`), `sceneItemLabel`, `sceneLabelCalls` (this page's reads and writes, in order) and `failNextSceneLabelCalls(['read' | 'write'])`.
- Picker: the props gain `scene` (the two label methods), `notification` and an optional `timing`; `main.tsx` passes the platform ports. The waits are `LINK_PICKER_TIMING` in `src/core/timing.ts`: pick 5 s, label read 2 s, label write 5 s. The label is read once, when the token id is valid, the projection is loaded, the first catch-up has ended and the role is GM. While the read runs, the box and the sheet buttons are disabled, so no pick skips the default. A read with no answer in time counts as unreadable. The offer ("Подписать токен именем листа", a `react-aria-components` `Checkbox`, as no checkbox primitive exists) shows above the list only when the list shows, and is disabled after a pick. Box default: checked when the label is empty after trim. The hint is the checkbox's accessible description and sits in the grid column of the label text, so it follows the box size. A read answering `null` logs an error, shows no hint, and leaves the box unchecked and disabled, as no write could succeed. A rejected or timed-out read logs an error, shows no hint, and leaves the box unchecked and enabled.
- Order: a pick stores the label to write (`sheet.name` when the box is checked, else `null`) with the sent command. When the link is in the replica (the existing `arrived` check), the picker checks that the role is still GM, writes the label, then closes. A write that rejects or has no answer in time logs an error and shows `notification.show('Не удалось подписать токен', 'ERROR')`, itself given the same time, before the close; a rejected or silent notification still closes. A ref keeps the write and close to one run per command id, and once they start the 5 s pick timer stays off, even when another GM relinks the token during a slow write. A failed close still resets the pick, as before, so the GM can pick again; that pick writes the label again.
- Never paths: unlink, sheet rename and sheet delete run in the background and the replica, which hold no reference to the label methods. `engine-scene.test.ts` now counts the label methods with the other scene calls, and `scene-watch.test.ts`'s fake rejects them. No `metadata` write.
- Copy: `linkLabel`, `linkLabelNow(label)`, `linkLabelNone`, `linkLabelFailed`. None is in the Voice and Tone table, so `copy.test.ts` is unchanged.
- Tests: `src/platform/obr/item-label.test.ts` (read of an image, an empty label, a missing item, a drawing, a text item; write keeps every other field; a drawing and a text item are left as they are). `src/platform/mock/index.test.ts` › mock scene labels (hooks, room-wide write, a write to a missing item, an item with no label text and from a player, the label kept across removal, failures). `src/ui/picker/link-picker.test.tsx` (happy-dom component tests on the real projection store): no label, a label, read rejects, item missing, pick checked with the order send → arrived → write → close, pick unchecked, decline and accept by toggling, write fails, link refused, sheet renamed later, player, read after the first catch-up. Later tests: read timeout with the box and sheets disabled while pending, write timeout, a rejected and a silent notification, a failed close, a relink during a slow write, a role change before the write, the box disabled after a pick; adapter: a rich read, the write of both texts, an image with no text, an unknown text type, a non-string plain text, another id and two items. A mutation check made each picker guard (default, role at read and at write, catch-up, notification, checkbox, write, arrival order, buttons while reading, each timeout, the timer ref, the disabled box for `null`) and the adapter's IMAGE and `PLAIN` checks fail their tests. `tests/link.e2e.ts` adds five tests: label written, label kept, write failure, unlink keeps the label, player picker. `tests/support/room.ts` exports `clientQuery` for the player picker URL.
- Browser tests: on this host Chromium cannot launch (`bootstrap_check_in … MachPortRendezvousServer`, error 141). `bun run test:browser tests/link.e2e.ts` ran once: 15 of 15 failed, each at `browserType.launch`, with no other error. The new e2e tests are not observed green.

## Spec Change Log

## Review Triage Log

Round 1 (Blind Hunter, Edge Case Hunter, Verification Gap):

| Finding | Source | Disposition |
| --- | --- | --- |
| A pick during the label read skips the default label | EC, BH | patch: sheet buttons disabled while reading; read times out after 2 s as unreadable |
| A label write or notification that never settles keeps the picker busy | EC | patch: both raced against timeouts; close always follows |
| The pick timer restarts during a slow write after another GM relinks | BH, VG | patch: timer off for good once `finish()` starts; test |
| `setItemLabel` resolves when the item vanished between read and write | EC, BH | patch: draft callback records the write; throws when none happened |
| A `null` read leaves the box enabled, so checking it always fails | EC, BH | patch: box disabled for `null`; a rejected read keeps it enabled and unchecked |
| A client demoted after the pick still writes the label | EC | patch: role re-checked before the write; adapter refuses a non-GM |
| A RICH label reads wrong; the write leaves the old `richText` | EC, BH | patch: RICH read from `richText`; write sets both texts |
| Checkbox disabled states and the `onLinked` reject path untested | VG, BH | patch: tests |
| Mock drops labels when an item leaves the scene; cannot model an unlabelable item | BH | patch: labels kept; `null` label models an unlabelable item |
| `item-label.test.ts` skips malformed SDK inputs | BH | patch: tests |
| `ScenePort` header comment outdated; hard-coded `ps-[24px]` | BH | patch |
| Real OBR adapter reject contract has no test | VG | defer: no Owlbear SDK harness in the repo |
| New e2e tests never ran green | BH | defer: Chromium cannot launch on this host; run before Done |

## Design Notes

- The picker, not the background, writes the label: it is the page the GM is using, it already has the token id, and the write is not room data.
- A checkbox keeps the pick a single press. The default avoids silently replacing a label the GM set by hand.
- A non-image item (for example a shape) may have a different text model. The adapter writes only when the item has a `text` field of the SDK `TextContent` shape; otherwise the write rejects and the failure path runs.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: link an unlabeled token with the box checked, the sheet name shows under it; link a labeled token, the box is off and the label stays.
