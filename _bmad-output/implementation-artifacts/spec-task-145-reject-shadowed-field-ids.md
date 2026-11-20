---
title: 'TASK-145: Reject repeat fields that reuse an enclosing field id'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
baseline_commit: '0ed72921fffa6af957e0fd84bd2acdbcafed078b'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A sheet dice cell can read the wrong field when a repeat field reuses the sheet field's id. With a repeat `bonus` before the sheet's `bonus`, `1d6 + bonus` can ignore the sheet's bonus.

**Approach:** Reject field id reuse between a repeat scope and any enclosing repeat or sheet scope, in either layout order. Report the id and both cell locations in Russian. Use the same rule for preset upload, import, and Builder. Allow reuse in unrelated scopes and leave `repeat.id` and token id rules unchanged. Do not add a compatibility mode, change dice lookup, or handle multiple GMs. Document the rule and keep the example and bundled presets valid.

Builder's Add field chooses an id that avoids conflicts in its own scope, its enclosing scopes, and its descendant scopes. A draft with no field id conflict does not gain one from adding a field. Manual field renaming and formula rewrites are out of scope.

</frozen-after-approval>

## Implementation Notes

- Scope decision after review: include CAP-24 id suggestions because Builder otherwise creates a field id that the new validation rejects.
