---
title: '1.4 Own the Replica in the Background Page'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '985c0d6e99ed464205e2625ae730bb86f8c89d34'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Records have a store, but nothing owns them at runtime, so data cannot outlive a window and windows cannot read or change it. Backlog task: TASK-6, whose seven acceptance criteria apply in full.

**Approach:** Run a replica engine in the background page, connect windows to it on the LOCAL channel with a projection, deltas and intent commands, and send everything through one paced queue. AD-10, AD-11 and the size and pacing rules of AD-12 apply exactly.

## Boundaries & Constraints

**Always:** Only `src/replica` mutates the replica, composes `d` and mints `c`. Every inbound message is parsed by a zod schema in `core`. Every timeout, pause and spacing comes from one constants module that tests inject. Strings come from the copy catalog.

**Never:** Build room sync, catch-up, the room envelope, the pending queue, the room copy or `gmLink`. Build sheet interface. Let a command carry a whole record.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GM start | Persisted records of the current generation | All are in the replica | N/A |
| Corrupt stored record | One invalid value at start | Skipped; local-save notice; a later write of that key succeeds and clears it | N/A |
| Player start | Role PLAYER, a command applied | `setItem` is never called | N/A |
| Open window | `projection-request` with a nonce | Full projection echoing the nonce, then deltas | N/A |
| Foreign nonce | Projection for another window | Ignored | N/A |
| Window before background | Request sent with no listener | Request repeats until the first part arrives | N/A |
| Incomplete set | Some parts never arrive | Restarts after the timeout | N/A |
| Split projection | Records exceed one message | Parts carry `i`, `n` and a sequence; deltas buffered until complete; older deltas ignored | N/A |
| Sequence gap | A delta skips a sequence number | Window requests a new projection | N/A |
| Command | `sheet-create` with kind and name | Replica composes `d`, mints `c`, emits a delta | N/A |
| Whole record in a command | Message holding `k`, `d`, `c` or `a` | Schema refuses; no effect | No throw |
| Echo | One command id delivered twice | One effect | N/A |
| Reopen window | Closed, then a new projection request | Same records | N/A |
| Restart | Background restarts over the same storage | Same records | N/A |
| Pacing | Many sends | Spaced by the injected value, in order, on one queue | N/A |
| Rate limit | Send reports rate-limited | Waits with backoff, resends the same message, order kept | N/A |
| Other send failure | Send reports failure | Logged; the queue continues | N/A |
| Size | Batch over the limit | Each message under 15000 UTF-8 bytes of JSON, multibyte text included | N/A |
| Record too large | Input that cannot fit one message | Command rejected with an error; nothing applied | No throw |
| Write fails | `setItem` fails | Replica keeps the value; notice; banner shows the exact text at full width as a live region | N/A |
| Write recovers | Same key later writes | Notice clears; banner goes when no failed or corrupt key remains | N/A |

</frozen-after-approval>

## Code Map

- `src/replica/record-store.ts`, `version-minter.ts` -- reuse. `loadGeneration` must also report corrupt keys.
- `src/core/merge.ts`, `records.ts`, `result.ts`, `json.ts` -- reuse.
- `src/platform/ports.ts`, `obr/index.ts`, `mock/index.ts` -- `sendMessage` returns a result. Owlbear rejects with `{ error: { name: "RateLimitHit" } }`; only the adapter knows that shape.
- `src/replica/background-main.ts`, `src/ui/main.tsx`, `src/ui/shell/window-shell.tsx` (`banner` prop), `src/ui/copy.ts` -- entry points and the banner.
- `deferred-work.md` -- cross-page mock storage and LOCAL broadcast are needed now.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/timing.ts` -- named constants with starting values; send spacing is 50 ms -- AC 6.
- [x] `src/core/visibility.ts` -- pass-through taking the role -- AC 2.
- [x] `src/core/ui-messages.ts` -- channel name and schemas: `projection-request`, `projection`, `delta`, `command`, `command-rejected`; `sheet-create` is the first command -- AC 2, 3.
- [x] `src/core/message-size.ts` -- the one splitting function and the fit check -- AC 5.
- [x] `src/platform/send-queue.ts` -- one serial queue per page -- AC 5.
- [x] `src/platform/ports.ts`, both adapters -- send result; the mock shares LOCAL across pages and persists page-level storage, and tests can simulate rate limits and failures -- AC 2, 4, 5.
- [x] `src/replica/engine.ts`, `src/replica/background-main.ts` -- load, projection, deltas, commands with echo protection, notices -- AC 1 to 5, 7.
- [x] `src/ui/replica-client.ts`, `src/ui/projection-store.ts`, `src/ui/main.tsx` -- request, assemble, buffer, apply; banner from notices; content stays "Загрузка…" -- AC 2, 7.
- [x] Tests beside each module, `src/replica/engine-client.test.ts` over a shared mock bus, and `tests/replica.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the seven criteria of TASK-6.

## Implementation Notes

- A failed storage load adds an `(unreadable)` mark to the problem set, so the notice shows and no write clears it until a reload. Persistence stays off until then, so a command cannot write into the wrong generation or reuse an order.
- A stored record too large for one message counts as corrupt at load, because no window could ever receive it.
- `core/visibility` owns `PlayerRole`, and `ports.ts` re-exports it, so `core` does not depend on `platform`.
- The engine puts an `engine` id on projections and deltas. A window that sees another engine id requests a new projection, because a restarted engine counts from zero.
- `vite.config.ts` pins the `obr` chunk name for the SDK and adapter, because a shared `ui-messages` chunk otherwise absorbs it.
- Window-to-replica rejection reaches a window through `$rejection` only for commands that window sent. Story 1.6 shows it.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: failed read keeps persistence on | high | Confirmed by reading: writes reach generation 0 or restart `order`, and records are orphaned after a reload. Patched: persistence off until a reload. |
| Blind and Edge: no sender check on the UI channel | false | Honest clients send only LOCAL here, and v1 protects honest clients only. The fix assumes that window and background share a connection id, which is unmeasured and could drop every real message. |
| Blind: corrupt stored sheet leaves the banner on | low | Real but rare, and matches the frozen matrix. Rejected; removing data is a product call. Recorded in deferred-work.md. |
| Blind and Edge: role read once | false | Story 2.2 adds the role-change trigger; already in deferred-work.md. |
| Blind and Edge: `sendCommand` has no delivery evidence | low | No production caller yet. Deferred to Story 1.6. |
| Blind: store cannot tell not-loaded from empty; rejection never clears | false | No consumer yet. Deferred to Story 1.5, which adds the no-preset state. |
| Blind: timing comment states a false invariant | medium | Confirmed: 7750 ms adds up against 6000 ms. Patched the comment. |
| Blind: restarted engine noticed only at the next delta | low | Rejected: the background page and windows reload together with the room page. |
| Blind and Edge: `toSendResult` can reject | low | Direct correction. Patched with `String(cause)`. |
| Blind and Verification: oversized stored record untested | medium | Patched with a test; observed red. |
| Verification: envelope measurement unobserved | medium | Broken verification. Patched with a near-full part test; observed red. |
| Verification and Blind: failed `loadGeneration` untested | medium | Patched with the failed-read tests; observed red. |
| Verification: engine nonce guard unverified | low | Patched with a test; observed red. |
| Verification: window request guard unverified | low | Patched with a test; observed red. |
| Verification: assembly match untested | low | Deferred as filed. |
| Blind: buffered delta gap untested | low | Patched with a test; observed red. |
| Blind: multi-part delta never runs | false | Every command yields one record today. |
| Blind: `timing.test.ts` restates constants | low | Margin assertion removed. Spacing stays pinned because the spec states 50 ms. |
| Blind: e2e test cannot fail for its stated reason | medium | False green. Patched: it waits for a banner only the window's own projection can raise. |
| Blind: real-timer test and unsafe console patch | low | Console patch fixed with `spyOn`. Real-timer test rejected: it passed five runs and a clock seam adds surface. |
| Edge: lost newest delta leaves a window stale | low | Rejected: the next delta shows the gap and heals it; a retry protocol is more than a direct fix. |
| Edge: endless rate limit blocks the queue | false | AD-12 says `RateLimitHit` is waited out. |
| Edge: generation holding only corrupt records is skipped | low | Rejected: needs a fully corrupt imported generation, and Epic 5 owns imports. |
| Edge: one queue per page, not per client | false | A page cannot route its sends through another page without sending. Windows send rarely, under the measured limit. |

## Design Notes

- `sheet-create` exists because a command must exercise the path. The window supplies `name` from the catalog, so `replica` holds no interface text. Story 1.6 adds the control.
- Echo protection keeps a bounded set of recent command ids.
- A failed or corrupt key stays in one set, so the notice is derived from that set.
- The closing-window send of AD-12 comes with field editing in Story 1.9.

## Verification

**Commands:**
- `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner: after a deploy, open the window with no console error, close it and open it again.
