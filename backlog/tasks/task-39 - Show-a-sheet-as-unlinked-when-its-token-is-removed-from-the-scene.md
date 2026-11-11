---
id: TASK-39
title: Show a sheet as unlinked when its token is removed from the scene
status: Done
assignee:
  - '@claude'
created_date: '2026-11-11T12:08:00Z'
updated_date: '2026-11-11T15:09:00Z'
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
- [x] #1 After the linked token is deleted from the scene, the sheet header no longer shows "Токен привязан" on any GM client
- [x] #2 The link: record of a deleted token is tombstoned through the normal GM command path, so the room copy and other clients drop it
- [x] #3 A token that is only out of view, on another scene, or not yet loaded does not lose its link
- [x] #4 A snapshot import keeps links to tokens that exist in the room, and a link to an absent token stays inert as in TASK-31
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a scene port with an OBR adapter and a mock.
2. Detect a linked token removed within one ready period of the scene.
3. Tombstone its link: record through link-clear on GM clients.
4. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-4-6-unlink-a-sheet-when-its-token-is-deleted.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-4-6. Review round 1 patched (triage log in the spec). Checks 2026-11-11: oxfmt, lint, typecheck, bun test 1873 pass, vite build — all exit 0. AC 2-4 proven by src/replica/engine-scene.test.ts, scene-watch.test.ts, engine-import.test.ts. AC 1 (header in the browser) is covered by tests/link.e2e.ts, which could not run: Chromium fails at launch on mbp2021 (bootstrap_check_in MachPortRendezvousServer, error 141), also outside the sandbox; DNS is down on the host too. Task stays open until test:browser passes twice.

test:browser 2026-11-11 after a session restart (Aqua session): 396 passed, twice in a row.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A GM client now watches the open scene through a new scene port. When a linked token disappears within one ready period of the scene, the GM tombstones its link: record through the normal link-clear path, so "Токен привязан" goes away on every client. Scene changes, tokens of other scenes, catch-up and imports never drop a link early; removals seen during them wait, and a deleted token stays remembered for the session so a late link-set from another GM is cleared too. Verified by unit, engine and e2e tests (396 e2e twice). Open: owner check of scene switching in a live room.
<!-- SECTION:FINAL_SUMMARY:END -->
