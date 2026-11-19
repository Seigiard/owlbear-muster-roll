---
title: 'TASK-120: Mark the GM offline only after a ping goes unanswered, also after a page pause'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `livenessTable` takes the GM link offline whenever gm-silence fires. When a page's timers stop longer than `gmLinkTimeoutMs` (a frozen tab, a sleeping laptop), ping and gm-silence fire back to back on wake, so the link goes offline before the GM can answer the ping; its `alive` brings the link back and a live player starts a needless `gm-return` catch-up. This breaks the rule that a timer only schedules work and a rule decides on the answer it received (formal finding `findings/hidden-page-offline.cfg`, TASK-120).

**Approach:** gm-silence decides only on a ping the GM left unanswered. Pin it with module tests of the late timers after a pause, and change the catch-up model the same way so `NoPrematureOffline` holds with hidden pages.

</frozen-after-approval>

## Implementation Notes

- `catch-up-table.ts`: the online liveness phase keeps `silenceDue` and `pingSentAt`. `heard` and `watch` reset both; `fired('ping')` sets `pingSentAt`. gm-silence takes the link offline only when `silenceAnswered`: it fires at most a quarter of `gmLinkTimeoutMs` late, and the last ping is at least a quarter old. Otherwise `recheckGm` keeps the link online, pings, and arms gm-silence for a quarter. The recheck is decided a quarter later on the reply.
- Why both halves:
  - The lateness half covers replies queued while the page was frozen. On wake they may still wait behind the overdue silence.
  - The ping-age half covers a page that wakes just before the silence is due. Its overdue ping goes out at the wake, and the silence fires on time a moment later.
  - The first version had only the lateness half. Blind Hunter found the second case.
- In a running page the ping fires a quarter to a half of the timeout before the silence, so the old behavior holds there: offline at `gmLinkTimeoutMs` after the last GM message.
- Accepted:
  - Chrome's intensive throttling makes every gm-silence late. It applies to a tab hidden for 5 minutes and wakes timers once a minute. While it lasts, the GM stays online. A GM that left and returned meanwhile then brings no `gm-back`. When the tab is visible again, `page-return` catches up, and the next on-time gm-silence decides.
  - Queued replies may still wait behind the silence on a page that wakes less than a quarter of the timeout after the silence came due. That page is treated as running.
- Model (`formal/catch-up/CatchUp.tla`):
  - `Fire` passes `hidden[c]` as `late`, and chooses `pingOld` within `PingCanBeOld`. A ping can be old only after its replies came back, or on a hidden page.
  - A gm-silence ends `hidden`, because the page runs again from then on.
  - `badOffline` is set only when the link actually goes offline.
  - The finding became `mutations/silence-ignores-pause.cfg`.
  - New: `mutations/silence-ignores-ping-age.cfg` (lateness only; breaks `NoPrematureOfflineVisible`) and `hidden-page.cfg` (both pages hide, one return, every invariant).
  - A separate `Age` step was tried first. It tripled the state space, so the age is chosen at the silence.
- `docs/machines/liveness.md` gains `online --> online: fired`. The machine test samples a late silence.
- AD-6 in `ARCHITECTURE-SPINE.md` and the edit-delivery `GmLinkLost` map state the new rule.
- Review: Blind Hunter, 13 findings.
  - Patched:
    - the wake-before-due hole (ping age);
    - stale TLA comments;
    - the model's hidden flag never ending;
    - the skill bounds and check time;
    - a watch test;
    - the `pingDelay` comment;
    - the spec and plan;
    - the edit-delivery map;
    - AD-6 Prevents.
  - Accepted: unbounded rechecks under intensive throttling (above).
  - Rejected:
    - Machine-check invariants for `silenceDue`: unit tests pin each arm and due pair, and removing the watch update turns a test red.
    - An engine test: the rig's manual clock cannot stop timers, and AC #3 asks for a module test.
    - Stable finding numbers: the generation-adoption skill renumbers the same way, and "former finding" notes keep the history.
- Checks: `oxfmt`, lint, typecheck, `bun test` (3619 pass), `test:browser` (587 pass; one unrelated flaky test per run, each passed on rerun), `mutants` (53 of 53 killed), build, `formal/catch-up/check.sh` (every config as expected), `formal/edit-delivery/check.sh`, `formal/drift.sh`. Removing each half of `silenceAnswered`, or the `watch` reset, turns a test red.
