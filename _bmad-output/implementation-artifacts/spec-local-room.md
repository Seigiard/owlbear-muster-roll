---
title: 'Local Room: Look at the Whole Extension Without Owlbear'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '566221b19c04b06630cddcb276b8a1c98a32b3bb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-40-preview-a-preset-locally.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The owner cannot look at the whole extension locally. `bun run dev:mock` needs `index.html` and `background.html` opened by hand in two tabs and starts with an empty room, so the owner must upload a preset and add sheets first. Seeded rooms exist only in the e2e helpers. `bun run preview` draws read-only sheets, not the window with its sidebar, settings and GM controls.

**Approach:** A dev-only page, `room.html`, opened by `bun run room`. It seeds the mock room with a preset and sample sheets, then runs a GM client and a player client in iframes on one page: each client is a hidden background iframe plus a visible 600 by 600 window iframe, as the real popover. A toolbar switches the theme, picks the preset and resets the room.

## Boundaries & Constraints

**Always:**
- Two clients side by side, frames wrap on a narrow screen: GM (default mock client) and player (`mock-client=p`, `mock-role=PLAYER`, `mock-player=lisa`, `mock-device=p`, as `tests/player.e2e.ts`). Each window frame has its label and size written above it.
- Seed on page load only when the mock room's storage has no `preset` record, so edits survive a page reload. Seed = the chosen preset's `preset` record plus `previewSheets(preset, 'sample')` records, written as `seedStorage` in `tests/support/room.ts` writes them, before any background iframe starts.
- Reset button: removes every `localStorage` key of this origin, seeds again, recreates all iframes.
- Preset choice: the preview's list (`PRESET_LIST_PATH`), default `docs/example-preset.json`, kept in the address as `?preset=<key>`. A new choice resets the room with that preset.
- Theme switch (dark, light), kept in the address as `?theme=light`. Applied to every window iframe through its `setMockTheme`, and again after each iframe load. The page's own chrome follows it.
- Page chrome in English, as the preview's. The page lives under `src/preview/`, shares the preview's dev-server plugin, and runs only in the mock mode.
- The build keeps its inputs; `dist/` holds no room page.

**Never:**
- Changes to the window, the engine, the mock adapter's behaviour or the preset parser. A small export from the mock's side-effect-free `client-params.ts` is allowed.
- Importing `@/platform/current`, the OBR SDK or the mock platform into the host page.
- Editing preset files, or a picker or builder frame.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First open | Empty storage | GM window shows the sheets and its "+"; player window shows its view | N/A |
| Reload after an edit | GM changed a value | Value still there | N/A |
| Reset | Any state | Fresh seed, both windows reload | N/A |
| Light theme | `?theme=light` | Both windows and chrome light, also after reset | N/A |
| Unknown preset key | `?preset=nope` | First list entry | N/A |
| Chosen preset fails to parse | Bad JSON on disk | `presetFailureMessage` shown in place of frames; no seed | Message on page |

</frozen-after-approval>

## Code Map

- `src/preview/main.tsx`, `preview-page.tsx:349` (`fetchPresetList`), `address.ts`, `themes.ts` (`PREVIEW_THEMES`) -- reuse list fetch, address parsing pattern and themes; do not change the preview page's behaviour.
- `src/preview/sample-records.ts:57` -- `previewSheets(preset, 'sample')` gives the sheet records to seed.
- `src/core/preset.ts:101` -- `parsePresetFile`; `src/ui/preset-errors.ts:5` -- `presetFailureMessage`.
- `src/core/deflate.ts` -- `deflateToBase64` for the `preset` record `d` (`JSON.stringify(JSON.parse(text))`), stored as `{k:'preset',d,c:1,a:'mock-connection'}`.
- `src/core/storage-key.ts:32` -- `buildStorageKey(MOCK_ROOM_ID, INITIAL_GENERATION, key)`; each record stored as `JSON.stringify(record)` (mirror `tests/support/room.ts:186` `seedStorage`).
- `src/platform/mock/client-params.ts` -- `MOCK_ROOM_ID` and the URL param names; import with the same `oxlint-disable-next-line no-restricted-imports` comment `tests/support/room.ts:10` uses.
- `src/platform/mock/index.ts:176,216` -- `window.setMockTheme` global on each mock page; call it on `iframe.contentWindow`.
- `src/ui/theme.ts` -- `applyTheme` for the host chrome.
- `scripts/preview.ts` -- launch pattern (spawn `bunx vite --mode mock --open <page>`, forward signals); `package.json` scripts.
- `preview.html` -- template for `room.html`.
- `tests/build.test.ts:168` -- add the room page to the dev-only check.
- `tests/support/room.ts` (`ADD`, `clientQuery`) and `tests/preview.e2e.ts` -- e2e patterns; use `page.frameLocator`.
- `CLAUDE.md` build-commands block, `GLOSSARY.md` near **Preview** -- docs.

## Tasks & Acceptance

**Execution:**
- [x] `src/preview/room-seed.ts` -- pure function: preset text → storage entries (key, value) -- testable without a browser.
- [x] `src/preview/room-seed.test.ts` -- keys parse with `parseStorageKey`, the `preset` value inflates back to the preset, every `previewSheets` record present.
- [x] `room.html`, `src/preview/room-main.tsx`, `src/preview/room-page.tsx` -- host page per Boundaries.
- [x] `scripts/room.ts` + `package.json` `room` script -- `bun run room` opens `/room.html`; share the launch code with `scripts/preview.ts` where it fits.
- [x] `tests/room.e2e.ts` -- first open, reload keeps an edit, reset, light theme, player window loads.
- [x] `tests/build.test.ts` -- `dist/` holds no room page.
- [x] `CLAUDE.md`, `GLOSSARY.md` (term **Local room**), `docs/preset-format.md` preview note -- one line each on `bun run room`.

**Acceptance Criteria:**
- Given a fresh checkout, when the owner runs `bun run room`, then the browser opens one page with a working GM window and player window, no manual upload or extra tab.
- Given the GM window, when the owner adds a sheet or edits a value, then the player window shows the change, as in a live room.
- Given `bun run build`, then `dist/` has no room page and the build test passes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` (outside the sandbox), `bun run build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner: `bun run room`, switch theme, edit as GM, see the player window follow.
