---
id: TASK-118
title: Write the room copy of edits a GM made just before closing the tab
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T06:20:00Z'
updated_date: '2026-11-19T21:06:00Z'
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
- [x] #1 An edit a GM made and then closed the tab before the room copy write finished is in the room copy after that GM next opens the room and catches up, with no further edit or page hide
- [x] #2 A module or engine test reproduces the tab closing during the room copy read and passes
- [x] #3 `formal/room-copy/check.sh` reports `finding-lost-for-good` as passing, and the config and the room-copy skill are updated to expect that
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix 3b74bff, mutants 6430076, model cee9ff8. observeRead owes a write when a GM's catch-up read finds a copy that lacks one of its stored records, or no copy while it holds records; a read that answers after catch-up timed out arms the write itself. AC #3: finding-lost-for-good.cfg became one-gm.cfg, which passes with NoLossForGood (now: every edit an open GM holds), and broken-catch-up-ignores-copy.cfg brings the old rule back. Spec: _bmad-output/implementation-artifacts/spec-task-118-room-copy-owed-after-reopen.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A GM whose tab closed before the room copy write finished now writes the missing edits after it reopens the room and catches up. The catch-up read compares the room copy with the GM's stored records and owes a write when the copy lacks one, or is absent. The room-copy model checks this with one GM (one-gm.cfg). A GM with records in a room with no copy now writes it at catch-up end.
<!-- SECTION:FINAL_SUMMARY:END -->
