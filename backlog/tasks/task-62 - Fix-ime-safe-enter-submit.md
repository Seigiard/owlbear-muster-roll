---
id: TASK-62
title: Fix ime-safe-enter-submit
status: To Do
assignee: []
created_date: '2026-11-14T08:28:00Z'
updated_date: '2026-11-14T08:33:00Z'
labels:
  - bug
  - ui
dependencies: []
references:
  - src/ui/sheet/use-field-edit.ts
  - src/ui/sheet/duplicate-count.tsx
  - src/builder/item-form.tsx
  - src/builder/formula-input.tsx
priority: medium
type: bug
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An anti-slop lint pass (rule ime-safe-enter-submit) flagged keydown handlers that act on Enter without checking whether the key ends an IME composition. With a CJK input method, the Enter that confirms composed text reaches keydown with event.isComposing true, or with the legacy keyCode 229 in some browsers; a handler that treats it as submit commits half-typed text. The sheet field editor already guards this at src/ui/sheet/use-field-edit.ts:347-351. Three other inputs do not: the repeat-block duplicate count (src/ui/sheet/duplicate-count.tsx:143, Enter confirms), the builder id input (src/builder/item-form.tsx:825, Enter commits the rename) and the builder formula suggestions (src/builder/formula-input.tsx:94, Enter or Tab inserts the active match). The interface is Russian, which needs no IME, but names, labels and formula text can be typed with any input method, and a full-width digit composition hits the count input too. Independent oracle: UI Events, keydown during composition carries isComposing = true; keyCode 229 is the legacy signal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 duplicate-count.tsx, item-form.tsx IdInput and formula-input.tsx ignore a keydown with isComposing true or keyCode 229, the same way use-field-edit.ts does; one shared predicate is fine if it stays in src/ui
- [ ] #2 A mounted test for the duplicate count sends an Enter keydown with isComposing true and sees no confirm, then a plain Enter and sees the confirm
- [ ] #3 Document or builder tests cover the id input and the formula suggestions the same way, or the task notes state which existing test harness cannot send a composing keydown and why
- [ ] #4 Browser tests for duplicate, builder rename and formula suggestions pass unchanged
<!-- AC:END -->
