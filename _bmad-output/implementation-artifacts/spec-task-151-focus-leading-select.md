---
title: 'Focus a leading select field when adding a repeat block'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
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
- `src/ui/sheet/use-repeat-blocks.ts` finds the focus target with `input, textarea`. The deletion branch does not use that query.
- Add one regression to `tests/repeat-blocks.e2e.ts`. Keep the existing text-first and deletion focus tests unchanged.
