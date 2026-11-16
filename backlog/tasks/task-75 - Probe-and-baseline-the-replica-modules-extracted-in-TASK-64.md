---
id: TASK-75
title: Probe and baseline the replica modules extracted in TASK-64
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T20:32:00Z'
updated_date: '2026-11-16T04:56:00Z'
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
- [x] #1 bun run probe runs over command-routing, generation-flow, roll-flow, room-protocol and engine, and the counts per module (killed, survived, timed out) are recorded in the task notes
- [x] #2 Each survivor is classified as a test gap, equivalent or unreachable, with a one-line reason
- [x] #3 Each test gap is covered by a test that kills the mutation, or by a follow-up task that names it
- [x] #4 tools/mutants/probe-baseline.json holds an entry with verdict and reason for every remaining survivor and timeout, and bun run probe on these modules reports 0 new survivors, 0 new timeouts and 0 missing entries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Run the existing probe on command-routing, generation-flow, roll-flow, room-protocol and engine at a recorded revision; preserve results and per-module counts.
2. Classify every survivor against existing behavioral contracts; investigate timeouts separately.
3. Add calibrated behavioral regression tests for real gaps through the TDD chain. Record any unresolved gap as a named follow-up, never as equivalent.
4. Add justified survivors and timeouts to the anchor baseline, preserving other modules.
5. Commit the tested state, rerun the five-module probe, run the changed-path checks and closing review, then finalize the task against its acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Metadata/baseline phase recorded on lock 47eb45bd3ba989fad6cd762df960aa0c7b21b22f. Complete initial run at f91547e079b99f7dee6edf4408ebd52667eb33bb with `bun run probe command-routing generation-flow roll-flow room-protocol engine --jobs 6 --out /Users/seigiard/.claude/artifacts/tdd-20261115-task75/TASK-75/initial-results-v2.json`; limits 30000 ms unit and 180000 ms replica, six workers. Counts: command-routing 140 total/115 killed/25 survived/0 timeout; generation-flow 208/129/79/0; roll-flow 115/101/14/0; room-protocol 132/103/29/0; engine 494/338/156/0; total 1089/786/303/0. Complete classification is 126 calibrated gaps, 156 equivalent and 21 unreachable, no deferred gaps; replay-3 at the lock has 126/126 assertion-red exit 1 and restored-green exit 0. Candidate baseline preserves the original 68 parsed entries and SHA256 f4efced3bbda1b185ccd1e20e80524d33d094eae8d4f7af2ae54c2bb50646399, then appends 177 justified equivalent/unreachable anchors for 245 total entries. Evidence: _bmad-output/implementation-artifacts/task-75-verification.md and /Users/seigiard/.claude/artifacts/tdd-20261115-task75/TASK-75/. Final five-module comparison, AC #4 and closing review remain pending; task is not Done.

D6 targeted metadata repair at lock 885c7f775fe50a063def9081739896cc228dbe6c: first final probe was a preserved failed attempt at final-results.json/final-summary.json/final-provenance.json/final-comparison.json, with command-routing 140/128/12/0, generation-flow 208/171/37/0, roll-flow 115/108/7/0, room-protocol 132/116/16/0, engine 494/388/106/0; total 1089/911/178/0, one new survivor, zero new timeouts and zero missing. The D6 anchor src/replica/engine.ts / startReplicaEngine > raiseNewerVersion / if→false / newerVersionSeen / nth=1 is accepted equivalent: the first call sets sticky newerVersionSeen and publishes; later calls repeat true and publish(), while publisher deduplication suppresses unchanged visible records/header. The initial killed status has no retained assertion output, so its cause is unknown. Evidence is version-survivor-investigation/guard-false.patch, both full replica green logs, the positive-control red/restored-green logs, and actual caller inspection. Cumulative classifications are 304 (126 gap, 157 equivalent, 21 unreachable), while the initial inventory remains 303. Baseline is now 246 entries with 178 selected-module entries; prior 245 entries and original 68 objects/order are preserved. Replay-4 and calibration-final/matrix.json are current evidence. D5 preserves the independent original-module 65 survivor/3 timeout oracle; deletion controls remain in test-writer-5.report.md. Fresh complete final comparison, AC #4 and closing review remain pending; status and checkboxes unchanged.

Final-v2 complete probe accepted at source revision 377cdde10a620961fcb843dcd1dc280dc95ddb92. Exact command: bun run probe command-routing generation-flow roll-flow room-protocol engine --jobs 6 --out /Users/seigiard/.claude/artifacts/tdd-20261115-task75/TASK-75/final-results-v2.json. Provenance: /Users/seigiard/.claude/artifacts/tdd-20261115-task75/TASK-75/final-v2-provenance.json; summary: final-v2-summary.json; comparison: final-v2-comparison.json; supervisor task75-final-v2-sunny-8b3b / t3cy. Exit 0. Per-module total/killed/survived/timeout: command-routing 140/128/12/0; generation-flow 208/171/37/0; roll-flow 115/108/7/0; room-protocol 132/116/16/0; engine 494/388/106/0; total 1089/911/178/0. Comparison is zero new survivors, zero new timeouts and zero missing; all 126 calibrated gaps killed, all 178 selected baseline anchors survived, all 1089 anchors match the initial inventory. Provenance records baseline entries 246, selected entries 178, baseline SHA256 5b2100bb7e3e83858e642fed9e94143671ac66d7fe8618f0ced22e680d61cb53, caller unchanged, lockDiffExit 0 and ownedWorktreesRemoved true. Accepted D6 unit/static evidence and browser/build reuse remain valid because this final record changes only verification Markdown and this Backlog record; no application/browser/build/configuration/dependency input changed. AC #1-#4 are checked from the recorded evidence. Task remains In Progress and explicitly awaits caller-owned closing review; approved spec and terminal completion are unchanged.
<!-- SECTION:NOTES:END -->
