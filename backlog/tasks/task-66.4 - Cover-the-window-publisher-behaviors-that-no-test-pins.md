---
id: TASK-66.4
title: Cover the window-publisher behaviors that no test pins
status: To Do
assignee: []
created_date: '2026-11-15T08:12:00Z'
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
The mutation probe found 16 window-publisher mutants that survive every `src/replica/` test (probe document, "Gaps in window-publisher.ts", clusters A–F). A player's `known` map ignores the pending overlay (A), a projection that cannot fit is not tested (B), the projection nonce release after sending is not tested (C), a too-large pending record is not tested (E), and the size estimate for large counters is not tested (F). None of them shows a GM-only sheet to a player. Cluster D is a product question: after a replica replacement the publisher stays silent, so a window still live on the older engine gets no cue; the probe could not tell whether that silence is intended.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gap clusters A, B, C, E and F in the probe document each have a test that passes on the current code and fails under each mutant the cluster lists.
- [ ] #2 The owner decides whether a replica replacement must cue a window that is live on the older engine (cluster D); the decision is recorded in the task, and a test pins the chosen behavior.
- [ ] #3 New mutation controls in `tools/mutants/window-publisher.json` cover clusters A, B and C, and `bun run mutants window-publisher` reports 0 survived and 0 stale.
<!-- AC:END -->
