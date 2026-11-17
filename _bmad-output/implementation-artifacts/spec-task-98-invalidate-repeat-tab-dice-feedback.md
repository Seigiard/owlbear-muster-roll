---
title: 'Invalidate repeat-tab dice feedback after remote block edits'
type: 'bugfix'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
context:
  - '{project-root}/GLOSSARY.md'
---

<frozen-after-approval reason="task acceptance criteria">

## Intent

**Problem:** A dice result or field error remains visible after another client changes the repeat-tab block that owns the dice cell. The sheet-value signature excludes repeat-tab block records.

**Approach:** Include each repeat scope from all tabs exactly once in the signature that `DiceButton` consumes. Add a focused mock-room browser regression that observes stale visible feedback, a real second-client edit of the selected repeat-tab block, and cleared feedback.

## Boundaries & Constraints

**Always:** Preserve root, repeat-section, repeat-row and cross-tab formula invalidation. Deduplicate every scope across tabs. Test through the public dice feedback and remote-client edit boundary.

**Never:** Inspect signature representation or private React state in the regression. Change `main.tsx`, `preview-pane.tsx`, `copy.ts`, shell presentation, or add a broad benchmark project.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected output |
|---|---|---|
| Repeat-tab stale feedback | Selected repeat-tab block produces a field error | The visible error stays until a relevant value changes |
| Remote block edit | A second GM changes a field in that repeat-tab block | The first client receives the block record update |
| Invalidated feedback | The first client receives that remote update | The visible dice error clears |
| Existing scopes | Root, repeat-section, repeat-row and another-tab formula fields | Their existing invalidation behavior remains unchanged |

</frozen-after-approval>

## Code Map

- `src/ui/sheet/sheet-body.tsx` -- creates the sheet-value signature consumed by `DiceButton`.
- `src/ui/sheet/dice-button.tsx` -- existing public feedback consumer that clears a message on signature change.
- `tests/repeat-tab-dice.e2e.ts` -- mock-room browser owner for repeat-tab dice behavior.

## Tasks & Acceptance

**Execution:**
- [x] Lock a public mock-room regression that shows an error, performs a second-GM field edit in the selected repeat-tab block, and observes the error clear.
- [x] Add repeat-tab scope records once to the sheet-value signature, retaining all established scopes.
- [x] Calibrate the regression by excluding the repeat-tab scope from the signature and observing that stale feedback remains.

**Acceptance Criteria:**
- Every relevant root, repeat-section, repeat-row and repeat-tab block contributes once per computation across all tabs.
- A remote repeat-tab block change clears stale dice result or field error by the existing `DiceButton` behavior.
- Cross-tab formulas, ordinary repeat scopes and local edit invalidation stay correct.
- The regression observes public feedback and remote delivery rather than signature shape or private state.

## Verification

- `bunx playwright test tests/repeat-tab-dice.e2e.ts --workers=1`
- `bunx oxfmt --ignore-path .gitignore --check .`
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run test:browser`
- `bun run build`

Final SHA `5baf4f475107cbd7d0f4064552c466a4f8389b9d`:

- The focused regression first failed on the old behavior, then passed after the repair. It uses two mock-room GMs, sees the exact field error under the first GM's dice button, changes the selected repeat-tab block through the second GM's field control, and sees the first feedback live region clear.
- Calibration removed only the repeat-tab prefix loop. The focused command exited 1 at the protected assertion: remote `hp` became `10` while the old field error stayed. Raw mutation diff and output: `/Users/seigiard/.claude/artifacts/preset-v4-window3-20261117/task-98/calibration-repeat-tab-prefix.{diff,log}`.
- Format, lint, typecheck, unit and build checks exited 0 in `/Users/seigiard/.cache/herdr-run/task98-w3-nonbrowser-5baf4f.{sh,log,exit,meta}`; unit result: 3413 pass, 1 skip, 0 fail.
- The parent-reserved full browser check `bun run test:browser --workers=2` exited 0 with 571 passed in `/Users/seigiard/.cache/herdr-run/task98-w3-full-browser-5baf4f.{sh,log,exit,meta}`.

## Risks

- The mock-room regression proves application behavior only. A live Owlbear-room check remains outside this ticket's automated scope: roll `Beta` with missing `hp` in one GM client, edit `Beta` from another, and confirm the first feedback live region clears.
