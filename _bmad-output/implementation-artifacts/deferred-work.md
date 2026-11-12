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
