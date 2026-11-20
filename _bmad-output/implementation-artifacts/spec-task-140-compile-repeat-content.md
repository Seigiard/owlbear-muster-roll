---
title: 'Let the React Compiler transform RepeatContent'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
route: 'oneshot'
baseline_commit: '9f53a4917a78e0484be631b958afd0326d5638a0'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** React Compiler 1.0 skips `RepeatContent`. Passing `controls.addButton` as a ref makes the compiler report reads of that property and of `controls.add` during render.

**Approach:** Pass the same ref through a local binding. Keep focus unchanged when a GM adds, deletes, or duplicates a repeat block in one window. Opening the duplicate form focuses its count field; Escape returns focus to the invoking button. Ship no profiling code or test changes.

</frozen-after-approval>

## Implementation Notes

- The baseline Babel probe reports two `CompileError` events on `RepeatContent`. The same probe must emit `CompileSuccess` for `RepeatContent` and no `CompileError` for `src/ui/sheet/preset-section.tsx`.
- `tests/repeat-blocks.e2e.ts` checks focus after add and delete. `tests/duplicate.e2e.ts` checks focus on open, after confirmation, and on Escape.
- `tests/nested-repeat.e2e.ts` checks focus when opening a pre-existing duplicate through its token link. A separate test checks the name of a newly created duplicate.
