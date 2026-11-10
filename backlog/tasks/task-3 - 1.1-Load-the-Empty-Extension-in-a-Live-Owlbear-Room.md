---
id: TASK-3
title: 1.1 Load the Empty Extension in a Live Owlbear Room
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T15:38:00Z'
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
- [ ] #1 **Given** a clean checkout **When** dependencies install and `vite build` runs **Then** the installed versions equal the Architecture Stack table **And** the build emits the `index.html` and `background.html` entry pages, with `src/core`, `src/replica`, `src/platform/obr`, `src/platform/mock` and `src/ui` in place
- [ ] #2 **Given** a file outside `src/platform/obr` **When** that file imports `@owlbear-rodeo/sdk` **Then** lint fails
- [ ] #3 **Given** the repository hooks **When** a developer commits or pushes **Then** lefthook runs lint and format on pre-commit and typecheck on pre-push **And** TypeScript runs strict with `skipLibCheck: true`
- [ ] #4 **Given** the ports for broadcast, metadata, party, player, storage, context menu, popover, action, notification and theme **When** `bun test` and Playwright run **Then** both run against the mock adapter of the same ports
- [ ] #5 **Given** a manual `wrangler deploy` by the owner (human gate) **When** `https://musterroll.2249364.xyz/manifest.json` and the HTML pages are fetched **Then** responses send `Access-Control-Allow-Origin` for `https://www.owlbear.rodeo` and no-cache for HTML and `manifest.json` **And** other assets have content-hashed names (AD-17, NFR1)
- [ ] #6 **Given** the owner adds the manifest URL to a live Owlbear room (human gate) **When** the GM opens the extension **Then** the action window and the background page both load with no console error
<!-- AC:END -->
