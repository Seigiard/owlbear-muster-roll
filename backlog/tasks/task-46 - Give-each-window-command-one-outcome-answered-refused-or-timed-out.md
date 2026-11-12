---
id: TASK-46
title: 'Give each window command one outcome: answered, refused or timed out'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-12T14:57:00Z'
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
- [x] #1 Sending a command from the window yields exactly one outcome: answered with a result, refused with a reason, or timed out; the window client owns id matching and timeouts
- [x] #2 No component keeps a command id, polls a result map or arms its own command timeout; `projection-store` holds room state only
- [x] #3 A duplicate closes on its own copies only, never on an unrelated new NPC (the deferred-work.md:89 case is covered by a test)
- [x] #4 Outcomes are tested in `replica-client.test.ts`; whether the engine answers every command is checked against AD-10 and recorded
- [x] #5 Interface text stays in `src/ui/copy.ts`, and the full check in CLAUDE.md passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence (run dir ~/.claude/artifacts/tdd-20261112-113928/task-46-command-outcomes/): AC1 replica-client.test.ts 'replica client command outcomes' and 'timeout selection' (answered, refused, timed out, foreign/repeated, buffering, too-large), calibrated by mutations M1-M4, M10 and D1. AC2 static rg check over src matches nothing; projection-store holds room state only. AC3 duplicate-count.test.tsx 'another client's empty repeat block does not answer a duplicate of an empty source', red on the baseline interface (controls/duplicate-count-baseline-red.log), calibrated by M9. AC4 AD-10 audit table in the spec Implementation Notes; engine tests for live, replay, player and engine-made ids (M5-M8, R5). AC5 no change to src/ui/copy.ts; full check on merge commit a04a775: oxfmt, lint (0 errors), typecheck, bun test 2681 pass / 0 fail, test:browser 492 passed, build. JUnit vs baseline: 36 added, 10 retired (owners in the spec), 0 retained assertion-count changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every window command now has one outcome: answered, refused or timed out. The engine sends `command-done` after the delta that carries a command's effect (or a result answer, or `command-rejected`), including commands queued during catch-up and accepted player edits; engine-made commands get none. The window client owns ids, matching, answer buffering until the projection, and one timeout per command kind in `Timing`. Views read a `CommandOutcome` instead of command ids, result maps and private timers. Fixed: the duplicate block no longer closes when another client adds a block with the source's values. Code review: round 1 (9 agents) found 3 major and 14 minor issues, fixed in a second tdd batch; round 2 found none. Deferred to deferred-work.md: version skew between a new window and an old background page, a late snapshot import no longer clearing its warning, a duplicate during a catch-up longer than 15 s, and a stale comment in tests/owner.e2e.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
