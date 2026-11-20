---
id: TASK-102
title: Consider late child edits after a parent block is removed
status: To Do
assignee: []
created_date: '2026-11-18T06:48:00Z'
updated_date: '2026-11-20T13:18:00Z'
labels: []
dependencies: []
priority: low
type: bug
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up, not a preset-v4 acceptance blocker. The owner deferred this rare deletion/edit race on 2026-11-18. At 76d0305 and test commit 3abef2f, a receiving GM accepts a player edit to boss/b1/attack/a1 after boss/b1 is tombstoned. The diagnostic is preserved in 3abef2f: src/replica/engine-propose.test.ts, test rejects a nested field edit whose parent block is deleted. This is a constructed delayed-delivery scenario, not a reported live-room incident. Reconsider only if user impact warrants it; multiple GMs or multiple GM windows are outside the current supported acceptance scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If this follow-up is selected, a delayed player edit under a deleted parent is refused and leaves the deleted parent and child data unchanged.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Archived 2026-11-20 by the owner's decision ("103 102 - архивировать"). The path needs a race between a GM change (preset field removal or parent block deletion) and a player edit still in flight. No live-room occurrence is known, and the owner does not spend code and tests on minimal-probability races.
<!-- SECTION:NOTES:END -->
