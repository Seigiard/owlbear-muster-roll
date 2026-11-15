---
id: TASK-75
title: Probe and baseline the replica modules extracted in TASK-64
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T20:32:00Z'
updated_date: '2026-11-15T20:40:00Z'
labels: []
dependencies:
  - TASK-67
documentation:
  - _bmad-output/implementation-artifacts/spec-task-75-replica-probe-baseline.md
priority: medium
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-64 moved the roll, generation, command-routing and room-protocol rules out of engine.ts into their own modules after the TASK-66 mutation probe ran, so bun run probe has no baseline for them or for the shrunken engine.ts. A dry run generates about 1089 mutations across these five modules. Until they are probed and their survivors are classified, a probe run on them lists every survivor as new, and behaviors no test pins stay unknown. TASK-66 is the model: probe, classify each survivor, cover real gaps with tests, record the rest in the baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bun run probe runs over command-routing, generation-flow, roll-flow, room-protocol and engine, and the counts per module (killed, survived, timed out) are recorded in the task notes
- [ ] #2 Each survivor is classified as a test gap, equivalent or unreachable, with a one-line reason
- [ ] #3 Each test gap is covered by a test that kills the mutation, or by a follow-up task that names it
- [ ] #4 tools/mutants/probe-baseline.json holds an entry with verdict and reason for every remaining survivor and timeout, and bun run probe on these modules reports 0 new survivors, 0 new timeouts and 0 missing entries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Run the existing probe on command-routing, generation-flow, roll-flow, room-protocol and engine at a recorded revision; preserve results and per-module counts.
2. Classify every survivor against existing behavioral contracts; investigate timeouts separately.
3. Add calibrated behavioral regression tests for real gaps through the TDD chain. Record any unresolved gap as a named follow-up, never as equivalent.
4. Add justified survivors and timeouts to the anchor baseline, preserving other modules.
5. Commit the tested state, rerun the five-module probe, run the changed-path checks and closing review, then finalize the task against its acceptance criteria.
<!-- SECTION:PLAN:END -->
