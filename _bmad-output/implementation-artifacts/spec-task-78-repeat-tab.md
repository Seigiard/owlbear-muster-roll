---
title: 'TASK-78: Repeat tab — one tab per block'
type: 'feature'
created: '2026-11-16'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '2b3ead7ec919cdbda9d87ce18381cb1baa4b4147'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-muster-roll/preset-format.md'
  - '_bmad-output/specs/spec-muster-roll/storage-and-sync.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NPCs need separate tabs inside one sheet, not separate sidebar sheets or stacked section blocks.

**Approach:** Expand `repeat: {id, nameField}` tabs into one tab per block, through the extension's and Builder preview's shared frame.

## Boundaries & Constraints

**Always:** Keep stable block paths, explicit `nameField`, existing empty-name fallback, client-local selection, inherited visibility, source layout positions, per-cell merge and ancestor token labels. Tab-block creation/deletion is GM-only, including player-editable sheets.

**Never:** Add storage for the selected tab, convert old formats, deploy, or implement nested repeat scopes here. TASK-79 owns nesting; TASK-80 owns new Builder forms. Preserve the TASK-77 row-block, picker and visibility repairs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Block tabs | NPC tab scope with two named blocks | Two distinct tabs show their name-field values in block order | Empty names use the existing fallback |
| Add | GM presses the final "+" | An empty block is added and its tab opens | A refused or timed-out command is not reported as success |
| Player | Player views the same visible sheet | Block tabs and allowed content appear; no "+" or delete control | Engine also refuses tab-block creation/deletion by players |
| Delete | GM requests deletion inside a block tab | Existing sheet-deletion confirmation precedes removal of that block, values and token links | Cancel preserves the block |
| Token | Open a token cell in one NPC block | That expanded tab opens and its cell is revealed; map selection marks only the matching tab | Removed targets remain inert |
| Shared frame | Same preset and blocks in preview and extension | Both show the same expanded tabs and role-specific controls | Preview changes only its snapshot |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts`: `openTabIndex` currently counts source tabs. Separate rendered-tab identity from source tab position; keep ordinary-tab callers working.
- `src/core/records.ts`, `src/core/sheet-values.ts`, `src/core/sheets.ts`: reuse keys, ordered blocks, naming and TASK-77 scope repairs.
- `src/core/link-target.ts`, `src/core/token-links.ts`: resolve tab-block cells by path, and map open/mark requests to expanded tabs.
- `src/core/visibility.ts`: retain inherited visibility at the shared projection boundary.
- `src/ui/navigation.ts`, `src/ui/main.tsx`, `src/ui/sheet/sheet-body.tsx`: local selection and block context for fields/dice.
- `src/ui/shell/window-frame.tsx`, `src/ui/shell/tab-bar.tsx`: one frame and tab row; keep addition reachable with zero stored blocks.
- `src/replica/composers.ts`, `src/core/ui-messages.ts`: block commands, scope lookup, GM-only tab lifecycle.
- `src/builder/preview-navigation.ts`, `src/builder/preview-pane.tsx`, `src/preview/sample-records.ts`: use the same expansion; preview currently ignores non-field commands.
- `src/copy.ts`: shared Russian control text.

## Tasks & Acceptance

**Execution:**

- [ ] `src/core/preset.ts` and scope helpers — expanded tabs retain source position and block context.
- [ ] Link-target/token-links and navigation files above — open/mark the exact tab.
- [ ] Composer/message files above — GM lifecycle, confirmed deletion with values/links.
- [ ] Main/body/frame/tab-row files above — selected block, final add action and in-tab delete.
- [ ] Preview files above — shared expansion and functional snapshot-only add/delete.
- [ ] Focused core/engine owners and `tests/repeat-tabs.e2e.ts` — matrix red/green through public boundaries.
- [ ] `docs/preset-format.md` and canonical preset/storage contracts — remove only the repeat-tab restriction; TASK-79 owns nesting.

**Acceptance Criteria:**

- Given repeated and ordinary tabs, when blocks change, then `openTabIndex` counts expanded block tabs and selection remains local.
- Given the NPC sheet in either client, when a GM adds, opens or confirms deletion, then the matrix holds in both extension and preview.
- Given a visible player view, when the player opens a block tab, then its content follows access rules without GM lifecycle controls.

## Implementation Notes

Reconcile this map with the committed TASK-77 review fix before implementation.

Estimated footprint: 16–18 source files, 6–8 test files, 1.5 hours including verification. Keep this cohesive task under the user's autonomous 77 → 78 → 79 → 80 authorization.

The user's overnight authorization covers implementation without a routine approval stop. The parent re-read this spec, reconciled it with the verified row-scope repair at `db11acc8cb09c1f9cd057e5b38d4d3ad6fcf8f39`, and froze its intent before dispatch. `repeatScopeById` now resolves rows as well as sections; its section-shaped adapters retain the original row position. Extend this mechanism rather than restoring section-only assumptions. TASK-77 AC2's unproved temporary guard stays unchecked; this task advances tab support, not a claim that the earlier refusal existed.

The 90-minute run stopped bounded and unaccepted at `e3ab0d423e970c77729c7f7682a9ed1fbca39288`, after four phase turns. D6 remains: both extension and preview derive the final add action from rendered blocks, so zero blocks produce no "+"; deleting the last block leaves no way to add another. Use visible source repeat scopes for those actions. No scoped review ran. D5 also remains: readable outputs show 3377 Bun passes, one environment skip and 552 browser passes, but final-state attribution is report-only; the final format artifact is missing and exact final lint/typecheck/build logs and exits are unavailable. This is not six-check verification. The final four-path lock is `6e44fa3122cd8aedeac0099422c9ab2190307c64`, with accepted test-only fixture/locator corrections and unchanged behavioral expectations. All workers settled; no source work or review continues in the background. The run directory is `/Users/seigiard/.claude/artifacts/tdd-20261116-235951/task-78-repeat-tab`.

## Spec Change Log

## Review Triage Log

## Verification

- Focused core/engine owners and `tests/repeat-tabs.e2e.ts`: 3–5 minutes; observe real missing behavior before implementation.
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`: 2–4 minutes; no errors.
- `bun test`: 2 minutes; no failures, name any environment skip.
- `bun run test:browser`: 3–5 minutes; full suite passes outside the sandbox.
- `bun run build`: 1 minute; production bundle builds.
- `bun test src/core/preset.test.ts`: under 1 minute; published example remains valid. Reuse the full-suite result when it covers unchanged files.
- Backlog readback, `backlog doctor` and staged diff checks: under 1 minute.
