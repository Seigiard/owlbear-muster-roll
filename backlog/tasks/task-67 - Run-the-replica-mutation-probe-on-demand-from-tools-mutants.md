---
id: TASK-67
title: Run the replica mutation probe on demand from tools/mutants
status: Done
assignee: []
created_date: '2026-11-15T16:54:00Z'
updated_date: '2026-11-15T20:32:00Z'
labels:
  - testing
  - tooling
dependencies: []
references:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
  - _bmad-output/implementation-artifacts/task-66-verification.md
priority: medium
type: task
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The hand-written mutation controls in tools/mutants/*.json are written by the same author as the tests they check, so they miss what that author did not think of. A one-off AST mutation generator (source in the appendix of _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md) found 82 untested behaviors and one real defect in catch-up, room-copy and window-publisher; TASK-66 closed them. A rerun on 53f742d reproduced the TASK-66 result exactly: 788 mutants, 65 classified survivors (50 equivalent, 15 unreachable, listed in _bmad-output/implementation-artifacts/task-66-verification.md), 3 timeouts, in about 13 minutes on 6 parallel checkouts. The generator lives only in a document today and needs typescript@5 installed by hand, because the project's TypeScript 7 has no JS compiler API. Epic 64 is about to move code out of src/replica/engine.ts, which has never been probed. The owner chose an on-demand tool, not a CI step: a full run is too slow for every PR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One command (a package.json script) probes the named src/replica modules: pass 1 runs each module's own unit test, pass 2 runs src/replica/ for pass-1 survivors, and timeouts are reported apart from kills
- [x] #2 Mutations run only in disposable detached checkouts, never in the caller's working tree, and those checkouts are removed when the run ends, fails or is interrupted
- [x] #3 A committed baseline records each classified survivor by a stable anchor (module, function, operation and source text), not by a numeric id, with its verdict and reason; it holds the 65 survivors and 3 timeouts of the TASK-66 verification
- [x] #4 The report lists only survivors and timeouts not in the baseline, and baseline entries whose anchor no longer exists; a run on unchanged code reports none of either
- [x] #5 tools/mutants/README.md says when to run the probe, how long it takes, and how to classify and record a new survivor
- [x] #6 The AST comes from the project's own TypeScript 7 API (typescript/unstable/async, which runs under Bun), with no new parser dependency, and tools/mutants is type-checked by bun run typecheck
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Epic 64 merged before this work started; catch-up, room-copy, window-publisher and their tests are byte-identical to 53f742d, so the TASK-66 baseline stays valid. Probing the extracted modules (command-routing, generation-flow, roll-flow, room-protocol, engine.ts: 1089 mutants by dry run) is a separate follow-up task, not part of this one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added bun run probe [module...] (tools/mutants/probe/): the TASK-66 AST mutation generator ported to the TypeScript 7 async API, run in detached temporary worktrees with an unmutated preflight, two passes (module unit test 30 s, src/replica/ 180 s) and timeouts reported apart. tools/mutants/probe-baseline.json holds the 65 TASK-66 survivors and 3 timeouts, matched by anchor (file, function, operation, normalized node text, nth). Verified: generator yields the same 788 mutations as the TypeScript 5 original; full probe on unchanged code reported 0 new and 0 missing with exit 0 (about 13 min); full local check passed; two review rounds, all 11 round-1 findings fixed. Merged in PR #43. Follow-up: probe and baseline the modules extracted in TASK-64.
<!-- SECTION:FINAL_SUMMARY:END -->
