---
title: '2.4 Show Whether a GM Is Answering'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'b308b0171e1b53be29c11c514aaad6f2b836bd7b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-catch-up-on-join-and-on-return.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A player cannot tell whether any GM client is answering, and a client whose data drifted from a GM's has no way to notice. Backlog task: TASK-17, whose seven acceptance criteria apply in full.

**Approach:** Add AD-6 liveness: `replica` owns `gmLink`, pings after half the timeout of GM silence, and a live GM answers `alive` with the generation and a digest of all records. The projection carries `gmLink`; a player window shows the no-GM banner when it is `offline`. A digest that differs twice in a row from one GM starts catch-up, with the AD-7 ignore rule.

## Boundaries & Constraints

**Always:** Only `replica` sets `gmLink`, from GM-origin messages admitted by the gate (any `t` from a GM sender counts). The party list never sets it. A GM answers `alive` on receipt with no timer of its own. `ping` and `alive` use the 2.1 gate, schemas in `core`, and the shared send queue. Timeouts live in `TIMING`. The banner text comes from the copy catalog.

**Never:** The room copy and its notice (2.5), the no-data-no-GM empty state (2.6), any behavior that needs a timer to run in a hidden GM tab.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start | Any client | `gmLink: 'offline'`; no banner until the first catch-up ends | N/A |
| Ping | No GM-origin message for `gmLinkTimeoutMs / 2` | Sends `ping`; repeats every half timeout while silent | N/A |
| Alive | Live GM gets `ping` | Answers `alive { g, digest }` at once | GM in `catching-up`: no answer |
| Online | GM-origin message arrives | `gmLink: 'online'`; banner hides | N/A |
| Offline | No GM-origin message for `gmLinkTimeoutMs`, first catch-up done | Player: `gmLink: 'offline'`, banner "Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку." | N/A |
| Party says GM present | Party lists a GM but nothing arrives | Still `offline` | N/A |
| GM alone | GM client, no other GM | Never shows the no-GM banner | N/A |
| Hidden GM | GM tab hidden, still answers pings | Player stays `online` | N/A |
| Digest | `digest(records)` | XOR of a 32-bit hash of `(k, c, a)` per record; order-independent; equal sets give equal digests | N/A |
| Drift | `alive` from one GM of the same generation, digest differs from own twice in a row | Enters `catching-up` | N/A |
| One difference | Differs once, then matches | No catch-up | N/A |
| Other generation | `alive` of another generation | Not compared | N/A |
| Ignore after complete | Catch-up held all `n` from GM X | X's digest is ignored until X's digest changes | N/A |
| No ignore after timeout | Catch-up ended by timeout | No ignore starts | N/A |
| Banner priority | Several notices | local save failed, then new version, then no GM; one at a time | N/A |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts` -- gate dispatch, catch-up entry, answering, sync state, projection.
- `src/core/room-messages.ts` -- add `ping` and `alive { digest }` schemas.
- `src/core/timing.ts` -- add `gmLinkTimeoutMs`.
- `src/core/ui-messages.ts` -- carry `gmLink` in the sync state.
- `src/ui/main.tsx` -- `bannerFor`; `src/ui/copy.ts` -- `noGm` exists.
- `tests/support/room.ts`, `tests/sync.e2e.ts`, `tests/player.e2e.ts` -- multi-client helpers.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/digest.ts` -- `recordDigest(records)` with unit tests -- AC 2.
- [x] `src/core/room-messages.ts`, `src/core/timing.ts` -- schemas and `gmLinkTimeoutMs` -- AC 1, 2.
- [x] `src/replica/engine.ts` -- `gmLink`, ping timer, `alive` answer, drift detection with the ignore rule -- AC 1 to 7.
- [x] `src/core/ui-messages.ts`, `src/ui/main.tsx` -- `gmLink` in the projection; the no-GM banner for players only, lowest priority -- AC 3, 4, 6.
- [x] Tests: engine tests on the in-memory room with injected timing for every matrix row; `tests/liveness.e2e.ts` with a GM and a player client: banner appears when the GM's pages close and disappears when a GM returns; a GM alone never shows it; banner priority with a failed local save -- every matrix row.

**Acceptance Criteria:** the seven criteria of TASK-17.

## Implementation Notes

- `src/core/digest.ts` holds `recordDigest`. Its unit tests use values from a separate FNV-1a implementation. `ping` and `alive { digest }` schemas and builders are in `room-messages.ts`. `TIMING.gmLinkTimeoutMs = 20000`.
- The engine timing type is now `EngineTiming` (was `CatchUpTiming`) and includes `gmLinkTimeoutMs`.
- `gmLink` lives in the engine apart from the catch-up state and goes to windows as `sync.gmLink`. Every message the gate admits from a GM sender calls `hearGm`: `gmLink` becomes `online`, and the ping timer (half the timeout, then repeats) and the offline timer (the whole timeout) restart. The timers start with the engine. A client pings in any role, also a GM alone.
- A GM answers `ping` on receipt only when `canAnswer()` is true, the same check as for `state-request`: GM role, `live`, and readable storage. A GM whose storage could not be read stays silent, because its digest would not stand for records it sends.
- Drift: only an `alive` of the client's own generation is kept as that sender's last digest, and it is compared only while the client is `live` and, for a GM, its commit outbox and send queue hold no unsent commit. A match resets that sender's count. A difference counts at most once per sender in `gmLinkTimeoutMs / 2`; the second counted one enters `catching-up` with the new trigger `drift`. A new catch-up nonce clears all counts. When a complete answer ends a catch-up, the responder's last digest goes into the ignore map, and so does the last digest of the GM whose drift started it. A later `alive` with an ignored digest is not compared; any other digest lifts the ignore. A timeout exit or a late complete answer while live sets no ignore. The three maps drop connections that leave the party and clear on a role or generation change. The engine caches its own digest until the replica changes.
- A GM in a catch-up entered for `drift` still answers `state-request`, because that catch-up only pulls. It does not answer `ping` until it is live. `CommitOutbox.hasUnsent()` is new.
- Pings fire after `gmLinkTimeoutMs / 2` plus a random part of `gmLinkTimeoutMs / 4`. The mock accepts `mock-gm-link-timeout-ms` only in `(0, 2147483647]`.
- UI: `bannerFor(notices, sync)` moved to `src/ui/banner-message.ts` for unit tests. The no-GM warning shows when the role is not GM, the first catch-up has ended and `gmLink` is `offline`, below "local save failed" and "new version".
- Mock builds read `mock-gm-link-timeout-ms` from the page URL; `ClientParams.gmLinkTimeoutMs` sets it in e2e helpers.
- Contract change in existing tests: sync literals gained `gmLink`; catch-up tests where a GM sender spoke now expect `gmLink: 'online'`; `tests/player.e2e.ts` "keeps the loading text" now expects the no-GM banner above "Загрузка…".
- Not covered by e2e: a hidden GM tab. The engine test runs a real GM engine whose own timers never fire within the test and shows the player stays online. The owner's manual check after a deploy remains.
- Risk: a player's own timers also stall when its page is hidden, so its offline mark can come before its next ping. The next return triggers catch-up, and the GM's answer sets `online` again.

## Spec Change Log

- Review round 1: the hash text is now `${k.length}:${k}${c}:${a.length}:${a}` (lengths in UTF-16 code units) instead of fields joined by NUL, because the schemas allow NUL in a key or author. Known-bad state avoided: two different versions joining to one text.
- Review round 1: a ping fires after half the timeout plus a random part of a quarter. Drift counts at most one difference per sender in half the timeout, and a GM with unsent commits does not compare. Known-bad state avoided: one ping burst counting as two differences "in a row".
- Review round 1: a GM in a catch-up entered for drift still answers `state-request`. Known-bad state avoided: two drifting GMs both waiting, both timing out, again and again.
- Review round 1: a drift catch-up that ends with a complete answer also ignores the current digest of the GM whose drift started it. Known-bad state avoided: a lagging GM, answered by another GM, starting catch-up after catch-up.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: synchronized pings make one GM burst `alive`, so "twice in a row" fires at once | high | Confirmed by reading. Patched: ping jitter and one counted mismatch per sender per half-timeout window; tests observed red. |
| Edge: a GM with unsent commits sees a peer mismatch every round | medium | Patched: no comparison while commits are unsent. |
| Blind and Edge: two drifting GMs both catch up, neither answers, loop forever | high | Confirmed by reading. Patched: a GM in a drift catch-up still answers `state-request`; two-engine test converges. |
| Blind and Edge: the ignore goes to the responder, not the drifting GM | medium | Patched: the drifting GM's digest is ignored too; test. |
| Blind and Edge: other-generation digests stored; maps never pruned | low | Patched. |
| Blind: digest recomputed per ping and alive | low | Patched with a cache cleared on replica change. |
| Blind and Edge: NUL can make two versions hash alike | low | Patched with length-prefixed fields; expected values from an independent implementation. |
| Blind and Edge: mock timeout 0 makes a ping loop | low | Patched. |
| Verification: drift counts carried across a catch-up untested | medium | Patched with a test. |
| Blind: untested other-generation ping, late answer ignore, stop; offline test lacks an upper bound | low | Patched. |
| Blind: e2e banner check depends on node order | low | Patched. |
| Blind: `online` also counts a GM that is itself catching up | low | The spec chooses any admitted GM message. Documented in a comment. Rejected. |
| Blind and Edge: a GM with unreadable storage does not answer `ping` | low | Such a GM sends no commits and answers no `state`; the banner is accurate. Rejected; listed for the owner. |

## Design Notes

- `gmLinkTimeoutMs = 20000`, so a player pings after 10 s of silence. In mock builds a page URL param may shorten it for tests.
- Hash: 32-bit FNV-1a over the UTF-8 of `${k.length}:${k}${c}:${a.length}:${a}`, as an unsigned integer; the digest is the XOR of all record hashes, `0` for no records. (Changed in review round 1; see the Spec Change Log.)
- "Twice in a row" counts consecutive `alive` messages from one connection id, at most one per half timeout; any matching `alive` from that sender resets its count.
- The ignore rule stores the digest a GM sent last when a complete answer from it ended a catch-up; later `alive` from it with that same digest are not compared.
- A GM client also keeps `gmLink` and pings, so drift between GM tabs is caught, but its window never shows the no-GM banner.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: player in one browser, GM in another; close the GM tab and see the banner within about 20 s; reopen and see it go; hide the GM tab for several minutes and confirm the player stays online.
