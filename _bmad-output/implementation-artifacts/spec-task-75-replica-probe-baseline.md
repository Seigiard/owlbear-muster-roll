---
title: 'TASK-75: Probe and baseline the extracted replica modules'
type: 'chore'
created: '2026-11-15'
status: 'in-review'
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
- [x] `_bmad-output/implementation-artifacts/task-75-verification.md` — record run provenance, per-module counts, every survivor classification and timeout investigation.
- [x] `src/replica/*.test.ts` — add focused behavioral tests for observed gaps; use the existing helpers and calibrate each test against its mutation.
- [x] `tools/mutants/probe-baseline.json` — add only justified remaining survivors and timeouts using stable anchors.
- [x] `backlog/` — record the plan, evidence and final counts through the CLI; create explicit follow-ups only for unresolved gaps.
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
- Implementation chain ended at `3288e735bb8d0fa84d768eda667fc64ac2b85422`, with test lock `885c7f775fe50a063def9081739896cc228dbe6c`, ten of twelve authorized turns. Run directory: `/Users/seigiard/.claude/artifacts/tdd-20261115-task75/TASK-75/`.
- Final complete probe at `377cdde10a620961fcb843dcd1dc280dc95ddb92`: 1089 mutations, 911 killed, 178 survived, no timeouts; actual comparison zero new survivors, zero new timeouts and zero missing entries. All 126 calibrated gaps were killed. Baseline contains 246 entries and preserves the original 68 objects.
- Matrix audit: provenance/classification/comparison rows use the recorded full runner executions and ledger audit; behavioral-gap rows use 126 exact assertion-red/restored-green replays. No new timeout occurred. Existing runner limits and timeout comparison tests remain unchanged. Cleanup/source-preservation evidence covers both complete final runs.
- Final unit evidence: 3271 pass, one environment skip, zero fail; format/lint/types pass. Browser (521 pass) and build evidence is reused because their application/configuration/dependency inputs are unchanged. Closing review remains pending.
- Closing review uses the project's three supplied rubrics rather than the default code-review roster. All three context-free reviewers reported before triage. Review fixes must enter a new TDD batch in the existing run directory. Preserve the accepted tests and controls; add faithful behavioral owners before removing incorrect equivalent entries. Reconcile every affected anchor, its ledger row and its baseline reason. Reuse unchanged browser/build evidence, then run a new complete five-module probe on the corrected committed baseline.

## Spec Change Log

## Review Triage Log

### Closing review round 1

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind B1: cached preset with equal counter and different author | medium | Confirmed independently by verification-gap's exact red/green demonstration. `presetOf` at engine.ts:1008 can return the cached author's data when its author comparator is inverted. Patch: behavioral owner and reclassification. |
| Blind B2: three broadened flushNow guards | medium | `catchUp.closing()` leaves ordinary catch-up even with no pending intent (catch-up.ts:755); verification-gap reproduced the public state change. Patch all three anchors together. |
| Blind B3: retained pendingIds after bounded command-ID eviction | medium | `acceptCommand` uses a bounded ID set; eviction permits the id again. `pendingIdsOf` reuses its stored record id, so deleting/clearing that map is not justified by an impossible-repeat invariant. Patch: exercise admitted retry after eviction and reconcile all related cleanup anchors against actual effects. |
| Blind B4: unsubscribeRoom after stop and newer-format ingress | medium | room-protocol.ts:94-99 invokes onNewerVersion before its stopped check at :105. Engine stop does not stop the publisher/send queue. Patch: observe post-stop notices/messages under the exact unsubscribe mutation. |
| Blind B5: decodedPreset invalidation across generations | medium | snapshot-import.ts:176 creates records at c=1 by the importing author. A new generation can therefore have different preset data with the cached c/a pair; replacement must clear the cache. Patch: generation-replacement owner. |
| Blind B6: invalid held-open target disappears then returns | medium | replaceReplicaRecords calls dropStaleOpen at the moment the target disappears. deliverOpen alone cannot clear the historical request if a later generation restores the same id before any delivery. Patch: bounded request disappearance/reappearance owner. |
| Blind B7: mergePersisted immediate followReplica | medium | mergePersisted synchronously merges the newer storage preset and calls followReplica before catch-up exit. performCaughtUp may wait for remote work; equal final state does not prove equal immediate menu/size. Patch: inspect effects while catch-up is held open. |
| Blind B8: duplicate pending window-size requests | medium | window-size.ts:52-55 sets wantedAgain for a duplicate in-flight size; :38-39 retries on rejection. Repeated apply is not idempotent across an unresolved failure. Patch both engine size-cache anchors using a deferred action port. |
| Blind B9: cancelled proposal composer may return null | medium | proposal-queue.ts:100-109 returns null after drop/clear, including for a player. proposeMessage wraps its argument without validation; both engine OR mutations can send records:[null]. Patch the paced-cancellation mechanism and both anchors. |
| Blind B10: original baseline count test does not compare all objects | low, rejected | The original test also asserted only counts. Its scoped replacement preserves that contract; independent runtime audits prove the original 68 objects/order unchanged. Adding a duplicated immutable fixture is not needed to correct a demonstrated regression in this change. |
| Verification V1: equal-counter different-author preset | medium | Pre-verified: reviewer ran a detached 600x600 to 900x700 same-counter author change, observed assertion-red under the exact comparator mutation and restored green. Patch; same mechanism as B1. |
| Verification V2: flushNow without pending GM commands | medium | Pre-verified: reviewer observed catching-up become live under the >=0 mutation before the answer/deadline; restored code remains catching-up. Patch; same mechanism as B2. |
| Edge E1: winning preset with cached counter and different author | medium | Same verified author-comparator mechanism as B1/V1. Patch, not an additional independent defect. |
| Edge E2: new generation with identical preset counter/author | medium | Same verified cross-generation cache invalidation mechanism as B5; snapshot import resets counters. Patch. |
| Edge E3: flushNow during ordinary catch-up without intents | medium | Same verified closing transition as B2/V2. Patch all three guards. |
| Edge E4: immediate preset effects from storage on re-entry | medium | Same traced synchronous merge/late catch-up-exit distinction as B7. Patch. |
| Edge E5: room-copy read finishes after engine stop | medium | room-copy.ts:604-611 guards a resumed read with its own lifecycle, not options.writable. Omitting roomCopy.stop leaves the read live; same-generation data reaches engine.receiveRecords and persistence without an engine-level stopped check. Patch with a held metadata read and post-stop release. |
| Edge E6: newer-format room ingress after stop | medium | Same verified parser-before-stopped ordering as B4. Patch. |

All retained findings are local verification/classification corrections with no new public surface or gameplay decision. They route to patch. None requires changing the approved frozen intent or reverting sound implementation.

### Confirming review and refinements

- B9 refinement: the inner OR mutation sends a null cancelled proposal and is a calibrated gap. The outer exact mutation is `record === null || stopped && role === 'GM'`; operator precedence preserves the unconditional null guard. Its 0/0 control refutes the broader original claim for that anchor. The corrected equivalent reason is retained.
- B3 matching-site correction: the full probe also killed `engine > dropPendingWork / drop commandRouting.clearPendingIds()`. The first fix inventory omitted that delegating wrapper. An independent replay reaches the existing generation-replacement assertion (`old-free` instead of `fresh`) and restores green. All four cleanup sites are now classified as covered gaps.
- Confirming verification reviewer: no blocking findings after inspecting all 142 red/green records, corrected callers, current baseline and metadata through `31577e85ae03211aca7af30a0d17de08531abde6`.
- Confirming source reviewer C1 — medium, patch: `followParty / if→false / stopped` remains incorrectly equivalent. `party-roster.ts:35-43` can finish its initial read after `stop: unsubscribe` at :84; stop neither cancels the read nor changes its epoch. The resumed `replace` invokes `onReplace`, so the mutated engine guard publishes a changed party header after stop. Add a controlled held-read behavioral owner and exact assertion-red/restored-green control, then reclassify the anchor. No product or production change is needed.
- Verification reuse: the complete native five-module run at `c3e40df7aab4ba85616c06a2d818348f693c8da1` is immutable historical evidence (927 killed, 162 survived, no timeouts). A later targeted control must retain its own revision and result; it must not be relabeled as another full run. Reuse unchanged test/source evidence and rerun the comparison for the revised baseline with explicit provenance.
