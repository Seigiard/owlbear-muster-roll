---
id: TASK-148
title: Check staged player edits across refusal and GM return
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-20T12:17:00Z'
updated_date: '2026-11-20T13:59:00Z'
labels: []
dependencies:
  - TASK-132
references:
  - formal/edit-delivery
  - .claude/skills/edit-delivery/SKILL.md
  - formal/edit-delivery/broken/ReloadReplayAfterLostAck.cfg
priority: low
type: task
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The two-field EditDelivery gate can stage a command after a sent version, but it keeps the GM live and does not exercise revocation or the fair resend loop. The existing refusal and liveness gates have one field, so their staged batch is empty. This leaves the interaction between staged edits, denial, and GM return unchecked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TLC explores a staged two-field entry when a refusal or revocation arrives, and checks that no edit disappears without an answer or a report.
- [x] #2 A two-field liveness check covers a staged edit as the GM returns and verifies that the pending entry resolves under the stated fairness assumptions.
- [x] #3 The model guide names the bounds and what remains outside them.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify that the model reaches a staged batch at a matching denial, a revoke, and GM return.
2. Add bounded two-field refusal and fair resend checks. Keep the reproduced reload race as an expected failure, per the owner decision.
3. Record the model bounds, counterexample and run times. Run edit-delivery and drift checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
StagedRefusals.cfg checks NoSilentLoss. Reachability probes show that a matching denial and a revoke can arrive while the second field is staged. StagedReturn.cfg checks EntryResolves under weak fairness. A witness stages the second edit before GM absence, loses the proposal sent on return, and has a timer ready for resend with no reply in flight.

Known limit from TASK-119 and AD-4: a lost acknowledgement, a GM correction to the same field, and a reload before resend can replay the original edit along with the staged edit. TLC found the path in 16 transitions. The real replica engine on the mock platform saved str=11 instead of the GM’s str=15 after reload and kept str=15 without reload. The owner kept this as an accepted limit under the one-GM, one-window policy. The expected-failure model config records it. No application code, application tests, or follow-up tasks changed.

Local TLC run: 16 expected results in 101 seconds. The staged refusal and return checks completed in 1 and 7 TLC seconds, with 37,421 and 52,270 distinct states. TLC found the expected reload failure in 2 seconds. formal/drift.sh passed without moving the sync commit; no covered source file changed. The formatter skipped these file types.

The confirming run matched all 16 outcomes in 77 seconds. Both independent reviewers reported no remaining findings after the model guide correction.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added TLC checks for staged two-field edits at refusal or revoke and for queue completion after GM return. Recorded the accepted GM reload replay as an expected failure, with its trace and bounds in the model guide. All 16 configured outcomes matched and the drift check passed. No application files or follow-up tasks changed.
<!-- SECTION:FINAL_SUMMARY:END -->
