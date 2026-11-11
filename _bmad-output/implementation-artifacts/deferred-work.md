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
