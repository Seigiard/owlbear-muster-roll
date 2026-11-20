---
title: 'TASK-150: Keep Builder formula references when a conflicting field id is corrected'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
baseline_commit: 'e8c27e8c06c7d67a205c7e9f2691bf26b84356e1'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A GM can enter an id that another field already uses. Correcting the id can then leave a valid download with a formula that reads the wrong field.

**Approach:** Refuse a manual field id that is taken in the same, enclosing, or nested scope. Reuse the TASK-145 rule and show a Russian inline error that names where the id is taken. Leave the field id, formulas, and current draft unchanged. An existing conflict in a draft still uses the TASK-145 problem.

If a GM tries `bonus` to `attack_bonus`, then enters `bonus` again, clear the inline error and keep `1d6+bonus`. If the GM instead enters `damage_bonus`, clear the error and update the reference to `1d6+damage_bonus`. A free rename updates only references that resolve to the renamed field. This work covers one GM in one Builder window. It does not change the preset format or formula lookup.

</frozen-after-approval>

## Implementation Notes

- The owner replaced the original formula guard with refusal at the manual edit boundary. A formula never has to follow a field through a conflicting draft state.
- Manual field id edits and field id suggestions share the TASK-145 scope check. The core formula renamer and existing draft warnings are unchanged.

## Review

- Two independent reviewers found no issues in option B. The earlier correction regression no longer applies because the Builder never stores the conflicting id.
- TASK-152 tracks a pre-existing free-rename issue when a repeat tab and a nested repeat section share the same repeat id.

## Verification

- The two Chromium regression cases fail without refusal. With refusal, each downloads a valid preset with the expected formula. The unrelated `1d8+attack_bonus` stays unchanged.
- All 591 Chromium tests pass with `--workers=1`. Bun reports 3,680 passes and one environment skip. All 55 mutants are killed.
- Format, lint, typecheck, build, and formal drift checks pass.
