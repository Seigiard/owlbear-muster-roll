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
