---
id: TASK-68
title: Open the builder with one dev command, and a live Owlbear room with another
status: To Do
assignee: []
created_date: '2026-11-15T17:45:00Z'
labels:
  - one-editor
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plain `bun run dev` serves the Owlbear adapter, so outside Owlbear the window hangs on «Загрузка…», and five dev entries (dev, dev:mock, room, preview, the builder) leave the owner unsure what to open. The decision is one page for everything, the builder. Story 1 of _bmad-output/specs/spec-muster-roll/stories.yaml; CAP-40; _bmad-output/specs/spec-muster-roll/builder-and-dev.md "Dev commands".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `bun run dev` serves the builder and opens it in the browser, with no Owlbear and no tunnel
- [ ] #2 `bun run dev:owlbear` serves the Owlbear adapter through cloudflared and prints the `<tunnel>/manifest.json` URL for Add Extension
- [ ] #3 The old dev:mock, room and preview scripts still work until the removal task
<!-- AC:END -->
