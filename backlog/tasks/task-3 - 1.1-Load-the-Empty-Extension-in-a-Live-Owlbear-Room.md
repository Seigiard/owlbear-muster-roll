---
id: TASK-3
title: 1.1 Load the Empty Extension in a Live Owlbear Room
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T16:21:00Z'
labels:
  - epic-1
milestone: m-0
dependencies: []
references:
  - _bmad-output/planning-artifacts/epics.md
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want Muster Roll to install in Owlbear from its permanent URL, So that every later feature reaches a real room.

Story 1.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a clean checkout **When** dependencies install and `vite build` runs **Then** the installed versions equal the Architecture Stack table **And** the build emits the `index.html` and `background.html` entry pages, with `src/core`, `src/replica`, `src/platform/obr`, `src/platform/mock` and `src/ui` in place
- [x] #2 **Given** a file outside `src/platform/obr` **When** that file imports `@owlbear-rodeo/sdk` **Then** lint fails
- [x] #3 **Given** the repository hooks **When** a developer commits or pushes **Then** lefthook runs lint and format on pre-commit and typecheck on pre-push **And** TypeScript runs strict with `skipLibCheck: true`
- [x] #4 **Given** the ports for broadcast, metadata, party, player, storage, context menu, popover, action, notification and theme **When** `bun test` and Playwright run **Then** both run against the mock adapter of the same ports
- [x] #5 **Given** a manual `wrangler deploy` by the owner (human gate) **When** `https://musterroll.2249364.xyz/manifest.json` and the HTML pages are fetched **Then** responses send `Access-Control-Allow-Origin` for `https://www.owlbear.rodeo` and no-cache for HTML and `manifest.json` **And** other assets have content-hashed names (AD-17, NFR1)
- [x] #6 **Given** the owner adds the manifest URL to a live Owlbear room (human gate) **When** the GM opens the extension **Then** the action window and the background page both load with no console error
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold the exact Stack versions, tooling and Structural Seed at the repository root.
2. Define ten ports with one Platform type, an Owlbear adapter and a mock adapter.
3. Add manifest, _headers and wrangler.toml; do not deploy.
4. Verify build, lint boundary, typecheck, bun test, Playwright and headers on local wrangler dev.
5. Hand the owner the checklist for AC 5 and AC 6.
Spec: _bmad-output/implementation-artifacts/spec-1-1-load-the-empty-extension.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scaffold, ports, Owlbear and mock adapters, tests and deploy config are in the working tree (uncommitted). Verified: clean install and build in a fresh copy, format, lint boundary red/green, typecheck, bun test (9 pass, unsubscribe mutation goes red), Playwright smoke (3 pass on installed Chromium 1248, since the download of build 1254 was refused), headers on local wrangler dev, lefthook pre-commit and pre-push in a scratch repo. AC 5 and AC 6 are human gates; the owner checklist is in the spec under Implementation Notes.

Review: 29 findings triaged in the spec. Confirmed defects patched; 5 items deferred to deferred-work.md. Verified: frozen install, build, lint, typecheck, bun test 17 pass, Playwright 4 pass, headers on local wrangler dev. AC 5 and AC 6 wait for the owner's deploy and live-room check.

AC 5 verified on production: the owner's curl shows HTTP 200, Access-Control-Allow-Origin https://www.owlbear.rodeo and Cache-Control no-cache for manifest.json, index.html and background.html.

AC 6 verified by the owner in a live Owlbear room in Firefox: the action window opened at the expected size, the console shows index.html and background.html loading, and no error comes from Muster Roll code. The CSP, WebGL and blob messages in that console come from Owlbear and Cloudflare scripts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scaffolded the Muster Roll extension: exact Stack versions, lint, format and hooks, ten ports with Owlbear and mock adapters, manifest, _headers and wrangler config. Deployed by the owner to https://musterroll.2249364.xyz/. Verified: clean-clone install, build, lint and typecheck; bun test 17 pass; Playwright 4 pass; production headers and hashed assets; live-room load with no Muster Roll console error. Five follow-ups are recorded in _bmad-output/implementation-artifacts/deferred-work.md.
<!-- SECTION:FINAL_SUMMARY:END -->
