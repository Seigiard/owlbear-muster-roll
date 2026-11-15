---
title: 'TASK-75: Probe and baseline the extracted replica modules'
type: 'chore'
created: '2026-11-15'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '9a75650128d19072735ce87446eb923344f2d11f'
review_loop_iteration: 0
context:
  - '{project-root}/tools/mutants/README.md'
  - '{project-root}/_bmad-output/implementation-artifacts/task-66-verification.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** TASK-64 extracted replica rules after the original mutation investigation. The extracted modules and the smaller engine have no classified probe baseline. Surviving mutations therefore provide no distinction between known limitations and new test gaps.

**Approach:** Probe `command-routing`, `generation-flow`, `roll-flow`, `room-protocol` and `engine`. Classify each survivor from its reachable behavior. Add calibrated behavioral tests for real gaps. Record equivalent and unreachable survivors, and separately record timeouts, in the existing anchor-based baseline.

## Boundaries & Constraints

**Always:**
- Use the committed probe runner and its two-pass limits. Record the full source revision, invocation, per-module counts and result paths for each complete run.
- Preserve the existing baseline entries for other modules.
- Tie every classification to its full anchor and a one-line reason. A survivor classified as a gap must name its observable failure and independent contract.
- Observe each new regression test fail against the corresponding mutation for the intended assertion, then pass against unmutated code.
- Keep timeouts separate from assertion failures. A timeout does not prove that a test detects the broken behavior.
- Use the established room rig for engine tests. Derive expected results from existing product contracts rather than mutated implementation details.

**Never:**
- Do not change gameplay contracts, weaken tests, or classify an actual gap as equivalent merely to make the comparison green.
- Do not mutate the caller's checkout. Do not deploy or change production configuration.
- Do not extend the baseline schema just to hide deferred gaps. If a gap cannot be closed within this task, create a named follow-up and report any unmet final comparison criterion.
- Do not claim that mock tests prove live Owlbear host behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial inventory | Five selected modules at a recorded revision | Per-module killed, survived and timed-out counts; every surviving anchor available for investigation | A baseline mismatch is expected, not a failed test suite |
| Real gap | Reachable mutation changes a promised result | Behavioral regression test detects that change | Preserve assertion-red evidence and an unmutated green result |
| Equivalent survivor | Mutation preserves observable behavior under valid inputs | Baseline entry with the exact anchor and reason | Reject unsupported equivalence claims |
| Unreachable survivor | Existing caller or input invariant prevents the mutated case | Baseline entry names that invariant | Exercise a reachable positive control where needed |
| Timeout | Mutation exceeds the probe's test limit | Separate timeout verdict and explanation | Investigate before attributing it to the mutation |
| Final comparison | Committed tests and reviewed baseline | Zero new survivors, zero new timeouts, zero missing entries | Report residual gaps instead of disguising them |

</frozen-after-approval>

## Code Map

- `tools/mutants/probe/run.ts` — accepts explicit module names, `--jobs` and `--out`; uses detached worktrees at `HEAD` with an unmutated preflight. The default selects only the three older modules.
- `tools/mutants/probe/baseline.ts` — anchor is `file/fn/op/text/nth`; permitted verdicts are `equivalent`, `unreachable` and `timeout`.
- `tools/mutants/probe-baseline.json` — append classified entries without changing unrelated anchors.
- `src/replica/command-routing.test.ts` — route decisions, batch persistence and replay through `CommandRoutingPorts`.
- `src/replica/generation-flow.test.ts` — storage failures, held imports, supersession and effect ordering through its existing subject helper.
- `src/replica/roll-flow.test.ts` — controlled async dice, fallback, visibility and role/generation changes.
- `src/replica/room-protocol.test.ts` — ingress serialization, sender admission and message handling through real protocol entry points.
- `src/replica/engine-*.test.ts` and `tests/support/room-rig.ts` — engine behavior through rooms, storage, messages and projected state. No `engine.test.ts` exists, so engine mutations use the replica pass directly.

## Tasks & Acceptance

**Execution:**
- [ ] `_bmad-output/implementation-artifacts/task-75-verification.md` — record run provenance, per-module counts, every survivor classification and timeout investigation.
- [ ] `src/replica/*.test.ts` — add focused behavioral tests for observed gaps; use the existing helpers and calibrate each test against its mutation.
- [ ] `tools/mutants/probe-baseline.json` — add only justified remaining survivors and timeouts using stable anchors.
- [ ] `backlog/` — record the plan, evidence and final counts through the CLI; create explicit follow-ups only for unresolved gaps.
- [ ] Repeat the five-module probe on the committed final tests and baseline; run the required changed-path checks and closing review.

**Acceptance Criteria:**
- Given the five named modules, when the initial probe completes, then the task notes record killed, survived and timed-out counts separately for each module.
- Given its survivor inventory, when classification is complete, then every anchor has a verdict and reason; each real gap has a calibrated test or named follow-up.
- Given the final committed state, when the five-module probe runs, then its comparison reports zero new survivors, zero new timeouts and zero missing entries.
- Given probe completion or failure, when cleanup finishes, then the caller's source files are unchanged by the runner and its temporary worktrees are removed.

## Verification

- `bun run probe command-routing generation-flow roll-flow room-protocol engine --jobs 6 --out <absolute-results-path>` — initial inventory, then final baseline comparison. Preserve complete results outside the tracked source tree.
- Focused Bun tests and targeted mutation reruns — verify actual assertion-red/green behavior, not merely a nonzero process exit.
- Full changed-path check set from `CLAUDE.md` — format, lint, typecheck, unit tests, browser tests and build for source, test or tool changes.
- Backlog CLI views, `backlog doctor`, applicable formatting and whitespace checks — verify task records and documentation.

## Implementation Notes

- The user approved this specification and continuation in this session on 2026-11-15.
- This is the implementation handoff of an already-running `bmad-build`; do not restart its planning workflow. Execute the implementation through `tdd` on the current branch, with TASK-75 as the ticket name, and return its run directory and evidence. Begin with the probe inventory; derive test criteria only from observed survivors and existing contracts.

## Spec Change Log

## Review Triage Log
