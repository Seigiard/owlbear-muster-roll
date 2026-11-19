---
id: TASK-118
title: Write the room copy of edits a GM made just before closing the tab
status: To Do
assignee: []
created_date: '2026-11-19T06:20:00Z'
labels: []
dependencies: []
references:
  - formal/room-copy/RoomCopy.tla
  - .claude/skills/room-copy/SKILL.md
priority: medium
type: bug
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The room copy is what players read when no GM is online. A GM edit reaches it after a pause of 3-5 s, or at once when the page hides. Closing the tab fires `visibilitychange` → `engine.pageHidden` (`src/replica/background-main.ts`), which starts `writeRoomCopy` in `src/replica/room-copy.ts`; its metadata read is async and the tab dies before the answer, so nothing is written. The owed write lives only in memory (`deferred.owed`), so when the GM opens the room again `caughtUp(false)` schedules nothing and the copy misses those edits until the GM edits again or hides the page. Typical case: at the end of a session the GM changes HP or loot and closes the tab; players who open the room before the GM returns see the old values. The GM's own `localStorage` holds the edits. Found by the TLA+ model `formal/room-copy/` (config `finding-lost-for-good.cfg`, invariant `NoLossForGood`) and replayed on the real `createRoomCopy`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An edit a GM made and then closed the tab before the room copy write finished is in the room copy after that GM next opens the room and catches up, with no further edit or page hide
- [ ] #2 A module or engine test reproduces the tab closing during the room copy read and passes
- [ ] #3 `formal/room-copy/check.sh` reports `finding-lost-for-good` as passing, and the config and the room-copy skill are updated to expect that
<!-- AC:END -->
