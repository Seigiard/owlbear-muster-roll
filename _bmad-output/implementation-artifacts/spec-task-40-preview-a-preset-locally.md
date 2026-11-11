---
title: 'TASK-40 Preview a Preset Locally While Editing It'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '4ee7c68888bd468c2474c324b054e6857fef2973'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The owner can see how a preset looks only by uploading it in a live Owlbear room, or by uploading it again in the mock dev mode after each edit. Iterating on a sheet layout is slow. Backlog task: TASK-40, whose seven acceptance criteria apply in full.

**Approach:** A dev-only page, `preview.html`, served by the Vite dev server and never built. It draws the chosen preset with the extension's own sheet components on generated sample records, with no Owlbear, no background page and no replica engine. `bun run preview [path]` starts the dev server and opens the page. The page lists the repository presets, plus the launch path when one is given, and redraws when the chosen file is saved.

## Boundaries & Constraints

**Always:**
- Owner's decision on file selection: the list holds `docs/example-preset.json`, `tests/fixtures/presets/*.json` and `presets/*.json` (a new folder with a short README). A launch path anywhere on disk joins the list, is marked as the launch file, and opens first. The chosen file is kept in the page address (`?preset=<list key>`). An unknown key falls back to the first entry.
- The page parses the file text with `parsePresetFile` and draws the result with `SheetBody` and `ReadOnlySheetHeader`, the same components the window uses. On failure it shows `presetFailureMessage(failure)` in place of the sheets. On the next good save it draws again.
- Two frames, one character sheet (`preset.character`) and one NPC sheet (`preset.npc`). Each frame has the size from `windowSizeOf(preset)`, 600 by 600 without `window`, scrolls inside, and has its size written above it. Frames wrap when the screen is narrow.
- Sample records are built by a pure function from the preset: every field row gets a value by field type (text, number, check), every repeat section gets two instances, and each sheet gets a name. A switch shows the same sheets empty instead.
- A switch picks the light or the dark theme, applied with `applyTheme`. The switches stay in the page address too.
- Owner's decision on the view: read-only only, as a player sees the sheet (`editing=null`, `pending=null`). No GM edit inputs or row controls.
- Owner's decision after review: each frame shows the window's tab bar (`TabBar` from `src/ui/shell/tab-bar.tsx`) with one tab, the sheet's name or the NPC tab's name, above the content area, laid out as `WindowShell` lays it out (`p-3` content, scrolls inside). The sheet gets the same room as in the window.
- Owner's decision after review: the NPC frame draws the NPC header as the GM's NPC tab does (`npc` look: left bar, smaller name), with no read-only status. `ReadOnlySheetHeader` may take an optional `variant`, default `character`; the window's own use does not change.
- A dice press does not fail or hang: the stub `requestRoll` settles at once and the button returns to rest.
- The build stays as it is: three inputs (`index.html`, `background.html`, `picker.html`). Any Vite plugin for the preview runs only on the dev server.

**Never:**
- Importing `@/platform/current`, the mock platform, the OBR SDK, the engine, or `main.tsx` code paths that need them.
- Writing to any preset file, or to `localStorage` keys the mock room uses.
- Editing a preset from the page. That is TASK-38.
- Changes to the window, the engine or the preset parser.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No launch path | `bun run preview` | Page opens on the first repository preset | N/A |
| Launch path | `bun run preview ~/x.json` | `x.json` is in the list, marked, and shown | N/A |
| Missing launch file | Path does not exist | Command exits non-zero with a message naming the path; no server | stderr |
| Save a good edit | Chosen file changes | Sheets redraw within about 1 s; choice and switches kept | N/A |
| Save a bad edit | Not JSON, or fails checks | The upload message for that failure; no sheets | Message on page |
| Fix the file | Next good save | Sheets again | N/A |
| Unknown key | `?preset=nope` | First entry shown | N/A |
| Preset with window | `window: { width: 900, height: 700 }` | Both frames 900 by 700 | N/A |
| Repeat section, empty switch | Sample off | Repeat sections show no rows, as in a new sheet | N/A |

</frozen-after-approval>

## Code Map

- `vite.config.ts:8-29` -- adapter by mode, aliases, three build inputs. Add a dev-server-only plugin here (`apply: 'serve'`) or pass it from the launch script; do not add an input.
- `tests/build.test.ts:115` -- asserts the three build inputs; must stay green.
- `tests/fixtures/primitives.html` + `primitives.tsx` -- existing dev-only page; template for `preview.html`.
- `src/ui/main.css` -- `@import 'tailwindcss' source('..')` scans `src/` only: put preview TSX under `src/preview/`.
- `src/ui/sheet/sheet-body.tsx:13-27` -- `SheetBody` props: `template`, `sheetId`, `records: ReadonlyMap<string, VersionedRecord>`, `editing: FieldEditing | null`, `rolling: DiceRolling`, `pending: SheetPending | null`. With `editing=null` and `pending=null` it is read-only and provides `DiceSheetContext` itself.
- `src/ui/sheet/dice-button.tsx:19` -- `DiceRolling` = `requestRoll` (`ReplicaClient['requestRoll']`, returns `Result<string, CommandFailure>`), `$rollOutcomes` (`ProjectionStore['$rollOutcomes']`; outcome type `RollOutcome`, `src/core/ui-messages.ts:467`), `localValues` (`createLocalFieldValues()`, `local-field-values.ts:24`).
- `src/ui/sheet/sheet-header.tsx:283` -- `ReadOnlySheetHeader({ name, canEdit })`. Do not use `SheetHeader` or `NpcTab` (they need a `ProjectionStore` and `sendCommand`).
- `src/core/preset.ts` -- `parsePresetFile` (`:101`), `PresetFailure` (`:85`), `DEFAULT_WINDOW_SIZE` (`:76`), `windowSizeOf` (`:174`), `firstFieldId` (`:180`); types `Preset`, `PresetTemplate`, `PresetSection`, `PresetCell`, `PresetFieldCell`.
- `src/ui/preset-errors.ts:5` -- `presetFailureMessage(failure)`.
- `src/core/records.ts` -- `VersionedRecord {k,d,c,a}`; `sheet:{id}` `SheetData {kind,name,order}`; `rowKey` (`:104`) for `row:{sheetId}:{firstFieldId}` `FieldValues` (no empty strings); `repKeyPrefix` (`:110`) for `rep:{sheetId}:{sectionId}:{instanceId}` `RepData {order,cells}`. Readers: `src/core/sheet-values.ts`.
- `src/ui/theme.ts:37` -- `applyTheme(theme, root)`; `tests/support/colors.ts:7` has `LIGHT_THEME`; the mock's theme is private (`mock/index.ts:78`).
- `playwright.config.ts:20` -- e2e web server is `vite --mode mock`; a preview e2e test needs the dev-only plugin active there, with the launch path from an environment variable.
- `.oxlintrc.json:92+` -- blocks imports of `platform/mock` and `platform/obr`.

## Tasks & Acceptance

**Execution:**
- [x] `src/preview/sample-records.ts` -- pure builder of sample and empty records for one character and one NPC sheet -- testable without a browser.
- [x] `src/preview/` page modules + `preview.html` -- list, switches, frames, failure message, stub `DiceRolling`, theme -- the page itself.
- [x] Dev-server plugin module -- serves the preset list with texts (repository globs plus the launch file from an environment variable) and pushes a redraw when any listed file changes -- live redraw for files outside `src`.
- [x] `scripts/preview.ts` + `package.json` `preview` script -- checks the path, sets the environment variable, starts the mock dev server, opens `/preview.html` -- `bun run preview [path]`.
- [x] `presets/README.md` -- one paragraph: presets here show up in the preview.
- [x] Tests -- unit tests for the sample builder (every field type, repeat sections, empty mode, no empty strings) and the plugin's list building; an e2e test for list, address, launch file, redraw on save, failure and recovery, window size.
- [x] `docs/preset-format.md` -- a short "Preview a preset" note with the command.

**Acceptance Criteria:**
- Given the repository with no launch path, when `bun run preview` runs, then the browser opens the preview page with the first repository preset drawn in two frames.
- Given the preview open, when the owner edits and saves the chosen file, then the page redraws without a manual reload and keeps the chosen file and switches.
- Given `bunx vite build`, when it finishes, then `dist/` holds no preview page and `tests/build.test.ts` passes.

## Implementation Notes

- Plugin lives in `scripts/preview-plugin.ts`; the page and the plugin share `src/preview/protocol.ts` (endpoint `/__muster-roll-preview/presets`, HMR event, env variable `MUSTER_ROLL_PREVIEW_PRESET`). The page reloads the whole list with texts on each event.
- `vite.config.ts` imports the plugin chain with `.ts` extensions, so Vite prints no `configLoader: 'native'` warning; `tsconfig.json` gained `allowImportingTsExtensions` and the `scripts` folder.
- List key: path from the repository root with "/", or the absolute path for a file outside it. A launch path that is a repository preset moves that entry first instead of adding a second one.
- Address: `?preset=<key>&content=empty&theme=light`; defaults (sample, dark) stay out of it.
- `bun run` starts in the repository root and rewrites `PWD`, so a relative launch path is read from the root. The script forwards SIGINT/SIGTERM/SIGHUP to Vite.
- e2e: `playwright.config.ts` passes a launch file in the OS temp folder (`tests/support/preview.ts`), created if absent; `tests/preview.e2e.ts` rewrites it, so its tests run in order in one worker.
- Page chrome is in English; the sheets and the failure message keep the extension's Russian copy.

## Spec Change Log

- Review round 1, intent gaps (frame without the tab bar; NPC drawn with the character header). Amended the frozen block with the owner's two decisions above. The code was kept, not reverted: both decisions add to the page and change nothing already built. KEEP: the plugin and list protocol, the sample builder, the address handling, the stub rolling, the e2e structure.

## Review Triage Log

Round 1 (Blind Hunter, Edge Case Hunter, Verification Gap):

| Finding | Source | Verdict | Evidence | Route |
| --- | --- | --- | --- | --- |
| No check that `dist/` holds no preview page | VG | medium | `tests/build.test.ts` checks present files and `mock-room` only; adding a preview input keeps it green | patch |
| Success path of `bun run preview` (variable, page) untested; relative path and stale inherited variable untested | VG, BH | medium | `scripts/preview.test.ts` covers only early exits; e2e sets the variable in `playwright.config.ts` | patch: pure launch function + tests |
| e2e asserts the exact option list, so any `presets/*.json` breaks it | VG, BH, EC | medium | `tests/preview.e2e.ts` first test; `presets/` is the documented place for owner files | patch |
| Script name `preview` hides `vite preview` | BH | false | the owner fixed `bun run preview [path]` in the frozen intent | reject |
| Plugin runs on every dev server, also OBR mode behind the tunnel | BH | medium | `vite.config.ts` adds `presetPreview` unconditionally; `bun run dev` serves `/preview.html` and the list endpoint | patch: mock mode only |
| Preview themes copy the mock and test colours | BH | low | drift changes only the preview's stand-in colours; Owlbear gives the real ones; fix needs a shared module across mock and tests | reject |
| No unit tests for `address.ts`, `stub-rolling.ts`, the plugin handler | BH | low | e2e covers address round trip after reload, dice settle, list endpoint | reject |
| `PreviewContent` names a component and a type | BH | low | `preview-page.tsx` component vs `sample-records.ts` type | patch: rename the component |
| Docs omit mock mode, top-level-only listing, machine-specific launch key | BH | low | `docs/preset-format.md` "Preview a preset" | patch |
| `.ts` import in config files has no stated reason | BH | low | `vite.config.ts` imports with `.ts`, other files without | patch: one comment |
| One failed list fetch hides the sheets until the next save | BH, EC | low | Vite reloads the page when it reconnects; a failed fetch with a live server is not met in normal use | reject |
| Symlinked launch path or root lists a file twice | BH, EC | low | needs a symlink to a repository preset; fix adds realpath guards | reject |
| e2e launch file stays in the temp folder | BH | low | one small file per checkout, rewritten each run | reject |
| `readdirSync` can throw when a folder vanishes after `existsSync` | EC | low | race only; adds a guard | reject |
| A symlink in `presets/` is not listed | EC | low | `entry.isFile()` is false for a symlink; uncommon; adds a branch | reject |
| A huge launch file is read on every list request | EC | low | the owner's own file on a dev server | reject |
| Sample test would throw on a non-JSON fixture; `presets/` not covered | EC | low | fixtures folder holds presets only; owner work-in-progress files must not break tests | reject |
| A UTF-8 BOM file uploads fine but shows "not JSON" in the preview | EC | low | upload reads with `File.text()`, which drops the BOM; `readFileSync` keeps it | patch: drop a leading U+FEFF |
| Frame gives the full window height to the sheet; the real window takes the tab bar out of it | EC | medium | `window-shell.tsx`: `TabBar` then `p-3` content in `h-dvh`; preview frame has no bar | intent_gap |
| NPC sheet uses the character header; the extension draws NPCs only in the GM's NPC tab with the `npc` header | EC | medium | `ReadOnlySheetHeader` hardcodes `VARIANT.character`; `npc-tab.tsx:116` uses `variant="npc"` | intent_gap |

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner: `bun run preview ~/some-preset.json`, edit the file, save, and see the frames redraw.
