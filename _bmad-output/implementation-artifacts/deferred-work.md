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
