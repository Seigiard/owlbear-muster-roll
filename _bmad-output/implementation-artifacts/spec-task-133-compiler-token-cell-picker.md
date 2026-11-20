---
title: 'TASK-133: Let the React Compiler transform TokenCellPicker'
type: 'refactor'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** React Compiler 1.0 skips `TokenCellPicker` (`src/ui/picker/link-picker.tsx`) with "Handle TryStatement with a finalizer ('finally') clause": `apply` releases its busy state in a `finally`. The component gets no automatic memoization.

**Approach:** Rewrite `apply` without `finally` and keep its behavior: busy clears after success, after an unanswered command and after an `onLinked` failure; the last two show the failure. The compiler probe must print nothing for the file.

</frozen-after-approval>

## Implementation Notes

- `apply` now has one `try/catch`. The answered branch awaits `onLinked()` inside the `try`; an unanswered outcome sets `failed`. The single `catch` covers a rejected `sendCommand` and a rejected `onLinked`, as the old outer and inner catches did. `setBusy(false)` follows the `try/catch`: the `catch` never rethrows, so it runs on every path the old `finally` covered.
- Probe (`bun ./zz-probe.ts src/ui/picker/link-picker.tsx`) prints nothing after the change.
- Review found that no test checked the busy state after a failed link, and no test covered an `onLinked` failure. `src/ui/picker/link-picker.test.tsx` now asserts the "Привязать лист…" button is enabled again after a refused batch and after a timed-out command, and adds a test where `onLinked` rejects. Calibrated: with `setBusy(false)` removed, those three tests and the reassign success test fail (30/34 pass); with it, 34/34 pass; the original `try/finally` code also passes 34/34.

## Review Triage Log

- Blind Hunter (OpenCode, gpt-6.2-sol): no test proves the link button is usable again after `onLinked` fails, and the failure tests would pass with a stuck `busy` — `medium`, verified: the failure tests asserted only the live text and the selection, and no test made `onLinked` reject. Patched with the assertions and test above.
