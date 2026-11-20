---
id: TASK-148
title: Check staged player edits across refusal and GM return
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-20T12:17:00Z'
updated_date: '2026-11-20T13:32:00Z'
labels: []
dependencies:
  - TASK-132
references:
  - formal/edit-delivery
  - .claude/skills/edit-delivery/SKILL.md
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
- [ ] #1 TLC explores a staged two-field entry when a refusal or revocation arrives, and checks that no edit disappears without an answer or a report.
- [ ] #2 A two-field liveness check covers a staged edit as the GM returns and verifies that the pending entry resolves under the stated fairness assumptions.
- [ ] #3 The model guide names the bounds and what remains outside them.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map refusal and GM return to the current code and verify the model reaches both with later commands staged.
2. Run bounded two-field TLC checks, including fair resend after a reload. Replay any counterexample against the current code and stop if confirmed.
3. Record bounds, traces and run times. Run the edit-delivery gate and drift checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20: Investigation stopped at a reproduced existing GM reload race. TLC failed NoOldCellReplayAfterLostAck in 17 states (3.95 s elapsed, 2 workers); the two-field replay against the real replica engine with the mock platform failed twice after a reload and passed twice without it. The first proposal sets str=11 and its ACK is lost. The GM saves str=15. The player stages note=tired without sending it. The GM reloads, reads the same storage and loses its committed-proposal memory. The resend draws stale, the next proposal includes both str=11 and note=tired, and the GM persists str=11 over str=15. The reload limit was already named in TASK-119 and AD-4. No application or checked-in model files changed.

Scratch proof on this machine: /private/var/folders/mg/mg22yjv17054nxmbq8_jkqnm0000gn/T/opencode/task-148/{StagedReloadReplayAfterLostAck.out,replay.out}. Two-field scratch checks also passed: StagedRefusals (154,854 states, 5.14 s) and StagedReturn (52,270 states, 9.17 s, excludes GM field edits); separate TLC reachability checks found a staged batch before matching denial, revoke and GM return. The current repository gate passed all 13 cases in 52.29 s and formal/drift.sh passed. No acceptance criteria are marked complete pending the owner decision.

Owner policy confirmed by the orchestrator: keep the reload race as a known limit. Finish with model-only checks and one expected failing reload config. Do not change application code or add an application regression test or a follow-up task.
<!-- SECTION:NOTES:END -->
