---
title: 'TASK-145: Reject repeat fields that reuse an enclosing field id'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
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

Uploading or importing an invalid preset refuses the file. In the Builder form, the conflict is a warning at the repeat field. The GM can still edit the draft. As with other preset problems, the Builder blocks export until the GM fixes it.

</frozen-after-approval>

## Implementation Notes

- Scope decision after review: include CAP-24 id suggestions because Builder otherwise creates a field id that the new validation rejects.
- The shared validator indexes only valid field ids, so empty ids do not get an extra conflict warning.
- Manual formula renaming remains separate. A single-GM reproduction is tracked in TASK-150.

## Review Triage Log

- Fixed: the Add field action generated ids that failed the new validation. The suggestion now checks the related scopes. Two regressions cover both directions, with an unrelated-scope control.
- Fixed: two invalid ids no longer generate an extra scope warning.
- Deferred: correcting a manual field id can leave a formula pointing at the wrong field. See TASK-150.
- The confirming review returned no findings from either reviewer.

## Verification

- The full unit run passed 3,680 tests, with one environment skip. All 55 mutants were killed. Format, lint, typecheck, build, and formal drift passed.
- Chromium verified the rejected upload and Builder import, warned at the editable field, blocked download for the invalid draft, and downloaded the corrected preset.
- The full browser suite passed 587 of 589. The two timeouts (`cell-name.e2e.ts:300` and `player.e2e.ts:145`) passed when each file ran alone with one worker. TASK-142 tracks the suite-load issue.
