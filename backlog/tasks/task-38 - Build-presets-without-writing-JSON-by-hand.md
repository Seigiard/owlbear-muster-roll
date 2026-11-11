---
id: TASK-38
title: Build presets without writing JSON by hand
status: To Do
assignee: []
created_date: '2026-11-11T11:15:00Z'
updated_date: '2026-11-11T20:37:00Z'
labels:
  - v2
dependencies:
  - TASK-41
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a GM describes a sheet only by writing preset JSON by hand, which needs knowledge of the format. For the release (TASK-32) the owner accepted the agent-made d6-pool fixture as the second-system preset and postponed a hand-built one until a configurator exists. A GM should be able to build and change a preset in the extension, without editing JSON.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A GM can create a preset with character and NPC templates, sections, rows, fields and dice cells without editing JSON
- [ ] #2 A GM can open the room's current preset, change it and load it through the same path as a preset upload
- [ ] #3 The result passes the same checks as an uploaded preset file and downloads as a preset file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Forge session 2026-11-11 hardened the builder's shape: _bmad-output/forge/preset-builder/forged-idea.md. Next: bmad-spec update of SPEC.md, then bmad-ux.
<!-- SECTION:NOTES:END -->
