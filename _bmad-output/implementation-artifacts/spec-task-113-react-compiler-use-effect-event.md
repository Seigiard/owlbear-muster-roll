---
title: 'TASK-113 Cut the hook tax in src/ui with useEffectEvent and React Compiler'
type: 'chore'
created: '2026-11-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b34686e9c0d5157b176b274e941576f78180b599'
context:
  - '{project-root}/docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/ui/` carries hooks that exist only to fight re-renders and stale closures: latest-value refs for effects, timers and port callbacks, and `useMemo`/`useCallback` kept for referential identity. They hide behavior and add dependency-array noise.

**Approach:** Run the React Compiler (Babel `babel-plugin-react-compiler` through `@rolldown/plugin-babel` and `reactCompilerPreset` from `@vitejs/plugin-react`) in the Vite build and dev server, then remove identity-only memoization and replace latest-value refs with `useEffectEvent` (React 19.3) in `src/ui/`.

## Boundaries & Constraints

**Always:** ADR 0002 holds: reducers stay pure, one `useEffect` per state field; port/store subscriptions (register/unsubscribe pairs) stay effects. A kept `useMemo`/`useCallback` has a comment naming the behavior it protects. Each remaining compiler bailout under `src/ui/` is fixed or recorded in `_bmad-output/implementation-artifacts/deferred-work.md` with its cause. `@babel/core` stays on 7.x: Babel 8 makes the compiler bail out on every destructuring default.

**Decision (agent, 2026-11-20, reported to the owner):** `stateRef` in `use-field-edit.ts` is not a latest-value mirror. `update` writes it synchronously, and `onChange`, `onFocus`, `save` and the roll's `localValues` reader read it before the next render (for example a keystroke right after a timer-driven `update`). `useEffectEvent` cannot replace that, so `stateRef` stays with a comment naming this, and TASK-113 AC 4 is met for `latest` only; the task notes record why. Other synchronous refs found the same way (in-flight ids, focus flags, a signature read in a promise started from a handler) stay too.

**Never:** No edits outside `src/ui/`, `vite.config.ts`, `package.json`, `bun.lock` and the deferred-work entry (Builder bailouts are recorded, not fixed). No merging effects to dodge ADR 0002. No calling a `useEffectEvent` function from render or from a JSX event handler (React allows effect events only inside effects and their callbacks). No change to user-visible behavior or copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Typing pause save | text field, typing then 600 ms idle | one `field-patch` with the newest text | N/A |
| Enter then blur | Enter, then focus leaves before any re-render | Enter saves once; blur sends nothing more | N/A |
| Close while typing | `pagehide` or unmount with an unsaved draft | urgent `field-patch` with the newest draft | N/A |
| Prop change during pause | record value changes while a pause timer runs | timer saves against the newest place/record | N/A |

</frozen-after-approval>

## Code Map

- `vite.config.ts` -- add `babel({ presets: [reactCompilerPreset()] })` after `react()` (already drafted in the working tree; `bun run build` passes and output carries `react.memo_cache_sentinel`).
- `package.json`, `bun.lock` -- exact pins: `@babel/core` 7.29.0, `@rolldown/plugin-babel` 0.3.1, `babel-plugin-react-compiler` 1.0.0 (already installed).
- `src/ui/sheet/use-field-edit.ts` -- `stateRef` (L140, sync truth, stays), `latest` (L142, synced in a no-deps `useLayoutEffect` at L156, and mutated inside `save` at L255 so `frozenAtCurrent` sees the value just sent), `pauseTimer`, `focused`, `wasDisabled` (change detection, stays). `save` (L181) is a dep of the effect at L279 that registers the pagehide flush and calls `save('unmount')` in cleanup: a new identity would fire a spurious unmount save. Target: no `latest`; the pagehide/unmount/register/refusedTooLong effects call effect events; handler paths read current props; the pause timer must still save against the newest place/record (matrix row 4) — e.g. arm it from an effect on the draft, or pass the needed values explicitly. Pass the value just sent into `frozenAtCurrent` instead of mutating a ref.
- Classification (Explore pass): BEHAVIOR memos to keep or move to `useEffectEvent` at the consumer: `main.tsx` `mapMarks`/`sidebar`/`tabs`/`tabIds` (effect deps that dispatch) and `clearNameFocus`/`clearActionsFocus`/`clearBlockReveal` (deps of focus/reveal effects in `sheet-header.tsx:74,181` and `sheet-body.tsx:99` — make the consumer read the callback through `useEffectEvent`, then drop the `useCallback`); `window-view.ts` both memos (expensive decode; `records`/`links` identity drive effects); `link-picker.tsx` `arrivedTarget`/`links`/`linked` (effect deps; `linked` re-fetches from OBR); `tooltip.tsx` `hide` (listener effect dep); `preset-section.tsx` `closeDuplicate` (dep of `duplicate-count.tsx:46`; read `onDone` through `useEffectEvent` there, read `duplicateAsk` directly, drop `askedBlock` and its layout effect at L594). IDENTITY memos to delete: `main.tsx` `targetTokens`, `linkedTargets`, `pendingBySheet`, `mapView`, `editing`, `presetClient`, `rolling`, `blockTools`; `link-picker.tsx` `groups`, `linkedToTarget`; `access-panel.tsx` `rows`, `owner`; `preset-section.tsx` `rows`, both `blocks`, `instanceIds`; `sheet-body.tsx` `shownRecords`, `valuesSignature`, `diceSheet`; `tooltip.tsx` `show`, `hideIfInactive`; `sheet-header.tsx` `closeAccess`; `preset-actions.tsx` `sendUpload`. With the compiler on, a memo that only feeds an effect dep may also go when the compiler provably memoizes it; keep it with a comment when in doubt. `dice-button.tsx` `latestSignature` is read in a promise started from a handler: stays, with a comment.
- Other files with hooks (m=useMemo c=useCallback r=useRef e=effects): `main.tsx` m12 c3 e6; `picker/link-picker.tsx` m5 r4 e7; `preset-section.tsx` m4 c1 r2; `sheet-body.tsx` m3 r1; `access-panel.tsx` m2 r1; `window-view.ts` m2; `primitives/tooltip.tsx` c3 r6; `preset-actions.tsx` c1 r3; `sheet-header.tsx` c1 r3; `preset-cell.tsx` r4; `use-repeat-blocks.ts` r3; `settings/snapshot-actions.tsx` r2; `settings/wipe-actions.tsx` r2; `dice-button.tsx` r1; `duplicate-count.tsx` r1. DOM refs, timer handles and change-detection refs stay.
- Compiler bailouts today (Babel 7): `sheet/preset-section.tsx:416` (`RepeatContent`, ref read during render), `settings/snapshot-actions.tsx:44` (`refocus.current = true` during render, currently lint-disabled), `picker/link-picker.tsx:550` (`try/finally` in `apply`). Builder (out of scope, record only): `builder/preview-pane.tsx:90`, `builder/structure-tree.tsx:119`, `builder/builder-page.tsx:109`.
- Bailout probe: the scratch script `bailouts.ts` (runs `@babel/core` with the compiler logger over a directory) — re-create it outside the repo when needed; do not commit it.
- `.oxlintrc.json` -- React compiler lint rules (`react/refs`, `react/preserve-manual-memoization`, `react/exhaustive-deps`) already on; `exhaustive-deps` accepts an effect event omitted from deps.

## Tasks & Acceptance

**Execution:**
- [ ] `vite.config.ts`, `package.json`, `bun.lock` -- keep the drafted compiler wiring -- AC 1.
- [ ] `src/ui/sheet/use-field-edit.ts` -- drop `latest` and `stateRef`; effect events for timer, unmount and pagehide -- AC 4.
- [ ] remaining `src/ui/` files above -- remove identity-only `useMemo`/`useCallback`, replace latest-mirror refs with `useEffectEvent`, comment kept memos -- AC 3, 4.
- [ ] `preset-section.tsx`, `snapshot-actions.tsx`, `link-picker.tsx` -- fix each bailout or record its cause in `deferred-work.md` -- AC 2.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- one section "Deferred from: TASK-113" with the remaining bailouts, Builder included.
- [ ] TASK-113 notes -- before/after counts of `useEffect`, `useRef`, `useMemo`, `useCallback` in `src/ui/` (before: 42+3 layout, 38, 28, 12, matched with `use<Hook>(` or `use<Hook><`, tests excluded) -- AC 7.

**Acceptance Criteria:**
- Given the compiler in the Vite config, when `bun run build` and `bun run dev` run, then both pass and compile `src/ui/` components.
- Given the bailout probe over `src/ui/`, when it runs, then it reports nothing, or each remaining bailout has a `deferred-work.md` entry with its cause.
- Given the Playwright suite on the mock adapter (which runs the compiled app), when `bun run test:browser` runs, then it passes unchanged.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .` -- 1 min, exit 0
- `bun run lint` -- 1 min, exit 0
- `bun run typecheck` -- 1 min, exit 0
- `bun test` -- 3 min, exit 0
- `bun run build` -- 1 min, exit 0
- `bun run test:browser` -- about 10 min, outside the sandbox, exit 0
- `bun run mutants` -- CI and on request only; the user's PR CI covers it

## Implementation Notes

- Built through `implement`/`tdd` (run dir `~/.claude/artifacts/tdd-20261120-042349/task-113-react-compiler-use-effect-event/`). Babel 7, not 8: with Babel 8 the compiler bails out on every destructuring default.
- `stateRef` stays (spec Decision). `latest` is gone. The pause timer is armed by an effect on the draft, only for drafts typed in `onChange` (`Draft.typed`), so a too-large refusal is not re-sent.
- The reveal effect in `sheet-body.tsx` keeps `onRevealed` as a dependency: moving it to an effect event lost the token-cell focus (`tests/open.e2e.ts:253`).
- Remaining compiler bailouts are in `deferred-work.md`. The `tests/open.e2e.ts:253` focus flake came from react-aria's 80 ms fallback click on the sidebar entry; the test now waits for it.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence | Route |
|---|---|---|---|
| Too-large refusal re-arms the pause timer and re-sends (revmux 01 adversarial-claude-1) | high | Reproduced by the locked test in `tests/field-edit.e2e.ts` (red on 694b8b0) | fixed in 67ca7c6, 2108c65 |
| `readLocalValue` effect event called from a press handler (arch+quality-claude-3) | medium | `DiceButton.roll` calls `LocalFieldValues.read` synchronously | fixed in 67ca7c6 |
| Orphan `askedBlock` comment (adversarial-claude-3) | low | Comment named a deleted ref | fixed in aec4203 |
| deferred-work names a probe not in the repo (docs+tests-claude-4) | low | No probe script is committed | fixed in 793a36f |
| Enter/Escape between a pause save and its render freezes the old value (arch+quality-claude-4) | low | Needs a keystroke inside one render; fix adds state | rejected (low, rare) |
| Catch-up close in a layout effect commits the confirmation once (adversarial-claude-2) | maybe-false | The confirmation is already mounted when catch-up starts, so no new autofocus; `tests/snapshot.e2e.ts` and `tests/catch-up.e2e.ts` pass | rejected |
| Confirming round 02 (profile final) | none | 0 findings, sources 2/2 | done |
