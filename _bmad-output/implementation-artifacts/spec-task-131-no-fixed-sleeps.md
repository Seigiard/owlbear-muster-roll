---
title: 'TASK-131 Replace the fixed sleeps that playwright/no-wait-for-timeout does not detect'
type: 'chore'
created: '2026-11-20'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '694b8b0e33c391807b48102d2b00cb19e0ecd1eb'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `playwright/no-wait-for-timeout` reports `page.waitForTimeout` but not a call on a page held in a field (`gm.window.waitForTimeout`), so 12 fixed sleeps survived TASK-128 in `tests/`. A fixed sleep is slow, flaky under load, and a negative assertion after it stays green when the sleep is too short.

**Approach:** Replace each of the 12 sleeps with a wait on an observable condition, a command barrier (`tests/replica.e2e.ts`) or the Playwright clock (`tests/field-edit.e2e.ts`), and turn on the core rule `no-restricted-properties` for `waitForTimeout` in the test override of `.oxlintrc.json`, which reports the call on any receiver (probe: `a.window.waitForTimeout(5)` is reported).

## Boundaries & Constraints

**Always:** Each test keeps asserting the same behavior with the same expected values. A "nothing happens within X" assertion still lets X of app time pass (clock or real) before it checks; it must not check earlier. A sleep that cannot be replaced keeps an `oxlint-disable-next-line` naming the rule and why (as `tests/liveness.e2e.ts:99` and `tests/field-edit.e2e.ts:356` do today; their rule name moves to the new rule). `playwright/no-wait-for-timeout` is turned off in favor of the new rule, so one disable names one rule.

**Never:** No production code change. No weaker assertion, wider timeout as a substitute for a condition, or deleted test. No change to tests outside the 12 sites and the two existing disables.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sleep on any receiver | `x.window.waitForTimeout(n)` in `tests/` | `bun run lint` fails on it | N/A |
| Justified sleep | same call with a targeted disable stating why | lint passes | N/A |
| Negative wait | "no write / no mark / no tooltip within X" | X of app time elapses before the check | N/A |

</frozen-after-approval>

## Code Map

- `.oxlintrc.json` -- test override (around L422, `playwright/*` rules): add `"no-restricted-properties": ["error", { "property": "waitForTimeout", "message": "..." }]`; set `playwright/no-wait-for-timeout` off.
- `tests/catch-up.e2e.ts:153` -- 500 ms so an unsaved value "waits in the pending queue"; assert the stored cell is still the seed after a send barrier or a polled check of the outbox, not after a sleep.
- `tests/wipe.e2e.ts:95` -- 1000 ms "several write pauses pass with no write" (`snapshotPauseMs: 100`); needs elapsed app time; candidate: Playwright clock, or a disable with reason if the background page's timers cannot use it.
- `tests/owner.e2e.ts:452` -- waits past `ACCESS_CHANGE_TIMEOUT_MS` to prove no failure shows after the timeout.
- `tests/pending.e2e.ts:169` -- waits to a point inside `MARK_DELAY_MS`; `:406` -- 1.5× the mark delay to prove no mark.
- `tests/repeat-tabs.e2e.ts:220,259` -- `PAST_SAVE_PAUSE_MS`; `:419` -- `COMMAND_TIMEOUT_MS` for a timed-out add.
- `tests/cell-name.e2e.ts:167,210` -- 600 ms tooltip delay with no tooltip; `:278,282` -- 50/300 ms around touch pointer events.
- Patterns: `tests/field-edit.e2e.ts:140` (`page.clock.install()` before load, `page.clock.runFor`), `tests/characters.e2e.ts:59`, command barriers in `tests/replica.e2e.ts:152-170`. `tests/liveness.e2e.ts:100` shows the clock limit: `clock.runFor` fails after the GM pages close.

## Tasks & Acceptance

**Execution:**
- [ ] each of the 12 sites -- replace the sleep or keep it with a targeted disable stating why.
- [ ] `.oxlintrc.json` -- the rule above; move the two existing disables to it.

**Acceptance Criteria:**
- Given `tests/`, when `grep -rn waitForTimeout tests` runs, then each hit has a targeted disable on the line before that states why (TASK-131 AC 1).
- Given a new undisabled `waitForTimeout` on any receiver in `tests/`, when `bun run lint` runs, then it fails (TASK-131 AC 2).
- Given the change, when `bun run test:browser` runs, then it passes (TASK-131 AC 3).

## Verification

**Commands:**
- `bun run lint` -- 1 min, exit 0
- `bunx oxfmt --ignore-path .gitignore --check .` -- 1 min, exit 0
- `bun run typecheck` -- 1 min, exit 0
- `bun run test:browser` -- about 10 min, outside the sandbox, exit 0
- each changed test run 5 times with `--repeat-each=5` -- 3 min, all pass

## Implementation Notes

## Spec Change Log

## Review Triage Log
