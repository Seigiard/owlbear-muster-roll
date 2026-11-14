---
id: TASK-61.6
title: Validate UI separation on a second flow before sharing mechanisms
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-13T09:45:00Z'
updated_date: '2026-11-14T07:28:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.5
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
parent_task_id: TASK-61
type: spike
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A navigation-only design can accidentally become a framework for one caller. Use the ownership map and pilot findings to choose a materially different second flow, such as a settings confirmation flow or builder selection. The choice is intentionally deferred until evidence exists; builder document and undo already have useful separation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A second flow is selected from the epic map with a reason tied to a different interaction or effect pattern, not convenience alone.
- [x] #2 The experiment demonstrates which parts of the approved separation transfer unchanged and which stay flow-specific.
- [x] #3 A shared state-machine helper, emitter or registry is added to the proposal only when two real uses justify its seam; otherwise rejection is recorded.
- [x] #4 Behavior has independent observable oracles, and the experiment distinguishes executable evidence from a design sketch.
- [x] #5 H6 and the epic end-state map are updated; any approved production migration becomes a bounded follow-up task rather than silently expanding this spike.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Prepare and obtain approval for _bmad-output/implementation-artifacts/spec-task-61.6-second-ui-flow.md; select picker link-and-label against the navigation pilot and ownership map.
2. Build an isolated executable experiment in prototypes/ui-second-flow with pure flow rules, a flow-specific caller, controlled async ports and DOM-free checks; leave production source unchanged.
3. Compare transfer and flow-specific rules against independent picker contracts, including arrival/outcome order, role, timeouts and retry identity; calibrate key checks with deliberate defects.
4. Record executable evidence and limits; update H3/H6 and coverage through the Backlog CLI. Keep production migration for a separately approved bounded follow-up under TASK-61.7.
5. Review the artifact and run the project full check plus explicit prototype checks before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved picker experiment in prototypes/ui-second-flow: pure transitions, injected caller, controlled ports/time, isolated configs and reproducible calibration. README records baseline fd7ed425e88d344e1217bf559c0c9b31888ff568, independent picker oracles, caller knowledge and the transfer/shared-seam verdict.
Verification: isolated 48/48 passed; four deliberate defects caused behavioral assertion failures and exact source was restored. Explicit prototype lint (5 files, zero warnings/errors), format and typecheck passed. Full format/lint/typecheck/unit/browser/build check passed: 2910 unit passes plus one prototype-only environment skip, 512 browser passes. Production source, application tests, dependency files and ADR 0002 match baseline.
Updated doc-1 via CLI: bounded H3/H6 support, picker selected but unmigrated, settings and other gaps retained. Appended deferred migration/lifecycle/port limits. No live-room calls or deployment. Implementation is ready for parent-session review; task status and acceptance checks remain for finalization.

Post-review corrections: stop remaining effects when a link port synchronously disposes the caller; add ten caller cases for that batch, arrival-first notifying/closing, late write after timeout/close rejection/retry, notification deadline and normal timer cleanup. Narrow H3 to inbound events; document state-getter-only access, indefinite arrival/close waits, immutable borrowed snapshots and no-throw scheduling/cancellation.
Focused verification only: 41 caller tests passed; eight deliberate mutations failed behavioral assertions and restored code passed all 41 caller tests. Earlier combined-suite and full-project results above are pre-review, not verification of these corrections. The combined inventory is now 58 cases, but the unchanged 17 flow/environment cases and full project checks await the parent rerun.

Final parent verification supersedes the earlier pending results: eight calibrated defects, 58 isolated passes, explicit prototype typecheck/lint/format, root format/lint/typecheck, and 2920 unit passes with one environment-only skip. The normal browser run hit a native Node v26.13.0 V8 crash after 502 passes; a temporary node launcher with --no-turbo-fast-api-calls passed all 512 cases, then default build and the unchanged-production guard passed. No test was weakened or skipped for that crash. Independent follow-up confirmed the disposal fix and VG1 assertions.
AC evidence: README selection rationale (#1), transfer/caller-knowledge tables (#2), shared-seam verdicts (#3), original picker contract plus observable tests and eight calibrated defects (#4), doc-1 H3/H6 and coverage with production migration left to separately approved TASK-61.7 work (#5).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validated navigation separation on an executable link-and-label picker experiment; pure rules transfer, while attempt identity and sequential ports remain flow-specific. Shared machinery is rejected for now; H3/H6 and coverage are updated. Review corrections, 58 isolated checks, eight calibrated defects, 2920 unit cases and 512 browser cases passed; browser verification used a temporary Node fast-API workaround. Production source and tests remain unchanged; live ports, render publication and any production migration remain separate work.
<!-- SECTION:FINAL_SUMMARY:END -->
