---
id: TASK-81
title: Handle large fragmented player edits without losing pending work
status: To Do
assignee: []
created_date: '2026-11-16T15:14:00Z'
labels: []
dependencies: []
references:
  - src/replica/room-protocol.ts
  - src/replica/window-publisher.ts
  - _bmad-output/implementation-artifacts/spec-task-76-block-records.md
priority: medium
type: bug
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-76 introduced cell-level transport fragments when one block no longer fits one message. Review found that a stale reply for many edited text cells can exceed 15000 bytes and become denied, discarding pending work. Projection fragmentation also uses a fixed 512-byte reserve before the actual envelope is known. The proposal assembler bounds the number of assemblies but not their bytes, part count or lifetime. These large-message edge cases and missing multi-part acceptance coverage were explicitly deferred by the owner rather than extending TASK-76. The memory-exhaustion consequence is a code-traced risk, not a measured incident.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A stale multi-part edit rebases without changing to denied merely because its read-back exceeds one message.
- [ ] #2 Projection delivery of an accepted large block remains bounded with a realistic large party envelope.
- [ ] #3 Incomplete proposal assemblies have explicit part-count, byte and retention bounds.
- [ ] #4 A targeted two-part proposal test proves no persistence or ACK before all unique parts arrive, including duplicate and forbidden second parts.
<!-- AC:END -->
