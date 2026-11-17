---
title: 'Restore repeat-tab preview editing and token reveal context'
type: 'bugfix'
created: '2026-11-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md'
---

<frozen-after-approval reason="task acceptance criteria">

## Intent

**Problem:** The rendered body of a selected repeat tab does not expose its repeat-block instance to descendants. Builder preview edit entry therefore creates a root key instead of the selected block key, and token opening cannot find a below-fold target to reveal.

**Approach:** Preserve the existing rendered-tab identity and role policy, while making the selected repeat block an ancestor context for its rendered body. Prove the public Builder and window behaviors in a dedicated browser regression file.

## Boundaries & Constraints

**Always:** Keep TASK-91 rendered-tab identity and TASK-95 role-filtered selection intact. Apply the existing open-flow reveal and focus policy. The browser tests must observe edit entry, snapshot value output, and an initially below-fold token target.

**Never:** Change field write policy, change token-link rules, move tests owned by TASK-93 from `tests/repeat-tab-dice.e2e.ts`, or request a full browser suite without the parent’s explicit slot grant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Builder selected repeat tab | A GM double-clicks or presses Enter on a field in the selected block | The matching field enters edit mode and saving changes only that block in the snapshot | Existing role/write policy still prevents disallowed edit entry |
| Linked repeat-tab token | The open flow selects a visible repeat tab whose linked cell starts below the viewport | The target cell is revealed and receives focus when the request includes focus | A missing block remains a settled no-op under the existing policy |

</frozen-after-approval>

## Code Map

- `src/ui/sheet/sheet-body.tsx` -- renders a selected repeat tab, locates its reveal target, and applies focus.
- `src/builder/preview-pane.tsx` -- derives a Builder preview field key from the repeat-block ancestor.
- `src/ui/sheet/preset-section.tsx` -- establishes the existing repeat-section block DOM convention.
- `tests/repeat-tab-context.e2e.ts` -- dedicated browser owner for this task’s public Builder and token-open regressions.

## Tasks & Acceptance

**Execution:**
- [ ] `src/ui/sheet/sheet-body.tsx` -- expose the selected rendered tab block through the established DOM context -- lets Builder edit selection and token reveal resolve the same instance.
- [ ] `tests/repeat-tab-context.e2e.ts` -- add public browser flows for Builder edit/value output and below-fold linked-token reveal/focus -- prevents label-only false greens.

**Acceptance Criteria:**
- Given a selected Builder repeat-tab block, when the user double-clicks or presses Enter on its field, then edit entry targets that block.
- Given an allowed Builder edit, when it is saved, then only the selected block’s snapshot value changes.
- Given a linked repeat-tab cell below the visible area, when its token opens with focus requested, then the cell is revealed and focused.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx playwright test tests/repeat-tab-context.e2e.ts --workers=1` -- expected: Builder edit/value and below-fold reveal/focus regressions pass.
- `bunx oxfmt --ignore-path .gitignore --check .` -- expected: formatting passes.
- `bun run lint` -- expected: lint passes.
- `bun run typecheck` -- expected: typecheck passes.
- `bun test` -- expected: unit tests pass.
- `bun run build` -- expected: production build passes.
