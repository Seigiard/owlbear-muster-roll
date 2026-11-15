---
id: TASK-66.4
title: Cover the window-publisher behaviors that no test pins
status: To Do
assignee: []
created_date: '2026-11-15T08:12:00Z'
updated_date: '2026-11-15T08:30:00Z'
labels:
  - testing
  - replica
  - window-publisher
dependencies: []
documentation:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
parent_task_id: TASK-66
priority: medium
type: task
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The mutation probe found 16 window-publisher mutants that survive every `src/replica/` test (probe document, "Gaps in window-publisher.ts", clusters A–F). A player's `known` map ignores the pending overlay (A), a projection that cannot fit is not tested (B), the projection nonce release after sending is not tested (C), a too-large pending record is not tested (E), and the size estimate for large counters is not tested (F). None of them shows a GM-only sheet to a player.

Cluster D is a defect in the restart cue, decided by the owner on 2026-11-15. `restart()` sends a cue on the next `publish()` only when this publisher already sent a projection (`restartPending = hadProjection`), and it takes its comparison snapshot after the replica was replaced. So when a new background engine replaces its replica (an import, or a newer generation adopted at start) before any window asked it for a projection, a window still open on the older engine's stream gets no cue and keeps the old generation's records until some later change. TASK-49 already chose to cue "a window open across a background restart" (`_bmad-output/implementation-artifacts/spec-task-49-window-publisher.md`, Spec Change Log); this case slipped past that rule. The owner could not reproduce a background restart with an open popover in a live room, but a cue is cheap: one record-free delta per replica replacement or role change, which nobody receives when no window is open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gap clusters A, B, C, E and F in the probe document each have a test that passes on the current code and fails under each mutant the cluster lists.
- [ ] #2 After `restart()`, the next `publish()` sends exactly one record-free delta under the new engine id whether or not the publisher had sent a projection; after that cue, publishes before a projection keep the existing rule (a cue only when the visible records or pending change).
- [ ] #3 An engine-level test shows that a window holding an older engine's stream asks for a new projection after the new engine replaces its replica before any projection; it fails on the current code.
- [ ] #4 The test `stays silent after a restart with no earlier projection` in `src/replica/window-publisher.test.ts` is replaced, with the contract change stated in the commit.
- [ ] #5 New mutation controls in `tools/mutants/window-publisher.json` cover clusters A, B, C and D, and `bun run mutants window-publisher` reports 0 survived and 0 stale.
<!-- AC:END -->
