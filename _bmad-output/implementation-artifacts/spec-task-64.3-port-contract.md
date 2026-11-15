---
title: 'TASK-64.3: Port contract for mock and Owlbear adapters'
type: 'feature'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
baseline_commit: 'f30ad5e5fd6322e82aabb31859029c1e7fcd9c65'
review_loop_iteration: 1
context: ['CLAUDE.md', '_bmad-output/specs/spec-muster-roll/storage-and-sync.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The mock platform can drift from Owlbear while application tests pass. The storage, broadcast, and room-metadata behavior the replica engine needs has no shared contract.

**Approach:** Add one adapter-factory-driven scenario module. Run it in Bun against real mock objects and in Chromium against `createBrowserStorage(() => localStorage)`; expose broadcast and metadata through an opt-in, owner-run live OBR harness that reuses the singleton.

## Boundaries & Constraints

**Always:** Use the pre-change `src/platform/ports.ts` and recorded engine requirements as the oracle; preserve `ports.ts`. Reuse `createMockPlatform`, `createMemoryBus`, `createMemoryRoom`, and `createBrowserStorage`. Wait for observed delivery, assert only per-sender order, generate unique storage/metadata/channel names, and clean up only owned data. Preserve TASK-64.2's `tests/support/room-rig.ts` relocation.

**Never:** Build a second simulation, assert global multi-sender order, or guess a rate quota or metadata capacity. An injected send rejection proves local mapping only, not live rate limiting, delivery, or order. Do not automatically use a live room or mutate a nonempty/shared room.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| storage lifecycle | absent owned key; write, overwrite, remove | absent is `null`; latest string reads; removal restores `null`; owned keys compare as a set | no storage key-order assertion |
| storage failure | external backing throws on get/set/remove/list | matching `StoragePort` operation returns `err` | reason exists; no exception escapes |
| LOCAL and REMOTE | A background/window share A bus; B has another bus/connection in one room | LOCAL stays on A and includes sender; REMOTE reaches B, not A | wait for observed events |
| broadcast order/failure | one sender emits values; injected rate-limit outcome | receiver sees that sender's sequence; send resolves `rate-limited` | injection is local evidence only |
| metadata merge | retained/removable owned entries; update and `undefined` | read/listener see merge; undefined entry disappears | capacity/drop excluded |

</frozen-after-approval>

## Code Map

- `src/platform/ports.ts` -- fixed public shapes for the three ports and failures; do not change.
- `src/platform/mock/index.ts` -- real factory, injectable `MockStorageBacking`, and `failNextSends`; uncaught backing exceptions are the expected first divergence.
- `src/platform/mock/local-bus.ts`, `src/platform/mock/room.ts` -- real LOCAL/REMOTE and metadata topology; reuse only.
- `src/platform/obr/index.ts` -- OBR singleton; the live harness may import it via `@/platform/current`, with no factory refactor.
- `src/platform/obr/browser-storage.ts`, `send-result.ts` -- storage Result mapping and rejection mapping to reuse.
- `src/platform/mock/index.test.ts`, `src/platform/obr/browser-storage.test.ts`, `src/platform/obr/send-result.test.ts` -- local test conventions and focused coverage to retain.
- `tests/support/room.ts`, `playwright.config.ts` -- browser conventions; normal Playwright serves mock mode, so it is not live OBR evidence.
- `vite.config.ts`, root HTML entries, `package.json` -- only needed for a named dev-served live harness.
- `CLAUDE.md` and `_bmad-output/implementation-artifacts/deferred-work.md` -- evidence boundaries and deferred discovered divergences.

## Tasks & Acceptance

**Execution:**
- [x] `tests/support/port-contract.ts` -- define framework-independent, behavior-named scenarios and a fixture interface containing production ports plus explicit test controls for topology, observed events, injected outcomes, and owned cleanup. Keep test infrastructure outside production source.
- [x] `src/platform/mock/port-contract.test.ts` -- bind the runner to real mock factories. Add thrown external `MockStorageBacking` operations first; then correct `attemptStorage` only if they demonstrate the divergence.
- [x] `tests/port-contract-storage.e2e.ts` and `tests/support/browser-port-contract.ts` -- bind storage scenarios to `createBrowserStorage` and real Chromium `localStorage` through a Vite-loaded browser module; compare keys as sets.
- [x] `tests/port-contract-live/`, HTML/Vite entry, and `bun run port-contract:live` -- provide a paired-client, owner-run OBR harness. Generate/show a run id, use it in every key/channel, require the peer to join it, and provide owned-data cleanup. State that two live clients are required for REMOTE and metadata.
- [x] `src/platform/mock/index.ts` -- fix only demonstrated contract divergence, beginning with converting thrown backing operations to `StorageFailure`; retain the send-failure hook.
- [x] `CLAUDE.md` and live instructions -- distinguish Bun/mock, Chromium storage, and owner live evidence. Name unrun live limits: cross-client delivery/timing, host-scheduled per-sender order, rate rejection/recovery, and metadata capacity/drop. Historical measurements remain observations, not guarantees.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- audit the conditional row; no row was appended because every observed divergence was fixed in this task.

**Acceptance Criteria:**
- Given mock and browser-storage bindings, when applicable scenarios run, then each matrix row has a behavioral result without a second simulation.
- Given a throwing external mock backing, when every storage operation runs, then it returns the matching Result failure without throwing.
- Given A and B fixtures, when messages and metadata updates run, then scope, per-sender order, merge, and undefined-delete follow the port contract.
- Given an owner-selected empty room, when the paired harness runs, then it reports observed OBR broadcast/metadata and cleans only its namespace.
- Given revised guidance, when maintainers read it, then mock or injection evidence cannot be confused with live Owlbear evidence.

## Implementation Notes

- D4 correction: `tests/port-contract-live/main.ts` renders the run id and role through DOM properties and text nodes, validates the run id before `platform.onReady`, and shows a visible error for malformed ids or roles. The original diagnostic control and log remain preserved as `controls/harness-runtime-original-diagnostic.ts` and `controls/harness-runtime-original-diagnostic.log`; the fixed local-runtime control is `controls/harness-runtime-fixed.ts`.
- D5 correction: `tests/port-contract-live/manifest.json` and `port-contract-live-background.html` form a dev-only installable OBR extension entry served by Vite without adding a dangling manifest to `dist`. `tests/port-contract-live/README.md` gives the HTTPS tunnel, manifest installation, empty-room, role-selection, observation and cleanup procedure. It does not change `public/manifest.json` or the production origin.
- The live harness opens a hidden local bridge through the coordinator's popover port. The bridge is a separate same-client extension context, so LOCAL is not inferred from same-page subscriptions. REMOTE and one-sender order still use the paired owner clients.
- Metadata control uses only the read RPC needed by the locked scenario. Reader writes fail visibly. Control sends and metadata reads time out with visible errors; a control transport failure is not an adapter-semantic verdict.
- Final local controls recorded `200 application/json` for the Vite-served dev manifest, inert malformed run-id rendering in Chromium, and mock-only LOCAL/REMOTE/order wiring with the expected recipients. These controls do not prove Owlbear SDK semantics or a live room.
- D6 correction: the separate bridge now subscribes to every shared data channel, so an enabled B-to-A REMOTE control records the real event in both A's direct recorder and bridge recorder. Normal A-to-B LOCAL/REMOTE/order/metadata wiring remains checked separately; these are mock-context controls only.
- D6/D7 correction: role-picker selection updates the visible active role and run id before readiness waits, and the harness-only interface strings now live in the `copy.portContractLive` group in `src/copy.ts`.
- Historical conditional no-deferred audit: no row was appended to `deferred-work.md`; the only observed execution divergences in that adapter/harness audit were D6 and D7, and both were fixed. This historical result does not claim that the confirming review had no deferred findings: the remaining live-room limits and deliberate minor omissions are explicitly deferred in the Review Triage Log and `deferred-work.md`.
- Local-versus-live proof boundary: mock browser contexts prove harness wiring and safe rendering only. They do not prove Owlbear host delivery, cross-client timing, host rate limits or recovery, metadata capacity or drops, global order, or live-room behavior.

## Spec Change Log

- Batch 2 closeout records the owner's decision `Ручной стенд (Recommended)` (option A). The live OBR path remains a bounded manual-observation harness: it does not add an automatic PASS/FAIL evaluator, protocol, session, state, guard or recovery path. The README and maintainer guidance require manual comparison, finite-window disclosure, inspection of coordinator/peer/hidden-bridge consoles, and independent treatment of relay errors and missing observations.

## Review Triage Log

### Review round 01: individual findings

- `adversarial-claude-1`: defer. The early/repeated Run waiter race is a construction outside the documented owner sequence; keep the sequence that waits for pairing first.
- `adversarial-claude-3`: decision resolved by option A. Peer/bridge forwarding logs control failures locally, so a missing observation cannot distinguish relay failure from adapter delivery failure; keep bounded manual observation and narrow the documentation.
- `adversarial-claude-2`: defer. The two-hop delayed-leak input has no live timing occurrence; disclose the 2-second and 100-ms finite bounds instead of adding a host guarantee.
- `docs+tests-codex-1`: decision resolved by option A. The README's all-errors-visible interpretation conflicted with local control-failure logging; document the relay/observation ambiguity.
- `adversarial-claude-4`: defer. A cached ready bridge after close is an unverified normal OBR lifecycle condition; verify it in a live room before changing the mechanism.
- `docs+tests-claude-5`: reject as a missing-deliverable claim. Controls are session artifacts outside the checkout, not committed repository tests; keep their external locations in the handoff.
- `adversarial-claude-5`: defer. LAN exposure is an optional dev-server hardening concern without a supplied occurrence; do not expand the port contract.
- `arch+quality-claude-3`: code. Correct the eligible mixed-language harness explanations in `copy.portContractLive`; no source-inventory test is needed.
- `arch+quality-claude-4`: reject. Demonstrated diagnostic consumers import `waitForObserved` and `browserPortContractSupport`; speculative wrapper/export pruning is not justified.
- `GS1`: defer. Physical spacing and centered max-width are style polish without an observed port or owner-flow defect.
- `GS2`: defer. Hex versus OKLCH representation is style polish without a measured rendering or contrast defect.

### BMAD blind-hunter findings

- `B1`: false as an automatic-PASS claim. The harness returns observations and the approved owner path requires comparison; it has no PASS verdict. Automatic evaluation would be a new assurance boundary.
- `B2`: low; defer. It is the same early-click waiter construction as `adversarial-claude-1`, outside the documented sequence.
- `B3`: low; defer. Overlapping Run/Cleanup is possible, but no supplied occurrence names concurrent operator actions.
- `B4`: low; defer. A third client sharing a run id is outside the two-client empty-room precondition; pinning would be a new control requirement.
- `B5`: false as cleanup-success proof. Coordinator cleanup and peer local cleanup are separate documented actions; no all-client acknowledgement promise exists.
- `B6`: false as a false-success claim. Cleanup failure is visible and no atomic or best-effort cleanup contract was promised.
- `B7`: low; defer. The finite observation-window concern is disclosed; no universal live timing or protocol barrier is added.
- `B8`: false as a scenario-PASS claim. The function returns observations, while the mock assertions own exact order; the owner compares live output manually.
- `B9`: low; defer. The result JSON replaces the initial support list, but no persistent exported-report schema was promised.
- `B10`: false for the accumulating-quota-leak claim. The browser owner uses a fresh Playwright context, and no persistent owner imports this fixture.
- `B11`: low; defer. More protocol-input cases need an independent occurrence and oracle; temporary controls and permanent adapter owners remain the evidence.
- `B12`: low; defer. Session artifacts exist outside the checkout; the handoff names the external evidence rather than claiming committed tests.
- `B13`: low; defer. Party membership cannot establish an empty-data room, and a third connection is outside the documented two-client precondition.
- `B14`: low; defer. Screen-reader live-status polish has no supplied occurrence and no accessibility-conformance claim is made.

### BMAD edge-case findings

- `E1`: low; defer. Same early-click waiter construction as B2.
- `E2`: low; defer. Same concurrent-operator construction as B3.
- `E3`: low; defer. A timer after an open rejection is an unobserved lifecycle construction, not a demonstrated port regression.
- `E4`: low; defer. Peer cleanup errors can reach its console; the documented path does not promise coordinator-wide cleanup acknowledgement.
- `E5`: low; defer. Same third-client construction as B4.
- `E6`: low; defer. A late duplicate beyond the observation bound was not supplied as a port occurrence; no at-most-once timing contract is added.
- `E7`: false for the accumulating-leak claim. Same fresh Playwright-context lifetime as B10.
- `E8`: low; defer. A normal browser tab has no Owlbear readiness callback by design and is not live-host evidence.
- `E9`: false as an atomic-cleanup requirement. Same absent best-effort contract as B6.
- `E10`: low; defer. Initial ready-send failure and orphaned listeners are an unobserved failure construction; no new recovery lifecycle is added.
- `E11`: low; defer. A hostile thrown value whose string conversion throws is not an observed quota/access error class; the four required storage failure owners have direct red/green evidence.

### BMAD verification-gap finding

- `G1`: false as an automatic-success claim. No live comparator exists, but the approved owner-run path explicitly requires manual comparison; no shared automatic verifier is added.

## Closeout

- Confirming final: review `02-after-fix`, profile `final`, completed with exit `0`, `2/2` healthy sources, no degraded sources, zero findings, zero questions and zero blocking findings. Reviewed source state is clean at `f069564fb6b242d974c900de84016681736dd93d`, with cumulative base `f30ad5e5fd6322e82aabb31859029c1e7fcd9c65`.
- Original review: mixed profile completed with `6/6` healthy sources, `0` critical, `0` major and `9` minor findings. All three BMAD layers completed separately, and every finding remains recorded above with its individual disposition. The narrower confirming profile does not erase those deliberate omissions.
- Decision: `Ручной стенд (Recommended)` (option A). The OBR path is a documented paired manual-observation harness and requires owner comparison; it is not an automatic PASS/FAIL evaluator and no live room was run for this task.
- Explicit limitations carried forward: observation waits are finite (2 seconds plus a 100-ms quiet period); coordinator, peer and hidden-bridge consoles must be inspected; a missing observation can be a relay/control failure; and live host delivery, timing/order, rate-limit behavior and recovery, metadata capacity/drop behavior, bridge lifecycle, and other deferred harness polish remain unverified and deferred.

## Design Notes

The runner receives a fixture factory rather than importing adapters. The mock fixture forms A background/window on one `LocalBus` and B on another, sharing `createMemoryRoom`. The browser fixture is intentionally storage-only. The live fixture adapts the singleton and coordinates two harness pages through its run id; it reuses scenarios and port calls, never mock internals.

## Verification

**Commands:**
- `bun test src/platform/mock/port-contract.test.ts` -- mock contract, including thrown backing regression, passes.
- `bun run test:browser -- tests/port-contract-storage.e2e.ts` -- Chromium storage binding passes.
- `bun run port-contract:live` -- serves the opt-in harness; this alone is not a live-room pass.
- `bunx oxfmt --ignore-path .gitignore --check .` -- formatting passes.
- `bun run lint && bun run typecheck && bun test && bun run test:browser && bun run build` -- full sequential check passes.
- Final audit counts: targeted mock `10/10`; targeted Chromium `1/1`; unit `3019 pass`, `1 skip`, `0 fail`; full browser `521/521`; production build and dist guard exit `0`. The named unchanged prototype precondition skip is `environment precondition: the isolated runner has no DOM globals`.

**Manual checks:**
- Owner, in an empty test room only: open two live harness clients with the same run id; record LOCAL/REMOTE recipients and per-sender sequence, metadata merge/delete and listener observations; press cleanup and verify only the generated namespace is removed. Do not infer rate quota or global order from normal delivery.
