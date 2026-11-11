---
id: TASK-33
title: Set the window size from the preset
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T16:53:00Z'
updated_date: '2026-11-11T14:23:00Z'
labels:
  - v2
milestone: m-5
dependencies: []
documentation:
  - _bmad-output/specs/spec-muster-roll/preset-format.md
type: feature
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The action window has one fixed size, 600 by 600 px, set in the manifest. Sheet formats differ: a wide format needs more room than a short one. Owlbear gives the window no drag handle, so a GM cannot resize it. The owner prefers to set the size in the preset over building a resize handle, because the format already decides the layout and this adds no new control. The Owlbear SDK can change the size at runtime with OBR.action.setWidth and setHeight. A preset key needs an entry in preset-format.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a preset that sets a window width and height **When** any client opens the window **Then** the window opens at that size
- [x] #2 **Given** a preset with no window size **When** any client opens the window **Then** the window opens at 600 by 600 px
- [x] #3 **Given** a preset file with a window size outside the allowed range **When** the GM uploads it **Then** the file is refused and nothing changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build spec: _bmad-output/implementation-artifacts/spec-5-4-set-the-window-size-from-the-preset.md
1. Optional preset key window {width 360-1440, height 360-1080}; bad-window refusal; download keeps it.
2. ActionPort.setSize; the background of every client applies the size of the held preset (600x600 default), skipping repeats.
3. preset-format.md entry; tests for every matrix row.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-5-4. Review round 1 patched (triage log in the spec). Checks 2026-11-11: oxfmt, lint, typecheck, bun test 1958 pass, vite build — exit 0. AC 1-2 proven by src/replica/engine-window-size.test.ts (GM and player, with and without window, before and after catch-up) against the mock ActionPort; AC 3 by src/core/preset.test.ts (14 malformed window forms, edges) and preset-errors.test.ts. Open: owner check that Owlbear resizes the action window in a live room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A preset may now set the action window size with an optional `window: { width, height }` (width 360-1440, height 360-1080 px). The background of every client applies it through OBR.action.setWidth/setHeight whenever the held preset changes, and falls back to 600x600 when the preset has none. A bad `window` refuses the upload with a message naming the rule. Docs: docs/preset-format.md and the spec preset-format.md. Verified by unit and engine tests; the live-room resize is still an owner check.
<!-- SECTION:FINAL_SUMMARY:END -->
