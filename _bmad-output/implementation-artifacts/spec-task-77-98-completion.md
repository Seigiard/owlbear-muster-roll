---
title: 'Complete preset v4 through TASK-98'
type: 'feature'
created: '2026-11-17'
status: 'in-progress'
baseline_commit: '88b7db235528ca5d7561c306851bf68bd8339586'
route: 'dispatch'
review_loop_iteration: 3
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Preset v4 has merged repeat-tab support but retains data-loss, authorization, navigation and roll defects. Nested blocks and complete Builder controls remain unfinished.

**Approach:** Complete the open work in TASK-77–98 through separate ticket chains, ordered by dependencies and shared files. Keep this checkout as the integration workspace. Use isolated ticket checkouts for concurrent writers.

## Boundaries & Constraints

**Always:** Preserve the acceptance criteria in each Backlog task. Treat TASK-78, 83, 84, 85 and 87 as completed deliveries; their named follow-ups own remaining defects. Validate a saved candidate before reusing it. Preserve per-cell versions and inherited visibility. Use the existing pure navigation reducer and React effects.

**Never:** Deploy, claim live Owlbear acceptance from mocks, or merge rejected candidates as verified work. TASK-86 remains an owner-run gate. TASK-79's live criterion stays open until that gate passes.

## I/O & Edge-Case Matrix

| Given | When | Then | Owner |
|---|---|---|---|
| Root number hp=7 and tab text hp | Preset upload, edit or import | Independent values survive; actual removals are counted | 89 |
| Player can edit a visible block | Raw create/delete or hidden-field proposal arrives | GM refuses it; permitted field edits still work | 90, 92 |
| Draft belongs to B; A precedes B | Remote lifecycle changes reorder tabs | B stays selected; draft never reaches C | 91 |
| Tab block hp=7 | Room or preview rolls 1d1+hp | Result is 8 from that block | 93 |
| Token exists only in a repeat tab | Root link is submitted or old link reconciled | Root target is refused or removed; scoped links survive | 94 |
| GM-only tab precedes target | Player opens linked block | Correct visible block opens and reveals its cell | 95 |
| Selected preview block or below-fold token | User edits or opens token | Correct block changes; reveal and focus follow existing policy | 96 |
| Two visible repeat scopes | GM navigates add controls | Accessible names distinguish their scopes | 97 |
| Tab-block dice feedback is visible | Remote value changes | Stale feedback clears | 98 |
| Fragmented pending edit | Stale reply or partial proposal arrives | Preserve local intent and untouched versions; bound assembly | 81 |
| Concurrent hp edit and armor removal | Upload or interrupted-upload repair | Preserve hp tuple; persist required clears without proposing removed fields | 82 |
| Nested child under invalid parent | Snapshot import | Drop child and count loss; valid parent-local scope ids work | 79 |
| Current supported repeat boundary | Upload or Builder validates | Refuse unsupported shapes at source paths; document proven boundary | 88, 77 |
| Valid v4 preset | Builder edits and round-trips it | Controls cover registry keys; download passes public parser | 80 |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts`, `preset-migrate.ts`, `link-target.ts`, `sheets.ts`: scope membership, loss accounting and token targets for 89/92/94/88.
- `src/core/access.ts`, `src/replica/room-protocol.ts`: receiving-GM admission for 90/92.
- `src/core/dice-roll.ts`, `src/ui/sheet/sheet-body.tsx`: block values and feedback for 93/98.
- `src/ui/navigation.ts`, `main.tsx`, `src/core/rendered-tabs.ts`: selected identity and role-filtered opening for 91/95.
- `src/builder/preview-pane.tsx`, `src/ui/sheet/preset-section.tsx`, `src/copy.ts`: preview block context and shared labels for 96/97.
- `src/replica/composers.ts`, `proposal-queue.ts`, `pending-edits.ts`, `window-publisher.ts`, `src/core/message-size.ts`: persisted-versus-pending boundaries and transport for 81/82.
- TASK-79 candidate changes 22 source and 9 test files. Its full-path resolver, formulas, duplicate and import changes need separate validation before reuse.
- `src/builder/document.ts` and node forms: TASK-80 controls, unique ids, rename propagation and round trips.

## Tasks & Acceptance

**Execution:**

1. Repair repeat-tab follow-ups before bringing nested support into the integration baseline. Keep task records and regression ownership separate.
2. Schedule shared core files serially: 89 before 82; coordinate 92/94 before nested resolver work.
3. Schedule UI identity first: 91 before overlapping 95/96/97 edits. Run 93 before 98, its explicit dependency.
4. Investigate 81 independently where file ownership permits. Correct its suspect stale-reply oracle before implementation. For 82, first reproduce the concurrent loss through the public consumer.
5. Repair and validate 79 after the TASK-78 release blockers. Then validate 88 against that accepted boundary and close 77's remaining criterion with evidence or explicit supersession. If 79 stops, 88 instead guards the remaining unsupported forms. Do not add a temporary rejection only to remove it in the same completed run.
6. Implement 80 after verified nested runtime support. Leave 86 ready for the owner's real-room check.
7. Run per-ticket TDD validation, integrate accepted branches, then run one closing integration review. Mark stopped chains blocked and continue independent work.

**Acceptance Criteria:**

- Given each open task, when its chain completes, then every checked criterion has command and revision evidence.
- Given a blocked chain, when other tasks are ready, then independent work continues and dependent work waits.
- Given the final candidate, when reported, then automated completion and owner-only live acceptance are stated separately.

## Design Notes

Concurrency follows file ownership, not ticket count. Limit active implementation lanes to three; browser checks share a bounded resource queue. Reuse unchanged passing evidence, but keep the repository's required per-ticket checks. Rejected candidates provide reusable code only after their recorded defects and tests are corrected.

Start with 89 (scope isolation), 91 (stable tab identity), and the 81 oracle repair. Schedule 82 after migration work settles. The later core follow-ups share an owner; UI follow-ups share another. Task 79 follows the release blockers because its current Backlog record explicitly requires them repaired first. A full-path rewrite ahead of those fixes would also make their regressions harder to isolate.

Planning estimate: 18–38 agent-hours of serial work, roughly 12–20 elapsed hours with bounded parallelism and required checks. This is a range, not a run budget. Use 60–90 minute implementation windows, with the first window budgeted at 90 minutes; stop starting new work at twice that budget. Expected combined footprint is approximately 30–45 source and 20–30 test files, with substantial overlap. These are planning bounds; record each ticket's exact paths before dispatch.

## Implementation Notes

- 2026-11-17: The owner approved separate ticket specs and chains, at most three parallel lanes, and a first 90-minute implementation window. Initial tickets: 89, 91 and the 81 oracle repair. The current checkout remains the integration workspace.
- 2026-11-17 window 1: Integrated TASK-89 (`7d2f6f6`), TASK-91 (`c1e9fdb`), TASK-94 (`05ef736`) and repaired TASK-81 (`1117177`). All four tasks passed their acceptance checks and the closing integration review.
- TASK-81 uses the ordinary stale-reply per-cell contract. Corrected lock `37654a1` fails against baseline `c6822ca`: a 15,188-byte read-back becomes denied. Candidate `c8e595d` delivers two fragments while preserving local intent and untouched GM tuples.
- Review regressions `aedc6f3` and fixes `738bbf2` cover complete numbered-envelope sizing and stable selection after local '+' creation. Both assertions passed mutation calibration.
- After window 1, remaining tasks were 77, 79, 80, 82, 88, 90, 92, 93, 95, 96, 97 and 98. TASK-86 remains the owner's live-room gate. The umbrella stays in progress.
- Resume with the repeat-tab follow-ups before TASK-79. Its saved candidate imports children under an incorrect parent path and rejects valid parent-local scope ids. TASK-80 waits for verified TASK-79. TASK-82 first needs a valid concurrent-edit oracle; its saved candidate fails player-proposal stripping. The rejected candidates remain available for diagnosis.
- TASK-95 should reuse and verify the rendered-identity conversion already added by TASK-91. Numeric selection inputs remain available for Builder compatibility.
- 2026-11-17 window 2: Owner requested the next window. Start from `1fc8a7c2bd08608331a33873e3f3a6de4ba71554`, with a 90-minute budget and at most three ticket lanes. Initial frontier: TASK-90 receiving-GM admission, TASK-93 room/preview dice, TASK-95 role-filtered token opening. Queue TASK-92 after 90, TASK-96 after 95, TASK-97 after 96, and TASK-98 after 93 and 96 to serialize shared files. Full browser suites run one at a time with two workers. The parent owns integration and one closing review.
- Window 2 completed TASK-90, 92, 93, 95 and 96. Player proposals cannot create or delete repeat-tab blocks or change their hidden fields. Token opening respects source-section visibility and selects the correct player-visible block. Preview edits retain the selected block; linked cells below the viewport reveal and focus.
- TASK-93 now resolves numeric fields, dice-choice fields and field labels across all plain sections of a repeat tab. Review regression `08a18e0` failed with a field error instead of 8; repair `077bb74` passed it. Restoring the numeric section-only lookup made the same assertion fail again.
- TASK-95 reuses TASK-91's production repair and adds calibrated public browser regressions. Preview dice evidence is exact field-error → empty-feedback; core and Room independently assert the numeric result 8.
- Remaining implementation: TASK-97/98, then TASK-79 and the TASK-88/77 boundary plus TASK-80; TASK-82 still needs its concurrent-edit oracle repaired. TASK-86 remains owner-run. Rejected candidates remain available.
- 2026-11-17 window 3: Owner requested continuation from `521716e092937648d3136c4a722ca9c3ef99a336`. Start at 17:45:02Z with a 90-minute budget. Frontier: TASK-97 shared copy and accessible add names, TASK-98 remote dice-feedback invalidation, and TASK-82 oracle recovery. Their UI and replica production paths are separate. Full browser suites retain the single two-worker slot. TASK-79 follows accepted repeat-tab work if the budget permits; the parent retains this checkout and the closing review.
- Window 3 completed TASK-82, 97 and 98. Unchanged cells retain their tuples during preset upload; persisted recovery clears removed fields without contaminating player proposals. Shared add controls distinguish colliding scope titles, and remote repeat-tab edits clear stale dice feedback.
- Remaining frontier: TASK-79, then TASK-80 and TASK-88/77; TASK-86 remains owner-run. TASK-79's rejected candidate remains preserved. No new frontier task started in this window.
- Window 3 exceeded its 90-minute estimate because the concurrent oracle, pending/persisted boundary and duplicate-title coverage needed repair, followed by serialized browser checks. Closing work stayed within the existing three-ticket frontier.

## Spec Change Log

## Review Triage Log

- Round 01: `mixed`, 6/6 sources, two major findings fixed in `738bbf2`. Two minor test gaps share those regressions.
- Round 02: `final`, 2/2 sources, no degraded sources, findings or open questions; exit 0. Cumulative base: `a87fc3c`; checked source: `738bbf2`.
- Deferred `lean-codex-1`: obsolete incomplete stale-reply retention needs a cleanup contract. See `deferred-work.md`, TASK-77–98 window 1. Shared assembler and identity deduplication suggestions were immaterial.
- Window 2 round 01: `mixed`, 6/6 sources. Cross-section dice lookup was major and fixed in `077bb74`. Identical link visibility branches were minor and deferred.
- Window 2 round 02: `final`, 2/2 sources, no degraded sources, findings or open questions; exit 0. Cumulative base `1fc8a7c`; checked source `077bb74`. The deferred minor remains recorded in `deferred-work.md`.
- Window 3 round 01: `mixed`, 6/6 sources; two mechanical documentation findings corrected in `d7920fb` and `a6af377`. A constructed stale-preset data-loss scenario was graded minor by the caller and deferred for a provenance contract.
- Window 3 round 02: `final`, 2/2 sources, no degradation; exit 1. The same deferred risk remains, with an additional failed-preset-send trigger traced in code. No runtime reproduction is claimed. The loop closed with no caller-graded finding above minor; it did not produce an empty review. See the TASK-82 spec and `deferred-work.md`.

## Verification

- Ticket consumer regressions: expected behavior from the matrix and original task; estimate 1–3 minutes per run.
- Required source checks from `CLAUDE.md`: format, lint, typecheck, Bun, browser and build; estimate 4–10 minutes per ticket state.
- Final integration checks: same required set plus merged ticket commands; estimate 5–12 minutes.
- Backlog-only changes: CLI reads, doctor and whitespace checks; estimate under 1 minute. Markdown is excluded from formatter coverage.
- Baseline: five required checks passed; browser 557/558. NPC token focus failed in the full run and passed 3/3 isolated retries. Keep this unresolved instability visible.
- Live Owlbear verification: TASK-86, owner scheduled; no autonomous runtime estimate or completion claim.
- Final clean source `738bbf20a2193cd92d3d39c9a467398be9db1ea8`: format, lint, typecheck, unit, browser (`--workers=2`) and build all exit 0. Unit: 3401 pass, 1 skip, 0 fail. Browser: 563 pass. Later full green runs do not establish the cause of the baseline focus failure.
- Window 2 final clean source `077bb748d66e4ea8b5324399ce52b67cdbb5f37b`: all six checks exit 0. Unit: 3413 pass, 1 skip, 0 fail. Browser: 570 pass with two workers. Focused dice-roll: 32 pass. This proves application behavior under the mock adapter, not live Owlbear acceptance.
- Window 3 integration `9f6f5b3`: focused engine 26 pass, focused browser 25 pass; all six checks exit 0. After the comment correction committed as `a6af377`, all six checks passed again: 3415 unit pass, 1 DOM skip, 572 browser pass with two workers. All three ticket locks remained byte-identical. This does not prove live Owlbear acceptance or the deferred stale-preset scenario.
