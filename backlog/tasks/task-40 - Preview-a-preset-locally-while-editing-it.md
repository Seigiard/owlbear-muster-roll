---
id: TASK-40
title: Preview a preset locally while editing it
status: Done
assignee:
  - '@claude'
created_date: '2026-11-11T17:27:00Z'
updated_date: '2026-11-11T18:26:00Z'
labels:
  - v2
dependencies: []
type: feature
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A preset's look can be checked today only by uploading it in a live Owlbear room or by loading it by hand in the mock dev mode. Each change to the JSON needs a new upload, so iterating on a sheet layout is slow. The owner wants a local page that shows a preset as the extension draws it and redraws on each save. It also becomes the preview part of the preset builder (TASK-38). Owner's choice of file selection: the page lists the presets kept in the repository, and a path given at launch (for example `bun run preview ~/presets/my-sheet.json`) joins that list and opens first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One command starts the preview page with no Owlbear room
- [x] #2 The page lists the preset files kept in the repository (docs/example-preset.json, tests/fixtures/presets/ and a presets folder) and shows the one chosen; the choice is kept in the page address
- [x] #3 A preset path given to the launch command, anywhere on disk, is added to the list and opens first
- [x] #4 The chosen preset shows as the extension draws it: a character sheet and an NPC sheet with sample content, including repeated rows and dice cells
- [x] #5 Saving the chosen file redraws the page without a manual reload
- [x] #6 A file that fails the preset checks shows the same failure message as an upload, and the page recovers when the file is fixed
- [x] #7 The window size from the preset's window key, or 600 by 600 without it, frames the sheet
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure sample-record builder (src/preview/sample-records.ts) with unit tests.
2. Dev-server-only Vite plugin: preset list (repo globs + launch file from env) and redraw on change.
3. preview.html + src/preview page: list, address state, sample/empty and theme switches, two frames sized by windowSizeOf, failure message, stub DiceRolling.
4. scripts/preview.ts + package.json preview script; presets/README.md; docs note.
5. e2e test; full checks; three reviews.
Spec: _bmad-output/implementation-artifacts/spec-task-40-preview-a-preset-locally.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec: src/preview/ (page, sample builder, stub rolling, themes, address, protocol), preview.html, scripts/preview-plugin.ts (serve-only), scripts/preview.ts + 'preview' script, presets/README.md, docs note, unit tests and tests/preview.e2e.ts. All checks green: oxfmt, lint, typecheck, bun test (2086), playwright (406), vite build (dist has no preview).

Verification: bun test 2096 pass; bun run test:browser 406 passed twice (tests/preview.e2e.ts: list and launch mark, address after reload, unknown key, redraw on save keeping state, failure message and recovery, 900x700 and 600x600 frames, repeat rows, dice); lint, typecheck, oxfmt, vite build exit 0; build test asserts no preview in dist. Manual: `bun run preview <tmp file>` served /preview.html (200) with the launch file first and marked.
Review round 1: 7 patches applied (plugin only in mock mode, build test, launch function tests, e2e list robust to presets/*.json, BOM, rename, docs); 2 owner decisions added (tab bar in each frame, NPC header look via optional ReadOnlySheetHeader variant); 11 findings rejected with evidence in the spec triage log. Nothing deferred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`bun run preview [path]` starts the mock dev server and opens /preview.html, a dev-only page that draws a preset as the extension does, with no Owlbear room. It lists docs/example-preset.json, tests/fixtures/presets/*.json and presets/*.json; a launch path from anywhere on disk joins the list, marked, and opens first. The chosen file and the sample/empty and light/dark switches stay in the page address. Two frames at the preset's window size (600x600 without `window`) show the window's tab bar and a read-only character sheet and an NPC sheet with sample values (two rows per repeat section). Each save redraws the page; a file that fails the checks shows the upload's message and recovers on the next good save. The build is unchanged (asserted by tests/build.test.ts). Shared code change: ReadOnlySheetHeader takes an optional variant; WindowShell exports CONTENT_CLASS. Spec: _bmad-output/implementation-artifacts/spec-task-40-preview-a-preset-locally.md.
<!-- SECTION:FINAL_SUMMARY:END -->
