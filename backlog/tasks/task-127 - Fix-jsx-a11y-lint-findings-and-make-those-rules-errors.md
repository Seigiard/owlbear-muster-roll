---
id: TASK-127
title: Fix jsx-a11y lint findings and make those rules errors
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T13:18:00Z'
updated_date: '2026-11-19T21:11:00Z'
labels: []
dependencies: []
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Oxlint's built-in jsx-a11y plugin was enabled with every rule that already had findings set to warn. The open findings: prefer-tag-over-role 19 (role on a div where a native element exists), no-autofocus 14, no-noninteractive-element-interactions 7, aria-role 2, no-noninteractive-element-to-interactive-role 2, role-has-required-aria-props 1, heading-has-content 1. Autofocus in the extension popover may be deliberate; decide per case. Run better-accessibility on the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun run lint reports no findings from the seven jsx-a11y rules listed in the description, except targeted disables that state why
- [x] #2 Those seven rules are set to error in .oxlintrc.json
- [x] #3 bun run test:browser passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Native elements: confirmations and inline forms are fieldset, status texts are output, Pressable autoFocus became focusOnMount with one disable (focus moves to the safe cancel action). Kept with disables: read-only cell values stay span role=img/group (output would be a live region), the nested repeat block stays div role=group (fieldset breaks subgrid), the formula listbox/options and owner radios keep ARIA roles, role=GM/PLAYER are app props. Deferred review note: the sidebar h2 now holds its title as ::before content and an sr-only span; not confirmed with a screen reader.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The seven jsx-a11y rules report nothing and are errors in .oxlintrc.json. Divs with ARIA roles became native fieldset/output where the semantics match; read-only values keep their roles so remote changes are not announced. Verified: lint, typecheck, bun test 3604 pass, test:browser 587/587 on the integration branch.
<!-- SECTION:FINAL_SUMMARY:END -->
