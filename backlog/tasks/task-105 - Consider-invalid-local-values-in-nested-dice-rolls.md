---
id: TASK-105
title: Consider invalid local values in nested dice rolls
status: To Do
assignee: []
created_date: '2026-11-18T07:27:00Z'
updated_date: '2026-11-20T06:15:00Z'
labels: []
dependencies: []
priority: low
type: bug
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up from preset-v4 review 02-after-fix, adversarial-2 and adversarial-3. At 428d1f8, local-field-values.ts selects displayed roll overlays by leaf target identity. Constructed cases: invalid text in an enclosing bonus field is omitted from a child roll; invalid text in a source child can affect a duplicated child with the same leaf instance id. The owner asked to prioritize ordinary valid-input flows. These invalid-input combinations do not block TASK-79/80/88/77. Review findings are source-confirmed, not live-room reproductions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If selected, a child roll uses local values and errors from its exact block and its ancestors: an invalid value in an enclosing (parent) field reaches the child roll as a field error.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validity check 2026-11-20 at 34131dc. The source/duplicate crossover case is closed: shownForRoll's sameTarget compares the full block address through sameAddress (commits 39e3176, 080a532), and a probe confirmed a duplicated child under another parent instance does not see the source child's invalid value. The remaining case is open: shownForRoll (src/ui/sheet/local-field-values.ts) reaches only the rolled row and plain rows, so an invalid value in an enclosing parent field is omitted from a child roll. AC narrowed to that case.
<!-- SECTION:NOTES:END -->
