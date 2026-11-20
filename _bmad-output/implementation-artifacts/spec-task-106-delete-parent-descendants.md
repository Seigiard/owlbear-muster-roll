---
title: 'TASK-106: Delete descendants with their repeat block'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'fa8f4767a5399fffc950378187d7469656483857'
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0003-a-block-has-one-address-converted-at-the-storage-and-wire-edges.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Deleting a repeat block leaves its descendants in the replica with their values. A snapshot still includes them. When the GM loads that snapshot, the absent parent makes the import report those values as a new loss.

**Approach:** For a GM deletion, put a deletion version for each descendant in the same command batch as the parent. Keep deletion markers in the replica so that an older copy cannot restore the values. Leave unrelated blocks and existing deletion markers unchanged. Preserve token-link cleanup. A download followed by import against the same preset must report no loss from the deleted blocks.

The scope is one GM in one window. Leave player proposal delivery, role changes, rare failure and race recovery, and snapshot format and validation unchanged. Do not sweep descendants left by earlier deletions. They are already hidden, and an export-only filter would not clean the replica. A write sweep adds recovery and versioning policy for historical data without recovering any visible values.

</frozen-after-approval>

## Implementation Notes

- `src/core/compose.ts`: `composeRepeatBlockDelete` checks that the target is live. It already returns the parent marker first, followed by token-link markers. Keep the parent first because `pending-edits.ts` reads the first record as the proposed target. Select descendants using the complete `BlockAddress`, not a partial id or a string prefix. Skip already deleted records. Mint with the existing `tombstone` helper to preserve each block's lifecycle.
- `src/replica/command-routing.ts`: `composeCommand` applies and publishes the returned records together on the successful GM path. No routing change is needed. The existing storage batch can stop on write failure; this task adds no storage transaction.
- `src/core/snapshot-file.ts`: `encodeSnapshotFile` already excludes tombstones. Keep `src/core/snapshot-import.ts` unchanged so a file with actual orphaned values still reports the loss.
- Cover the batch and version through `src/core/compose.test.ts`. Cover the loss notice through a nested delete, download, and import in `tests/nested-repeat.e2e.ts`.
- `formal/edit-delivery/coverage.txt` lists `src/core/compose.ts`, but the model covers `composePending` for one block key and excludes repeat blocks. Verify that the modeled path stays the same, run its configurations, and advance the sync commit.
- Both regressions failed before the fix. The command omitted two deletion markers, and Chromium reported two lost values. After the fix, the command included both markers. Chromium showed the ordinary import confirmation and restored the surviving block's value from the downloaded snapshot.
- Full local verification passed: format, lint, types, Bun (3,672 passed, one environment skip), Chromium (589 passed), mutation checks (55 killed), and build. All edit-delivery configurations matched their expected outcomes, and formal drift passed after the sync update.

## Review Triage Log

- Two independent reviewers completed the focused review. No in-scope finding remained.
- Deferred an existing projection limit to TASK-149. Closing catch-up can withdraw too many pending keys for one window delta; the shared sender already has this limit on queued sheet deletion. The review found the path in source, not in a browser run.
