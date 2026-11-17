# TASK-94: Root token links exclude repeat-tab-only cells

## Intent

A root token link must name a token cell in the sheet root. A token cell that exists only inside a repeat tab requires that tab's repeat scope and block instance.

## Acceptance

1. A root `link-set` target for a token cell that exists only in a repeat tab is inert or refused.
2. A preset change that turns an ordinary token-bearing tab into a repeat tab clears the obsolete root `link:` record through existing migration behavior.
3. Root linkability and picker targets contain no root target when a template has token cells only in repeat tabs.
4. Root token cells and properly scoped repeat-tab links remain live.

## Boundaries

- Preserve the current two-part repeat-tab link path.
- Keep TASK-92 visibility and TASK-95 filtered navigation unchanged.
- Do not add a migration-only exception: root liveness remains the shared contract for link command, picker and preset-change cleanup.

## Verification

Lock core public-consumer regressions for `liveLinkTarget`/the link command, `presetDiff`, and `pickerGroups`; then run their focused owner command and the source checks selected by `CLAUDE.md`.
