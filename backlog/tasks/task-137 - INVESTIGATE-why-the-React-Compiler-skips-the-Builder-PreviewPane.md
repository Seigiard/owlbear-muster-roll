---
id: TASK-137
title: 'INVESTIGATE: why the React Compiler skips the Builder PreviewPane'
status: Done
assignee: []
created_date: '2026-11-20T06:19:00Z'
updated_date: '2026-11-20T06:45:00Z'
labels: []
dependencies: []
priority: low
type: spike
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`PreviewPane` (`src/builder/preview-pane.tsx`) bails out three times with "Existing memoization could not be preserved": the compiler finds that a dependency of a hand-written `useMemo` may change later. The pane has eight `useMemo` calls. Some only cache derived values (`toPreset`, `encodePreset`, `template`); others create stateful objects that must keep one identity for the life of the pane (`createVersionMinter`, `createLocalFieldValues`, `createFieldFlushes`). It is unknown which ones trigger the bailout, and whether the stateful ones belong in `useState`/`useRef` initializers rather than `useMemo`.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The task notes name the `useMemo` calls and the dependencies behind each "Existing memoization could not be preserved" report, with the probe output that shows it
- [x] #2 The task notes say, for each `useMemo` in `PreviewPane`, whether it only caches a value or must keep an identity, and which change (remove it, or move it to a `useState`/`useRef` initializer) removes the bailout without changing the preview
- [x] #3 The task notes give a do or drop recommendation; a follow-up task exists for the fix when the recommendation is to do it; no production code changes in this task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Spike findings (2026-11-20, base 84b1218)

Spike run by an OpenCode subagent (gpt-6.2-sol) in a detached worktree; every throwaway edit was reverted, no production code changed.

### AC#1: the memos and the dependency behind each report

All three `CompileError` events have category `PreserveManualMemo`, reason "Existing memoization could not be preserved", detail message "This dependency may be modified later", and the same dependency `renderSheetId`:

| `useMemo` in `src/builder/preview-pane.tsx` | `details[0].loc` (line:col, zero-based) |
|---|---|
| `renderRecords`, line 226 | `renderSheetId`, `238:30-43` |
| `visibleRenderedTabs`, line 375 | `renderSheetId`, `383:20-33` |
| `visibleRepeatTabs`, line 386 | `renderSheetId`, `399:5-18` |

Probe excerpt (first report):

```
preview-pane.tsx SourceLocation { start: { line: 90 }, end: { line: 702 } }
_CompilerDiagnostic { options: { category: 'PreserveManualMemo',
  reason: 'Existing memoization could not be preserved',
  details: [ { kind: 'error', loc: { start: { line: 238, column: 30 }, end: { line: 238, column: 43 },
  identifierName: 'renderSheetId' }, message: 'This dependency may be modified later' } ] } }
```

Removing each memo on its own removed exactly its report. `renderSheetId` is a `string | null`; the compiler cannot prove it primitive, so the diagnostic does not show a real runtime mutation.

### AC#2: what each memo holds, and the change that removes the bailout

The pane has 21 `useMemo` calls, not eight (lines of the unmodified file):

| Line | Value | Lifetime | Proposed change |
|---:|---|---|---|
| 102 | `sourceRecords`, snapshot lookup | cache | keep |
| 107 | `preset`, `toPreset(document)` | cache | keep |
| 108 | `presetData`, encoded preset | cache | keep |
| 109 | `minter`, per-record version counters | pane identity | lazy `useState` |
| 111 | `records`, role-visible lookup | cache | keep |
| 116 | `localValues`, field readers shared with dice | pane identity | lazy `useState` |
| 117 | `pageHideFlushes`, pending-save registry | pane identity | lazy `useState` |
| 146 | `template`, converted selected template | cache | keep |
| 151 | `rolling`, dice handler | cache; needs current inputs | keep |
| 181 | `sidebar`, role-visible entries | cache | keep |
| 192 | `allSidebar`, unfiltered entries | cache | keep |
| 204 | `sheetNavigationAction`, sheet reducer input | cache; effect dependency | keep |
| 226 | `renderRecords`, visible or sample records | cache | keep; make the sheet ID primitive |
| 241 | `fieldEditing`, command sender and registries | cache; needs current inputs | keep |
| 363 | `selectedTab`, tree selection projection | cache | keep |
| 368 | `tabIsShown`, visibility predicate | cache | keep |
| 375 | `visibleRenderedTabs`, displayed tabs | cache; effect dependency | keep; make the sheet ID primitive |
| 386 | `visibleRepeatTabs`, repeat-tab add targets | cache | keep; make the sheet ID primitive |
| 402 | `navigationTemplate`, template with document UID | cache | keep |
| 408 | `navigationAction`, tab reducer input | cache; effect dependency | keep |
| 492 | `preview`, editable-cell context | cache | keep |

A new preset updates the props of the same unkeyed pane; none of the three stateful objects resets on a preset change today, so a mount-only initializer keeps their behavior. `rolling` and `fieldEditing` must keep refreshing with their inputs, so they stay memos.

Tried (throwaway):
- Lazy `useState` for the three stateful objects alone: all three reports stay.
- Removing the three reported memos: exposes a fourth report (`openTab` in the deps of `preview`, line 503). Removing that memo too silences the probe, but the compiled code rebuilds those values on every render. 165 unit tests passed; 77/78 Chromium tests (the file-menu timeout passed on an isolated rerun).
- Preferred: keep every derived memo, pass the sheet ID as a primitive (`String(activeSheetId)` only for a non-null real sheet ID), and move `minter`, `localValues` and `pageHideFlushes` to lazy `useState`. The probe printed nothing; the detailed probe reported `CompileSuccess` for `PreviewPane` (41 memo blocks) and the emitted code kept the three reported caches. 165 unit tests and 78/78 Chromium tests passed (`tests/builder.e2e.ts`, `tests/builder-snapshot.e2e.ts`, `tests/repeat-tabs.e2e.ts`).

### AC#3: recommendation

**Do, at low priority.** The change is one file and keeps the existing caches; the main risk is a regression in save or navigation behavior, which the three Chromium suites cover. No speedup was measured. Follow-up task created (see below).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All three "Existing memoization could not be preserved" reports point at the same dependency, `renderSheetId` (`string | null`), in the memos `renderRecords` (238:30), `visibleRenderedTabs` (383:20) and `visibleRepeatTabs` (399:5). The notes classify all 21 `useMemo` calls: three hold pane-lifetime objects (`minter`, `localValues`, `pageHideFlushes`) and belong in lazy `useState`; the rest are caches to keep. Moving the stateful ones alone does not remove the bailout. A throwaway change that also passes the sheet ID as a primitive silenced the probe, compiled `PreviewPane` with its caches intact, and passed 165 unit tests and 78/78 Chromium tests. Recommendation: do, at low priority, because no speedup was measured. Follow-up: TASK-141. No production code changed; the throwaway edits were reverted.
<!-- SECTION:FINAL_SUMMARY:END -->
