---
title: 'TASK-112: Keep loaded-file warnings when opening a preset identical to the current draft'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `BuilderPage.open` (`src/builder/builder-page.tsx`) skips `store.open` when the opened file's preset is identical to the draft, so the snapshot records survive. For an origin-less draft (built by hand or from an example) this also leaves `step.origin` null and `document.originRepeatIds` empty. A later repeat id change or repeat removal then shows no "blocks will be erased" warning, although the GM did open that file.

**Approach:** On an identical open whose file has an origin, the store adopts that file as the origin of an origin-less draft: it sets `step.origin` and collects `originRepeatIds` onto the current document's uids. The document, its uids, the selection and the snapshot records stay as they are. A draft that already has an origin keeps it: the attached file is written back on every edit, so reopening it must not erase the identity of the file the GM loaded first.

Acceptance (from TASK-112):
- Given an origin-less draft, when the GM opens a preset file identical to it, then the draft has loaded-file warning identity (origin set, repeat ids collected).
- Given that draft, when the GM changes a repeat id or turns repeat off, then the form warns about the original room block's id.
- Given an identical open, then the snapshot records and edited values stay as they were.

</frozen-after-approval>

## Implementation Notes

- `src/builder/document.ts`: `collectOriginRepeatIds` is exported.
- `src/builder/builder-store.ts`: new `adoptOrigin(origin)`. It does nothing when the step has an origin or when `origin` does not format to the draft's preset text. Otherwise it sets the origin and the repeat ids, collected on the current document's uids, on the current step and on every undo and redo step that has no origin. It is not an undo step, as the draft's content stays. Without the history update, an undo past the adoption and a new edit lost the origin for good (review finding).
- `src/builder/builder-page.tsx`: `open` calls `store.adoptOrigin` on the identical path when `next.origin` is not null (examples pass null).
- Tests: page-level in `src/builder/attached-files.test.ts` (id change and repeat off, records kept); store-level in `src/builder/builder-store.test.ts` (ids, reload, history, differing preset, existing origin).
- A full `bun run test:browser` run failed once in `tests/selection.e2e.ts:135`, which does not load the Builder; it passed 3/3 alone. Deferred as TASK-139.

## Review Triage Log

Blind Hunter, one pass:

- medium, patched: the adopted origin lived only in the current step; undo past it plus a new edit lost it while the file stayed attached. `adoptOrigin` now updates the history steps too, with a test.
- low, patched: the page test helper turned repeat off when the path had no repeat section, so the id case could pass without changing an id. It now throws.
- low, patched: no test for undo and redo after adoption. Added.
- low, patched: `adoptOrigin` trusted the caller for structural identity, and `collectOriginRepeatIds` maps by index. The store now checks the preset text itself, with a test.
- low, rejected: the draft name is not taken from the identical file. Behavior predates this change; the download name is not a warning concern.
- low, patched: the `BuilderStep.origin` comment named the rename warning and the identical-open case was missing.
- low, rejected: no page test for a draft that has an origin. The store test covers the guard; the page path is one call.
- false: warning text should come from `copy.ts`. The neighboring warning tests in `item-form.test.tsx` assert literal Russian text.
- false: GLOSSARY lacks "origin". It is a code identifier, not a domain term shown to users; no term changed meaning.
