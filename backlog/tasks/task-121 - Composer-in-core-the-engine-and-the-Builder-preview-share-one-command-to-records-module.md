---
id: TASK-121
title: >-
  Composer in core: the engine and the Builder preview share one
  command-to-records module
status: Done
assignee: []
created_date: '2026-11-19T07:45:00Z'
updated_date: '2026-11-19T09:06:00Z'
labels: []
dependencies: []
references:
  - >-
    docs/adr/0003-a-block-has-one-address-converted-at-the-storage-and-wire-edges.md
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
  - TASK-114
  - TASK-115
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Builder preview applies window commands with its own code (`src/builder/preview-pane.tsx` sendCommand, about 140 lines): repeat-block-add and -delete with its own version and lifecycle minting, field-patch through core helpers, and `repeat-block-duplicate` silently answered without effect. The replica composes the same commands in `src/replica/composers.ts` (1218 lines). Every nested-path fix landed in both (2e468aa touched the preview), and the semantics of versions, orders, block keys and tombstones exist twice. The 2026-11-18 architecture review named this candidate 3 and proposed running the preview on the engine over the mock platform; the owner rejected that route on 2026-11-19 after grilling: it reopens AD-20 (the builder imports no platform or replica at runtime, lint-guarded), the explicit rejection in `_bmad-output/specs/spec-muster-roll/builder-and-dev.md` ("puts the mock adapter in production"), adds 30-40 kB gzip, makes preview edits asynchronous and has no undo history. Accepted route: `composers.ts` imports only `src/core` and its ComposeContext is `records + mint + newRecordId + isGmPlayer + mode`, so it moves to `src/core/compose.ts` as the one command-to-records module; the preview calls it with its synchronous store and `setSnapshot` undo steps, in mode `persisted` with `isGmPlayer: () => true` and the engine version minter under author `builder`; the engine keeps calling it. Decisions: preview composes field-patch, repeat-block-add and -delete; other commands stay answered without effect, and the preview keeps passing no block tools, so «Дублировать…» is not offered there (correction 2026-11-19: the review assumed the control existed in the preview; it never rendered); `reconcileRecords` on preset change stays (it moves blocks by `presetMoves`, the engine erases by `presetDiff`: a deliberate difference, not debt); the roll result display gap in the preview is out of scope; `createComposers(connectionId)` stays a factory; no re-export shim in `src/replica`; `src/preview/` is deleted and its one consumer, a unit-style test inside `tests/dice-choice-field.e2e.ts` that asserted a sample value nothing else used, is deleted with it; the AD-20 lint rule keeps forbidding replica and platform and drops the preview entry; ADR-0005 records the decision, AD-23 in the spine is rewritten to the current preview behaviour, and the three references that say "candidate 3 runs the preview on the engine" (ADR-0003, deferred-work.md, TASK-114.3) are corrected. Two PRs: 120.1 mechanical move, 120.2 preview and documents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The engine and the Builder preview compose commands through the same `src/core/compose.ts` exports; `src/replica/composers.ts` does not exist and `src/builder/preview-pane.tsx` holds no record minting of its own
- [x] #2 ADR-0005 is accepted; AD-23 in ARCHITECTURE-SPINE.md describes value editing, dice rolls under the role policy and the shared composer; ADR-0003, deferred-work.md and TASK-114.3 no longer say the preview will run on the engine
- [x] #3 AD-20 still holds: `src/builder` imports nothing from `@/replica/**` or `@/platform/**` at runtime, the lint rule stays, `tests/build.test.ts` builder-chunk check unchanged
- [x] #4 A unit test (`src/builder/preview-compose.test.ts`) asserts literal expected records for field-patch, repeat-block-add and repeat-block-delete composed for the preview; no parity test against `compose` (owner decision in the TASK-121.2 spec)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC 4 reworded 2026-11-19 to match the owner-approved TASK-121.2 spec, which forbids a parity test against compose. Delivered in two PRs: TASK-121.1 (#59, merged) and TASK-121.2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
One command-to-records module: src/core/compose.ts (moved from src/replica in TASK-121.1) is called by both the engine and the Builder preview (TASK-121.2). The preview's own minting and src/preview/ are gone; AD-20 still holds and is lint-enforced.
<!-- SECTION:FINAL_SUMMARY:END -->
