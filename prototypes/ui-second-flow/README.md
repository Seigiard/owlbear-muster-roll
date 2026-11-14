# Second-flow experiment: token picker

## Result and scope

Pure decisions transfer from navigation to the picker. A flow-specific caller can execute label ports and report outcomes without React, DOM, Owlbear or replica startup. This remains historical executable prototype evidence; its caller is not a production interface.

The picker was selected over settings because its link → replica arrival → optional item-label write → close sequence adds external effects, bounded platform waits and same-target close retry. Settings confirmation would repeat more of navigation's confirmation pattern. Settings remains untested by this experiment.

Baseline: `fd7ed425e88d344e1217bf559c0c9b31888ff568` (full `git rev-parse HEAD` at execution).

The production owner is now `src/ui/picker/link-picker-reducer.ts`, with `useReducer` and all commands, ports and browser effects in `src/ui/picker/link-picker.tsx`. This prototype keeps the independent experiment and caller for historical evidence; it is not the production runner.

## Files and ownership

- `picker-flow.ts`: historical pure state transitions, read eligibility, offer defaults, arrival priority, role checks, sequence and attempt identity. It contains no promises, timers or platform calls. The production rules now belong to `src/ui/picker/link-picker-reducer.ts`.
- `picker-caller.ts`: experiment-only caller. It supplies facts, invokes injected ports, schedules bounded label waits and reports outcomes. It does not decide when arrival wins, whether to write or when to close.
- `picker-flow.test.ts`: pure rules and an isolated-environment precondition.
- `picker-caller.test.ts`: observable port calls, controlled promise completions and controlled time.
- `test-support.ts`: deferred ports and a manual scheduler. No sleeps or SDK simulation.
- `calibrate.py`: eight deliberate defects, each restored in `finally`, followed by the correct caller suite. Run it without concurrent edits or checks of these prototype files.
- Local Bun, TypeScript, lint and format configuration makes the excluded prototype checks explicit.

Core remains authoritative: `tokenIdSchema` validates token ids, `sameLinkTarget` compares sheet and repeat-block targets, and `LinkTarget` defines their shape. The prototype does not rebuild `pickerGroups`, visibility, offered-name resolution, replica records or command policy. A future real caller would obtain choices from the existing core functions and supply the current replica target, not an optimistic projection.

## Independent oracles

The consumer is the flow's caller. The observable failures are an early label write or close, a player starting an operation, a missing notification before close, and an old completion changing a retry.

The unchanged product contract is `_bmad-output/implementation-artifacts/spec-4-7-offer-the-sheet-name-as-the-token-label.md`: its matrix and bounded-wait, role and retry requirements define the sequence and defaults. The approved TASK-61.6 matrix specifies stale attempts. The unchanged `src/ui/picker/link-picker.test.tsx` and `tests/link.e2e.ts` provide independent production examples. New expectations use literal port-call sequences, not values produced by the new transition code.

| Contract | Observable check |
| --- | --- |
| Valid token, loaded, first catch-up complete, GM; read once | Read gating cases, repeated facts and blocked picks during the read |
| Empty/existing/missing labels | Checked/unchecked/disabled offer and exact write/no-write calls |
| Rejected or silent read; late answer inert | Link and close without a default write; optional explicit offer still works |
| Answer is not replica arrival | No write or close after command answer alone; matching repeat-block arrival starts write |
| Frozen offered name | A second pick/offer during the attempt cannot replace the original write text |
| Refusal/command timeout/rejection | Failure state, no write/close, another pick allowed |
| Arrival first | Late timeout and relink cannot restart or clear writing, notifying or closing; the pending attempt blocks another pick |
| Label rejection/timeout | Notify before close; rejected/silent notification still closes |
| Player or demotion | No player read/pick; demotion before arrival skips write and closes |
| Close rejection | Same-target retry works, including an already matching replica; old command failure and a late timed-out write cannot settle the new attempt |
| Bounded waits | Notification stays pending before its deadline; normal read/write/notification settlement removes its timer |
| Disposal | Pending read/write/notify timers cancel; later outcomes and the rest of a synchronously interrupted effect batch cannot start more effects |

The absent-DOM assertion checks the isolated environment only. It is not behavioral evidence. The root suite skips that assertion because root `bunfig.toml` deliberately preloads happy-dom. All behavioral checks still run there.

## Reproduction

Use the locked project tools. If needed, install them with `bun install --frozen-lockfile` at the repository root. No dependency versions change.

Run from this directory:

```sh
bun test
python3 calibrate.py
bunx oxlint --type-aware --config .oxlintrc.json .
bunx oxfmt --config .oxfmtrc.json --check '*.ts' '*.json'
```

`bun test` loads this directory's `bunfig.toml`, with `preload = []`. Do not pass `--config` after `test`: this Bun version treats its value as a test filter. Calibration needs Python 3 and Bun, but adds no project dependency.

Run from the repository root:

```sh
bunx tsc --noEmit -p prototypes/ui-second-flow/tsconfig.json
bunx oxfmt --ignore-path .gitignore --check .
bun run lint
bun run typecheck
bun test
bun run test:browser
bun run build
git diff --exit-code fd7ed425e88d344e1217bf559c0c9b31888ff568 -- src tests package.json bun.lock docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
```

Root configurations exclude prototypes. Local configuration can affect file discovery, so run the explicit checks rather than inferring prototype coverage from a root pass. Root TypeScript excludes prototypes; the local config explicitly includes them and removes DOM libraries. It retains the existing core imports and their dependencies.

## Executed results

Post-review checks:

- Isolated combined suite: 58 passed, zero failed (57 behavioral cases and one no-DOM precondition).
- `python3 calibrate.py`: eight mutants failed behavioral assertions (exit 1), then 41 caller cases passed after exact source restoration.
- The synchronous-disposal reproducer first failed on both queued-write and queued-close paths before the fix.
- Explicit prototype TypeScript, lint (five files, zero warnings/errors) and format checks passed. The config uses ES2023 libraries without DOM libraries.
- Root format, lint and typecheck passed. Root unit suite: 2920 passed, one skipped no-DOM precondition, zero failed (2921 tests across 101 files). Lint reported existing warnings.
- All 512 unchanged Chromium browser cases passed in 2.4 minutes with Node's `--no-turbo-fast-api-calls` CLI flag. The production build and baseline diff guard then passed. Build reported the existing `advancedChunks` deprecation.
- The baseline guard confirms no changes to application source/tests, dependency files or ADR 0002. Full checks prove the unchanged application, not prototype integration.

Parent checks ran through supervised `herdr-run` jobs `task616-final-full-r2` and `task616-browser-fast-api-off`. Their logs and exit verdicts are local execution records; reproduction does not depend on those records.

### Local Node runtime limitation

The default browser rerun reached 502 passes before the Vite server aborted inside Node v26.13.0 with `Lazy deopt after a fast API call with return value is unsupported` in `Buffer.byteLength`. Ten remaining pages received connection-refused errors. A `--jitless` probe could not start Vite because it removed WebAssembly. Neither failed run is counted as a passing suite.

The successful rerun disabled only fast API calls, retaining WebAssembly. A temporary executable named `node` was placed first on `PATH`; it invoked the actual Node executable with `--no-turbo-fast-api-calls` followed by the original arguments. Then the unchanged `bun run test:browser` ran. The flag is a Node CLI option, not an allowed `NODE_OPTIONS` value. This workaround is local; repository configuration and dependencies remain unchanged. One successful rerun supports the workaround, not a confirmed upstream root cause or runtime fix.

| Deliberate defect | Observed failure |
| --- | --- |
| Remove matching-arrival gate | `write:t1:Goblin` appeared before arrival |
| Remove GM check before write | Demotion produced `write:t1:Aragorn` instead of close |
| Double label-read timeout | At the specified deadline, a late empty read incorrectly enabled a default write |
| Ignore command attempt id | An old refusal cleared the second same-target pick; `write:t1:Again` was missing |
| Continue an effect batch after synchronous disposal | The disposed caller still invoked the queued write or close |
| Accept late command failure in any phase except writing | Notifying and closing attempts were replaced by a second link after a late timeout |
| Fire notification timeout one unit early | Close appeared before the deadline, instead of a pending notification and one timer |
| Leave timers scheduled after normal settlement | Read/write/notification timer-count assertions found leftover timers |

These eight mutation cases are calibrated against deliberate defects. Other assertions, including the late-write-after-retry cases, have been observed green but are not individually mutation-calibrated. Calibration does not prove all possible defects are detectable.

## Transfer from navigation

| Principle or mechanism | Navigation example | Picker example | Verdict |
| --- | --- | --- | --- |
| Pure decisions; effects outside | `transition` owns navigation priority; window sends commands and applies DOM effects | Flow owns arrival/write/notify/close priority; caller executes ports | Transfers unchanged as an ownership principle |
| Facts instead of importing runtime owners | Window supplies committed view facts | Caller supplies readiness, role and replica target | Transfers; no new projection or store |
| Direct events, not a general bus | Handler and command outcomes reach the reducer | Facts, user choices and scoped async results reach this flow | Supported for inbound scoped event delivery; picker render publication is not exercised |
| Domain key as operation identity | Fresh create sheet key; accepted same-sheet delete retry limit in ADR 0002 | Target is not fresh; close retry can pick the same target | Does not transfer; picker uses a local monotonic attempt id |
| Effect execution shape | `useReducer` plus React effects; no integration layer or effect ids | Experimental caller executes effect data and waits for several external ports | Prototype-only. In production the picker takes navigation's shape: `useReducer` plus effects in the component; this caller is a test harness |
| Completion priority | Projection and create/delete outcomes select navigation state | Matching replica arrival wins over later command failure; write/notify/close run once | Principle transfers; exact rules do not |
| Runtime requirements | Pure navigation reducer tests; browser tests for mounted focus/reveal | Pure flow plus controlled promises and scheduler; no mounted UI | Both permit isolated rules; browser/lifecycle obligations remain separate |

## Caller knowledge and duplicate ownership

| Concern | Baseline picker React caller | Experiment |
| --- | --- | --- |
| Read/default policy | Read-start ref, read effect, offer state and readiness guard | Pure flow owns read-once and defaults; caller invokes the read effect |
| Arrival/answer ordering | Arrival calculation, outcome effect and finishing ref interact | Flow consumes the replica target and scoped outcome; caller forwards facts/results |
| Label/notification/close sequence | Async `finish()` and ref coordinate each stage | Flow owns stage order; caller knows five concrete port operations |
| Role and retry | React reads current role and resets sent/finishing state | Flow rechecks role and gives each pick a new id |
| Time and lifetime | React effect cleanup plus port waits | Caller owns injected scheduling and one explicit `dispose()` |
| Grouping, visibility and replication | Core and existing stores | Same owners; no copies in the prototype |

The interface requires five facts (`loaded`, `firstCatchUpDone`, `role`, `arrived`, fixed token id), a core-resolved target/name, and offer/pick events. The caller knows the five port mappings and two bounded label-wait durations. It does not branch on arrival, role, offer defaults or failure priority. The flow owns label status, offer choice, current attempt/stage and failure/closed state. The caller holds the single flow state and timer cancellation handles, not a second workflow state.

The command port still owns command settlement and timeout. `answered` is not an arrival. The caller does not add another command timer or copy replica policy. A command port that never reports a timeout violates that boundary; the experiment does not supply a replica-client replacement.

## Shared-seam verdicts

- **H3: supported for inbound scoped event delivery within these two flows.** The picker caller has only a state getter, with no asynchronous view publication or render subscription API. This experiment does not establish outbound publication requirements or a verdict for every UI flow.
- **H6: supported for this executable picker experiment.** Pure rules, supplied facts and external effects transfer. Target identity, stage sequencing, platform deadlines and disposal stay flow-specific. Production transfer remains unproven until a separately approved migration is wired and checked.
- **Shared state-machine helper/runner: rejected for now.** Navigation intentionally has no caller layer, effect-consumption contract or sequential platform-port runner. The prototype is the only user of this runner shape. Sharing would add configuration or duplicate ownership without two matching requirements.
- **General emitter and registry: rejected for demonstrated uses.** Both flows have a known caller and direct inbound events. No dynamic discovery, broadcasting or listener-management need was demonstrated; picker outbound publication remains untested.
- **Machine library: rejected for now.** No requirement in these two flows needs a new runtime or dependency. A local timeout helper remains private to this caller, not a new shared API.

## Limits and next work

`dispose()` is an explicit experimental lifetime boundary. It cancels scheduled callbacks and prevents new effects from late results or the remaining interrupted batch. It cannot cancel or undo a platform call already in progress. This is not proof of React unmount, Strict Mode, remount or iframe-close equivalence.

The scheduler must return a cancellation function and deliver deadline callbacks asynchronously, like a normal timer. Scheduling and cancellation callbacks must not throw; the caller adds no scheduler-exception machinery. Facts and returned state are borrowed immutable snapshots, including their nested objects. Do not mutate them outside events; the API does not clone or freeze them.

An answered command without matching replica arrival can wait indefinitely, as in the baseline. An unresolved close can also wait indefinitely and blocks retry; only a rejected close permits another pick. Label read, label write and notification waits are bounded. No second command timer or close timeout is added.

The arrival rule matches the existing target-based replica rule. It does not prove that a matching record was caused by the current command. Same-target retry can finish against a link already present. No protocol change or stronger commit identity is proposed.

Controlled ports prove decisions and ordering, not Owlbear SDK behavior, actual item-label persistence, role-change delivery or popover closure. No live-room call or deployment ran. Browser checks exercise only the unchanged mock-backed application, not this caller wired into React.

TASK-61.7 must research and propose any bounded production picker migration separately. Keep settings, field-edit ownership, builder selection/rename and shared renderer gaps open. Do not promote this experimental caller API to production or introduce shared machinery from this experiment alone.
