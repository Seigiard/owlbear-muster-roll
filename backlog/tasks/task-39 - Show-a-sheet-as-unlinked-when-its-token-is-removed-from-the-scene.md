---
id: TASK-39
title: Show a sheet as unlinked when its token is removed from the scene
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-11T12:08:00Z'
updated_date: '2026-11-11T12:14:00Z'
labels:
  - release
dependencies: []
priority: high
type: bug
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in the live-room release check (TASK-32). A GM linked a token to the NPC sheet "gob", then deleted the token from the scene. The sheet header still shows "Токен привязан". Story 4.4 (TASK-27) decided that link status reads only link:{tokenId} records and never the scene, and accepted "still linked" for an absent token in v1 (spec-4-4, matrix row "Absent token"). In use this misleads the GM, and the record of a removed token can never be unlinked, because there is no token left to click. deferred-work.md already tracks the growth of such orphan link: records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After the linked token is deleted from the scene, the sheet header no longer shows "Токен привязан" on any GM client
- [ ] #2 The link: record of a deleted token is tombstoned through the normal GM command path, so the room copy and other clients drop it
- [ ] #3 A token that is only out of view, on another scene, or not yet loaded does not lose its link
- [ ] #4 A snapshot import keeps links to tokens that exist in the room, and a link to an absent token stays inert as in TASK-31
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a scene port with an OBR adapter and a mock.
2. Detect a linked token removed within one ready period of the scene.
3. Tombstone its link: record through link-clear on GM clients.
4. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-4-6-unlink-a-sheet-when-its-token-is-deleted.md
<!-- SECTION:PLAN:END -->
