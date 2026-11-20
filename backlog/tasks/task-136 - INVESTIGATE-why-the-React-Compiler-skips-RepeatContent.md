---
id: TASK-136
title: 'INVESTIGATE: why the React Compiler skips RepeatContent'
status: Done
assignee: []
created_date: '2026-11-20T06:19:00Z'
updated_date: '2026-11-20T06:45:00Z'
labels: []
dependencies: []
priority: low
type: spike
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`RepeatContent` (`src/ui/sheet/preset-section.tsx`) is the repeat section of a sheet: its repeat blocks with "Удалить" and "Добавить" under them. It bails out twice with "Cannot access refs during render", and the probe does not name the expression. Candidates are the focus refs of `useRepeatBlocks` (`src/ui/sheet/use-repeat-blocks.ts`: `addButton`, `blockElements`, `deleteButtons`) and the `duplicateButtons` map in `preset-section.tsx`. They move the focus after a block is added, deleted or duplicated, which `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` cover. The fix is unknown, and so is whether the missed memoization costs anything on a real sheet.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The task notes name each expression that makes the compiler report "Cannot access refs during render" for `RepeatContent`, with the probe output that shows it
- [x] #2 The task notes state whether a change can remove the bailout while keeping the focus behavior that `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` check, and sketch that change
- [x] #3 The task notes give the re-render cost of the bailout on a sheet with many repeat blocks (for example React Profiler commit times with and without the fix), and a do or drop recommendation
- [x] #4 A follow-up task exists for the fix when the recommendation is to do it; no production code changes in this task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Spike findings (2026-11-20, base 84b1218)

Spike run by an OpenCode subagent (gpt-6.2-sol) in a detached worktree; every throwaway edit was reverted, no production code changed.

### AC#1: the expressions behind "Cannot access refs during render"

Both `CompileError` events name `RepeatContent` (`src/ui/sheet/preset-section.tsx:408`). The full `event.detail` (category `Refs`, detail message "Cannot access ref value during render") points at:

| `details[0].loc` (line:col, zero-based, end exclusive) | Expression |
|---|---|
| `469:11-29` | `controls.addButton` in `ref={controls.addButton}` |
| `472:15-27` | `controls.add` in `onPress={controls.add}` |

Probe excerpt:

```
preset-section.tsx:408
_CompilerDiagnostic { options: { category: 'Refs', reason: 'Cannot access refs during render',
  details: [ { kind: 'error', loc: { start: { line: 469, column: 11 }, end: { line: 469, column: 29 } },
  message: 'Cannot access ref value during render' } ] } }
```

Bisection: the `469` report stays when `onPress` is replaced; the `472` report appears only while the original `ref={controls.addButton}` is present. The compiler treats the whole `controls` object as a ref holder once one of its properties is passed as `ref`, so reading `controls.add` during render also counts. The focus maps in `useRepeatBlocks` (`blockElements`, `deleteButtons`) and the `duplicateButtons` map are not involved. Returning a callback ref under the same `controls.addButton` property does not clear the errors.

### AC#2: a change that removes the bailout and keeps focus behavior

Yes. Destructure the ref out of `controls` once, and pass the local binding:

```diff
  const controls = useRepeatBlocks(sheetId, sectionId, instanceIds, parent);
+ const { addButton } = controls;
- ref={controls.addButton}
+ ref={addButton}
  onPress={controls.add}
```

With only this change (throwaway), the probe printed nothing for the file, the detailed probe reported `CompileSuccess` for `RepeatContent` (39 memo slots), and `tests/repeat-blocks.e2e.ts` plus `tests/nested-repeat.e2e.ts` passed 23/23. The hook, the command handlers and the focus effects stay unchanged.

### AC#3: re-render cost and recommendation

Method: headless Chromium (Apple M1 Pro), two Vite production mock builds aliased to `react-dom/profiling`, the React Compiler on in both (the bailout confirmed only in the baseline build). Each scenario: six fresh browser contexts per variant, baseline/fix order alternated. Value: the sum of `<Profiler onRender>` `actualDuration` over the commits of one action; median of run medians, range across runs in brackets.

| Action | Samples per run after warm-up | Baseline, ms | With fix, ms |
|---|---:|---:|---:|
| Parent update with unchanged props, 120 blocks | 24 | 13.88 (12.85-16.45) | 0.00 (0.00-0.10) |
| Save a changed name in one of 120 blocks | 16 | 12.80 (12.40-13.35) | 13.70 (12.90-14.20) |
| Open the duplicate form on a parent with 120 nested blocks | 20 | 13.90 (13.55-14.55) | 1.00 (0.90-1.00) |
| Close that form with Escape | 20 | 13.52 (13.40-13.60) | 0.50 (0.50-0.55) |

Keydown to the first animation frame that showed the new state: opening the duplicate form fell from 31.4 ms to 12.1 ms, closing from 35.2 ms to 12.7 ms. The gain is in updates that can reuse the nested block UI; a save costs about 0.9 ms more.

Recommendation: **do**. The change is two lines, keeps the focus logic, and removes about 13 ms of render work per keyboard action on a large repeat section. Follow-up task created (see below).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The two "Cannot access refs during render" reports come from `ref={controls.addButton}` (469:11) and `onPress={controls.add}` (472:15) in `RepeatContent`: passing one property of `controls` as a `ref` makes the compiler treat the whole object as a ref holder. A two-line change (destructure `addButton` from `controls`, pass the local as `ref`) silenced the probe, compiled `RepeatContent` (`CompileSuccess`, 39 memo slots), and passed `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` 23/23 as a throwaway edit. Profiler on 120 nested blocks: opening or closing the duplicate form drops from about 13.9 ms to about 1 ms of render work; saves cost about 0.9 ms more. Recommendation: do. Follow-up: TASK-140. No production code changed; the throwaway edits were reverted.
<!-- SECTION:FINAL_SUMMARY:END -->
