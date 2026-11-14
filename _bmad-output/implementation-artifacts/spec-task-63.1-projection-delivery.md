---
title: 'Keep projection assembly data valid for its delivery phase'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/ui/replica-client.ts` stores delivery phase, acquisition nonce, projection assembly, buffered messages, engine identity, and sequence as separate mutable values. Maintainers must reconstruct which values are valid together, which can expose stale assembly data or misordered deltas.

**Approach:** Keep the existing `ReplicaClient` interface and protocol behavior, but make one local discriminated delivery state own phase-specific data. Requesting owns the acquisition nonce and buffered answers, assembling owns the nonce and assembly while buffering deltas, and live owns the engine identity and sequence.

</frozen-after-approval>

## Implementation Notes

- Research: CAP-1 in `SPEC.md` and `state-machines.md` requires phase-valid projection delivery while preserving nonce filtering, complete-only publication, incomplete timeout recovery, command-answer retention, old-stream delta discard, ordered replay, queue suppression, live-only open handling, and stop cleanup. `brownfield.md` confirms that TASK-61.8 supplies only sequencing lessons and no runtime dependency. The current production path is limited to `src/ui/replica-client.ts`; the unchanged owners are `src/ui/replica-client.test.ts` and `src/replica/engine-client.test.ts`.
- Before ownership: `phase`, `nonce`, `assembly`, `buffered`, `liveEngine`, and `lastSeq` were independently writable. Callers still only saw `ReplicaClient`, but internal handlers reconciled several nullable and phase flags.
- After ownership: one local discriminated delivery value is the only writable owner of phase, acquisition nonce, assembly descriptor, and live stream identity. `queuedNonce`, pending command outcomes, and their timers remain independent because their lifetimes cross delivery phases.
- Implementation: `DeliveryState` now narrows requesting, assembling, and live data at each handler. Projection publication captures buffered messages after synchronous store updates, so reentrant bus replies retain their existing replay order. Timer arming, queue suppression, nonce filtering, and stop cleanup remain in their original owner.
- Reentrant replay preservation: a sequence-gap recovery can synchronously receive the first replacement projection part while the replay callback is still unwinding. The remaining command answers are therefore appended through the non-live state helper, whether recovery is still requesting or already assembling.
- Caller knowledge: before and after this refactor, callers know only the unchanged `ReplicaClient` interface. The before/after difference is inside delivery handlers: callers no longer need to account for independently writable phase, assembly, nonce, engine, or sequence values.
- Evidence: the first baseline attempt failed only because `@happy-dom/global-registrator` was absent; after `bun install --frozen-lockfile`, the clean baseline passed 153 tests in `/Users/seigiard/.cache/herdr-run/task631-attempt1-focused-baseline-rerun.log`. Final focused evidence is `/Users/seigiard/.cache/herdr-run/task631-attempt1-focused-final5.log` (153 passed, 0 failed). The six required checks passed with logs `/Users/seigiard/.cache/herdr-run/task631-attempt1-format-final5.log`, `/Users/seigiard/.cache/herdr-run/task631-attempt1-lint-final2.log`, `/Users/seigiard/.cache/herdr-run/task631-attempt1-typecheck-final.log`, `/Users/seigiard/.cache/herdr-run/task631-attempt1-unit-final.log` (3009 passed, 1 environment-only DOM skip), `/Users/seigiard/.cache/herdr-run/task631-attempt1-browser.log` (520 passed), and `/Users/seigiard/.cache/herdr-run/task631-attempt1-build.log`. `git diff --quiet 448e73eaf44972caf115f45d216ac867394e9502 -- src/ui/replica-client.test.ts src/replica/engine-client.test.ts` returned 0, proving both existing test files stayed unchanged. Parent owns blind review and code review.
- Final verified command summary: canonical production revision `a8101d4fe50a17955fbcf13b8aa5a4bef3b80c42` contains the implementation. Tested preservation covers the unchanged focused suite (153 passed), full unit suite (3009 passed, 1 environment-only DOM skip), browser suite (520 passed), and passing format, lint, typecheck, and build checks. These checks do not verify the conditional fully synchronous replacement hypothesis described in the deferred-work entry. No live Owlbear validation was required or claimed.

## Review Triage Log

- Store-publication answer loss — minor construction; rejected as a production defect. Review found no existing consumer that synchronously delivers nested engine messages from store updates; the inspected callers were `main.tsx`, `picker/main.tsx`, `window-view.ts`, `pending-marks.ts`, `picker/link-picker.tsx`, and `sheet/access-panel.tsx`. Preserve code and add no manufactured fixture.
- Fully synchronous replacement during old-buffer replay — minor construction, BMAD maybe-false; deferred as unverified rather than treated as an existing defect. The production engine, window publisher, queue, and OBR path did not demonstrate this producer; only the mock memory bus showed synchronous delivery. The required proof is recorded in `deferred-work.md`.
- Additional reentrancy tests — minor; rejected for this ticket. No behavior gap was demonstrated, existing suites retain ownership, and a hypothetical subscriber would add a new scenario rather than protect an observed production path.
- Portable verification evidence — minor polish; rejected as a blocking defect. The task and spec record command results, the chain record identifies canonical revisions and durable logs, and the repository has no requirement to commit raw logs. Local cache paths remain a portability limitation; no artifact infrastructure was added.
