---
title: 'Focus a leading select field when adding a repeat block'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
baseline_commit: '8dcf40c023eae502e612ef67b36b8f6dce1ecec7'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** When a GM adds a repeat block whose first field is an editable select field, the window focuses the following text name field instead.

**Approach:** In one GM window, focus the leading select field in the new repeat block when the GM presses Add. Keep the existing focus behavior for text-first repeat blocks and after deletion.

</frozen-after-approval>

## Implementation Notes

- The Chromium probe observed focus on the `attack` textarea after Add. The `Броня` field rendered and accepted focus as a native `SELECT`.
- Add used `input, textarea` to find the focus target. It now includes `select` in the same query, so the first field in the block still wins in DOM order. Deletion does not use that query.
- In `tests/repeat-blocks.e2e.ts`, the new regression failed on the unfocused combobox before the fix. All 16 tests passed after the fix, including text-first Add and both deletion focus targets.
