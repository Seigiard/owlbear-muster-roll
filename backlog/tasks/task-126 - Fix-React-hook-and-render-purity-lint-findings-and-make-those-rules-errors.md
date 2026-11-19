---
id: TASK-126
title: Fix React hook and render-purity lint findings and make those rules errors
status: To Do
assignee: []
created_date: '2026-11-19T13:18:00Z'
labels: []
dependencies: []
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Oxlint's built-in react plugin was enabled with every rule that already had findings set to warn, so the lint stays green. The open findings: react/refs 25 (refs read or written during render), react-hooks exhaustive-deps 9, react/set-state-in-effect 5, react/preserve-manual-memoization 3, react/use-memo 2, react/immutability 2. React Doctor also found a race that no oxlint rule reports: the effect at src/ui/picker/link-picker.tsx:474 has no cancel flag, so an older getTokenIds -> getItemBounds chain can finish last and write a stale setItemIds order. Some exhaustive-deps and set-state-in-effect cases may be deliberate under docs/adr/0002 (one useEffect per state field); keep those with a reason in a targeted disable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bun run lint reports no react/refs, react/exhaustive-deps, react/set-state-in-effect, react/preserve-manual-memoization, react/use-memo or react/immutability findings, except targeted disables that state why
- [ ] #2 Those six rules are set to error in .oxlintrc.json
- [ ] #3 The link picker effect ignores results from a superseded run, and a test shows an out-of-order resolution does not change the item order
<!-- AC:END -->
