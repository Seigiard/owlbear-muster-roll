---
id: TASK-114.3
title: 'UI: rows, reveal and tab identity carry the block address'
status: To Do
assignee: []
created_date: '2026-11-18T18:24:00Z'
updated_date: '2026-11-18T18:55:00Z'
labels: []
dependencies:
  - TASK-114.2
parent_task_id: TASK-114
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third PR of TASK-114. preset-section.tsx builds DiceRow with `instanceId`, `target` and `sectionId` and computes the scope chain four times (main.tsx once more); tokenTargetOf rebuilds a path from `row.target` or `[sectionId, instanceId]`; sheet-body.tsx and preset-section.tsx serialise the path into `data-repeat-path` with JSON.stringify and find it again with querySelectorAll and string compare; use-repeat-blocks.ts applies a different rule for when the wire `path` is present; navigation.ts encodes a repeat-block tab as a string key beside a numeric one; replica-client.ts `wireCommand` copies the path a third way. Accepted shape: `plainRows` and `repeatBlocksOf` produce the address once and dice place, field target, token target, reveal, duplicate, delete and add carry it unchanged; the DOM attribute holds the address key and reveal looks it up by one selector; the `block-revealed` event carries an address; `TemplateTabSelection` string form becomes `{sourceIndex, block}` while the numeric legacy form and `isLegacyTemplateTabSelection` stay for the later tab-identity work; `wireCommand` is the only serialisation point. The Builder preview (`preview-pane.tsx` own command application) is not migrated: candidate 3 of the architecture review replaces it with the engine; record this in deferred-work.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/ui holds no even-index filter, `path.length > 2 ? path : undefined` or `[sectionId, instanceId]` reconstruction outside `replica-client.ts` wireCommand
- [ ] #2 Reveal of a nested block, a copied nested block and a repeat tab finds its element by the address key: the existing e2e journeys for TASK-109 and nested token open pass
- [ ] #3 `TemplateTabSelection` has no string-encoded path form
- [ ] #4 UI "lock" tests (`link-picker-*-v4`, `*-review-fix`) that assert the old shapes are folded into the owning module tests or deleted when the type now forbids the case
- [ ] #5 deferred-work.md records that the Builder preview keeps the wire form until candidate 3
- [ ] #6 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spec decision: the dice place (roll-request, LOCAL wire) sends `path` whenever its block is not null, so plain rows in a tab block start sending path:[scope,id]; intended, nothing stores that message.
<!-- SECTION:NOTES:END -->
