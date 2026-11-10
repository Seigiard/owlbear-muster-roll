---
id: TASK-33
title: Set the window size from the preset
status: To Do
assignee: []
created_date: '2026-11-10T16:53:00Z'
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
- [ ] #1 **Given** a preset that sets a window width and height **When** any client opens the window **Then** the window opens at that size
- [ ] #2 **Given** a preset with no window size **When** any client opens the window **Then** the window opens at 600 by 600 px
- [ ] #3 **Given** a preset file with a window size outside the allowed range **When** the GM uploads it **Then** the file is refused and nothing changes
<!-- AC:END -->
