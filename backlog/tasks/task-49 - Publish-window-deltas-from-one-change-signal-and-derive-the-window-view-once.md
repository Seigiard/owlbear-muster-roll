---
id: TASK-49
title: Publish window deltas from one change signal and derive the window view once
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-13T04:27:00Z'
labels: []
dependencies: []
references:
  - src/replica/engine.ts
  - src/ui/main.tsx
  - src/ui/picker/link-picker.tsx
  - src/ui/replica-client.ts
  - src/replica/engine-client.test.ts
priority: low
type: task
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`emitDelta` in `src/replica/engine.ts` has 24 call sites, 15 of them `emitDelta([])` meaning something changed, so every state change must remember to refresh windows. On the window side, `visibleRecordMap` and preset decoding are duplicated in `src/ui/main.tsx` (790 lines, 29 commits in 6 weeks, about 10 derived views in `useMemo`) and `src/ui/picker/link-picker.tsx`. `engine-client.test.ts` (2751 lines, the largest test file) tests the projection protocol through a full engine. That a missed call leaves a window stale is inferred, not shown by a fix. The engine-side change detection is an open design question. Found in the architecture review of 2026-11-12 (candidate 5, Worth exploring).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The engine signals a change in one way; one publisher owns the sequence and what windows hold, and computes deltas from it
- [x] #2 The window and the link picker read one derived window view (decoded preset, visible records, token links); no derivation is duplicated between them
- [x] #3 The window view gets sheets only through `src/core/visibility.ts`
- [x] #4 Publisher and receiver are tested as a pair over an in-memory bus; the full check passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence. AC1: src/replica/window-publisher.ts owns the engine id, the sequence and what windows hold; engine.ts calls publisher.publish() at every former emitDelta site, and rg for emitDelta|sentVisible|shownPending|shownParty|projectionSent|answeringNonces|engineId|sequence in engine.ts finds nothing. A delta is a diff against what windows hold. AC2: src/ui/window-view.ts derives the decoded preset, visible records and token links once; main.tsx and link-picker.tsx read it, and rg for visibleRecordMap|decodePreset|liveLinks in them finds nothing. AC3: window-view.ts gets records and links only through core/visibility (visibleRecordMap, liveLinks). AC4: window-publisher.test.ts pairs the publisher with startReplicaClient and createProjectionStore over createMemoryBus, with no engine and no room-rig; window-view.test.ts covers the five view cases. Mutations M1-M8 each fail at least one test. Full check at c63bbdc..7f8201c: oxfmt, lint, typecheck, bun test 2746 pass, test:browser 492 pass, build ok. Code review: round 1 (9 sources) 13 minors, round 2 (9 sources) 1 major and 2 minors, all fixed through the tdd chain; round 3 (final) found nothing. Spec deviation: before a stream's first projection, a change of visible records sends one record-free delta, so a window of an older stream asks again (spec Change Log).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Engine changes now reach windows through one call, publisher.publish(). src/replica/window-publisher.ts owns the window stream and sends each window only the difference from what it holds, so a missed hint can no longer leave a window stale. The main window and the link picker read one window view (src/ui/window-view.ts). Pair tests cover the publisher and its receiver over an in-memory bus with no engine; one engine-client test moved to its pair-test owner. Behavior is unchanged: the phase-A junit list equals the baseline, and the full check passes (bun test 2746, test:browser 492, build). Two behavior notes: a dropped change signal is now repaired by the next one, and before a stream's first projection a records change sends one empty delta so windows of an older stream ask again. The spine names window-publisher in AD-10 and window-view in the Visibility convention. Unblocks TASK-50, which must re-read emitDelta and roomCopyStatus call sites.
<!-- SECTION:FINAL_SUMMARY:END -->
