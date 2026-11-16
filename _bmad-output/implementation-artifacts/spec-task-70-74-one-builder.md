---
title: 'TASK-70–74: Edit values and attached files in one builder'
type: 'feature'
created: '2026-11-15'
status: 'in-progress'
baseline_commit: '695b4cc1e5275e372f9a62c683b9fa873ba311b3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-muster-roll/builder-and-dev.md'
  - 'docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The builder shows snapshots but cannot edit their values, show the player view, or keep files on disk synchronized. Separate dev pages duplicate its preview.

**Approach:** Complete TASK-70–74: selected-cell editing, GM/player view, file blocks, Chromium synchronization, then obsolete-page removal. Keep one preset, snapshot, draft and undo history.

## Boundaries & Constraints

**Always:** Reuse window/sheet rendering and core visibility. Structure edits affect every template sheet. Follow ADR 0002: pure reducers, `useReducer`, effects/ports in React callers. Keep Russian copy in `src/copy.ts`. File access has a port and Bun/Playwright fakes. Preserve file checks and refusal messages.

**Never:** Add replica/mock/Owlbear runtime to the builder, reload reattachment, or Safari/Firefox write/follow. Deployment stays with the owner.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Select | First cell click | Tree/form select its item | No value change |
| Edit | Second click or Enter | Edit snapshot value | Escape exits; selection stays |
| Dice | Second dice-cell click | Roll through existing formula path | Existing formula errors |
| Structure | Template edit | All its sheets change | Whole-step undo |
| Player view | «Мастер / Игрок» | Same records; GM-only sets/sheets/tabs disappear | Hidden open sheet shows a note |
| Player editing | Sheet-set sheet / single sheet | Set reads only; `players: "edit"` stays editable | No snapshot owners/rights |
| File blocks | Preset and snapshot | Kind, filename or «черновик»/«пусто», status dot/line | Menu: location, last sync |
| File actions | Open, preset example, save as, copy, detach, clear | Actions replace old top-bar controls | TASK-72 save as downloads |
| Clear | Confirm document clear | One confirmation names linked file; clear both | Undo restores both |
| Page edit | Attached Chromium file | Write immediately; show when | Problems pause writing; fixes resume it |
| Disk edit | External save | Redraw without reload; show when | Invalid file keeps last good content and shows refusal |
| Conflict | Both changed | «Взять из файла» / «Оставить мои» | Respect choice |
| Fallback | API unavailable | Open/download only | No write/follow claims |

</frozen-after-approval>

## Code Map

- `src/builder/preview-pane.tsx`, `preview-navigation.ts`: selection/navigation/rendering.
- `src/builder/builder-store.ts`: history, draft, records, reconciliation; no file I/O.
- `src/ui/sheet/use-field-edit.ts`, `dice-button.tsx`, `src/core/dice-roll.ts`: editing/roll reuse.
- `src/core/visibility.ts`, `src/ui/shell/sidebar-entries.ts`: visibility/sidebar; preserve stable uids.
- `src/builder/builder-page.tsx`, `problems.ts`: file controls and problem gating.
- `src/core/snapshot-import.ts`, `snapshot-file.ts`: parsing/encoding.
- `src/platform/ports.ts`: capability conventions; builder file access stays Owlbear-independent.
- `vite.config.ts`, `scripts/preview-plugin.ts`: obsolete wiring.
- `tests/builder.e2e.ts`, `tests/builder-snapshot.e2e.ts`: existing browser seams.

## Tasks & Acceptance

**Execution:**
- [x] TASK-70: preview/store, interaction module and tests — editing/rolls.
- [x] TASK-71: preview/navigation, copy and tests — role/visibility/write policy.
- [x] TASK-72: page, file-block component/state, history, copy, glossary and tests — file menus; define File block.
- [x] TASK-73: file-access port, browser implementation/fake, caller/reducer and tests — write/follow/refusal/conflicts.
- [ ] TASK-74: remove `room.html`, `preview.html`, their page modules, scripts, plugin and obsolete e2e tests; update `package.json`, `vite.config.ts`, `CLAUDE.md`, `presets/README.md`, `docs/preset-format.md` and `GLOSSARY.md`. Preserve mock `index.html` for e2e only.

**Acceptance Criteria:**
- Given preset/snapshot content, when matrix actions run, then their observable results hold.
- Given completed changes, when dev starts, then the builder remains the standalone entry; `dev:owlbear` stays separate.
- Given the integration tip, when full checks run, then all pass.

## Implementation Notes

- The owner approved the complete plan and continued implementation on 2026-11-15.
- TASK-70 adds selected-cell editing through the existing field-edit path and a pure preview reducer. Dice cells evaluate on second click. Validation passed: 3192 unit tests, one existing environment skip, 537 browser tests, formatting, lint, types and build. A separate real-preview control observed RNG consumption; no rendered numeric dice face is claimed.
- TASK-71 adds the GM/player switch, core visibility projection, player write policy and hidden-sheet note. Number fields retain their existing textbox behavior. Final validation passed: 3192 unit tests, one existing skip, 540 browser tests and all static/build checks. Mutation controls proved detection of empty projected records and leaked GM-only tabs.
- TASK-72 replaces top-bar file actions with preset/snapshot file blocks and adds their glossary term. Save-as downloads current encoded content; clear names the file and undo restores content. Final recovery preserves a sample for each empty set and the existing snapshot reconciliation/export rules. Validation passed: 3192 unit tests, one existing skip, 547 browser tests and all static/build checks.
- TASK-73 adds the file-access port, Chromium adapter, file synchronization and conflict choices. Save File/Save As writes and attaches the selected handle; Download Copy stays separate. Preset follow preserves compatible snapshot values. Confirmed Clear/Undo updates both page and file. Final validation passed: 3208 unit tests, one existing skip, 547 browser tests and all static/build checks. Mutation controls and a fresh real-Chromium OPFS control passed on the recovery tip. Native picker permission/cancellation and external OS-process delivery remain unverified.

## Spec Change Log

## Review Triage Log

## Design Notes

Separate ticket worktrees and TDD locks. Shared preview/store/page paths favor 70 → 71 → 72 → 73 → 74. TASK-68 is Done on owner-confirmed live evidence.

Browser handles expose names, not absolute OS paths. Show only exposed location information.

## Verification

- Declare independent test oracles from the task/approved contract before edits. Exercise public store/port/browser behavior.
- Fakes prove app logic, not native permission or Owlbear semantics.
- Name replacement builder coverage when retiring page tests; no source-absence tests.
- Run `CLAUDE.md` full source checks per ticket and on integration; reuse unchanged evidence.
- Read changed Backlog tasks, run `backlog doctor`, check the diff. Markdown formatting is skipped.
- One closing `code-review`; PR with requested auto-merge.
