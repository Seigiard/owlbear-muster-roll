# Token links and map selection

A GM links a token to a token cell. Opening the token selects the target
sheet, tab and repeat block. Map selection marks the linked targets.

## Sub-features

- `token-link`: choose a target in the picker and link or unlink a token.
- `token-open`: open the target sheet, tab and repeat block.
- `token-selection`: show selection marks and select linked tokens from a sheet.
- `token-lifecycle`: clear links when their token or target is deleted.

## How to get to it (user POV)

In Owlbear, use a token's link command to open the picker. Choose a sheet or
repeat block. Use the token's open command to return to the target.
In the sheet, use `Выделить на карте` for a linked target.

## Driving it with Playwright

Run `bun run verify tokens`. Existing `tests/link.e2e.ts` uses the mock token
menu boundary to open `/picker.html?token=tok-new`; picker actions then use
the actual UI. Follow its fixture setup rather than calling a link setter.

Use `tests/open.e2e.ts` to observe the selected sidebar entry, ordinary tab,
repeat tab and target block after an open command. Use
`tests/selection.e2e.ts` for both map-to-window marks and the window's
`Выделить на карте` action. Assert the target, not merely an open window.
Capture the mock scene output alongside the rendered target.

## Gotchas

- A standalone browser has no real Owlbear token context menu.
- The mock menu entry is an external host boundary, not proof of host wiring.
- TASK-109 records a known copied nested-target reveal problem.
- A linked token, target sheet and visible token cell are required preconditions.
