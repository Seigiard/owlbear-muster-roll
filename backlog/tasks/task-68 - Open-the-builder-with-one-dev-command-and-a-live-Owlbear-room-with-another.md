---
id: TASK-68
title: Open the builder with one dev command, and a live Owlbear room with another
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-15T21:42:00Z'
labels:
  - one-editor
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plain `bun run dev` serves the Owlbear adapter, so outside Owlbear the window hangs on «Загрузка…», and five dev entries (dev, dev:mock, room, preview, the builder) leave the owner unsure what to open. The decision is one page for everything, the builder. Story 1 of _bmad-output/specs/spec-muster-roll/stories.yaml; CAP-40; _bmad-output/specs/spec-muster-roll/builder-and-dev.md "Dev commands".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bun run dev` serves the builder and opens it in the browser, with no Owlbear and no tunnel
- [x] #2 `bun run dev:owlbear` serves the Owlbear adapter through cloudflared and prints the `<tunnel>/manifest.json` URL for Add Extension
- [x] #3 The old dev:mock, room and preview scripts still work until the removal task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Point the default dev command at the existing builder and keep the old commands unchanged.
2. Add an Owlbear dev launcher that starts Vite and cloudflared, prints the public manifest URL, and closes its child processes.
3. Validate the CLI boundary, run the required local checks, and review the change through the implement/TDD chain.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and independently reviewed the builder and Owlbear dev commands. All local checks pass: format, lint, typecheck, 3165 Bun tests (one documented environment skip), 521 Chromium tests, and build. The controlled real browser opener targets /builder.html; the old dev:mock, room and preview commands still serve their pages. Real cloudflared registered a quick tunnel and printed its manifest URL, but 15 public fetch attempts failed with curl exit 6 (hostname resolution). AC2 remains unchecked until public manifest reachability and Add Extension can be verified. Review deferred the old dev instruction cleanup to TASK-74, and recorded optional shutdown escalation, pre-URL buffer bounding, and a permanent missing-cloudflared regression in deferred-work.md. No package-script inventory test was added.

The owner confirmed the pending live Owlbear verification on 2026-11-15: "68 проверено, закройте в этом ПРе". AC2 is accepted on that manual confirmation, not on mock or local test results.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Default dev opens the standalone builder. dev:owlbear starts Vite with cloudflared and prints the manifest URL. Existing dev commands remain until TASK-74. The prior local validation passed; the owner confirmed the remaining live Owlbear check on 2026-11-15. All acceptance criteria are complete.
<!-- SECTION:FINAL_SUMMARY:END -->
