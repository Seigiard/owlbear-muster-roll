# TASK-79 window 4 review: blocked

Reviewed integration: `62044f2eb6c02760c1b35beff88f39efe7c751f2`.
Fixed base: `3b779818ccaaec60c48fbc29be73046565d0ffdb`.
Review: `owlbear-preset-v4-77-98-window4/01-initial`, profile `mixed`.
All six sources reported; no degraded source. Exit 1 means findings were returned.

## Acceptance

The chain passed its automated gates, but the integration review found unsupported
owned behavior. TASK-79 is not accepted. TASK-88's supersession conclusion is
withdrawn pending those repairs. TASK-77 AC2 remains open. TASK-80's separate
candidate must preserve the repaired runtime before integration.

All six integration checks passed at the reviewed SHA: 3422 unit tests passed,
one DOM-environment test skipped, and 573 browser tests passed. Five mutation
rows were calibrated. Those results do not cover every supported nesting shape.
No live Owlbear acceptance is claimed.

## Grading and remaining work

| Finding | Grade | Occurrence and disposition |
| --- | --- | --- |
| `adversarial-claude-1` | critical | TASK-79's explicit `npc → attack` and `boss → attack` parent-local identity occurrence. `templateScopes.sections` overwrites fields by leaf id; `stripToTemplate` and `presetDiff` consume that map. Different fields can be cleared on edit, duplicate or upload without a matching loss count. Required TASK-79 repair; no fix in this window. |
| `adversarial-claude-2` | major | TASK-79 AC4 nested upload losses. `sectionTarget` checks only the leaf id, so removing or renaming a parent can retain and undercount descendants. Required TASK-79 repair. |
| `adversarial-claude-3` | major | TASK-79 AC1 and the shipped nested row in `docs/example-preset.json`. The plain-tab section→row path is absent from by-path resolution; the UI renders the child row as parent cells. Required TASK-79 repair. TASK-88 cannot claim complete support. |
| `adversarial-claude-4` | major | Preservation of existing repeated-row naming, duplicate numbering and pending marks. `sectionFields` drops the repeated row from its synthetic section. Required TASK-79 regression repair. |
| `adversarial-claude-5` | major | TASK-79 player-editing flow and retained access semantics. `proposalJudgement` denies multi-pair block keys; proposal queue and field visibility still use flat identities. Required TASK-79 repair. Local access behavior can be tested; AC5 still needs the owner in Owlbear. |
| `bugs+impl-codex-6` | major | Retained token opening for TASK-79 nested blocks. Navigation passes the leaf instance to the tab lookup and loses its parent block. Required TASK-79 repair. |
| `bugs+impl-codex-7` | minor | Parent and child reuse the same id. Source-grounded constructed input, with no separately recorded user occurrence. Follow-up rather than a new acceptance requirement in this window. |
| `bugs+impl-codex-8` | minor | Dice lookup chooses the enclosing section before the repeating row. Keep with the existing section→row repair above; no duplicate issue. |
| `arch+quality-claude-6` | minor | An unused default argument rebuilds a block index; unused migration arguments remain. Maintenance follow-up. |
| `lean-codex-3` | minor | Relocation state is unreachable because `sectionTarget` returns the original id or null. Maintenance follow-up. |
| `docs+tests-codex-4` | minor | Formula lookup comment omits enclosing blocks and `blockAt`. Documentation cleanup follow-up. |

The caller checked the critical and major paths in current source. The review
contains diagnostic reproductions; no new parent-run runtime reproduction is
claimed here. The raw review preserves each finding's full explanation.

TASK-100 tracks `bugs+impl-codex-7`. TASK-101 tracks the unused-index,
unreachable-relocation and stale-comment findings. The section→row dice
finding remains part of TASK-79's required repair.

## Evidence

### Owner scope decision, 2026-11-18

The owner retained ordinary nested editing and token navigation as acceptance
requirements. Multiple GMs and multiple windows of one GM are outside this
completion scope. Existing accepted tests remain intact.

Two new diagnostics are optional follow-ups, not blockers: TASK-102 covers a
late child edit after parent deletion; TASK-103 covers preset field removal
while a nested edit is pending. Commit `3abef2f` preserves both reproductions.
The latter fails because a baseline field remains, not because the nested key
is flattened. Its expected proposal shape needs checking before future work.
Retiring these two tests records the scope decision; it does not claim either
case is fixed. TASK-99 also needs evidence of relevance to one GM/window before
implementation.

- Review JSON and grading input:
  `/Users/seigiard/.claude/artifacts/preset-v4-window4-20261117/review-01.json`.
- Integration check records:
  `/Users/seigiard/.claude/artifacts/preset-v4-window4-20261117/integration-checks/checks.json`.
- Browser evidence: `/Users/seigiard/.cache/herdr-run/w4-integration-browser.{meta,log,exit}`.
- TASK-79 chain: `/Users/seigiard/.claude/artifacts/preset-v4-window4-20261117/task-79/nested-tdd-20261117-202031/`.

## Stop condition

The 90-minute window reached its doubled budget at 23:10:54Z. Repeated
regression repairs while porting TASK-79 consumed the window. TASK-80 stopped
with unmerged candidate `8ddc9293745bd4e9e0220f61b42ab832490b54ee` and 38
passing focused checks. Calibration, full checks and review remain. No
review-fix batch or confirming round started. The review remains blocked.
