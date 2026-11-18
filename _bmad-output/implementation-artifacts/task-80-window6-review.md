# Preset v4 final acceptance

Accepted source: `6695d2346fbd2a0107e2fb24e19c9473bb28bf54`.
This is the source in the original integration checkout.

## Changes and evidence

| Task | Result | Evidence |
| --- | --- | --- |
| TASK-109 | A copied nested child's token targets its complete path; repeat-tab reveal still scrolls and focuses correctly. | Calibrated browser regression, navigation owners, final independent review2/2 with no findings. |
| TASK-80 | V4 forms, scoped ids, name-field choices, rename propagation and loaded-file warnings work through ordinary edits and restored drafts. | Focused73 pass; F1–F5 mutation calibration; two repair rounds and final review2/2 with one minor deferred. |
| TASK-110 | Three additional browser journeys and reusable verification profiles are integrated. | All three journeys run in the final browser suite. |
| TASK-88 / TASK-77 AC2 | Current parser/Builder/upload boundary is verified; the old blanket nesting refusal is superseded by support. | `task-88-boundary-evidence.md`. |

## Required checks

All commands ran against the clean accepted source.

- Format, lint, types and build: exit0. Lint reports293 existing warnings,0 errors.
- Bun:3455 pass,1 existing no-DOM environment skip,0 failures.
- Browser:583 pass with2 workers;0 skipped,0 flaky,0 unexpected, no report errors.
- Raw output and revision/exit metadata: `~/.cache/herdr-run/w6-final-*`.
- Browser report/traces: `preset-v4-final-w6-20261118/test-results/verify/window6-final/`.
- Chain and review artifacts: `~/.claude/artifacts/preset-v4-window6-20261118/`;
  Builder cumulative reports remain in `preset-v4-window4-20261117/task-80/`.

## Review dispositions

Builder round03's five new major defects and one owned pre-existing defect
were repaired. Round04 found two holes in warning identity persistence.
The owner approved completing the mechanism. Round05 confirms those repairs
and leaves only `bugs+impl-1`, minor/refined, deferred as TASK-112.
All review sources reported without degradation.

Earlier test-gap findings are covered by the extended owners.
The Builder spec now records its completed state.
TASK-109's separate final review found no defect.
This closes the bounded loops; it does not claim an empty Builder findings list.

## Remaining boundaries

- TASK-111: old drafts retain their contents, but lack data to reconstruct
  original node identity. The Builder does not invent positional matches.
- TASK-112: attaching an identical file to an origin-less draft can omit
  the early warning. Runtime upload still confirms block erasure.
- TASK-99/100/101/102/103/105/106/108 remain optional follow-ups.
- TASK-86 remains the owner's real Owlbear room check.
- Unrelated local generation/verification work was preserved and excluded
  from the clean source used for these checks.
