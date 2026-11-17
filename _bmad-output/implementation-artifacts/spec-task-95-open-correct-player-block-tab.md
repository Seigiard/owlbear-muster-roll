# TASK-95: Open the correct player block tab after preceding GM-only tabs

## Scope
Verify role-filtered token opening after TASK-91's rendered-tab identity conversion. The browser contract covers a player opening a public token in a repeat section and a repeat tab after a preceding GM-only tab.

## Acceptance mapping
- A public repeat-section token opens `Gear`, not `Stats`, and reveals its target block.
- A public repeat-tab token for `A` opens `A`, not `B`.
- Existing browser contracts retain player denial for hidden targets and GM token opening.

## Boundaries
- `src/ui/main.tsx` maps the full rendered-tab result from `repeatBlockTabIndex` to the role-filtered visible rendered tab and passes its stable tab key to navigation.
- `src/ui/navigation.ts` keeps the selected tab by the supplied stable key.
- Browser tests use the public mock-adapter context-menu token-open flow.

## Non-goals
- TASK-96 owns missing `data-repeat-block` context and below-fold reveal.
- TASK-93 owns dice coverage and core dice behavior.
