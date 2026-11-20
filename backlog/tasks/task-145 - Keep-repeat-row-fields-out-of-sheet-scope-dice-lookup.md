---
id: TASK-145
title: Reject repeat fields that reuse an enclosing field id
status: Done
assignee:
  - '@codex'
created_date: '2026-11-20T07:42:00Z'
updated_date: '2026-11-20T14:32:00Z'
labels:
  - review-follow-up
dependencies: []
references:
  - TASK-101
  - src/core/preset.ts
  - src/core/dice-roll.ts
priority: medium
type: bug
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A valid v4 preset can reuse a field id in a repeat row and the sheet scope. When a repeat row with a check field named `bonus` comes before the sheet row with numeric `bonus = 4`, a sheet dice cell running `1d6 + bonus` returns 1 with a die face of 1. Moving the repeat row after the sheet row returns 5. Reproduced through `parsePresetFile` and `rollDiceCell` during TASK-101 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Preset parsing rejects a field id reused by a repeat scope and any enclosing scope, regardless of row order, with a Russian diagnostic naming the id and both locations. Upload, import, and Builder use this validation.
- [x] #2 Unrelated scopes may still reuse field ids, and repeat-id rules stay unchanged, including TASK-100 and TASK-108 cases.
- [x] #3 The published format, product format spec, and Scope glossary entry document the rule; the example and bundled presets parse successfully.
- [x] #4 Builder Add field suggests an id that avoids enclosing field IDs and IDs of descendant fields. Adding a field to a valid draft does not introduce a scope conflict.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add order-independent enclosing-field validation to the rules shared by file parsing and Builder. Keep repeat ids and dice lookup unchanged.
2. Show the Russian diagnostic with both cell locations. Update the format reference, product spec, glossary, and example.
3. Verify the regression, valid repeat-id reuse, bundled presets, and the changed-path checks; open a PR with automerge.

4. Reserve field IDs in related scopes for Builder Add field, with a regression proving export remains possible.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision (2026-11-20): «145 валидация, ошибки не нужны т.к. я один ГМ, у меня ща нет таких проблем. а позднее и не будет». Replace the dice lookup fix with preset validation, with no compatibility mode or warning. Scope: one GM in one window; no race, multiple-GM, or role-change work.

TASK-100 and TASK-108 primarily cover repeat-id reuse. TASK-100 also includes a field-shadowing subcase that the new contract rejects; keep valid ancestor and local lookup controls using distinct field ids. Room snapshots contain values, not a preset; Builder preset import, window upload, and encoded-preset decoding go through parsePresetFile, and Builder draft problems use presetProblems.

Implementation 269fafbe1010110677ccddd2e96baf4aca70898d: 414 focused tests pass; 3677 unit tests pass with 1 environment skip; 55/55 mutants killed; build, lint, typecheck, format, formal drift pass. Chromium submitted the same invalid file through window upload and Builder; both show the id and both JSON cell locations. Focused review (2/2) found that Add field can generate a newly forbidden id from a valid Builder draft. Reproduced with sheet bonus and repeat label Bonus: addCell generates bonus, then builderProblems reports shadowed-field-id. CAP-24 expects generated ids to follow the preset rules; awaiting scope decision before publishing.

Orchestrator decision (2026-11-20): include the CAP-24 Add field suggestion fix and regression so validation does not break the normal Builder flow. Keep manual formula rename out. Full Chromium suite passed on the initial validation implementation: 588/588, with four workers.

Final owner severity: upload and file import reject the preset. During Builder structure editing the field shows a warning and stays editable. Preset export uses the existing problem gate, so export is unavailable until the field id is corrected. CAP-24 Add field now avoids conflicts in either direction. Manual formula rename is tracked separately as TASK-150.

Final evidence on the merged base: 343 focused tests; full unit 3680 pass, 1 environment skip; mutants 55/55; format, lint, typecheck, build, backlog doctor, and formal drift pass. Chromium uploaded and imported the invalid file, showed the editable field warning, blocked export, and downloaded the corrected preset. Full browser 587/589: timeouts in tests/cell-name.e2e.ts:300 and tests/player.e2e.ts:145 passed in isolated single-worker file runs (11/11 and 15/15); known TASK-142 load flake, no new issue. Confirming review: 2/2 reviewers, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preset upload and import reject field IDs shared with an enclosing scope, naming both cells in Russian. Builder flags the warning without blocking structure edits, keeps export blocked until corrected, and suggests safe IDs when adding fields. Repeat IDs and dice lookup are unchanged. The format references and examples were verified. Manual formula rename is tracked in TASK-150.
<!-- SECTION:FINAL_SUMMARY:END -->
