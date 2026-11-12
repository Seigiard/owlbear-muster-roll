---
title: 'TASK-57 Let a Dice+ caller choose where the dicex fork rolls'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: '52f7410fddc6c2b1ad839f6626d3191006135f48' # dicex fork, /Users/seigiard/Projects/dicex-task-54
route: 'dispatch'
review_loop_iteration: 0
context:
  - '/Users/seigiard/Projects/dicex-task-54/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After TASK-54 the dicex fork picks the roll place by itself: the Dicex action window when it is open, else the popover tray. A Dice+ caller cannot choose. The owner: «а есть АПИ, которое говорит «брось в окно dicex» «брось в всплывающий трей»? ... тогда расширения могут это использовать, как хотят». Backlog task: TASK-57.

**Approach:** In the dicex fork worktree `/Users/seigiard/Projects/dicex-task-54` (branch `dice-plus-roll-without-action`, PR #2, base 52f7410), add an optional `rollIn?: "auto" | "window" | "tray"` to the Dice+ roll request. The background routes by it. The isReady reply advertises `features: ["rollIn"]`, so a caller can tell the fork from original Dice+. Muster Roll sends nothing new.

## Boundaries & Constraints

**Always:**
- `rollIn` absent, not a string, or an unknown value means `"auto"`: exactly the TASK-54 routing (window open → action route; closed → popover handshake, 2 s silence → action route).
- `"window"`: the action route (`OBR.action.open()`, then the internal ping/ready/roll as today), whatever the window state; the popover gets no ping and no roll.
- `"tray"`: the popover handshake even when the window is open; ready → roll on the popover channel only, `action.open` not called; 2 s silence → the action route, as `"auto"` falls back.
- A roll runs in exactly one page and produces exactly one `{source}/roll-result`: the relay sends the roll on one channel set only.
- Every isReady reply carries `features: ["rollIn"]`; `permitted` stays present only when the request names a `source`.
- `rollIn` is validated where it is read, not in `isRollRequest`: an unknown value never turns a request into an ignored one.

**Never:**
- Changing access checks, notation errors, `roll-error` replies, the action-page or popover roll handlers, or the tray UI.
- Changing Muster Roll code.
- Pushing to the fork's `main`, merging PR #2, or touching `upstream`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Auto, absent | no `rollIn`, any window state | TASK-54 routing; existing coordinator tests unchanged | N/A |
| Auto, unknown | `rollIn: "sideways"` or `rollIn: 7` | same as absent | N/A |
| Window, closed | `"window"`, action closed | `action.open` once; internal roll; no popover ping | N/A |
| Window, open | `"window"`, action open | internal route as today; no popover ping | N/A |
| Tray, open | `"tray"`, action open, popover answers | popover roll; `action.open` 0; no internal roll | N/A |
| Tray, silent | `"tray"`, action open or closed, popover silent 2 s | action route: `action.open` 1, internal roll | N/A |
| isReady | request with or without `source` | reply has `features: ["rollIn"]`; `permitted` only with `source` | N/A |

</frozen-after-approval>

## Code Map

All paths are in `/Users/seigiard/Projects/dicex-task-54`.

- `src/plugin/dicePlusProtocol.ts` -- `RollRequest`, `IsReadyResponse`, `isRollRequest`. Add the `RollIn` type, `rollIn?` with a doc comment, a pure resolver (unknown → `"auto"`), a feature constant, and `features?: string[]` on `IsReadyResponse`. The top comment points at a design doc that is gitignored and absent; the README is the published protocol doc.
- `src/plugin/dicePlusBackgroundCoordinator.ts` -- `relayRollRequest`: today `isOpen` → `relayThroughAction`, else `relayThroughChannels(POPOVER…)` then fallback. Branch on the resolved `rollIn`; reuse both helpers unchanged.
- `src/plugin/dicePlusBackgroundListeners.ts` -- isReady reply builder; add `features`. The roll listener passes the payload through as is.
- `src/plugin/dicePlusBackgroundCoordinator.test.ts` -- routing tests with `obrConfig.actionIsOpen`, `obrCalls.actionOpenCount`, `simulateBroadcast`, fake timers. Extend for the Matrix rows; keep the four existing tests.
- `src/integration/dicePlusIsReady.test.ts`, `src/integration/dicePlusAccess.test.ts` -- isReady tests. `dicePlusAccess.test.ts` "keeps the old reply shape for a request without source" asserts exact keys; it now asserts `features` and still asserts no `permitted`.
- `src/plugin/dicePlusProtocol.test.ts` -- resolver tests; `isRollRequest` still accepts a request with an unknown `rollIn`.
- `README.md` -- "Dice+ Integration" section: document `rollIn`, default, fallbacks, and `features`; reword "Without `source`, the reply keeps its old shape".
- Do not touch: `dicePlusInternalRollHandler.ts`, `dicePlusPopoverRollHost.ts`, `PopoverTrays.tsx`, `DicePlusPopoverRollTray.tsx`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/plugin/dicePlusProtocol.ts` -- `RollIn`, `rollIn?`, resolver, `features` -- the request and reply contract.
- [ ] `src/plugin/dicePlusBackgroundCoordinator.ts` -- route by resolved `rollIn` -- Matrix rows 1–6.
- [ ] `src/plugin/dicePlusBackgroundListeners.ts` -- `features: ["rollIn"]` on every isReady reply -- Matrix row 7.
- [ ] tests beside the changed modules -- every Matrix row.
- [ ] `README.md` -- document `rollIn` and `features`.

**Acceptance Criteria:**
- Given the change, when `npx yarn@1.22.22 test` and `npx yarn@1.22.22 build` run in the dicex worktree, then both exit 0 and the four TASK-54 coordinator tests pass unchanged.
- Given `rollIn: "tray"` and an open window, when the popover answers, then the only roll message sent is on `rodeo.owlbear.dice/popover-roll`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Why exactly one roll for `"tray"` with the window open: the action page listens only on `internal-*`, the popover only on `popover-*`, and the relay sends one roll message. Each iframe has its own stores and its own pending Dice+ request, and no page reads its own player's roll metadata back, so the action page neither shows nor reports a popover roll.

Why `features` on every reply: a caller that sends no `source` still needs to detect the fork. The field is additive; original Dice+ omits it, so its absence means "no `rollIn`".

```json
{ "requestId": "q-1", "ready": true, "timestamp": 1731400000000, "features": ["rollIn"] }
```

## Verification

**Commands** (in `/Users/seigiard/Projects/dicex-task-54`):
- `npx yarn@1.22.22 test` -- expected: all pass (baseline 325 in 40 files).
- `npx yarn@1.22.22 build` -- expected: exit 0.

**Manual checks (owner, live room with the fork build):**
- A request with `rollIn: "tray"` while the Dicex window is open rolls in the bottom-right tray once; the window shows no roll; one result returns.
- `rollIn: "window"` with the window closed opens it and rolls there.
