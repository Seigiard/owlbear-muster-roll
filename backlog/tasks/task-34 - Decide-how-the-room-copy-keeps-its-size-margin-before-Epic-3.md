---
id: TASK-34
title: Decide how the room copy keeps its size margin before Epic 3
status: Done
assignee: []
created_date: '2026-11-11T00:23:00Z'
updated_date: '2026-11-11T04:43:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-18
references:
  - src/core/snapshot-size.test.ts
  - >-
    _bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md
type: feature
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-18 (Story 2.5) AC 12 measured the room copy of a synthetic party: 6 characters and 60 NPCs with Russian text, every field filled, 4 attacks per character and 2 per NPC, a token link per sheet, acl and plink per character, nanoid sheet and instance ids, UUID player and token ids, two GM connections as authors, on the larger Story 1.11 fixture tests/fixtures/presets/d20.json. The copy alone takes 15138 bytes of the 15500-byte room metadata limit, a margin of 362 bytes. AC 12 makes a size over 15500 bytes or a margin under 1500 bytes a human gate that the owner decides before Epic 3. Room metadata is shared with other extensions, so a real room can have less free space. Reproduce with: bun test src/core/snapshot-size.test.ts (it prints 'snapshot bytes: N, margin: M'). The architecture spine lists two deferred levers: a snapshot byte layout such as an author table (AD-12 version rule applies), and removing tombstones inside a generation. Other options include accepting the margin or capping the party size.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The owner records a decision on the room copy size margin: accept it, or name the change to make
- [x] #2 If the decision names a change, a follow-up task holds it, and Epic 3 work starts after it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-11-11: shorten newly generated ids (sheet 12, repeat-row instance 8 characters). Measured on the worst-case party: 12158 bytes, margin 3342. Alternatives measured and not taken: author table (14898 bytes, margin 602); accept as is (a typical 6+20 table is 7534 bytes; overflow shows the not-saved banner); cap NPC count (product limit). Removing tombstones was ruled out because deleted sheets could come back from a stale device.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decided: keep the room copy margin by shortening new ids (sheet ids 12, repeat-row instance ids 8 characters), which brings the worst-case party from 15138 to about 12158 bytes (margin ~3342, above the 1500 gate). Follow-up TASK-37 holds the change; TASK-20 now depends on it, so Epic 3 starts after it. No code changed here; measurements came from a scratch variant of src/core/snapshot-size.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
