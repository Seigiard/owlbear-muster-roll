---
id: TASK-113
title: Cut the hook tax in src/ui with useEffectEvent and React Compiler
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T17:19:00Z'
updated_date: '2026-11-20T03:20:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
  - https://react.dev/reference/react/useEffectEvent
  - https://react.dev/learn/react-compiler
priority: medium
type: chore
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The React window carries a layer of code that exists only to fight re-renders and stale closures, not to express behavior. On 2026-11-18 `src/ui/` had 52 `useEffect`/`useLayoutEffect`, 48 `useRef`, 34 `useMemo` and 14 `useCallback` calls. Most refs hold "latest" values for effects, timers and port callbacks (`src/ui/sheet/use-field-edit.ts` keeps five: `stateRef`, `latest`, `pauseTimer`, `focused`, `wasDisabled`); most memos and callbacks exist to keep referential identity for dependency arrays.

The question behind this task was whether to leave React (Solid 2.0, web-component primitives such as ui-sdk) to simplify the UI. The decision was to stay: `core/`, `replica/` and `platform/` carry the hard logic and are framework-free, ADR 0002 fixes the UI flow shape around `useReducer` plus one `useEffect` per state field, and `react-aria-components` has no mature framework-free replacement yet. The simplification that is available without a rewrite is in React 19 itself: `useEffectEvent` (stable since React 19.2) removes the latest-ref pattern, and the React Compiler removes hand-written memoization.

Scope: `src/ui/` only. ADR 0002 stays as it is: reducers stay pure, effects stay one per state field. Effects that subscribe to a port or a store (register/unsubscribe pairs) stay effects. The `muster-roll` lint rules in `tools/oxlint/` and the Playwright suite in `tests/` are the oracle that behavior did not move.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The React Compiler (`babel-plugin-react-compiler`) runs in the Vite build and in `bun run dev`, and `bun run build` passes with it
- [ ] #2 The compiler reports no bailouts for files under `src/ui/`, or each remaining bailout is recorded in `_bmad-output/implementation-artifacts/deferred-work.md` with its cause
- [ ] #3 Every `useMemo` and `useCallback` in `src/ui/` whose only purpose is referential identity is removed; each one that stays has a comment naming the behavior it protects
- [ ] #4 Every ref in `src/ui/` that only mirrors the latest value of a prop or state for an effect, timer or port callback is replaced with `useEffectEvent` or removed; `src/ui/sheet/use-field-edit.ts` keeps no `latest` or `stateRef`
- [ ] #5 Effect counts stay within ADR 0002: no reducer gains a side effect, and no `useEffect` is merged with another to dodge the rule
- [ ] #6 The full check from CLAUDE.md passes: oxfmt, lint, typecheck, `bun test`, `bun run test:browser`, `bun run build`
- [ ] #7 The task notes record the before and after counts of `useEffect`, `useRef`, `useMemo` and `useCallback` in `src/ui/`
<!-- AC:END -->
