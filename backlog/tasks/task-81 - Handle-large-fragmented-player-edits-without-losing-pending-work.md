---
id: TASK-81
title: Handle large fragmented player edits without losing pending work
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T15:14:00Z'
updated_date: '2026-11-17T10:38:00Z'
labels:
  - blocked
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT STATUS — 2026-11-17, after closing review:
BLOCKED, NOT MERGED. Clean final candidate 78925c4 (source c6c900b) on feature/preset-v4-task-81 is preserved. Its new stale-fragment oracle wrongly requires re-stamping and re-proposing an untouched GM cell. The candidate satisfies that wrong expectation through preserveReadBack/preserveCells and skips stripping. Correct the oracle against the existing ordinary-stale per-cell contract before repair. Focused 77/77 and supporting 207/207 do NOT establish correctness of that suspect owner; no final six-check run or acceptance claim.

Earlier progress below is historical; the current status above supersedes it.

CURRENT: Active implementation on feature/preset-v4-task-81, based on a5abdc3. Locked public regressions cover fragmented stale rebase, projection byte limits, assembly count/bytes/lifetime and two-part admission. The writer has reproduced the failures; production repair and stable full checks are in progress. Nothing from TASK-81 is merged yet.

CURRENT BLOCKER: Not merged. Parent found a contradictory stale-fragment regression: after editing only str, it expects untouched note to be sent again at counter 6/player. The existing ordinary stale owner requires str-only proposal and preserves note at its original GM tuple. The candidate adds a fragmented-only preserveReadBack/preserveCells path that restamps every read-back cell and bypasses stripping, risking overwrite of an independent GM edit. The bounded attempt is closing without acceptance. Continuation must correct the locked oracle and preserve the same per-cell/access semantics for fragmented and ordinary replies.
<!-- SECTION:NOTES:END -->
