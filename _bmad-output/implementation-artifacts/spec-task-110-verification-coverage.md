---
title: 'TASK-110: Runnable UI verification and missing cross-feature journeys'
type: 'chore'
created: '2026-11-18'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

The user needs verification that covers the existing application rather than
one demonstration route. Audit the current v4 browser tests, add only confirmed
missing user journeys, and make the existing suite callable through quick,
feature and full profiles with retained evidence and explicit incomplete runs.

Keep the existing Playwright mock adapter boundary. Add three contract-backed
browser journeys: import the actual downloaded snapshot and verify restored
values after restarting both room pages; move a populated repeat section
between tabs through a preset upload without losing blocks; keep a selected
`d1` working after a preset removes that option and both pages restart.
Tag those journeys `@verify-quick`. Expected UI values are literals from the
user's actions and documented format contract, not reconstructed by production
helpers. Existing fixtures may establish preconditions, not replace the action
under proof.

Expose `bun run verify quick`, `bun run verify full`, and named feature
profiles. Full means every discovered browser spec, including any failures.
Unknown profiles and zero selected tests fail. Retain Playwright JSON, traces,
screenshots and run metadata in a unique ignored evidence directory. A run
with skipped or flaky tests must not claim complete success. The skill maps
every existing browser spec to a feature group and states the mock/live boundary.

Do not change app behavior, port the unaccepted builder candidate, fix TASK-109,
weaken existing assertions or add unrelated multi-GM and race scenarios.
Builder fallback is a confirmed gap but stays explicitly uncovered until its
owner's pending implementation is accepted. No original shared checkout edits,
deployment or live-room mutations.

</frozen-after-approval>

## Implementation Notes

- Base is `418bd5e70705403baf5c1921321f0ac37bc35b35`, not the worktree creator's
  default v3 commit. The accidental v3 run was interrupted and is not evidence.
- Baseline v4 typecheck passed. Playwright discovered 579 tests in 46 files.
- Three read-only audits inspected harness and coverage. A fresh audit on the
  correct v4 base confirmed the selected gaps against `docs/preset-format.md`,
  `tests/snapshot.e2e.ts`, `tests/tabs.e2e.ts` and
  `tests/dice-choice-field.e2e.ts`.
- Footprint is three test files, the package script, one CLI and one Playwright
  configuration, plus the verification skill and map. Budget is 40 minutes.
- The CLI data shape is a profile-to-Playwright-arguments registry. Playwright
  remains the test owner and report producer; no second browser framework.
- Blocking first steps are exact-base verification, fixture audit and oracle
  declaration. They are complete before implementation.
- Independent workstreams are test additions, CLI/configuration and skill map.
  Each code-writing worker has its own worktree. Shared browser suites run
  serially per checkout. Evidence directories are unique per invocation.
- Smallest safe decomposition is two code workers and one documentation owner.
  No app modules or public domain signatures change.
- Verification durations: targeted quick journeys 2 minutes; runner list/error
  paths 1 minute; format/lint/typecheck/Bun tests/build 3 minutes total; full
  browser suite approximately 10 minutes. No mutation probe is planned.
- The complete baseline v4 browser run passed 579 tests with zero skipped,
  failed or flaky results. Evidence is
  `/private/var/folders/mg/mg22yjv17054nxmbq8_jkqnm0000gn/T/opencode/verify-coverage-110/v4-baseline.json`.
  Its revision is the exact base named above. Baseline build, typecheck,
  formatting and lint also passed. Lint emitted existing warnings.
- Baseline Bun tests completed with 3432 passing tests, one existing skipped
  test and zero failures across 141 files. The log is
  `/private/var/folders/mg/mg22yjv17054nxmbq8_jkqnm0000gn/T/opencode/verify-coverage-110/unit.log`.
- The feature map now names all 46 existing browser specs. A path comparison
  confirmed that no discovered spec is absent from the index. Eight feature
  pages retain user entry points, concrete locators and observable outcomes.
- Integrated the test-only child commit as
  `01d1793559e286e8dd523694bfd259d9116fcce9` and the CLI/config child commit as
  `3708fe157404f72004a1e54d09cfdbef010dac1e`. No production app file changed.
- `bun run verify quick --list` selects exactly three new tests in three
  files. Unknown profiles exit 2. Running `quick` in the isolated runner-only
  branch, which has no tagged tests, exits 1 with an explicit incomplete
  report instead of success.
- Final browser metadata at `test-results/verify/full-T2R8xX/metadata.json`
  records the integrated code revision above. Its dirty paths are only
  documentation, task metadata and the local audit files.
- Formatting, typecheck and lint passed again after integration. The earlier
  Bun and build results remain applicable because their app inputs and
  dependencies did not change.
- Independent review found two discriminating-precondition gaps. The dice
  journey must prove that `d1` is a disabled stale option after restart, and
  the snapshot journey must prove changed values and block absence before
  restoration. These are test fixes, not app changes.
- Feature profiles intentionally group spec files. The skill now names the
  additional profiles required for cross-feature preset and dice-choice
  changes instead of implying that one file group covers every dependency.
- The new tests characterize existing behavior and have passed, but deliberate
  defect-injection calibration has not run. Neither regression calibration nor
  a mutation-probe result is claimed.
- The first integrated `bun run verify full` passed 582 tests with zero
  skipped, failed or flaky results. `full-T2R8xX` retains 582 traces and the
  actual downloaded snapshot after runner cleanup. Its `cleanup.json` records
  that the owned server port 16568 no longer listened after exit.
- Integrated stronger preconditions and evidence capture as
  `f6a6991a218272b82ad90bb521b69742b0990e01`. Source-only cleanup commit
  `9fedceb80b8cfdff007e539ffc20db73d510569f` removes lint suppressions through independent parallel file copies
  and closes the child even if process-metadata recording fails.
- Fresh independent review found no remaining blocking issue in those fixes.
  Reviewer agents inherited GPT-6.1 Sol; model diversity was not established.
- The final run is `test-results/verify/full-H7lPcX`. Its metadata records
  `f6a6991a218272b82ad90bb521b69742b0990e01` plus the saved tracked diff that
  became `9fedceb80b8cfdff007e539ffc20db73d510569f`. Its untracked input snapshot includes the skill, spec and
  task state as they stood at launch.
- The final run passed all 582 browser tests, with zero failed, skipped or
  flaky results and no global runner errors. Cleanup checked both recorded
  PIDs and the checkout's server port; both processes exited and port 16568
  closed. The evidence retains 582 traces, the actual snapshot download,
  `process.json`, `metadata.json`, the binary diff and untracked inputs.
- All accepted review findings are resolved. Native builder fallback and real
  Owlbear host behavior remain explicit coverage limits; no production fix
  or candidate integration was attempted.

## Review Triage Log

- Medium, patch: snapshot edits need an observed changed state before import.
  Add UI precondition assertions after reopening the sheet.
- Low, patch: restore a removed repeat block as well as its values to support
  the journey's block-restoration claim.
- Medium, patch: d1 values and rolls alone cannot rule out the old preset.
  Assert the stale option is disabled after restart.
- Low, patch: file-group profiles need explicit cross-feature commands.
  Add those commands to the skill and feature pages.
- Medium, patch: HEAD plus dirty filenames cannot reconstruct a dirty run.
  Save its tracked diff and untracked file contents with the evidence.
- Low, patch: cleanup refers to recorded process ownership not yet saved.
  Record launcher and child process details and explain ownership comparison.
- Low, patch by disclosure: green characterization tests are not a deliberate
  regression calibration. State that limit in the spec and map.
- False as a baseline-data claim: the baseline JSON proves all reported test
  counts. Server closure was checked separately through the owned port, not
  inferred from JSON. Add the final cleanup observation to the decision log.
- No comment findings: only nine required test-phase markers were added.
  Nothing was deleted or restored, and no HOLD comment remains.
