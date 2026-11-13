---
id: TASK-59
title: Hide a tab from players
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T18:50:00Z'
updated_date: '2026-11-13T00:34:00Z'
labels:
  - v3
dependencies:
  - TASK-58
type: feature
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A GM wants a part of a visible sheet that only GMs see, such as GM notes on a character. The owner decided that a tab, like a template, can be GM-only in the preset; visibility only narrows, and there is no per-sheet runtime hiding. Today token-links.ts and the engine open path check only the template, so a tab rule must reach every reader at once. Story 2 of _bmad-output/specs/spec-muster-roll/stories.yaml; binding rules AD-4 "Rule, one edit check", AD-13, AD-18 (one core/visibility function for sheet, tab and link target), AD-19 and the Visibility convention (records filtered by template only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A tab with visibility gm is shown to GMs and not to players; a visible template whose every tab is hidden is accepted and shows players the header with no tab
- [x] #2 A roll from a hidden tab shows only on GM clients, and a player replica refuses a hidden roll request and sends nothing
- [x] #3 A player gets no token menu entry, no open and no selection mark for a repeat block on a hidden tab
- [x] #4 Every field on a hidden tab is read-only for a player, the sheet set name field included, and a GM client refuses a player proposal for such a field
- [x] #5 Records of hidden tabs stay in every replica, so the sheet name and rolls still read them
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built through the tdd chain (run dir ~/.claude/artifacts/tdd-20261112-230021/TASK-59) and three revmux review rounds (owlbear-task-59 01-initial, 02-after-fix, 03-after-fix). Commits: f8dae80 test slice, b613aeb implementation. Locked tests: tests/hidden-tabs.e2e.ts plus core, engine and access unit tests; guard tests calibrated by mutation. Full check on the final tree: oxfmt, lint, typecheck, build exit 0; bun test 2735 pass, 1 known TASK-60 baseline fail (copy.test.ts '+ Добавить'); test:browser 508 passed. Deferred test gaps are in deferred-work.md. A live Owlbear room check is the owner's.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A tab with visibility gm is now hidden from players. core/visibility gained tabShownTo, fieldTargetShownTo and linkTargetShownTo (AD-18): the tab row and content show only the tabs a role sees (no row with one visible tab), a roll from a hidden tab goes out hidden and gm_only and a player replica refuses it, a player gets no token menu entry, open or selection mark for a repeat block on a hidden tab, and records of hidden tabs stay in every replica and projection (only links to repeat blocks are filtered by tab). core/access playerMayEditField is the field edit check: the GM refuses a player proposal for a hidden-tab field, and the header shows a hidden-tab name with no input while the status follows the sheet write right. openTabIndex(layout, chosen, shown) picks the open tab per role (AD-26). Docs, spec preset-format and GLOSSARY (Hidden tab) updated. Verified by unit, engine and Playwright tests on the mock adapter; live Owlbear behavior still needs the owner's check.
<!-- SECTION:FINAL_SUMMARY:END -->
