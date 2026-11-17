---
title: 'Complete preset v4 through TASK-98'
type: 'feature'
created: '2026-11-17'
status: 'in-progress'
baseline_commit: '88b7db235528ca5d7561c306851bf68bd8339586'
route: 'dispatch'
review_loop_iteration: 0
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

## Spec Change Log

## Review Triage Log

## Verification

- Ticket consumer regressions: expected behavior from the matrix and original task; estimate 1–3 minutes per run.
- Required source checks from `CLAUDE.md`: format, lint, typecheck, Bun, browser and build; estimate 4–10 minutes per ticket state.
- Final integration checks: same required set plus merged ticket commands; estimate 5–12 minutes.
- Backlog-only changes: CLI reads, doctor and whitespace checks; estimate under 1 minute. Markdown is excluded from formatter coverage.
- Baseline: five required checks passed; browser 557/558. NPC token focus failed in the full run and passed 3/3 isolated retries. Keep this unresolved instability visible.
- Live Owlbear verification: TASK-86, owner scheduled; no autonomous runtime estimate or completion claim.
