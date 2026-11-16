---
id: TASK-74
title: Remove the old dev pages and scripts
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-16T09:16:00Z'
labels:
  - one-editor
dependencies:
  - TASK-68
  - TASK-73
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: chore
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the builder shows both views and follows files, room.html and preview.html are three previews of one preset. Story 7 of _bmad-output/specs/spec-muster-roll/stories.yaml (done checkpoint); CAP-40.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 room.html, preview.html, the Vite preview plugin and their e2e tests are gone; the mock index.html stays for e2e tests only
- [x] #2 package.json has no dev:mock, room or preview script
- [x] #3 CLAUDE.md, presets/README.md, docs/preset-format.md and GLOSSARY.md (Local room) no longer name them
- [x] #4 The full local check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace consumers of obsolete room/preview pages, launchers and preview plugin; retain shared app/test support and mock index.html for e2e.
2. Remove the obsolete entrypoints, scripts and their retired test owners; update Vite/Playwright wiring and active documentation.
3. Keep native file synchronization, builder editing and dev:owlbear intact; name replacement behavioral coverage instead of adding source-absence tests.
4. Follow the TDD oracle gate/checks-only route where appropriate and run the full changed-path checks before integration.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed obsolete room/preview pages, their exclusive modules, launchers, plugin and test owners. Mock index.html remains for e2e; builder and dev:owlbear remain. Retired rendering/GM-player/file-follow behaviors are owned by builder.e2e.ts, builder-snapshot.e2e.ts, attached-files.test.ts and the native OPFS control; obsolete launch/list/address/seeding contracts are removed with their entrypoints. Final full checks passed: 3182 unit tests (one existing environment skip), 531 Chromium tests, format, lint, typecheck and build. Original completed shell records and logs were recovered without rerunning checks.

Final integration closeout: 3205 Bun tests pass with one existing environment skip, 541 Chromium tests pass, and format/lint/typecheck/build/diff checks pass. Two repair rounds and a final healthy two-source review leave no critical or major findings. Minor omissions are recorded in deferred-work.md. TASK-68 remains Done on the owner-confirmed live check. Five merged ticket worktrees were removed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The builder is the only standalone dev page. Old room/preview pages, scripts, plugin and exclusive tests are removed. Active launch instructions are updated; dev:owlbear and the e2e mock index remain. All required local checks passed.
<!-- SECTION:FINAL_SUMMARY:END -->
