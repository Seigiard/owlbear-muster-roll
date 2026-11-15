- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-load-the-empty-extension.md`
  summary: Make the mock's LOCAL broadcast and storage cross pages and survive a reload.
  evidence: Each page has its own in-memory instance. Stories 1.3 and 1.4 need the window-to-replica path under Playwright.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-load-the-empty-extension.md`
  summary: Define a failure result for StoragePort writes and reads.
  evidence: `localStorage` can throw on quota or access. Story 1.3 is the first caller.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-load-the-empty-extension.md`
  summary: Add a local player role-change subscription to PlayerPort.
  evidence: Story 2.2 makes a role change a catch-up trigger, and the port has only `getRole`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-load-the-empty-extension.md`
  summary: Add a repeatable check for served headers and `html_handling`.
  evidence: Only manual `wrangler dev` and the owner checklist cover them. A redirect still carries both headers.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-load-the-empty-extension.md`
  summary: Add an automated check of the SDK import boundary.
  evidence: The rule was verified by hand, and no test observes `.oxlintrc.json`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-window-that-belongs-to-owlbear.md`
  summary: Give WindowShell per-tab content and controlled tab selection.
  evidence: All panels share one `children`, which is enough for the loading text only. Stories 1.5 and 1.11 give tabs content.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-window-that-belongs-to-owlbear.md`
  summary: Give the TabList an accessible name from the copy catalog.
  evidence: No string exists in `EXPERIENCE.md`. Story 1.6 builds the real tab bar.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-keep-records-safe-in-the-browser.md`
  summary: Refuse `__proto__`, `constructor` and `:` in preset field ids.
  evidence: Zod drops a `__proto__` key from a parsed record with no error. Story 1.5 owns the preset schema.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-keep-records-safe-in-the-browser.md`
  summary: Prove through a real reload that the browser storage adapter persists.
  evidence: Tests inject their own getter. TASK-6 is the first production caller.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-own-the-replica-in-the-background.md`
  summary: Give the window delivery evidence for commands, or send them only while live.
  evidence: `sendCommand` returns `ok` on enqueue, and a command with no listening engine vanishes. Story 1.6 is the first caller.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-own-the-replica-in-the-background.md`
  summary: Expose loaded versus empty from the projection store and clear old rejections.
  evidence: The client phase is private. Story 1.5 adds the no-preset state.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-own-the-replica-in-the-background.md`
  summary: Decide how a corrupt stored sheet clears its banner.
  evidence: Its random key is never written again, so the notice stays until the stored value goes.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-own-the-replica-in-the-background.md`
  summary: Test that projection assembly refuses parts of another answer.
  evidence: No test delivers a part from another engine or sequence into an open assembly.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-load-and-download-a-preset.md`
  summary: Show a stored preset that does not decode as unreadable, not as absent.
  evidence: A record from a newer build would show the upload screen and invite an overwrite. Room sync brings such records.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-load-and-download-a-preset.md`
  summary: Bound the inflated size in `decodePreset`.
  evidence: About 15 KB of base64 can inflate to megabytes. Today only the client's own window sends it; room sync brings foreign records.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-load-and-download-a-preset.md`
  summary: Show a result under the button after a preset replace.
  evidence: A replace with no sheets changes nothing visible. The AD-14 diff story owns the result text.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-load-and-download-a-preset.md`
  summary: Cap `columns` in the preset schema.
  evidence: A huge value passes upload and would make a huge grid. Story 1.8 renders the grid.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-create-and-name-characters.md`
  summary: Apply the sheet name rule to records read from storage and from other clients.
  evidence: `sheetDataSchema.name` is a plain string; only the engine's commands check length and blankness. Room sync brings foreign records.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-create-and-name-characters.md`
  summary: Test that a disappearing selected tab hands the selection to the first tab.
  evidence: The branch exists in `main.tsx`, but nothing can remove a sheet until Story 1.11.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-see-a-sheet-laid-out-by-the-preset.md`
  summary: Assert `aria-multiline` on text and number value controls.
  evidence: No test reads it; Story 1.9 replaces the read-only controls with editable ones.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-keep-npcs-on-their-own-tab.md`
  summary: No test proves NPC delete focus skips a next neighbour deleted in another window before the tombstone lands.
  evidence: Replacing the `find(... npcSheets.includes ...)` with `neighbours[0]` keeps all focus tests green.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-see-edits-from-other-gm-tabs-live.md`
  summary: No test proves the banner shows local-save-failed above new-version when both are active.
  evidence: Swapping the two branches of `bannerFor` keeps every test green. Story 2.5 owns the multi-notice banner.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-see-edits-from-other-gm-tabs-live.md`
  summary: A player client keeps INITIAL_GENERATION, so once the room generation moves past it, the gate drops every GM commit at that player.
  evidence: `src/replica/engine.ts` sets the player's generation only at start. Stories 2.2 and 2.5 must take it from the room copy and from `state`.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-catch-up-on-join-and-on-return.md`
  summary: A GM client that sees a higher generation enters catch-up but drops every higher-generation `state`, waits the full timeout, then replays pending intents as commits that peers of the higher generation drop.
  evidence: `receiveState` adopts a higher generation only for a client without persisted data. Epic 5 owns AD-9 adoption.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md`
  summary: Room metadata is writable by any party member, so a player can write a forged room copy that GM clients merge as authoritative records (security review finding). Owner decision: accept the table-trust model, or design provenance for the copy.
  evidence: `src/replica/engine.ts` merges `copy.records` of the same generation during catch-up and before a write. Owlbear room metadata has no writer identity; a signing key cannot be shared between GM devices without a server.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-read-characters-with-no-gm-online.md`
  summary: No test proves a window never receives room-copy outcome `read` before the copy's records.
  evidence: Putting `noteRoomCopy` before `receiveRecords` in `mergeReadRoomCopy` keeps every test green; the gap lasts between two back-to-back deltas.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-evaluate-dice-formulas-safely.md`
  summary: A number field value that stringifies in exponent form (for example `1e-7`) gives the field error in a roll.
  evidence: `fieldNumber` reads numbers through `parseNumberInput(valueText(value))`, and the 1.9 parser refuses exponent notation.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-roll-a-dice-cell-and-show-the-result.md`
  summary: A roll pressed right after a blur save that the engine rejects uses the old record value, while the window shows the typed text again.
  evidence: The blur save clears the window draft before the roll request; the window does not keep drafts until the patch is acknowledged.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-roll-a-dice-cell-and-show-the-result.md`
  summary: A player roll that uses the player's own pending edit is untested until Epic 3 adds player edits.
  evidence: Only the GM pending path exists now; `engine-roll.test.ts` covers it.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-duplicate-an-npc.md`
  summary: The duplicate block closes when any new NPC appears, so another GM adding an NPC at that moment closes it before the copies arrive.
  evidence: `sheet-header.tsx` treats any new NPC key as acceptance of its command.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md`
  summary: `link:` records of tokens removed from the scene are never cleaned up, so menu filters and re-creations grow over a campaign.
  evidence: v1 reads `link:` records only and never the scene; a removed token cannot be clicked to unlink.
  status: resolved for new deletions by spec-4-6 (TASK-39); records from before it stay.

## From spec-3-3-apply-a-players-edit-after-a-gm-check (TASK-22)

- A player with access can add `rep:` instances without limit; only the room-copy size check stops growth. Consider a per-section instance quota.
- With two GM clients, a player's record with a `c` equal to an unseen GM edit can win the author tie.
- Pending entries wait up to `proposeResendMaxMs` (30 s) after a GM leaves catch-up when `gmLink` does not change.
- The engine test `TIMING` literal is copied in about 14 files; a shared fixture would remove the copies.
- The `gone` race in `handlePlayerCommand` (a row removed by a not-yet-shown commit) has no test.

## From spec-3-4-see-when-an-edit-is-waiting-for-a-gm (TASK-23)

- No test covers the save-on-disable flush of a focused field in a row whose removal becomes pending, or the disabled dice button in that row.
- The row slot live region also announces the delayed mark of a new row; check with a screen reader in a live room.

## From spec-5-1-change-the-preset-over-existing-sheets (TASK-29)

- A second GM client still on the old preset can write an old key after the upload; incoming commits are not stripped.
- No test covers a merged row over the message limit (`too-large`), or the 15 s window timeout.
- The confirmation shows only the count, not which fields lose values.

## From spec-5-2-download-a-room-snapshot (TASK-30)

- No feedback after "Скачать снимок"; the Owlbear iframe may block downloads. Check in the live room (TASK-32).
- A value still in its typing pause is not in the downloaded file.

## From spec-5-3-replace-the-room-from-a-snapshot (TASK-31)

- Any participant can write a higher-generation room copy and replace the room for every client. Accepted by the owner for home use; revisit for public tables.
- A generation that never completes (importer gone, copy did not fit) keeps every client in catch-up until a GM of that generation answers.
- The late `snapshot-imported` after the 60 s window timeout has no test; the mock has no scene, so an inert link to an absent token is checked only as no error.

## From spec-4-6 (TASK-39, token unlink)

- The scene order of `onReadyChange` and item lists on a scene switch is verified only in the mock. Check in a live room: switch scenes with linked tokens; links must stay.
- An undo of a token delete does not restore its link. A GM links it again.
- A deleted linked token still leaves one `link:` tombstone in the room copy. Orphan `link:` records from before TASK-39 stay until a compaction exists.
- Deleting N linked tokens sends N `link-clear` commits, not one batch.

## From spec-4-7 (TASK-35, token label)

- The OBR adapter's label read and write are tested only through pure helpers; a `mock.module('@owlbear-rodeo/sdk')` harness would pin the reject contract.
- Owlbear's display of a label after `text.type` changes to `PLAIN` is unverified live. Owner check in a live room.

## From spec-5-4 (TASK-33, window size)

- Owlbear's resize of an open action window through `setWidth`/`setHeight` is unverified live. Owner check in a live room.
- A test that an adopted generation resizes before its catch-up ends needs a long catch-up fixture.

## From spec-4-8 (TASK-36, dice extension)

- d100 rolls locally, because dicex reports only the tens die. Supporting it needs dicex to report the combined value.
- The client follows dicex shapes read from source; a live-room roll with the fork confirms them.
- dicex gains a GM access permission (owner decision 2026-11-11); the client should ask for access up front and read `permitted` from the readiness reply once the fork ships it.

## From spec-task-41 (sheet sets and single sheets)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-41-sheet-sets-and-single-sheets.md`
  summary: Each sheet set's "+" sits after all tabs in the DOM and only CSS `order` places it after its set, so keyboard and screen-reader order differ from the visual order.
  evidence: ARIA does not allow a button inside a tablist; each "+" names its set ("Добавить: {title}"). Matching the orders needs a different tab bar widget.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-41-sheet-sets-and-single-sheets.md`
  summary: A live `sheet:` whose `set` names no sheet set of the preset (a create racing an upload) is never tombstoned or counted.
  evidence: `presetDiff` walks only the old preset's templates; the race needs a sheet-create to reach a GM after an upload that removed its set.

## From spec-task-38 (preset builder)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-38-preset-builder.md`
  summary: No test proves that Ctrl/Cmd+Z inside a builder text input leaves the store's undo stack alone.
  evidence: The undo e2e presses the keys only with focus on the tree; removing the `isTextInput` guard passes every test. Add one press inside the title input when that test is next touched.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-38-preset-builder.md`
  summary: Renaming a field after renaming its template, in a preset opened from a file, shows no «Значения поля … будут стёрты» warning.
  evidence: `item-form.tsx` finds the origin template by the current `template.id`; a fix tracks each template's origin id per uid.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-38-preset-builder.md`
  summary: A problem inside a collapsed tree container shows no mark until the container is expanded.
  evidence: `structure-tree.tsx` marks only the problem's own uid; the counter still reaches it. A fix marks collapsed ancestors.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-38-preset-builder.md`
  summary: Two rows of one plain section that start with the same field id give duplicate React keys in the builder preview.
  evidence: `plainRows` in `preset-section.tsx` keys rows by row id; only an invalid builder draft reaches it, and changing the keys touches how the window keeps field state across preset changes.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-38-preset-builder.md`
  summary: Builder form inputs set no `aria-invalid` and do not point at their problem messages through `aria-describedby`.
  evidence: `FormulaInput` always gets `invalid={false}`; the form's problem list is not referenced by its inputs.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-38-preset-builder.md`
  summary: The build test's theme-hex check skips every `builder-*` chunk, not only the preview theme values.
  evidence: `BUILDER_CHUNK` in `tests/build.test.ts`; narrowing it needs `src/preview/themes.ts` in a named chunk of its own.

## From spec-task-44 (Cairn 2e preset)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-44-cairn-2e-preset.md`
  summary: A formula cannot take its die size from a field, so a weapon's damage die is not part of its repeat block.
  status: resolved by spec-task-52 (TASK-52)
  evidence: Dice terms need literal `N` and `M` (`src/core/formula.ts`). `presets/cairn-2e.json` shows `1d4` to `1d12` on every attack row instead, and the player picks the weapon's die.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-44-cairn-2e-preset.md`
  summary: A dice cell's label comes only from a fixed text cell, so a damage roll reads «1d8», not the weapon's name.
  evidence: `cellLabel` in `src/core/sheet-values.ts` reads text cells only. A label from the repeat block's first field would name the attack in the roll.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-44-cairn-2e-preset.md`
  summary: A comparison cannot say that a natural 1 always succeeds and a natural 20 always fails, as Cairn saves do.
  evidence: `1d20 <= str` gives the same outcome while the attribute is from 1 to 19, which covers Cairn play (attributes 3–18, 0 is death or paralysis).
- source_spec: `_bmad-output/implementation-artifacts/spec-task-44-cairn-2e-preset.md`
  summary: A repeat block holds no list of its own, so a Cairn NPC gets two fixed attack rows.
  evidence: ADR 0001 makes an NPC a repeat block; a third attack goes into the notes.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-44-cairn-2e-preset.md`
  summary: The sheet does not count used inventory slots, and a bulky item takes two slots only by hand.
  evidence: `presets/cairn-2e.json` gives each of the ten slots a text field and a Fatigue check; a formula cannot count filled fields, so the player writes a bulky item into two slots.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-53-cell-name.md`
  summary: Name Cairn inventory slots and fatigue checks "1" through "10".
  evidence: Those cell names are outside TASK-53's list; the current labels remain the visible slot numbers and the Fatigue column.

## Deferred from: code review of spec-task-42-shadcn-aria and spec-task-44-cairn-2e-preset (2026-11-12)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-42-shadcn-aria.md`
  summary: The build leak check matches hex values only, so a theme text colour hard-coded as an `rgba()` string in JS ships unnoticed.
  evidence: `MAPPED_HEX` in `tests/build.test.ts`. Lightning CSS turns `rgba()` in CSS into the hex forms it lists; only inline JS strings such as `rgba(255, 255, 255, 0.7)` get through.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-42-shadcn-aria.md`
  summary: The three copies of the live Owlbear themes can drift apart, and no test compares them.
  evidence: `MOCK_THEME` in `src/platform/mock/index.ts`, `PREVIEW_THEMES` in `src/preview/themes.ts` and `LIGHT_THEME` in `tests/support/colors.ts`. The builder page shows `PREVIEW_THEMES`, and the contrast test reads only `LIGHT_THEME`. A unit test that compares them needs the mock theme exported.

## Deferred from: build of spec-task-47-shared-engine-test-rig (2026-11-12)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-47-shared-engine-test-rig.md`
  summary: No test fails when a GM client still adopting another generation writes the room copy.
  evidence: Removing `adoptTarget === null` from `canWriteRoomCopy` in `src/replica/engine.ts` leaves all 658 engine tests green, both before and after the rig move. AD-8 says only a client that can vouch for its records writes the copy.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-47-shared-engine-test-rig.md`
  summary: Four non-engine test files still hold their own full `Timing` literal.
  evidence: `src/ui/replica-client.test.ts`, `src/ui/picker/link-picker.test.tsx`, `src/replica/commit-outbox.test.ts` and `src/platform/send-queue.test.ts` were outside TASK-47's scope; a new `Timing` field must still be added to each by hand.

## Deferred from: build of spec-task-45-pending-edits-module (2026-11-12)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-45-pending-edits-module.md`
  summary: The `proposalAllowed` pre-check in `edit` of `src/replica/pending-edits.ts` is an equivalent mutation (M6): no test fails without it, before or after TASK-45.
  evidence: `resolveSheet` (`src/core/sheets.ts`) gives a hidden template `write: 'none'`, so `playerMayEdit` and the composer refuse every case `proposalJudgement` refuses. Either the check is dead and can go, or a state where it alone refuses needs a test; deciding needs a look at `core/access`.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-45-pending-edits-module.md`
  summary: Mutation M9 (a stale answer rebases on `current` alone) survived every engine test at the baseline; only the new unit test kills it.
  evidence: ticket.md calibration in the TASK-45 run directory: M9 fails 0 tests at the baseline and after phase A, 1 test after phase B (`a stale answer below the edit rebuilds over the newest known record, not only the answer`). No engine-level or e2e test covers it.

## Deferred from: build of spec-task-54-roll-without-closing-the-window (2026-11-12)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-54-roll-without-closing-the-window.md`
  summary: In the dicex fork, a remote player's tray can cover the roller's own Dice+ tray in the bottom-right popover.
  evidence: `src/plugin/PopoverTrays.tsx` (branch `dice-plus-roll-without-action`) renders the roller's tray and every remote `PopoverTray` at the same absolute spot (`right=16 bottom=16`). The later sibling covers the earlier one when two rolls show at once. Remote trays already overlap this way on base 47cd243. A fix needs a stacking or layout decision. Code-review finding bugs+impl-terra-2 (revmux round 1).

## Deferred from: build of spec-task-46-command-outcomes (2026-11-12)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-46-command-outcomes.md`
  summary: A window of a newer build that talks to an older background page never gets `command-done`, so commands the old engine applied time out after 15 s.
  evidence: After a deploy, a room opened before it keeps the old background page. Result answers (preset, snapshot, wipe, roll) still arrive, and access, link, create and repeat-block views settle from records, so the visible harm is a false `copy.duplicateFailed` and a dropped held field value. A fix needs a protocol choice, for example a build marker the window reads before it waits for `command-done`.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-46-command-outcomes.md`
  summary: A snapshot import that succeeds after its 60 s timeout no longer clears `copy.snapshotImportNoAnswer`.
  evidence: The client drops every answer after the timeout (spec matrix "Timed out"), so the spec-5-3 rule that a late `snapshot-imported` clears the warning no longer holds. Restoring it needs a view signal for a replaced room that does not depend on the late answer.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-46-command-outcomes.md`
  summary: A duplicate queued during a catch-up longer than 15 s shows `copy.duplicateFailed`, and a retry queues a second duplicate.
  evidence: The duplicate now closes when replay answers (spec Always). An incomplete catch-up with backoff can last up to `incompleteRequestMaxMs` (30 s), longer than the default command timeout.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-46-command-outcomes.md`
  summary: A comment in `tests/owner.e2e.ts` still names `ACCESS_CHANGE_TIMEOUT_MS`, which TASK-46 replaced with `Timing.accessChangeTimeoutMs`.
  evidence: TASK-46 kept `tests/` unchanged as the oracle for unchanged behaviour, so the comment was left for a later edit of that file.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-58-tabs-format-v3.md`
  summary: src/ui/copy.test.ts "Add a sheet of a sheet set" fails because EXPERIENCE.md asks for "+ Добавить" and copy.addSign is "+".
  evidence: Fails at 411b3d0 before TASK-58; the label belongs to the sidebar (TASK-60), which also updates the "+" assertions in tests/characters.e2e.ts.

## Deferred from: build of spec-task-48-catch-up-state-machine (2026-11-12)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md`
  summary: Under calibration mutation M5 (a GM client also catches up on a GM return), `src/replica/engine-sync.test.ts :: remote record :: that loses to the local one sends no delta and writes nothing` fails by a timing race, on the baseline engine and on the catch-up module alike.
  evidence: The focused test failed 17 of 20 runs on the baseline engine and 18 of 20 on the module. Both timelines show the same order: the marker delta, then the empty delta of the late complete state answer. `afterMarker` waits for the marker only, so the randomly delayed answer can land inside the test window. Unmutated, the test passes, because a GM does not catch up on a GM return. Evidence: `controls/d11-*` in the TASK-48 tdd run directory.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md`
  summary: Under mutation M5, several two-GM engine tests pass or fail from run to run, so M5's failing set is not a stable calibration signal.
  evidence: Three runs on each side varied in `engine-import :: adoption guards :: an adopter whose save fails…`, `engine-import :: adoption :: a second GM adopts on reset alone…`, `engine-import :: two imports at once end with every client on the higher one`, `engine-propose :: on two GM clients: both store the same record and both commit its echo`, `engine-scene :: two GM clients :: both clear the link…`, `engine-sync :: two GM clients :: settle on the record with the higher (c, a)…` and `engine-wipe :: a wipe :: another GM adopts the empty room…`. The 13 failures stable on all runs match on both sides.

## Deferred from: code review of TASK-59 hidden tabs (2026-11-13)

- source_spec: backlog TASK-59
  summary: No test covers the tab check in the engine's deferred `openTargetShown` recheck of a held open request.
  evidence: Review round 1 (revmux owlbear-task-59/01-initial, docs+tests-codex-1). A player press on a hidden-tab repeat block is refused earlier in `openTarget`, so only a GM who becomes a player within `openRequestTtlMs` reaches the recheck. The code handles it; only the regression test is missing.
- source_spec: backlog TASK-59
  summary: No e2e covers a template whose first tab is GM-only and whose second tab is visible, or a player reopening a tab chosen before it was hidden.
  evidence: Review round 2 (revmux owlbear-task-59/02-after-fix, docs+tests-terra-1, lean-codex-1, docs+tests-codex-1). `openTabIndex(layout, chosen, shown)` picks the first tab the role sees; every new scenario starts on visible tab 0.

## Deferred from: code review of TASK-60 sidebar (2026-11-13)

- source_spec: backlog TASK-60
  summary: CellTooltip keeps one module-wide open tooltip, so a hover tooltip blocks a focus tooltip elsewhere, and a mouse `pointerleave` no longer hides it when the pointer leaves the iframe.
  evidence: Review round 1 (revmux owlbear-task-60/01-initial, bugs+impl-codex-5, adversarial-claude-4). The lock and the touch-only leave rule came with the sidebar tooltip; changing them needs a choice about which tooltip wins and when one closes.
- source_spec: backlog TASK-60
  summary: The `sidebarOrder` helper in `tests/templates.e2e.ts` sorts by the `style.order` WindowFrame writes and puts Settings last, and no test checks the visible text of a sidebar group heading (it comes from a CSS `::before`).
  evidence: Review round 1 (docs+tests-codex-2, docs+tests-terra-1). Test-only gaps; the rendered order and the heading's accessible name are correct.
- source_spec: backlog TASK-60
  summary: `preview.html` loads its preset list with a synchronous XHR during the first render, then fetches it again.
  evidence: Review round 1 (lean-terra-1). Dev-only page; works, but blocks the first render.
- source_spec: backlog TASK-60
  summary: The sidebar's right edge is an inset `box-shadow` with a physical offset, so it would sit on the wrong side in a right-to-left layout.
  evidence: good-css check, round 1 (good-css-3). The interface is Russian-only and left-to-right today.

## Deferred from: build of spec-task-50-room-copy-module (2026-11-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-50-room-copy-module.md`
  summary: An import keeps writing its room copy after its client loses the GM role during the import's metadata read, and the engine then sends `reset` from what is now a player.
  evidence: The engine's `importSuperseded` (`src/replica/engine.ts`) checks only stop, adoption and generation, at the baseline `17f80f3` and after TASK-50; `changeRole` calls `roomCopy.demoted()`, which does not stop an import in flight. Code review round 1 of TASK-50, finding `bugs+impl-codex-2`, raised it as pre-existing. A fix changes the import contract (what a demoted importer reports), so it needs its own task.

## Deferred from: TASK-61.6 second-flow picker experiment (2026-11-14)

- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.6-second-ui-flow.md`
  summary: Research a separately approved bounded production picker migration under TASK-61.7; do not adopt the experimental caller as a production interface.
  evidence: `prototypes/ui-second-flow/README.md` records 58 isolated passing cases and eight calibrated defects. Production `src/ui/picker/link-picker.tsx` remains unchanged; React lifetime, replica delivery and real port wiring are not exercised by that experiment.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.6-second-ui-flow.md`
  summary: Keep cancellation and replica-arrival limits explicit in any later picker design.
  evidence: Prototype disposal cancels scheduled callbacks and drops late completions, but cannot undo an in-flight SDK call. Matching-target arrival is not command provenance; a same-target close retry can finish against an already matching replica. A stronger guarantee needs separate contract research, not a protocol change in this spike.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.6-second-ui-flow.md`
  summary: Settings and the other open UI coverage rows still need research; navigation and picker do not justify a shared runner or event bus.
  evidence: Navigation uses React effects and fresh sheet keys; picker needs scoped attempt ids and sequential item-label ports. H3/H6 support is bounded to these examples; the experiment makes no settings, builder or shared-renderer migration claim. Live Owlbear label/close behavior remains the owner's check.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.9-preview-navigation.md`
  summary: Add optional unit coverage for nonempty cross-template isolation and a foreign selected tab.
  evidence: Review triage judged this minor and deferred it; the reducer compares template UIDs in both relevant branches, with no behavior defect demonstrated.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.9-preview-navigation.md`
  summary: Add optional unit coverage for a null initial state, including first-tab and selected-tab opening.
  evidence: Review triage judged this minor and deferred it; reducer initialization resolves these cases and the unchanged browser suite covers opening behavior.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.9-preview-navigation.md`
  summary: Add optional composition coverage for a stale shown-tab index after a same-template tab removal.
  evidence: Review triage judged this minor and deferred it; existing open-tab fallback owns index normalization and no behavior defect was demonstrated.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.9-preview-navigation.md`
  summary: Add optional browser coverage that retains the reducer-selected tab after selecting a window.
  evidence: Review triage judged this minor and deferred it; the current browser test chooses the target tab again, while reducer retention was calibrated and 519 browser tests passed unchanged.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-62-ime-safe-enter-submit.md`
  summary: Keep an IME Escape key from closing the duplicate-count form through its group handler.
  evidence: The unchanged `handleKeyDown` in `src/ui/sheet/duplicate-count.tsx` calls `onCancel` for every bubbling Escape, including composing events that the input ignores. This path exists before TASK-62 and is separate from its Enter-confirmation fix.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.10-wipe-confirmation.md`
  summary: Add optional unit coverage for stale or foreign wipe outcomes and further outcome-identity polish.
  evidence: Review-1 finding 4 says the reducer's request-identity guard is correct and shows no regression occurrence; this test-only polish is deferred rather than expanded into the TASK-61.10 repair.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.10-wipe-confirmation.md`
  summary: Clear a catching-up refusal delivered after catch-up ends instead of leaving its loading message until the next action.
  evidence: Review-1 separate pre-existing finding (`adversarial-2`) records this late-refusal edge, notes that the same behavior exists in the base, and routes it outside the preservation repair for later decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.11-preset-upload-confirmation.md`
  summary: An older preset file read can replace a newer file selection.
  evidence: `choose(file)` resets to idle, awaits `readPreset(file)`, then unconditionally dispatches `file-error` or `diff-requested`; the current refactor preserves that ordering. No user incident was demonstrated. A future fix needs an attempt identity check and is outside this task.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.8-link-picker.md`
  summary: Verify the intermediate role-delivery race between selecting a label write and calling `setItemLabel`.
  evidence: This interval is unverified, and no reproduced defect is claimed. The exact control is to deliver the role update after the reducer selects the writing phase but before `setItemLabel`, then observe whether the write is called while the role is `PLAYER`; any fix requires a separate contract decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-61.12-snapshot-import-confirmation.md`
  summary: An older snapshot file read can replace a newer file selection.
  evidence: Focused review pre-existing finding `adversarial-1` points to `choose(file)` resetting to idle, awaiting `readSnapshotFile(file)`, then unconditionally dispatching `file-error` or requesting a check. The same ordering exists at preservation baseline `840ed10a0e799e800551a75916c481283ec2f9a8`. No user incident was reproduced; this race candidate remains outside the behavior-preserving reducer extraction.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-63.1-projection-delivery.md`
  summary: A fully synchronous replacement projection during old-buffer replay can return delivery to `live` and let old-stream deltas continue.
  evidence: This conditional scenario is unverified and is also possible in the base; no actual production regression or verified fix is claimed. The current OBR and queue path does not establish a producer that fully completes replacement inline inside `request()` during replay, and no existing production producer was demonstrated. Proof needed: identify that real producer, then show a remaining old-stream delta or answer applied after replacement. Do not change this behavior in TASK-63.1.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-63.2-room-copy-phases.md`
  summary: Verify whether a real engine producer can start an ordinary write between an idle import wait and acquisition of its write slot.
  evidence: Blind review constructed `writeImport()` followed synchronously by `pageHidden()`. The await/acquire shape also exists in the base. No current engine event trace producing this interleaving was demonstrated, so no runtime defect or fix is claimed. Establish that producer before changing serialization policy.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-63.3-catch-up-phases.md`
  summary: Reconsider timer-dispatch exhaustiveness when adding another CatchUpTimer variant.
  evidence: The current switch handles every timer variant and then returns an empty decision list. A future unhandled variant could take that fallback without a type error. No current timer or behavior gap was demonstrated; this is deferred maintenance polish, not a runtime defect.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.1-layer-dependency-rules.md`
  summary: Extend layer import restrictions to catch relative paths that bypass the alias-only dependency rules.
  evidence: Review 01, `bugs-2` / Blind Hunter 1: ACs name alias specifiers, the current cross-layer source has no relative-path violation, and broader resolved-import enforcement is outside TASK-64.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.1-layer-dependency-rules.md`
  summary: Add a builder UI-entrypoint allowlist to restrict which UI modules the builder may import.
  evidence: Review 01, Blind Hunter 3: AC4 names only replica and platform restrictions, and no changed runtime UI import establishes an occurrence. Parent accepted this polish as out of scope.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.1-layer-dependency-rules.md`
  summary: Forbid additional React wrappers in core beyond `react` and `react-dom`.
  evidence: Review 01, Blind Hunter 4: AC1 names `react` and `react-dom`, and no current core wrapper violation is reported. Parent accepted this polish as out of scope.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.3-port-contract.md`
  summary: Keep the live OBR harness as bounded manual observation instead of adding an automatic PASS/FAIL comparator or a serialized control protocol.
  evidence: Batch 2 decision A is `Ручной стенд (Recommended)`. The unchanged live runner returns observations; README and CLAUDE.md require manual comparison within a 2-second delivery wait and 100-ms quiet period. Relay/control failure and missing observation remain ambiguous, so neither alone is a host defect.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.3-port-contract.md`
  summary: Add lifecycle locking and broader control-session safeguards for early or repeated Run, concurrent cleanup, duplicate callers, and cleanup acknowledgement.
  evidence: Review 01 `adversarial-claude-1`, `adversarial-claude-2`, `B2`, `B3`, `E1`, `E2`, `E3`, `E4`, `E10`; the owner procedure is the accepted mitigation, with no reproduced live occurrence and no new protocol in this closeout.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.3-port-contract.md`
  summary: Verify the hidden local bridge lifetime after an Owlbear popover closes and reopens.
  evidence: Review 01 `adversarial-claude-4`: a closed bridge may remain cached as ready, but normal OBR click-away lifecycle was not verified. Recreate paired actions after lifecycle/control trouble; do not treat this procedure as a runtime guarantee.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.3-port-contract.md`
  summary: Improve remaining harness report, topology, accessibility, and development-server polish.
  evidence: Review 01 `B9`, `B11`, `B13`, `B14`, `adversarial-claude-5`, `GS1`, `GS2` and the corresponding edge findings were low-risk or unobserved. They remain deliberate review omissions, not changed adapter semantics.
- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.3-port-contract.md`
  summary: Keep the live harness's cross-client timing, host rate-limit or recovery, metadata capacity or silent-drop, global order, and injected-failure boundaries owner-verified.
  evidence: The original spec's local-versus-live proof boundary remains unchanged. The earlier note that no deferred adapter divergence was appended refers to D6 and D7, the only observed harness divergences, both fixed. These new entries are deliberate harness omissions from Batch 2, not newly discovered adapter divergences.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.8-shared-preview-helpers.md`
  summary: Extend the alias-only layer restrictions to reject relative-path imports that bypass the configured aliases.
  evidence: Review-01 Blind Hunter 1 identified a construction that predates TASK-64.8; no current offending relative import or runtime defect was demonstrated. The current task's contract names alias specifiers, so broader resolved-import enforcement remains deferred rather than treated as a bug.

- source_spec: `_bmad-output/implementation-artifacts/spec-task-64.8-shared-preview-helpers.md`
  summary: Add an independent assertion that the built-output dice smoke invokes the rolling callback.
  evidence: Review-01 Blind Hunter 4 noted that the smoke's visible settled result and absence of a message would also pass with a no-op callback. The helper move is verbatim, no callback regression was demonstrated, and the smoke therefore records visible behavior only; callback-invocation coverage remains deferred rather than treated as a runtime bug.
