---
id: TASK-49
title: Publish window deltas from one change signal and derive the window view once
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-12T18:30:00Z'
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
- [ ] #1 The engine signals a change in one way; one publisher owns the sequence and what windows hold, and computes deltas from it
- [ ] #2 The window and the link picker read one derived window view (decoded preset, visible records, token links); no derivation is duplicated between them
- [ ] #3 The window view gets sheets only through `src/core/visibility.ts`
- [ ] #4 Publisher and receiver are tested as a pair over an in-memory bus; the full check passes
<!-- AC:END -->
