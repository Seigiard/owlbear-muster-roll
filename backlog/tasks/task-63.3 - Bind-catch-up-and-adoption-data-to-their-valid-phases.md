---
id: TASK-63.3
title: Bind catch-up and adoption data to their valid phases
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T14:10:00Z'
updated_date: '2026-11-14T22:14:00Z'
labels:
  - architecture
  - state-model
dependencies:
  - TASK-63.2
references:
  - src/replica/catch-up.ts
  - src/replica/catch-up.test.ts
  - src/replica/engine-catch-up.test.ts
  - src/replica/engine-liveness.test.ts
  - src/replica/engine-no-gm.test.ts
  - _bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md
documentation:
  - _bmad-output/specs/spec-explicit-operation-state/SPEC.md
parent_task_id: TASK-63
type: task
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAP-3. TASK-48 already made catch-up, GM liveness, drift and the adoption gate one synchronous decision module. Its current state still separates ownNonce, trigger, adoptionTarget and retry delay from the displayed phase. This final slice encodes their invariants within that existing owner. It is last because ordinary catch-up, incomplete generation adoption, late answers and GM response policy interact; it is not a second extraction from the engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The production state cannot represent live with an active adoption target; initialization is explicit, an active catch-up owns its nonce/trigger, and adoption owns its target and retry state.
- [x] #2 Ordinary timeout can end catch-up; incomplete adoption retries instead, and a failed adoption save leaves adoption open with old data retained under AD-9.
- [x] #3 Late complete answers after an unanswered exit still update GM-answer knowledge; page return preserves an eligible nonce; stale request/read results cannot finish a later catch-up.
- [x] #4 GM link remains an independent dimension; held requests, drift-answer eligibility, digest suppression and GM-return re-request rules retain AD-6/AD-7 behavior.
- [x] #5 The synchronous CatchUp interface and engine ownership of timers, staged records, persistence and replica swap remain intact; existing deterministic and integration checks plus the project full check pass, with before/after invariants and TASK-48 oracle evidence recorded.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refactor only src/replica/catch-up.ts into explicit initialization and phase-owned ordinary/adopting state, with independent GM link and late-answer history.
2. Reuse unchanged deterministic and engine catch-up/liveness/no-GM/import/wipe suites; run TASK-48 M1-M12 before and after, refreshing only source anchors.
3. Run all six project full checks, record invariants and caller knowledge in spec-task-63.3-catch-up-phases.md, then merge into the TASK-63 integration branch for combined review and one auto-merge PR.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CatchUp now has explicit initialization and phase-owned ordinary/adopting state; live cannot carry an adoption target. GM link and late-answer history remain independent. The synchronous interface and engine ownership are unchanged. Verification: focused 172 pass; full unit 3009 pass/1 environment-only DOM skip; browser 520 pass; format/lint/typecheck/build pass; baseline and final M1-M12 controls all killed. Combined review: mixed 6/6, final 2/2, no blocking findings. Future timer exhaustiveness is deferred maintenance polish, not a current behavior gap. Evidence: spec-task-63.3-catch-up-phases.md. PR: https://github.com/Seigiard/owlbear-muster-roll/pull/26.
<!-- SECTION:FINAL_SUMMARY:END -->
