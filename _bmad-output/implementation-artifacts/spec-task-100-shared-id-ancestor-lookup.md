---
title: 'TASK-100: Formula fields in enclosing repeat blocks with the same scope id'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A dice cell in a repeat section can report a field error when the field belongs to the enclosing repeat tab and the two scopes share an id. The preset permits that id reuse.

**Approach:** Reproduce the error through a roll on a valid v4 preset before changing the evaluator. Read values from the block that owns the resolved field. Preserve nearest-field shadowing, lookup across distinct scope ids, and the parent-local repeat id contract.

</frozen-after-approval>

## Implementation Notes

- `resolveFieldReference` already finds the owning scope. Compare the entire scope path in `blockValuesFor`, which both numeric and dice-choice lookups use. No change to the preset or the window's local-value lookup is needed.
- Exercise the result through `rollDiceCell`. TASK-101 owns the unrelated comment and cleanup.
- Before the fix, the public roll returned `field: bonus` and `field: weapon_die` errors instead of rolls of 7 and 4. The shadowing and distinct-id cases passed. The old comparison trimmed the rolled row's path to the length of the resolved path before comparing the ids, so `['npc', 'npc']` could match `['npc']`.

## Review Triage Log

- Low, patched. A second parent with a child of the same block id and different stored values makes the roll test reject a lookup that reads the first parent instead of the selected one.
- Low, not patched. The review also exercised a declared but empty child field and observed a field error. The selector does not retry an enclosing block if the resolved field has no value. The filled child field regression tests the requested precedence without adding a missing-value case.
