---
title: 'Close the replica test gaps found by the mutation probe'
type: 'bugfix'
created: '2026-11-15'
status: 'done'
baseline_commit: '476e8f0284f103d092c1b7363a56393e1433a617'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The probe found 82 test gaps across catch-up, room-copy and window-publisher. An answer timer can lose a player's request during catch-up. A restart can leave an open window on its previous engine's records.

**Approach:** Complete TASK-66.1–66.4 through regression tests, mutation controls and both fixes. Repeat the probe and account for every survivor.

## Boundaries & Constraints

**Always:** Use Backlog tasks and probe scenarios as scope and evidence. Preserve AD-6/AD-7/AD-9, answer suppression, serialized writes, pending-overlay visibility and message-size limits. Explain each equivalent or unreachable survivor.

**Never:** Count setup failures as behavioral mutation evidence, weaken tests to hide defects, or deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Answer crosses ordinary catch-up | Live GM arms answer; timer fires during page-return catch-up | Re-arm on exit through held-request delay | An observed answer suppresses it |
| Incomplete generation | Armed timer fires during adoption | No state answer | Keep AD-9 adoption open |
| Routine write blocks import | Hold write; import waits; stop or schedule rerun | Import completes after stop; writes never overlap | Use an external hang timeout |
| Import verification fails | Read-back throws or finds a lower copy | Resolve with failure; remove only lower copy; update sizes and publisher signal | No uncaught read failure |
| Exact metadata limit | Routine or import write measures 15500 bytes | Save succeeds | Preserve over-limit rejection |
| Restart before any projection | Replace replica; restart; publish | One record-free delta under new engine id; old window requests projection | Later unchanged publishes stay silent |
| Projection delivery and capacity | Repeated nonce, oversized pending, large counters | Retry after completion; apply pending visibility; parts below 15000 bytes | Unsplit content sends nothing and logs |

</frozen-after-approval>

## Code Map

- `src/replica/catch-up.ts`: `fired(answer)` discards requests that `leave` cannot drain. Reuse bounded holding and the synchronous decisions.
- `src/replica/catch-up.test.ts`: deterministic harness; set a nonzero clock for drift.
- `src/replica/room-copy.test.ts`: `createSubject` already provides gated metadata, held writes, scheduling and read failures.
- `src/replica/window-publisher.ts`: `restartPending = hadProjection` loses the required cue. Preserve the comparison after the cue.
- `src/replica/window-publisher.test.ts`: publisher harness, real client and projection store.
- `src/replica/engine-client.test.ts`, `src/replica/engine.ts`, `tests/support/room-rig.ts`: old-window/replacement integration.
- `tools/mutants/*.json`: source-editing controls require clean targets.
- Probe document: cluster inventory, survivor classifications and generator.

## Tasks & Acceptance

**Execution:**

- [x] TASK-66.1: catch-up source, tests and controls above — lock reproduction, retain held request, protect suppression and AD-9.
- [x] TASK-66.2: room-copy tests and controls — cover clusters A–I.
- [x] TASK-66.3, after 66.1: catch-up tests and controls — cover clusters A–H without duplicating 66.1.
- [x] TASK-66.4: publisher source, tests, controls and engine-client test — cover clusters A–F and implement the agreed cue. Replace `stays silent after a restart with no earlier projection`; state the contract change in the commit.
- [x] `backlog/` and this spec — record outcomes, evidence and reclassification reasons through the CLI.

**Acceptance Criteria:**

- Given each probe gap, when replayed, then a behavior assertion fails or a task explains reclassification.
- Given both defects, when regression tests run before and after fixes, then the reported behavior goes red to green.
- Given integration, when all three control suites run, then zero mutants survive or are stale.
- Given the final modules, when both probe passes repeat, then every survivor is explicitly equivalent or unreachable.
- Given these results, when finalized, then all subtasks and TASK-66 are Done.

## Implementation Notes

- Approved by the owner on 2026-11-15: continue implementation in this session.
- This is the implementation handoff for `/implement-spec 66`, already planned through bmad-build. Execute the `implement-spec` task graph with a `tdd` chain per ticket; keep test and production writing delegated to separate children.
- Integration checkout: the current worktree, branch `implement-spec-66`. Caller run directory: `/Users/seigiard/.claude/artifacts/implement-spec-66-20261115-093432/`; use its `66.1/` through `66.4/` directories for ticket chains. Exploration evidence is `exploration.report.md` there.
- Parent `t2p5` owns the one closing `code-review`, final acceptance audit and publication. Do not run per-ticket reviews, push, open a PR, deploy or re-enter bmad planning. Report any stopped chain to the parent immediately, with diagnosis and run directory, while preserving its evidence.
- Publish an atomic internal `implementation.report.md` in the caller run directory. Include full git revisions, ticket branches and merges, test locks, oracle and calibration outcomes, check commands and evidence, matrix-to-test mapping, probe results and outstanding work. Send the path with `hc send t2p5` when done or blocked.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence and route |
|---|---|---|
| Blind 1: shared metadata-size oracle | low / patch, fixed | Corrected in `44e21453d8146c43ca38e36bdeb24e7bfa2f7a13`: both equality cases independently measure actual UTF-8 JSON. A biased helper passed the old owners but fails the new ones; both equality comparator controls remain assertion-red. |
| Blind 2: observer startup consumes deadline | maybe-false / reject | All three current fixtures completed in about 50–62 ms under integrated parallel load; no slow-start failure was observed. A readiness protocol would add states for a hypothetical CI condition. Revisit with a failing startup trace. |
| Blind 3: process exit can outlive deadline | false / reject | The fixture never closes stdout early, traps no termination signal and spawns no descendants. EOF follows process exit; timeout cleanup terminates the sole Bun process. All five starvation controls reached parent assertion-red and reaped the child. The proposed surviving-process path is not present. |
| Blind 4: unread stderr pipe | low / defer | Failure diagnostics are less useful because the parent reports only exit status. No fixture emits enough stderr to block, and termination remains external. Keep stderr capture as a test-harness diagnostic improvement, not a demonstrated hang. |
| Blind 5: PATH-selected Bun | maybe-false / reject | No differing child runtime was observed; the project and all saved commands resolve Bun through the same PATH. A mismatched-runtime trace would establish the proposed failure. |
| Blind 6: spy restore after assertion | low / defer | The existing publisher tests already use this restore pattern. New cases follow it; a failed non-bailing run can retain a spy and obscure later logging diagnostics. A module-wide cleanup policy is a pre-existing test-harness improvement. |
| Blind 7: restart assertion filters projections | false / reject | This harness opens no client. `publish()` has only `sendDelta` paths and cannot emit a projection; `restart()` sends nothing. No discarded projection can occur in this scenario. |
| Blind 8: replacement setup not explicitly asserted | false / reject | The current setup opens no new window/request after engine-1 stops; snapshot-check emits a command response, not a projection. The faithful unconditional-cue control reached red at the replacement regression, proving the current setup exercises the pre-projection case. A future fixture change is not a present masking path. |
| Blind 9: portable per-gap calibration table | low / defer | All 82 original IDs have accepted saved calibration evidence or D's explicit reclassification; the verification note summarizes ticket clusters and every final survivor. A single expanded ID-to-owner table would improve navigation, but no missing or unmatched ID was identified. |
| Blind 10: local detailed probe evidence | low / defer | The repository retains the generator, fixed revisions, counts, and every surviving anchor/reason. Detailed transient logs remain local. A portable raw-run bundle would improve independent inspection; no existing acceptance condition requires committing process logs or tooling installations. |
| Edge 1: oversized party header in restart cue | maybe-false / defer | The constructed 100 long-name party can exceed the message cap with an empty payload. The same unbounded-header path existed for projected restarts and record-free change cues before this change; `splitParts` bypasses splitting when both arrays are empty. Actual Owlbear rejection and this party occurrence were not observed. Record the pre-existing header-limit question without widening startup or transport production code. |
| Verification Gap Reviewer | complete | No verification gaps found. |

The contained final round confirmed the correction with three fresh read-only
reviewers. No blocking critical/major defect or verification gap remained.
Earlier rejected and deferred dispositions are carried unchanged. This final
round checks fixes and blockers, not new minor polish.

## Design Notes

Run sequentially: 66.1, 66.2, 66.3, 66.4. Only 66.3 formally depends on 66.1. Use separate worktrees and test locks; merge successful chains into `implement-spec-66` with `--no-ff`. Run one closing review.

Run the generator with isolated TypeScript 5 in a disposable clean checkout. Correlate changed mutant ids by module, operation and source anchor. Measure progress; full-probe duration is not yet known.

## Verification

- Per ticket: module suite, relevant engine suites, committed controls; tie output to revisions.
- Integration: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.
- Probe: unit pass, then `src/replica/` for survivors; investigate timeouts and setup failures.
- Backlog: task read-back, `backlog doctor`, touched-path formatting and `git diff --check`.
- Mock checks do not prove the Owlbear host's background-restart lifecycle.
- Integration evidence and matrix-to-executed-test audit:
  [TASK-66 verification](task-66-verification.md). The clean integration
  `ab010576183cdce13d3dae4db627da284786075d` passed all listed checks: 3089 unit
  tests, 1 skip, 521 browser tests, and 53 controls killed with none survived or
  stale. The matrix owners all executed and passed.
- Final publisher probe: 118 mutants, 108 killed, 10 equivalent/unreachable
  survivors. Original D is explicitly reclassified under the approved cue
  contract. Catch-up replica pass: 12 more killed, 23 equivalent/unreachable
  survivors. Room-copy replica pass: 13 more killed, 32 equivalent/unreachable
  survivors. Across both passes: 720 test failures, 65 classified survivors and
  3 separately recorded timeouts. Closing review is complete after one test-only
  oracle correction and its confirming round.
- Post-review integration `44e21453d8146c43ca38e36bdeb24e7bfa2f7a13` passed
  format, lint, typecheck, 3089 unit tests (1 skip), all 53 mutation controls,
  the full 521-test browser recheck and build. One prior browser focus failure
  did not recur in ten exact-scenario repeats or the full recheck; its cause
  remains unverified and its original evidence is retained.
- Fresh post-review publisher replica outcomes match all ten classified
  survivors. Catch-up's 35 replica rows and room-copy's 334 unit / 45 replica
  rows also exactly match the earlier source-anchor/outcome records.
- Final acceptance: all 65 survivors are classified, the three timeouts remain
  separate, the matrix audit and closing review are complete, and Backlog
  TASK-66 plus all four subtasks are Done. No push or deployment.
