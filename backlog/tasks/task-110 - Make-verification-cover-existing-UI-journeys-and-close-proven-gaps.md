---
id: TASK-110
title: Make verification cover existing UI journeys and close proven gaps
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-18T08:22:00Z'
updated_date: '2026-11-18T08:57:00Z'
labels: []
dependencies: []
documentation:
  - _bmad-output/implementation-artifacts/spec-task-110-verification-coverage.md
type: task
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The initial verify skill proved one route and left agents without a runnable view of the broader existing browser coverage. The user requested an audit of those tests and new tests for missing user scenarios.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing browser coverage maps to runnable feature groups with explicit uncovered and live-only boundaries.
- [x] #2 New UI journeys cover proven gaps using independent contract expectations rather than private setters.
- [x] #3 Quick, feature and full verification runs preserve evidence and report failures without hiding skipped coverage.
- [x] #4 Changed-path checks and real browser execution are recorded with any baseline blockers separated from new failures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit existing browser harness and journey bodies in parallel. 2. Select missing contract-backed journeys and write a focused implementation spec. 3. Add tests and runnable verification profiles, preserving all existing tests. 4. Execute targeted browser proofs and required checks, recording unrelated baseline failures. 5. Review independently and update the verify feature map.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Work is isolated on test/verify-coverage at 418bd5e70705403baf5c1921321f0ac37bc35b35. Correct v4 baseline: 579 browser tests passed, zero skipped/flaky/global errors; JSON at /private/var/folders/mg/mg22yjv17054nxmbq8_jkqnm0000gn/T/opencode/verify-coverage-110/v4-baseline.json. Three confirmed gaps are actual snapshot round-trip plus restart, populated repeat section moved by preset upload, and persisted d1 after option removal. Builder native file-input fallback remains explicit pending-owner coverage, not silently claimed. Earlier v3 run was interrupted after detecting that worktree creation selected the default branch.

Added and integrated three tagged browser journeys plus the profile runner. Independent review found and fixed two false-green risks: assert snapshot mutations/deleted block before import, and assert saved d1 is disabled after the option is removed. Fresh review found no remaining blocking issue. Runner now records binary tracked diff, nonignored untracked inputs, actual launcher/child PIDs and handles cleanup in finally. First integrated full profile passed582/582; final stronger version is running with evidence in test-results/verify/full-H7lPcX. Intentional-defect calibration remains explicitly unclaimed. Native builder fallback and live Owlbear behavior remain named coverage gaps, not passing claims.

Final stronger full profile passed582/582 with zero skipped/flaky/global errors. Evidence test-results/verify/full-H7lPcX contains582 traces, snapshot.json, tracked binary diff, untracked inputs, metadata, process ownership and cleanup.json. Both recorded processes exited and server port16568 closed. The exact quick command also completed with exit0 after the full run. Final code formatting/typecheck/scoped lint and build passed; unchanged app Bun coverage is3432pass,1existing skip,0fail. Touched Markdown is excluded by formatter and is reported as skipped; links/sections/whitespace and46-file map consistency were checked separately. Independent review findings resolved; deliberate defect calibration was not run. All commits remain on isolated test/verify-coverage; shared integration branch untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Audited579 existing browser tests and added three real UI journeys for snapshot round-trip/restart, repeat-section relocation and retained stale dice choice. Extended verify to quick, seven feature profiles and unfiltered full discovery, with reproducible inputs and process evidence. Final full run passed582/582 and quick passed3/3. Independent review found no remaining blocker after false-green fixes. Native builder fallback and live Owlbear remain explicit coverage limits.
<!-- SECTION:FINAL_SUMMARY:END -->
