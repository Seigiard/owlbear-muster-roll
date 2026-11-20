---
id: TASK-111
title: Make unavailable warning identity explicit for older Builder drafts
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-18T09:52:00Z'
updated_date: '2026-11-20T07:15:00Z'
labels:
  - format-v4
  - optional-follow-up
dependencies: []
references:
  - TASK-80
  - src/builder/builder-store.ts
  - src/builder/document.ts
priority: low
type: enhancement
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Builder drafts saved before durable origin metadata contain an edited preset and the original preset, but no stable correspondence after moves or removals. TASK-80 now preserves that correspondence for new saves. Older drafts remain readable with all preset and snapshot data, but cannot reliably name the original block in destructive-change warnings. Positional guesses would name the wrong block. This compatibility limit was found during the TASK-80 warning-lifecycle repair; no affected live user is known, so it is outside preset-v4 completion scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Restoring an older draft preserves its preset, origin, filename and snapshot records.
- [x] #2 When original block correspondence is unavailable, the Builder communicates that limitation without naming a guessed block.
- [x] #3 Drafts with durable identity metadata retain exact loaded-block warnings after reorder, removal and reload.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep missing repeat identity distinct from a known empty map at the draft read/write boundary.
2. Show one draft-level notice when an opened origin lacks that metadata. Do not infer a match.
3. Verify the preserved draft, notice after re-save, and existing exact warnings after move, removal, and reload.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance evidence (85 Builder tests passed): the page cases restore the edited preset, origin, draft name, and snapshot records and show the snapshot value 12. A draft missing the repeat identity field shows the notice with no named block, after both restore and another save; the known-empty and no-original-repeat cases show no notice. Loaded-repeat form cases still name attacks after reorder or removal of a preceding section and reload.
A draft previously rewritten with an empty array is indistinguishable from a known empty map and is not reclassified.

Chromium showed the notice and the edited title after a real title edit and reload.
The first full browser run stopped after the Node 26 Vite server aborted. TASK-144 records the crash separately. The retry uses Node 22, the version configured in CI. Two concurrent full Bun runs timed out in different 5-second oxlint fixtures. The fixture file then passed 10/10 on its own.

Full Chromium retry passed 588/588 on Node 22.19.0 with three workers: mise exec node@22.19.0 -- bun run test:browser --workers=3. The Chromium and Node 22 build checks ran before merging TASK-108 from master. The merge needed only the union of two deferred-work entries.

Formatting, lint, typecheck, build and formal drift passed. The complete Bun retry without browser workers passed 3662 tests (1 skipped) and the mutation run killed all 55. After merging the Builder compiler refactor from master, typecheck, 85 Builder tests, the 56-test Chromium Builder profile without failures, skips or flakes, and the explicit legacy reload scenario passed again.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Builder restores older drafts unchanged and shows a general warning when it cannot identify the original repeat blocks. The notice survives a save and reload. Drafts with tracked repeat identity still name the exact blocks after reorder, removal, and reload. All three acceptance criteria passed. TASK-144 tracks the unrelated browser server crash under Node 26.
<!-- SECTION:FINAL_SUMMARY:END -->
