---
title: 'TASK-135: Let the React Compiler transform BuilderPage'
type: 'refactor'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** React Compiler 1.0 skips `BuilderPage` (`src/builder/builder-page.tsx`) with "Cannot access variable before it is declared" three times: it reads `followAttachedFile`, `writeFile` and `documentText` above their declarations. The component gets no automatic memoization.

**Approach:** Reorder the component's function declarations so each is declared before its first use, without moving any hook call. Opening, following and saving an attached preset file behave as before. The compiler probe must print nothing for the file.

</frozen-after-approval>

## Implementation Notes

- Pure move of function declarations inside `BuilderPage`; no line changed. Checks: the sorted lines of the file are identical before and after, and the sequence of hook calls is identical.
- Moves: `attachedFile` and `documentText` before `open`; `parseAttachedText` and `applyAttachedText` before `openAttachedFile`; `handleExternalResult` and `followAttachedFile` before the two follow effects; `writeFile` before `drainWriteQueue`.
- Surprise: moving only the three named functions is not enough. Once the reported reads are gone, the compiler reports the next forward reference (`handleExternalResult`, `applyAttachedText`, `parseAttachedText`), and plain function-to-function forward references fail with "[PruneHoistedContexts] Rewrite hoisted function references". The functions have no reference cycle, so a declaration order exists.
- Probe (`bun ./zz-probe.ts src/builder/builder-page.tsx`) prints nothing after the change.
- `src/builder/attached-files.test.ts`: 33/33 pass. `tests/builder.e2e.ts` and `tests/builder-snapshot.e2e.ts`: 56/56 pass.

## Review Triage Log

Blind Hunter (OpenCode, gpt-6.2-sol) reported four findings. The reviewer itself notes the reorder did not introduce them; each sits in code this change only moved. All four are deferred to `deferred-work.md`.

- `enqueueWrite` keeps a stale queued write when the latest text equals the active write — `medium`, verified by reading: with write A active and B queued, a new request for A hits the first early `return` and leaves B queued, so the file ends with B while the builder shows A. Pre-existing; deferred.
- `writeFile` does not re-check the attached file after `await fileAccess.read` — `maybe-false`: needs a test that attaches another file while the read is pending; would be `medium` if true. Deferred.
- An external edit between the preset read and the first follow poll can go unnoticed (`file-access.ts` takes the first poll as the base) — `maybe-false`: needs a test with an edit inside that window; would be `medium` if true. Deferred.
- Taking the file's version in a conflict allows a forced write that can overwrite a newer external change — `maybe-false`: needs a test with a second external change after the conflict shows; would be `medium` if true. Deferred.
