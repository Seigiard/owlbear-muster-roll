---
title: 'TASK-77: Preset format v4'
type: 'feature'
created: '2026-11-16'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '650e9e5517c08f840a223c79a79944e74602b6cf'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Format v3 makes naming, repetition and token links depend on special cases.

**Approach:** Implement story 9: one node registry for the v4 tree, explicit repeat identities and names, row objects, token cells and inherited visibility.

## Boundaries & Constraints

**Always:** Follow the companion contract. Templates use `repeat: {nameField}`; sections/rows use `{id,nameField}`. Cells retain `kind`; template `kind`, `tokens` and array rows disappear. Allow `players: "edit"` on any template. Preserve per-cell merge, lifecycle, clear markers, transport bounds and Builder's shared renderer.

**Never:** No converter, deployment, repeat tabs or nested block scopes. Temporarily reject the latter two by rules, not schema. Sheet sets may contain repeat sections/rows. Full Builder controls remain TASK-80; adapt existing operations without losing v4 properties.

## I/O & Edge-Case Matrix

| Input / state | Required result |
|---|---|
| Valid v4 / v1–3 preset or snapshot | Accept v4; refuse older files without writes |
| Duplicate id in a scope; invalid nameField; tab repeat; nested block repeat | Reject at the Builder item with the upload's reason |
| First field moves; nameField changes; plain rows move | Stable repeat.id keeps blocks; names follow nameField; plain values stay |
| Repeat section or row | Independent blocks per sheet; row blocks contain one row; duplicate numbers use nameField |
| Several token cells, including root and block cells | GM icon/status/menu per cell; player renders nothing; links target sheet, block path and cell |
| Token opens / map selection changes | Open correct tab and scroll to cell; selection marks do not navigate |
| Token label | Nearest available block name, section title, sheet name or template title |
| Hidden section or row | No player display, edit or token opening; rolls reach GMs only |
| Upload changes repeat.id, toggles repeat, removes fields or token cells | Apply contract loss rules with one confirmation; count values and sheets, not links; cancel changes nothing |

**Decision:** Linking lists all scene tokens, marks existing links and permits reassignment to this cell. Prefer: on-screen unlinked, off-screen unlinked, on-screen linked, off-screen linked. Screen means the client's map viewport; ranking is best-effort. Keep token-menu linking.

**Decision:** Unlinking lets the GM choose one or several of this cell's linked tokens. Preserve other links and map tokens.

</frozen-after-approval>

## Code Map

- `src/core/preset.ts`, `format-version.ts`: structure, traversal, resolution and shared upload/Builder checks.
- `src/core/sheets.ts`, `sheet-values.ts`, `formula-rename.ts`, `formula-evaluate.ts`, `repeat-block-duplicate.ts`: identity, scopes and names.
- `src/core/visibility.ts`, `access.ts`, `field-patch.ts`, `token-links.ts`, `link-target.ts`, `token-selection.ts`: policy, per-field admission and targets.
- `src/core/records.ts`, `snapshot-file.ts`, `snapshot-import.ts`, `preset-migrate.ts`: link payloads, file boundaries and upload losses; reuse block keys.
- `src/replica/composers.ts`, `pending-edits.ts`, `roll-flow.ts`, `engine.ts`, `src/core/ui-messages.ts`: commands, replay, roll visibility and cell opening.
- `src/ui/sheet/`, `src/ui/main.tsx`, `src/ui/navigation.ts`, `src/ui/shell/sidebar-entries.ts`, `src/ui/picker/`: rendering, navigation and token actions.
- `src/builder/`, `src/preview/sample-records.ts`: document conversion, existing forms/tree, problems, preview records and reconciliation.
- `src/platform/ports.ts`, `src/platform/{obr,mock}/index.ts`: token lists/viewport. SDK 3.1.0 provides viewport transforms and item bounds.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/preset.ts`, new `src/core/preset-registry.ts` — strict per-kind keys/children; separate id, nameField, formula, width and temporary rules with paths.
- [ ] Mapped core naming/policy modules — remove first-field and template-kind assumptions; support repeat rows, player-editable sets and inherited visibility.
- [ ] Mapped record/file/migration modules — v4 files, `{s,path?,c}` links, stable scopes and loss counts.
- [ ] Mapped replica and UI modules plus `src/copy.ts` — wire scoped commands, GM token-cell menus, ancestor labels, cell opening, selection and GM-only rolls.
- [ ] Mapped platform adapters and `src/ui/picker/` — reverse picker; fall back to unlinked-first sorting if viewport reads fail.
- [ ] `src/builder/`, `src/preview/sample-records.ts` — lossless conversion, valid defaults, operations, renames, problems and records.
- [ ] `src/{core,replica,builder}/*.test.ts`, `tests/*.e2e.ts`, `tests/support/` — port fixtures and protect matrix outcomes.
- [ ] `docs/preset-format.md`, `docs/example-preset.json`, `presets/*.json`, `tests/fixtures/presets/*.json`, `GLOSSARY.md` — publish v4; add Repeat scope, Block, Token cell; retire Linkable; widen Repeat section.
- [ ] `_bmad-output/specs/spec-muster-roll/storage-and-sync.md` and `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md` — replace transitional v3 preset/link/visibility rules; preserve unrelated decisions.

**Acceptance Criteria:**
- Given supported v4 files, when room and Builder exchange preset and snapshot, then structure, values and applicable token links survive.
- Given the updated examples, when the preset parse tests run, then every example passes the same validator as uploads.
- Given two clients editing different cells of one block, when v4 commands sync and reload, then both values remain.

## Design Notes

Field/token ids belong to their block scope; repeat ids belong to the parent. Template repetition adds no block-path pair. Remove field-matching repeat relocation: changed scope ids erase blocks. Preserve invalid editing states and undo; forms stay hand-written. Distinguish equal picker targets by location/cell id without changing offered token labels.

## Verification

Declare independent oracles before test edits; calibrate red then green. No broad mutation sweep. Run `CLAUDE.md`'s full checks, the example parse test, Backlog read/doctor and diff checks. Preserve the size workload/margin. Mock tests do not prove Owlbear behavior.

## Implementation Notes

- Approved for implementation in this session on 2026-11-16. Implementation budget: 45 minutes. At 90 minutes, stop at the next checkpoint and report completed and remaining work to the parent for a continue/split/keep-partial decision. This budget includes delegated implementation work.
- The first run stopped incomplete at its child budget checkpoint. HEAD `cdfe12d96db251add3ef56e3b767612f42b41306` locks nine new tests; production work remains staged and unstaged. Lint/build and the nine focused tests passed; typecheck had 654 test/fixture diagnostics, preset tests had 44 passes/189 failures, and formatting failed on `src/ui/shell/sidebar-entries.ts`. Browser, calibration and review are incomplete. Do not treat the partial work as merge-ready.
- On 2026-11-16 the user chose bounded continuation phases. The current phase starts at `2026-11-16T17:06:43Z`, with a 30-minute budget shared by all children. Finish cell-target tab/scroll navigation, descendant roll visibility and token behavior (names, independent cells, reverse picker ordering, reassignment and selective unlink), using focused behavioral checks. Stop and report on completion, or at the next checkpoint when `17:36:43Z` is reached, even if incomplete. Do not start the old-fixture/example conversion, documentation or full-suite phases, or extend this phase without a new parent/user decision. The complete feature still requires all original checks before merge.
- Resume the existing implementation chain and preserve its locked tests and all partial production work. The prior report and matrix audit are under `/Users/seigiard/.claude/artifacts/tdd-20261116-164705/task-77/`. Its idle children are `t3kv` (test writer) and `t3kw` (implementer); continuation ownership is now authorized.
- The bounded phase stopped partial at `17:36:43Z`. Open requests now carry path/cellId, reveal uses scoped token-cell anchors, roll admission checks section/row visibility, and the reverse picker uses live-link state and native viewport transforms. Thirteen focused tests and targeted lint/format/diff checks passed; full typecheck still fails on old tests/fixtures. Ancestor label fallback, rendered navigation/scroll, selection without navigation, positive GM hidden-roll delivery and viewport-failure fallback remain incomplete or unproven. No old-fixture conversion, documentation or full-suite phase started. Test-only HEAD: `149da346b6bf7e6c23efe1de99cc30cb8b9ee3ff`. Production remains uncommitted. Both children are idle; do not resume without a new user phase decision. Evidence: `phase-2-summary.md` and `phase-2-final.patch` in the prior report directory.
- The user authorized phase 3 after the phase-2 report. This phase starts at `2026-11-16T17:40:35Z`; its shared 30-minute budget ends at `18:10:35Z`. Complete ancestor-name fallback and focused evidence for rendered tab/scroll with root/block cell-id reuse, selection marks without navigation, positive GM-only hidden-roll delivery, and viewport-read failure fallback. Observe consumer interfaces, not internal spies; read the current `~/.claude/shared/testing.md` before test work, as its interface and mocking rules changed during this run. Reuse the existing chain/children and preserve prior work. Stop on completion or at the next checkpoint at the budget end, reporting calibrated versus uncalibrated evidence explicitly. Do not start old-fixture/example conversion, documentation, full-suite work or production commits. Any further phase requires another user decision.
- Phase 3 stopped at its budget end. Ancestor labels now fall back through nonblank block/section/sheet/template names; a missing-template `ReferenceError` for an unnamed sheet-set sheet was also fixed. Evidence includes 16 focused unit passes and two Playwright passes; the final localized correction passed its two focused owners and targeted lint/format. Four consumer regressions were calibrated red/green: rendered cell reveal, selection without tab navigation, GM/player hidden-roll delivery, and viewport-read failure fallback. Exact dirty-state restoration was verified. The new unnamed-sheet regression itself was observed only green; a separate public-interface control reproduced the pre-fix exception and post-fix template name. No broad-suite or merge-readiness claim follows. Test-only HEAD remains `5e20e6328f5a12ec9ec0040bdff589274bca12e3`; production is uncommitted, both children idle. Evidence: `calibrate-phase-3.report.md`, `implementer-phase-3.report.md`, `phase-3-final.patch` in the report directory. Old fixtures/examples, documentation, full checks and review remain for later authorized phases.
- The user authorized phase 4: port existing tests, fixtures and published JSON examples to v4, then resolve typecheck diagnostics and run focused owner tests. Shared budget: `2026-11-16T18:27:04Z` through `18:57:04Z`. Follow the current testing rules' per-contract port policy: declare one independent oracle and calibrate its owner once for a mechanical shape port; a changed behavioral expectation leaves that port and needs its own contract/oracle. Preserve intentional older-version refusal fixtures, previous locked tests, literal behavioral outcomes and the size workload/margin. Do not add a compatibility shim that makes v3 fixtures silently acceptable. Report genuine production defects instead of weakening assertions. Preserve all existing production work. Stop on completion or at the next checkpoint at the budget end. Do not start prose documentation, full-suite/browser-wide checks, final review or production commits during this phase. Report remaining errors and the exact checks run before awaiting another decision.
- Phase 4 stopped partial. Four published JSON/examples and five old test files were ported; source, index and locked paths were preserved. Published-file acceptance passed 9/9 with natural red/green evidence. Four bounded Builder/preview/UI owners passed 24/24 but remain uncalibrated. The full preset owner reached 201 passes/32 failures; typecheck still reports 629 diagnostics across 62 files. The remaining preset failures are provisionally 17 incomplete ports, 14 changed-contract cases and one unassessed `v: 1e16` classification mismatch; no production-defect verdict follows yet. Seven type diagnostics also occur in earlier locked tests and need the chain's explicit test-writer revision/relock process, not silent implementation edits. No commits or later phase work occurred. Both children are idle. Evidence and preserved patches: `test-writer-phase-4.report.md`, `phase-4-final.patch`, `phase-4-port.patch` in the report directory.
- The user now authorized two sequential steps **without an intermediate approval stop**: first resolve the 32 preset-owner failures, then port the remaining tests/fixtures and clear typecheck. This supersedes the previous one-phase-at-a-time stop for these two steps only. Step 1 starts at `2026-11-16T18:55:50Z`, with a shared 30-minute estimate (double-estimate checkpoint `19:55:50Z`). Classify every red against the approved v4 contract, complete mechanical ports, give changed-contract cases independent literal oracles, and investigate the `1e16` classification rather than changing the expected result to match code. Fix a demonstrated in-scope production defect if needed. Once the preset owner is green, proceed directly to step 2 without asking the user.
- Step 2 has a shared 60-minute estimate starting when step 1 completes; record that timestamp and enforce its double-estimate checkpoint across all children. Port the remaining test/helper fixtures, including typed browser fixtures, directly to v4 and fix their types without suppressions or compatibility shims. For earlier locked tests with type errors, have the test writer explicitly revise and relock the necessary shape/type changes; implementation may not silently alter their assertions. Preserve intentional old-version rejection cases, literal behavior, published examples and the size workload/margin. Use per-contract port oracles/owner calibration, focused tests and typecheck; no broad mutation sweep. Report any behavior that cannot be reconciled without a new product decision.
- Resume the existing chain and preserve all dirty/staged work. For these two steps, estimates are not automatic 30/60-minute cancellation deadlines: stop and seek a decision only for a genuine blocker, a required human decision, or when a step reaches twice its estimate. Do not reset a step budget for retries or subordinate handoffs. After both steps, stop with one combined report of exact checks, calibration status and remaining failures. Prose documentation, full browser/unit suite, final review and production commits remain outside these two steps.
- Both sequential steps completed before the second-step checkpoint. Step 1 finished at `19:13:34Z`; step 2 began immediately. Production fixes cover integer-version classification (`1e16`), nearest repeat-scope lookup, empty-tab Builder drafts, player-editable sheet sets and instance-specific link rejection reasons. Remaining test/helper/browser fixture ports are committed; production and published JSON remain dirty. Latest test-only HEAD: `cb11c58b2e4723cd90b133ebe02d87b29287ba6c`.
- Final focused evidence: typecheck exit 0; preset plus two regression owners 237/237; named core owners 1136/1136; replica owners 885/885; Builder/preview 114/114; UI 96/96; five Playwright files 66/66. These groups overlap and must not be summed. Targeted lint/format and both diff checks passed. The size workload remains unchanged: 11750 bytes, 3750-byte margin. Six specific consumer regressions were calibrated; the merge red occurred during the wait for literal client values, not at the later exact-record assertion. A Builder visibility false-green was explicitly revised/relocked and then observed red/green. Other green cases are not claimed calibrated.
- The combined report and exact commands/logs are published at `https://reports.1218217.xyz/reports/owlbear-muster-roll/20261116T210327Z-3b36b94a/index.html`; local evidence and `two-step-final.patch` remain in the report directory. Thirty-one changed browser owners have not run. Full unit/browser suites, build, prose/glossary/architecture updates and final review remain incomplete; no feature/merge-readiness claim or production commit. Both child agents are idle.
- The user explicitly instructed: "так заканчивай". Finish the complete approved task without further phase-approval stops. The previous scope exclusions for prose documentation/full checks no longer apply. Finish every remaining implementation task: user-facing preset documentation, canonical companion consistency, glossary and architecture updates; run all changed-path mandatory checks (`oxfmt`, lint, typecheck, full Bun suite, full browser suite, build), the example parse owner, Backlog and diff checks. Fix demonstrated in-scope failures through the existing chain without weakening tests or changing frozen intent. No broad mutation sweep, push or deployment.
- Completion implementation/checks budget starts at `2026-11-16T21:08:48Z`: 45-minute estimate shared by all children, double-estimate checkpoint `22:38:48Z`. Do not stop merely at the estimate or between internal steps; report only a genuine blocker, required human decision, the double-budget checkpoint, or completed implementation with full verification evidence. The parent will then audit the full diff/matrix and run the bmad-build review step (separate 20-minute review estimate), fix its findings and finalize commits/Backlog status. Do not pre-empt the parent's review/finalization or claim feature completion. Preserve all existing work and evidence; return exact full-suite counts, skipped cases, matrix-owner mapping and unresolved external/live-Owlbear limits.
- The user requested checking the current `tdd` and `code-review` skills. The parent read both installed skills plus the tdd dispatch/recovery/role briefs and verified `git diff --exit-code <canonical lock SHA> -- <110 locked paths>` exits 0. Apply those current skills to continuation; this is an alignment, not a new batch or budget reset. Reconcile criteria to actual TASK-77/approved-spec sentences and recorded caller decisions; keep constructions and self-diagnoses out of new criteria unless the caller resolves a genuinely new contract. Record failure diagnoses and cause checks before repair handoffs. Resume existing roles for handoff gaps; keep cumulative turn counts and report the current count before exceeding the accepted limit.
- Correcting the parent's earlier commit restriction: after required checks pass, the implementer is authorized to commit the complete reviewed-scope implementation/docs/examples and protected D5 test by named paths, preserving unrelated index entries. The parent-owned spec notes may be included without rewriting frozen intent. Reach tdd validation with the lock intact, valid final-state logs, a clean worktree and a canonical committed tip; local candidate commits precede the parent's review and are not feature acceptance. Push/deployment remain forbidden.
- The parent will use current `code-review` on the fixed baseline from frontmatter and the full cumulative scope. Resolved default revmux profile is `mixed`; the gap spans runtime wiring, behavior and docs not proved by types/lint, so keep that default for the initial round. Confirming rounds use `final` unless the user pins a profile. Grade reachability against this ticket's occurrences, route only eligible fixes to fresh tdd children, defer speculative polish/test-only additions as the skill directs, and enforce its two-fix-round closeout. Reviews remain report-only; the parent separately checks changed styling. No additional broad calibration inventory.
- The user then required browser-failure recovery before review: "Сначала разберись с падениями browser-прогона через recovery.md. Если они есть и на базе, покажи это прогоном на base_sha. Только потом code-review". Reconcile the 30 full-browser failures through current tdd recovery diagnoses/cause checks before repair routing. A pre-existing verdict requires an actual matching-owner base run in an isolated worktree with base-era fixtures, a faithful scenario/environment and command/status/logs; prior reports or a source guess are insufficient.
- The original tdd entry `base_sha` is `77abfe183695c61913215cf87eb58789cde840e0`, independently verified with Git. It differs from the frontmatter's fixed review baseline only in prepared task/spec documents: the parent verified an empty diff across src/tests/scripts/tools/package/lock and test/build configuration paths. Use this original pre-feature base for baseline browser controls, not a later lock's test-only `base_sha` carrying v4 tests against absent production. Keep the fixed review baseline unchanged. Browser recovery precedes review; current work/index/locks and the shared completion budget remain preserved.
- On the user's repeated request, the parent reloaded both live skills and `recovery.md` again. Current code-review now explicitly permits `direct` fixes for reachable mechanical minor findings: exact known local change, no locked path, no added behavior, one commit per finding, caller diff/lock/check/clean-state verification. This exception supersedes the earlier blanket statement that all review fixes go to children. Non-mechanical fixes still follow the prescribed fresh tdd children; review remains blocked until browser recovery/base controls are reconciled. Current tdd still requires occurrence-grounded criteria, diagnosis/cause check before repair, unchanged lock enforcement and valid completed command evidence rather than report verdicts.

## Spec Change Log

- Recovery settled at source candidate `9fa7179caa4d0f69dfb823d91454ec14976a1fae`: lint, typecheck, 3363 Bun tests (one environment skip), 542 browser tests and build passed. The single report-only review then found five in-scope behavior gaps: picker cell identity, refused-command handling, current-cell link status, repeat-row runtime support, and player section/row visibility. These gaps prevent feature acceptance despite the green suites. One bounded review-fix TDD batch is authorized; no second TASK-77 review round will run. The user authorized autonomous continuation through TASK-78, TASK-79 and TASK-80. TASK-86 records the owner's live-room gate; TASK-87 records deferred internal cleanup. Neither is claimed complete.

## Review Triage Log

Single round `01-initial`, profile `mixed`, all six sources reported. No confirming round is authorized.

| Finding | Grade | Evidence and disposition |
| --- | --- | --- |
| adversarial-claude-4 | high | AC4 requires several token cells; group keys and visible identities omit the cell. Batch6 fix. |
| adversarial-claude-5 | high | Reverse picker ignores refused/timed-out outcomes while AC4 requires working link/unlink. Batch6 fix. |
| arch+quality-claude-2 | high | Confirmed selective-unlink decision requires identifying this cell's linked tokens. Batch6 fix; reassignment remains intentional. |
| adversarial-claude-2 | high | AC3 explicitly requires one-row blocks; accepted repeat rows render at the root. Batch6 implements row scopes. |
| adversarial-claude-1 | high | AC5 and the frozen matrix hide sections/rows from players; renderer omits their visibility. Batch6 fix. |
| adversarial-claude-3 | medium | Repeat-row fields and scope ids use the wrong validator sets. Included in the same Batch6 row-scope repair. |
| arch+quality-claude-5 | medium | Token and repeat default ids collide. TASK-80 carries the valid-default repair. |
| arch+quality-claude-8 | low | Typed row has an unjustified `any`. TASK-80 carries the conversion cleanup. |
| adversarial-claude-6 | medium | Renaming the example name field leaves section/row `nameField` stale. TASK-79 carries ancestor-chain propagation; TASK-80 carries Builder conversion. |
| arch+quality-claude-6 | low | Link lookup creates an unread index. Deferred to TASK-87; no measured slowdown is claimed. |
| arch+quality-claude-12 | low | First-field comments and fallbacks describe retired naming. Deferred to TASK-87. |
| lean-codex-2 | low | Stable scope ids make relocation preparation unreachable. Deferred to TASK-87. |
| arch+quality-claude-7 | low | Duplicate preset helper exports have no callers. Deferred to TASK-87. |
| docs+tests-claude-6 | low | Linkable/token comments retain v3 meanings. Deferred to TASK-87. |
| arch+quality-claude-11 | low | Picker popover id is duplicated as a literal. Deferred to TASK-87. |
| docs+tests-codex-2 | medium | AD-14 still promised relocation and restoration after scope-id changes. Corrected with AD-3 in the documentation commit; `sectionTarget` and the approved loss table require deletion instead. |