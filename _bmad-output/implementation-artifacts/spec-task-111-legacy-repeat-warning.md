---
title: 'TASK-111: Explain missing repeat warnings in older Builder drafts'
type: 'feature'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An older Builder draft can contain both the edited and original presets without a record of which repeat scopes match. The Builder currently gives no repeat-block warning in that case. Pairing the presets by position could name the wrong block after a move or removal.

**Approach:** Restore the draft as saved and show one notice that exact repeat-block warnings are unavailable. Keep missing correspondence distinct from a known empty set of matches so the notice survives a save and reload. Leave the exact warnings for drafts with durable identity unchanged.

- Given a draft saved without repeat correspondence, when the Builder restores it, then it retains its preset, origin, filename, and snapshot records.
- Given an origin without correspondence, when the Builder shows the draft or a GM edits it and reloads, then the Builder explains the limitation without naming a guessed block.
- Given a draft with durable identity, when the GM moves or removes a preceding section and reloads, then an edit to the surviving repeat scope can still name its original block. A known empty set of matches does not trigger the older-draft notice.

</frozen-after-approval>

## Implementation Notes

- `document.ts` and `builder-store.ts` keep missing `originRepeatIds` absent across a save. They restore a present empty array as an empty map. Older drafts already overwritten with `[]` cannot be distinguished from drafts that saved a known empty map.
- `builder-page.tsx` shows a separate warning banner when the origin has a repeat scope but the draft has no map. `item-form.tsx` continues to name only original IDs from the map.
- The new Builder page cases failed before the fix because both legacy cases lacked the notice. The stored draft and its snapshot value were already preserved.

## Review Triage Log

- Low, rejected: A draft already resaved by an intermediate Builder with an empty array is byte-identical to a valid draft with no surviving matches. The work targets drafts with missing metadata and does not reclassify existing empty arrays.
- Low, patched: An origin without repeat scopes could show the notice even though no repeat warning can be missing.
- Low, patched: The reload case now checks the changed repeat ID. It would fail if the edit did not save.

## Verification

- `bun test src/builder/attached-files.test.ts src/builder/item-form.test.tsx src/builder/builder-store.test.ts`: 85 passed. The form cases retain the original `attacks` ID after reorder or removal and reload.
- Chromium: an older draft displayed the notice on restore. After a visible title edit and reload, it kept the edited title and the notice.
