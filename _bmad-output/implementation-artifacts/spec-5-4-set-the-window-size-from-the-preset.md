---
title: '5.4 Set the Window Size From the Preset'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '39c1f0fc8a2cb5c6972f711dfe9d7b61265a828e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-change-the-preset-over-existing-sheets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The action window has one fixed size, 600 by 600 px, from the manifest, and Owlbear gives it no drag handle. A wide sheet format needs more room than a short one. Backlog task: TASK-33, whose three acceptance criteria apply in full.

**Approach:** A preset may carry an optional top-level `window: { width, height }` in px. The background page of every client owns the window size: whenever the preset it holds changes, including the first preset it learns at start, it calls `OBR.action.setWidth` and `setHeight` with the preset's size, or with 600 by 600 when the preset has no `window` or there is no preset. The size then applies before the GM or a player opens the window, and also while it is open.

## Boundaries & Constraints

**Always:**
- Key: `window`, a strict object with `width` and `height`, both integers. Allowed: width 360 to 1440, height 360 to 1080, inclusive. Anything else in `window` (a missing half, a float, a string, an extra key, a value out of range) refuses the file with a new failure code `bad-window`, and the upload changes nothing. The message under the upload button names the allowed range.
- `window` is optional, so `FORMAT_VERSION` stays as it is. A file without `window` parses exactly as today.
- Download (`formatPresetFile`) writes `window` back when the preset has it, after `v` and before `character`.
- A preset change that differs only in `window` is an ordinary upload with the short "format changed" notice; it erases nothing.
- The default size, 600 by 600, comes from one constant shared with the code; `public/manifest.json` keeps 600 by 600.
- The size is applied through a new `setSize(width, height)` on `ActionPort` (OBR adapter: `setWidth` then `setHeight`; mock: records the last size for tests). The background calls it only when the target size differs from the last size it applied in this page's life.
- `preset-format.md` documents the `window` key and its range.

**Never:**
- Resizing from the window page itself, or from the picker popover.
- A resize control or any UI beyond the upload error message.
- A per-client or per-player size.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preset with size | `window: { width: 900, height: 700 }` | Every client's background sets 900 by 700 | N/A |
| Preset without size | No `window` | 600 by 600 | N/A |
| No preset | Room has no preset | 600 by 600 | N/A |
| Size changed by upload | GM uploads a file with a new `window` | Every client applies the new size on the commit | N/A |
| Size removed by upload | New file has no `window` | Back to 600 by 600 | N/A |
| Edge values | 360 by 360, 1440 by 1080 | Accepted | N/A |
| Out of range | width 359, or height 1081, or 0, or negative | File refused, `bad-window`; nothing changes | Upload message |
| Malformed | `window: {}`, `{ width: 900 }`, `{ width: "900", height: 700 }`, `{ width: 900.5, height: 700 }`, extra key, `window: null` | File refused, `bad-window` | Upload message |
| Same size again | Preset commit with the same `window` | No second `setSize` call | N/A |
| Snapshot import | Imported preset with `window` | Size applied like any preset change | N/A |
| Download | Preset with `window` | File holds the same `window` | N/A |
| setSize fails | Port rejects | Error logged; retried on the next preset change | N/A |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- schema, `PresetFailure` (`bad-window`), `formatPresetFile`; the default size constant may live here or in a small core module.
- `src/core/preset-migrate.ts` -- check that a `window`-only change counts as a change with nothing removed.
- `src/ui/preset-errors.ts`, `src/ui/copy.ts` -- the upload message for `bad-window`.
- `src/platform/ports.ts`, `src/platform/obr/index.ts`, `src/platform/mock/index.ts` -- `ActionPort.setSize`.
- `src/replica/background-main.ts`, `src/replica/engine.ts` (or a small new `src/replica/window-size.ts`) -- follow the held preset and apply the size.
- `_bmad-output/specs/spec-muster-roll/preset-format.md` -- document the key.
- `tests/fixtures/presets/` -- keep the existing fixtures valid; add no `window` to `d6-pool.json`.

## Tasks & Acceptance

**Execution:**
- [x] Core: schema and range check, `bad-window`, download order; unit tests for every parse row of the matrix.
- [x] Port: `ActionPort.setSize` in the port, the OBR adapter and the mock.
- [x] Background: apply the size from the held preset on start (after the preset is known) and on every preset change; skip repeats; log failures.
- [x] UI: the `bad-window` upload message from the copy catalog.
- [x] Docs: `preset-format.md`.
- [x] Tests: engine or background tests for apply, default, change, removal, repeat and import rows; a preset-errors test for the message.

**Acceptance Criteria:** the three criteria of TASK-33.

## Implementation Notes

- Core (`src/core/preset.ts`): `window` is a strict zod object, both keys `int` with the inclusive bounds of `WINDOW_SIZE_LIMITS`. `parsePresetFile` checks a present `window` key after `v` and before the structure, so every wrong `window` is `bad-window`, never `invalid-structure`. `DEFAULT_WINDOW_SIZE` (600 by 600) and `windowSizeOf(preset | null)` live there too. A unit test reads `public/manifest.json` and compares its action size with the constant.
- `formatPresetFile` writes `window` between `v` and `character` only when the preset has it. `encodePreset`/`decodePreset` keep it, so the `preset` record carries it to every client.
- A `window`-only upload: `presetDiff` reads templates only, so it returns count 0 and no writes; the upload takes the removes-nothing path with "Формат листов изменён.".
- Copy: `badFileReason.badWindow(width, height)` takes the bounds from `WINDOW_SIZE_LIMITS`, so the text and the parser cannot drift. One text covers a wrong range, a missing half, an extra key and a non-object: "Файл не подошёл: в window нужны только width и height, целые числа: ширина от 360 до 1440 px, высота от 360 до 1080 px. Ничего не изменено." `docs/preset-format.md` lists `window` in the File table, the range in Limits and the reason in Refused files.
- Port: `ActionPort.setSize(width, height)`. OBR adapter: `setWidth` and `setHeight` together (`Promise.all`); a failure can leave one dimension applied, and the retry sets both. Mock: `actionSizes()` lists every call, failed ones too; `failNextActionSize()` rejects the next one.
- Background: a new `src/replica/window-size.ts` (`createWindowSizer`) skips a size equal to the last one asked for in the page's life. A rejected call is logged with `console.error`. When the same size was asked for while that call was in flight, it is sent again at once; otherwise the size is forgotten and the engine is told. The engine's `followWindowSize()` takes a size once per version `(c, a)` of the `preset` record. On a reported failure it clears that marker, so the next replica change asks again. A `preset` record this build cannot decode (from a newer build) keeps the current size. It runs right after the saved records load (a GM with a saved preset sizes at once) and on every replica change through a new `followReplica()`, which replaced `refreshTokenMenu()` at the five replica-change sites (`apply`, `replaceReplica`, `mergePersisted`, `leaveCatchUp`, `receiveRecords`). With no `preset` record it waits for the end of the first catch-up, so a player or a GM with no saved data never flashes 600 by 600 before the room's size.
- Snapshot import: the import keeps the current preset, so the importer and the adopters get the same size and no new call. An adopter that held another preset takes the imported preset's size when the new generation is complete (test: a live GM adopts a room copy of a higher generation).
- Tests: `src/core/preset.test.ts` (accepted sizes and edges, 14 refused `window` shapes, round trip, download order, defaults, manifest), `src/core/preset-migrate.test.ts` (window-only change), `src/ui/preset-errors.test.ts` (message), `src/replica/window-size.test.ts` (repeat skip, height-only and width-only change, failure report, resend after an in-flight repeat), `src/replica/engine-window-size.test.ts` (start with and without size, no preset, player and second GM with no early size, size during the first catch-up, a player with no preset gets one 600 by 600 only after its first catch-up, upload change, removal, same size, unreadable preset keeps the size, stopped engine, adoption, failure and retry on the next replica change). Each new engine and sizer guard was observed red under a mutation of the code it protects. No e2e test: every matrix row is reached in engine tests, and Chromium cannot launch on this host.
- Accepted: a GM whose saved preset is older than the room's sizes the window from the saved one at start and again when catch-up brings the newer one, so the window can resize twice at start.
- Accepted: an older build refuses a file with `window` as `invalid-structure`. All clients run one deployed build, so this matters only for a file opened in an old copy.
- The test that a stopped engine asks for no size stays green with the `stopped` guard removed, because `stop()` already unsubscribes every source of records; it pins the behaviour, not the guard.
- Not verified here: `bun run test:browser` (Chromium does not launch on this host) and the manual live-room check, which needs the owner.

## Spec Change Log

## Review Triage Log

Round 1 (Blind Hunter, Edge Case Hunter, Verification Gap):

| Finding | Source | Disposition |
| --- | --- | --- |
| User doc `docs/preset-format.md` does not list `window` | BH | patch |
| `parsePresetFile` check-order comment outdated | BH | patch |
| `bad-window` message names only the range and has no units | BH | patch: one wording for every bad `window`, with px |
| An undecodable `preset` record resizes to 600×600 | BH | patch: size kept; test |
| A failed `setSize` waits for the next preset change | EC | patch: per-version marker reset; retry on any replica change; test |
| A same-size request skipped while a failing one was in flight is lost | EC | patch: sizer retries; test |
| `setWidth` and `setHeight` run one after the other | BH, EC | patch: `Promise.all`; partial failure noted in the port comment |
| Width-only or height-only change untested | VG | patch: tests |
| Startup size before the first catch-up ends untested | VG | patch: test with a held catch-up |
| Player with no preset and post-`stop()` paths untested | BH | patch: tests (the `stop()` test pins behavior, not the guard) |
| Fragile microtask wait and spy restore in `window-size.test.ts` | BH | patch |
| Duplicated `WindowSizeCall` and `WindowRange` types | BH | patch: derived |
| A GM with a stale saved preset can resize twice at start | BH | defer: accepted, recorded in Implementation Notes |
| An older build refuses a file with `window`, since `v` stays | EC | reject: every client runs one deployed build; noted |
| Adoption resize before catch-up ends untested | VG | defer: size still arrives at catch-up exit |
| OBR adapter `setSize` has no test | VG | defer: no Owlbear SDK harness; owner live check |

## Design Notes

- The background, not the window, owns the size: the size is set before the window opens, so it does not jump after it opens.
- The range keeps the window usable on a laptop screen and above the narrowest layout the sheet grid supports. The owner can widen it later.
- An older build refuses a file with `window` as `invalid-structure`. All clients run the same deployed build, so this only matters for a file opened in an old copy.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: upload a preset with `window: { width: 900, height: 700 }`; the window opens at that size on the GM and on a player; upload one without `window`; it goes back to 600 by 600.
