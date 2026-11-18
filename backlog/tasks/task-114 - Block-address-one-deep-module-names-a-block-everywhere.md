---
id: TASK-114
title: 'Block address: one deep module names a block everywhere'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T18:24:00Z'
updated_date: '2026-11-18T19:54:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md
  - GLOSSARY.md
  - TASK-100
  - TASK-108
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repeat-block address has no home. Five representations of "which block" (the `blk:` key, an even-length `path`, the scope path of even-indexed elements, the `{sectionId, instanceId, path?}` triple and `LinkTarget` with its "compatibility" `instanceId`) are converted by hand in about 20 files across core, replica and ui. The pure path functions are correct; the bugs are in how each consumer builds their argument, so there is no locality: commits 76d0305, bc92efb, ff5c71f, 836da18, 3abef2f each repaired one more consumer, and `isLegacyInstanceTarget` in composers.ts guards links that were written with a wrong scope id. The 2026-11-18 architecture review (reports.1218217.xyz/reports/owlbear-muster-roll/20261118T172032Z-086b1f4a) chose this as the first deepening. Decisions, all accepted by the owner: a block address is the sheet id plus the full path of (repeat scope id, block id) pairs, an empty path names the sheet root, and it is the only form code holds; storage keys, `link:` data, the five wire commands and `open-sheet` keep the v4 shapes and convert at the parse/serialise edge (no format bump); the address is plain readonly data built only through constructor functions in `src/core/block-address.ts`; `*ById` lookups in preset.ts go, only `*ByPath` stays; `isLegacyInstanceTarget` and the `instanceId` compatibility view are deleted; the "lock" test files migrate with their consumers; the term lands in GLOSSARY.md and the decision in ADR-0003. Work lands as three PRs: core, replica, ui (the subtasks).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No non-test file outside `src/core/block-address.ts` and the zod schemas at the storage and wire edges computes a scope path, a parent path or a key string from path parts by hand
- [ ] #2 GLOSSARY.md defines Block address and docs/adr/0003 records that the one address form converts at the v4 storage and wire edges
- [ ] #3 Stored v4 rooms and the wire messages read and write unchanged: `bun test` and `bun run test:browser` pass with no fixture format change
<!-- AC:END -->
