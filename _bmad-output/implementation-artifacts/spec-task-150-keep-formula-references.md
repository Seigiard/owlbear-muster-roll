---
title: 'TASK-150: Keep Builder formula references when a conflicting field id is corrected'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
baseline_commit: 'e8c27e8c06c7d67a205c7e9f2691bf26b84356e1'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A GM can enter an id that a repeat field already uses, then correct the id and download a valid preset whose formula reads the wrong field.

**Approach:** In the Builder, keep every formula unchanged when a manual rename targets a field id that TASK-145 treats as taken in the same, enclosing, or nested scope. Reuse the existing conflict predicate. The field id still changes in the draft and the existing problem still blocks download. If the GM changes the sheet field from `bonus` to `attack_bonus` and back, the repeat formula still reads `1d6+bonus`. A rename to an available id still updates only references that resolve to the renamed field. Do not change the preset format, formula lookup, or handling for one GM in one window.

</frozen-after-approval>

## Implementation Notes
