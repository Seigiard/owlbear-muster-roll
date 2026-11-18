---
id: TASK-81
title: Handle large fragmented player edits without losing pending work
status: Done
assignee:
  - '@openai'
created_date: '2026-11-16T15:14:00Z'
updated_date: '2026-11-17T14:18:00Z'
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
- [x] #1 A stale multi-part edit rebases without changing to denied merely because its read-back exceeds one message.
- [x] #2 Projection delivery of an accepted large block remains bounded with a realistic large party envelope.
- [x] #3 Incomplete proposal assemblies have explicit part-count, byte and retention bounds.
- [x] #4 A targeted two-part proposal test proves no persistence or ACK before all unique parts arrive, including duplicate and forbidden second parts.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-lock the stale-fragment oracle against the existing ordinary-stale per-cell contract: re-propose only player intent and retain untouched GM tuples. 2. On a fresh accepted baseline, validate reusable test/code slices from the rejected candidate; implement bounded assembly and correctly sized fragmented replies/projections without preserveReadBack/preserveCells semantics. 3. Validate focused owners and all required source checks; parent owns the single integration review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-17: Completed and integrated via 1117177; final source 738bbf2. The earlier candidate 78925c4 remains rejected and unmerged: its oracle incorrectly re-proposed untouched GM cells. Corrected lock 37654a1 fails on c6822ca with a denied 15,188-byte stale read-back and passes on c8e595d with two valid fragments. Ordinary per-cell rebase semantics are preserved. Proposal bounds: 32 parts, 32 assemblies, 480000 bytes, 60-second ingress expiry. The byte ceiling is defensive: other admission limits make an independent supported-ingress byte-limit oracle unreachable. Numbered-envelope regression aedc6f3 is calibrated and fixed by 738bbf2.

Final integration evidence on clean 738bbf20a2193cd92d3d39c9a467398be9db1ea8: format, lint, typecheck, unit (3401 pass, 1 skip), browser (563 pass, workers=2), and build all exit 0. Closing review: mixed 6/6, two major fixes; final 2/2, no findings or open questions. See _bmad-output/implementation-artifacts/spec-task-77-98-completion.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fragmented stale replies preserve player intent and untouched GM tuples. Projection sizing uses the actual envelope; incomplete proposals have explicit admission and retention bounds. Two-part acceptance rejects duplicate/forbidden-part shortcuts. Review fix 738bbf2 includes numbered-envelope bytes. Obsolete incomplete stale-reply retention remains a separate minor follow-up in deferred-work.md.

Final integration evidence on clean 738bbf20a2193cd92d3d39c9a467398be9db1ea8: format, lint, typecheck, unit (3401 pass, 1 skip), browser (563 pass, workers=2), and build all exit 0. Closing review: mixed 6/6, two major fixes; final 2/2, no findings or open questions. See _bmad-output/implementation-artifacts/spec-task-77-98-completion.md.
<!-- SECTION:FINAL_SUMMARY:END -->
