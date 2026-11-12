---
id: TASK-46
title: 'Give each window command one outcome: answered, refused or timed out'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-12T10:36:00Z'
labels: []
dependencies: []
references:
  - src/ui/replica-client.ts
  - src/ui/projection-store.ts
  - src/core/timing.ts
  - _bmad-output/implementation-artifacts/deferred-work.md
priority: medium
type: task
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every window action that sends a command re-implements the same loop: keep the command id in component state, look it up in `$rejections` and one of four result maps in `src/ui/projection-store.ts` during render, run its own `setTimeout` with its own constant from `src/core/timing.ts`, and guess success. 13 non-test files read the rejection map. `duplicate-count.tsx` gets no answer at all and infers success from records that arrive. Commit 5b5c9b1, about one concept (a command waits for its own answer), touched 19 files, and `_bmad-output/implementation-artifacts/deferred-work.md:89` records another bug of the same kind (the duplicate block closes when any new NPC appears). `src/ui/replica-client.ts` has four near-copies of send (`sendCommand`, `requestPresetDiff`, `requestSnapshotCheck`, `requestRoll`). Found in the architecture review of 2026-11-12 (candidate 2, Strong).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sending a command from the window yields exactly one outcome: answered with a result, refused with a reason, or timed out; the window client owns id matching and timeouts
- [ ] #2 No component keeps a command id, polls a result map or arms its own command timeout; `projection-store` holds room state only
- [ ] #3 A duplicate closes on its own copies only, never on an unrelated new NPC (the deferred-work.md:89 case is covered by a test)
- [ ] #4 Outcomes are tested in `replica-client.test.ts`; whether the engine answers every command is checked against AD-10 and recorded
- [ ] #5 Interface text stays in `src/ui/copy.ts`, and the full check in CLAUDE.md passes
<!-- AC:END -->
