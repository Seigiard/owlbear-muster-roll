---
title: 'TASK-61.6: validate UI separation on the link picker'
type: 'refactor'
created: '2026-11-14'
status: 'done'
baseline_commit: 'fd7ed425e88d344e1217bf559c0c9b31888ff568'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/backlog/docs/doc-1 - Epic-framework-independent-UI-behavior-and-simple-rendering.md'
  - '{project-root}/docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Navigation alone cannot validate UI separation across flows. TASK-61.6 must test transfer before proposing shared machinery.

**Approach:** Build an executable picker experiment: link → replica arrival → optional label write → close. Compare navigation, then update H3/H6 and coverage. Select picker over settings because external effects, timeouts and close retry test a different interaction than confirmation.

## Boundaries & Constraints

**Always:** Separate pure decisions from effects. A flow-specific caller supplies facts, executes ports and reports outcomes. Retain core policy and replica ownership. Use independent picker contracts. Measure caller knowledge, duplicate ownership and runtime requirements. Record the full baseline revision and reproduction commands.

**Never:** Change `src/`, application tests, dependencies, protocol, storage, copy or ADR 0002. No live-room calls or deployment. A shared helper, emitter, registry or machine library needs two real uses with matching requirements; otherwise record rejection. Experimental caller machinery is not an approved production interface.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Initial read | Valid token, loaded, first catch-up complete, GM | Read label once; block picks while reading; empty label selects offer, existing label clears it | Missing label disables offer; rejected/timed-out read permits linking without a default write; late answer is inert |
| Link and label | Selected target and checked offer | Freeze offered name at pick; send link; write only after matching replica arrival; close after write settles | Answer alone cannot trigger write or close |
| No label | Unchecked offer or empty offered name | Link, wait for arrival, close without write | Existing token label stays unchanged |
| Failed link | Refused/timed-out command before arrival | No label or close; show failure and allow another pick | An old completion cannot change a new attempt, including the same target |
| Arrival first | Replica arrival precedes command answer | Start finishing once; later timeout or relink cannot restart it | Preserve in-progress write/close sequence |
| Label failure | Write rejects or times out | Keep link; notify before close | Rejected/timed-out notification still permits close |
| Role change | Client becomes player before write starts | No label write; finish close | Player cannot start label read or pick |
| Retry | Close rejects | Permit a new pick, including the same target | Previous attempt's completions must stay inert |

</frozen-after-approval>

## Code Map

- `src/ui/navigation.ts`, `src/ui/main.tsx`: pure transitions and external effects; fresh sheet keys identify navigation operations.
- `src/ui/picker/link-picker.tsx`: `CurrentLabel`, `Sent`, `pick`, arrival and timeout rules currently live in React.
- `src/core/link-target.ts`, `src/core/token-links.ts`: reuse target comparison; retain grouping policy.
- `_bmad-output/implementation-artifacts/spec-4-7-offer-the-sheet-name-as-the-token-label.md`: independent sequence/default/failure/role contracts, bounded waits and close retry.
- `src/ui/picker/link-picker.test.tsx`, `tests/link.e2e.ts`: observable production call order, stored link, label and close.
- Root `bunfig.toml` preloads happy-dom; `tsconfig.json` excludes prototypes. Explicit isolated checks are required.

## Tasks & Acceptance

**Execution:**
- [x] `prototypes/ui-second-flow/picker-flow.ts` — pure rules; no promises, timers or platform calls.
- [x] `prototypes/ui-second-flow/picker-caller.ts` — inject command/label/notification/close functions and scheduling. Keep transition priorities in the flow. Guard stale completions; define disposal without claiming production lifecycle equivalence.
- [x] `prototypes/ui-second-flow/picker-flow.test.ts`, `picker-caller.test.ts` — exercise the matrix through observable calls and controlled time, without sleeps. Calibrate arrival, role, timeout and stale-attempt checks with deliberate defects; restore correct code.
- [x] `prototypes/ui-second-flow/bunfig.toml`, `tsconfig.json` — disable DOM preload and explicitly typecheck prototypes.
- [x] `prototypes/ui-second-flow/README.md` — record commands/results, oracles, transfer table, caller knowledge and shared-seam verdicts. Distinguish execution, proposals and live-port limits.
- [x] Backlog `doc-1` — CLI update of H3/H6, stage and picker/settings coverage; retain other gaps. Append further findings to `_bmad-output/implementation-artifacts/deferred-work.md`. Leave production migration for separately approved bounded work under TASK-61.7.

**Acceptance Criteria:**
- Given both flows, when transfer is assessed, then reusable principles and specific rules have examples and shared machinery has a justified verdict.
- Given isolated configuration, when checks run, then sequencing works without React/DOM/Owlbear/replica startup, against independent oracles and calibrated checks.
- Given completed evidence, when coverage is updated, then H6 has a bounded verdict, picker remains unmigrated and remaining work is explicit.

## Implementation Notes

- Implemented an isolated picker flow and experiment-only caller with injected ports and scheduling. Core retains validation, target comparison and grouping; replica/client retains command timeout ownership.
- `prototypes/ui-second-flow/README.md` records independent picker oracles, transfer/caller-knowledge tables and rejection of shared machinery without matching uses. H3/H6 are supported only within navigation and this executable experiment; picker production migration remains unapproved and untouched.
- `backlog doc update doc-1 --content ...` updated stage, H3/H6 and picker/settings coverage. Remaining migration/integration limits are appended to `deferred-work.md`.

## Spec Change Log

## Review Triage Log

Round 1: independent blind, edge-case and verification-gap reviews.

| Finding | Verdict and evidence | Route |
| --- | --- | --- |
| BH1: queued effects after synchronous disposal | medium: a same-target pick produces link plus write/close; a link port can call dispose before the next effect. The loop does not recheck disposal. No general queue is needed for the demonstrated case. | patch: stop queued effects after disposal/closure |
| BH2: no asynchronous view notification | low: state is read through a getter; no renderer is connected. Incoming scoped-event delivery is demonstrated, not renderer publication. | patch: narrow README claims explicitly |
| BH3: answered without arrival waits indefinitely | low: the flow deliberately waits for replica facts; the command promise is already settled and cannot later time out. Production retains this behavior. | patch: document the wait rather than inventing a timeout |
| BH4: unresolved close blocks retry | low: close has no deadline, matching production. Only label reads/writes and notifications have bounded waits. | patch: name this limit |
| BH5: borrowed mutable facts/state | low: the API exposes caller-owned references and a borrowed state snapshot; mutations outside events are unsupported. There is no connected renderer. | patch: document immutable use; reject added defensive-copy machinery for this prototype |
| BH6: old write completion after retry untested | low: bounded settlement already drops late completion, but the retry combination is not observed. Existing label-timeout and close-retry contracts supply the oracle. | patch: add the combination |
| BH7: notification deadline could be too early | medium: the existing test advances directly to the deadline and would accept an early timer. | patch: assert before and at the deadline |
| BH8: normal settlement timer cancellation unobserved | low: timer cleanup exists, but only disposal cleanup is observed. Leftover timers add work despite inert callbacks. | patch: observe timer count after normal settlements |
| BH9: scheduler/cancel throws | low: the injected timer contract does not promise throwing behavior; no normal scheduler failure was demonstrated. Error-handling branches would exceed a direct correction. | patch: state no-throw scheduler/cancel precondition; reject additional exception machinery |
| EC1: effects continue after disposal | medium: same verified queued-effects defect as BH1. | patch: same root cause as BH1 |
| EC2: scheduler throws | low: same unsupported scheduler behavior as BH9, rather than a real timer outcome. | patch: same contract clarification as BH9; no new guards |
| VG1: late command timeout during notifying/closing untested | medium: a mutation that accepts failures outside writing survives all tests and allows a second operation. Reviewer demonstrated both phases. | patch: add observable pending-attempt scenarios |

## Verification

- Run `bun test` from the prototype directory with its config and empty preload. Check absent DOM globals as an environment precondition, not behavioral evidence.
- Run `bunx tsc --noEmit -p prototypes/ui-second-flow/tsconfig.json`; lint prototypes explicitly if excluded by root lint.
- Full check: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.
- Verify no production/test/dependency changes. Full checks prove the unchanged baseline, not integration. Controlled ports prove caller decisions, not SDK behavior; live Owlbear remains untested.

Historical pre-review checks on baseline `fd7ed425e88d344e1217bf559c0c9b31888ff568` (superseded by final verification below):
- Isolated `bun test`: 48 passed (47 behavioral cases and one absent-DOM environment precondition).
- `python3 calibrate.py`: four behavioral assertion failures with deliberate arrival, role, deadline and stale-attempt defects; correct bytes restored; 48 passed afterward.
- Explicit prototype TypeScript, lint (five files, zero warnings/errors) and format checks passed. Local lint/format configs override the root prototype exclusion.
- Full check passed: format, lint (existing warnings), typecheck, `bun test` (2910 passed, one environment-precondition skip, zero failed), `bun run test:browser` (512 passed), build (existing `advancedChunks` deprecation).
- `git diff --exit-code fd7ed425e88d344e1217bf559c0c9b31888ff568 -- src tests package.json bun.lock docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md` passed with no output.
- No live-room calls or deployment. Experimental disposal is not production lifecycle proof. Review/finalization remains with the parent session.

Post-review focused verification:
- `bun test picker-caller.test.ts`: 41 passed, zero failed; ten cases added for synchronous disposal, arrival-first notifying/closing, late writes after retry, notification deadline and normal timer cleanup.
- `python3 calibrate.py`: eight deliberate defects failed behavioral assertions; exact source restored; 41 caller tests passed afterward. The added mutations cover queued disposal, waiting-only priority, early notification timeout and omitted timer cancellation.
- The synchronous-disposal cases failed before the fix with an extra write/close. No combined prototype suite or project-wide verification was rerun. Current prototype inventory is 58 cases; the 17 unchanged flow/environment cases retain pre-review results only.
- README and doc-1 bound H3 to inbound scoped events and document the absent render-publication API, indefinite arrival/close waits, immutable borrowed snapshots and no-throw scheduling/cancellation contract.

Parent verification notes:
- First full rerun observed all eight calibration defects and 58 isolated passes, then stopped at explicit prototype typecheck: Bun's test table inferred readonly expected arrays. Copying those expected arrays into mutable arrays fixes the type mismatch without changing any expected values. The full check is rerun on that correction.
- The next rerun passed calibration, all 58 isolated cases, explicit prototype typecheck/lint/format, root format/lint/typecheck and 2920 unit cases (one no-DOM precondition skipped in the root runner). Browser verification reached 502 passes before Node v26.13.0 aborted in V8 `Buffer.byteLength` with `Lazy deopt after a fast API call with return value is unsupported`; the remaining ten tests could not reach the dead Vite server. No test or application change is justified by this runtime crash. A full browser retry uses the supported `NODE_OPTIONS=--jitless` environment flag, then runs build and the production-diff guard.
- The verification-gap reviewer read the final changes independently and confirmed VG1 coverage and both synchronous-disposal paths; this follow-up did not execute checks or mutations.
- `--jitless` could not start Vite because this runtime removes WebAssembly. The next browser run instead launches Node with its supported `--no-turbo-fast-api-calls` CLI flag through a temporary PATH shim. This disables only the fast-API optimization named in the crash and retains WebAssembly; no repository configuration changes.

Final verification after all code corrections:
- `task616-final-full-r2`: eight calibrated defects, 58 isolated passes, explicit prototype typecheck/lint/format, root format/lint/typecheck, and 2920 unit passes with one environment-only skip. No behavioral skip or failure.
- `task616-browser-fast-api-off`: all 512 Chromium cases passed in 2.4 minutes with the temporary Node CLI workaround, followed by a successful default production build and unchanged-production diff guard; durable supervisor verdict exit 0.
- All review patches and claim clarifications are applied. Independent source-only follow-up confirmed the demonstrated disposal correction and VG1 coverage. Live Owlbear, renderer publication and production picker migration remain unproven and deferred; the epic stays open.
