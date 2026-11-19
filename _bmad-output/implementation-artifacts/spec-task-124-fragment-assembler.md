---
title: 'TASK-124: One fragment assembler in core for proposals and stale replies'
type: 'refactor'
created: '2026-11-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '96ceb050f7e47a4eb18c64cbb497a20ee3a98131'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A record sent in `i`/`n` parts is reassembled twice with one algorithm: `src/replica/room-protocol.ts:282-348` for a GM receiving a `propose`, with four limits (32 parts, 480 000 bytes, 32 open assemblies with the oldest evicted, 60 s retention) and `Date.now()`; and `completeStaleReject` in `src/replica/pending-edits.ts:345-400` for a player receiving a `reject stale`, with no limit at all, so a broken GM can grow the player's map without bound.

**Approach:** One `src/core/fragment-assembler.ts` owns the algorithm and the limits; both callers hold an assembler and keep their key and their reaction. Time comes in as an argument; the answer is a tagged outcome, so TASK-115.6 can later report a drop instead of a silent return. Architecture-review candidate 4, the part accepted on 2026-11-19; no ADR, no wire change, no glossary term (wire mechanics).

## Boundaries & Constraints

**Always:** The wire schemas in `src/core/room-messages.ts` are unchanged. `createFragmentAssembler(limits)` returns `{ add(key: string, part: { i, n, record }, now: number): AssemblyOutcome; clear(): void }`; `AssemblyOutcome` is `{ kind: 'complete'; record } | { kind: 'waiting' } | { kind: 'ignored' } | { kind: 'dropped'; reason: 'too-many-parts' | 'count-mismatch' | 'duplicate-part' | 'too-large' }`; `ignored` is an identical repeated part, `complete` always carries a record. Limits are `{ maxParts, maxBytes, maxAssemblies, retentionMs }`; the GM constants are exported once from the assembler and deleted from `room-protocol.ts`. Order of checks as today: part limit, expiry sweep (`now - firstPartAt >= retentionMs`, counted from the first part and never refreshed), lookup or create with eviction of the oldest-created assembly, count mismatch (drops the open assembly), duplicate, byte limit (`jsonByteLength` per part, summed), store, completion by `assembleRecords` from `@/core/merge` taking the completing part's `k` (callers guarantee all parts of a key share `k`). A completed or dropped assembly is removed. `n === 1` never reaches the assembler. Both callers switch over the outcome with a `never` default and keep today's reactions (`complete` continues, everything else returns). Player limits: `maxParts: Infinity`, the other three as the GM's. Reason: the GM's `staleReplyFragments` has no part cap, so a legal stale reply over a row with 33 or more large held cells can exceed 32 parts; a player cap would drop every part and the edit would resend for ever. Memory stays bounded by bytes and assemblies. Record the missing GM cap in `deferred-work.md`. `pending-edits.ts` passes `now()` from its options and calls `clear()` where it clears `staleRejects` today. Follow `.oxlintrc.json` (`src/core/**` imports only core; `anti-slop/*`; `#given/#when/#then`).

**Never:** Do not touch `catch-up.ts`'s `state` assembly, `staleReplyFragments`, `fragmentRecord` or `message-size.ts`. Do not report drops (TASK-115.6). Do not change `ProposalPatch`, the queues or `rejected` after assembly (TASK-125, TASK-119). No shim: the two private bodies are deleted. Do not edit DESIGN.md (TASK-115.11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two parts complete | `add(k,{i:1,n:2,r1},t)`, `add(k,{i:2,n:2,r2},t)` | `waiting`, then `complete` with `assembleRecords([r1,r2]).get(r2.k)`; assembly gone | — |
| Count mismatch | open `n: 2`, part with `n: 3`, same key | `dropped: count-mismatch`; the open assembly removed, no new one | — |
| Duplicate part | same `i`, equal JSON | `ignored`, assembly kept | different JSON → `dropped: duplicate-part`, removed |
| Too many parts | `n: 33` with `maxParts: 32` | `dropped: too-many-parts` before any lookup | with `maxParts: Infinity` → stored |
| Too large | summed bytes would exceed `maxBytes` | `dropped: too-large`, removed; a first oversized part first evicts the oldest when at `maxAssemblies` (today's order) | — |
| Expiry | part at `t`, a second part of the same key at `t + 59 999`, a part of another key at `t + 60 000` | second part does not refresh the deadline; the third call sweeps the first assembly before storing | — |
| Eviction | `maxAssemblies` open, a part for a new key | the oldest-created removed, the new one stored | — |
| Player stale replies | 33-part reply; a reply over 480 000 bytes; a reply whose second part comes 60 s later; then a 2-part reply | the 33-part one completes; the oversized and the expired answer `null` per part; the 2-part one completes | — |

</frozen-after-approval>

## Code Map

- `src/replica/room-protocol.ts:84-87, 121-126, 130, 282-348` -- constants, `ProposalAssembly`, `proposals`, the inline body: replace with key (`editIdOf`, `:12`) + `add(..., Date.now())` + switch. `assembleRecords` import (`:3`) goes; `jsonByteLength` stays for `staleReplyFragments`.
- `src/replica/pending-edits.ts:87, 335, 342, 345-400` -- `staleRejects` becomes the assembler; `completeStaleReject` keeps the `n === 1`/no-fragment shortcut and the `{ ...withoutFragment, current }` rebuild; `now` from options (`:57`); `assembleRecords` import goes.
- `src/core/merge.ts:59` `assembleRecords`; `src/core/message-size.ts:15` `jsonByteLength`.
- Behavioural owners, pass unchanged: `src/replica/engine-propose.test.ts:768-911, 1016-1085` (n = 2, 3, 4 stale fragments; 33 parts, 33 assemblies, 60 s, duplicate on the GM side); `src/replica/pending-edits.test.ts:446-546`. The TLA+ model leaves fragments out (`.claude/skills/edit-delivery/SKILL.md:12, 99`): no mapping change.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/fragment-assembler.ts` -- factory, outcome type, exported GM limits -- the one algorithm.
- [ ] `src/core/fragment-assembler.test.ts` -- every matrix row with literal `now` values -- the oracle the engine suite lacks for the player side.
- [ ] `src/replica/room-protocol.ts` -- GM side on the shared module.
- [ ] `src/replica/pending-edits.ts` -- player side with `maxParts: Infinity` and the other GM limits.
- [ ] `src/replica/pending-edits.test.ts` -- the "Player stale replies" row with the closure `now` the file already uses (`:933, 965, 994`).
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- one entry: `staleReplyFragments` has no part cap, so a GM can send a stale reply the GM side itself would refuse as a proposal; a GM-side cap or a `denied` answer is a later decision.

**Acceptance Criteria:**
- Given the repository, when `grep -rn "parts: new Map\|PROPOSAL_MAX_\|PROPOSAL_RETENTION" src/replica` runs, then it prints nothing.
- Given the GM, when `engine-propose` runs, then the tests at 768-911 and 1016-1085 pass with no edit.
- Given the junit lists before and after (procedure below), when the sorted `testcase name` attributes are compared, then before is a subset of after and the difference is the new tests.

## Implementation Notes

- Tests locked first (`aa1b982`, `aa266ba`): `src/core/fragment-assembler.test.ts` (seven cases, one per matrix row, literal records and `now` values) and two cases in `src/replica/pending-edits.test.ts` (33 parts complete; an oversized and an expired reply answer `null` per part, then a 2-part reply completes). `aa266ba` moves the clock to 120 000 before the recovered reply: at 60 000 the expired reply's lone second part would have completed it.
- `0c87954` adds `createFragmentAssembler` and `GM_FRAGMENT_ASSEMBLER_LIMITS`, and puts both callers on it; `complete` reads the completing part's `k` from `assembleRecords`, with the part itself as the type-level fallback.
- Mutation calibration: eight mutations (deadline refreshed by a later part, newest assembly evicted, identical duplicate dropped, changed duplicate kept, count mismatch kept, player `maxParts: 32`, player `maxBytes` and `retentionMs` as `Infinity`) each turned the owner test red on its protected assertion.
- `bun test` goes from 3 496 to 3 505 tests at the merged master; the junit names before are a subset of after, and the nine new cases are the difference. `test:browser` stays at 583.

## Spec Change Log

## Review Triage Log

- Review 01 (six sources): the too-many-parts test does not prove the cap precedes the lookup (minor, test-only, deferred); the TASK-77–98 deferred entry on stale-reply cleanup is now resolved (`f9a9c97`); the player's byte limit drops a legal reply of about 34 or more full parts, which follows the frozen spec, so it went to `deferred-work.md` beside the GM part cap (`edb3c90`).
- Review 02 (`final`, two sources): no findings.

## Verification

**Commands:**
- Junit baseline: before any edit, at the branch HEAD, `bun test --reporter=junit --reporter-outfile=<scratchpad>/before.xml`; after, the same into `after.xml`; compare sorted `testcase name` attributes (3 min)
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck` -- expected: clean (3 min)
- `bun test` -- expected: green (3 min)
- `bun run test:browser` -- expected: green; outside the sandbox (10 min)
- `bun run build` -- expected: builds (2 min)
