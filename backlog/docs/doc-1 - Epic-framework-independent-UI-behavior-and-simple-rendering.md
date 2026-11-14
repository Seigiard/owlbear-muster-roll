---
id: doc-1
title: 'Epic: framework-independent UI behavior and simple rendering'
type: specification
created_date: '2026-11-13T09:43:00Z'
updated_date: '2026-11-14T20:29:00Z'
tags:
  - epic
  - architecture
  - ui-decoupling
  - research
---
# Framework-independent UI behavior and simple rendering

## North star

Muster Roll separates UI behavior from rendering across the room window, builder, picker and shared previews. A visual module receives explicit display data and reports user events. Workflow state, transitions and asynchronous outcome rules can run without React, DOM, Owlbear or replica startup.

React remains the rendering technology. Navigation supplied the first validation slice; completion also required the later owner-approved migrations. Those migrations and the approved coverage dispositions are now complete.

The intended benefit is less caller knowledge: a change to one interaction should not require reconstructing rules scattered through render, effects and command callbacks. A smaller useState count or more files does not prove that benefit.

## Authority and current state

- Parent: **TASK-61**. This document holds the overall goal, hypotheses, decisions and coverage map. Child tasks hold their own acceptance criteria and researched plans.
- Owner-confirmed on 2026-11-13: make behavior framework-independent; retain React for rendering; validate navigation first; preserve the overall goal in a Backlog epic with tasks and hypotheses.
- Accepted direction on 2026-11-13: pure transitions inside a separate navigation module; React remains rendering. See `docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md`.
- Current stage: TASK-61 is complete. All 11 current child tasks are Done, including the picker, builder preview, wipe, preset-upload and snapshot-import migrations. TASK-61.8 records the owner's four successful live Owlbear checks. Field editing, repeat blocks, tree collapse, rename consequences and the small integration cleanups retain their explicit owner exclusions from 2026-11-14.
- Existing domain names come from `GLOSSARY.md`. Existing architecture decisions remain authoritative until explicitly revised.
- Before starting or resuming a child task, read this document. After its evidence changes a hypothesis or coverage row, update this document through the Backlog CLI.

## Target ownership

| Concern | Intended owner | What rendering knows |
| --- | --- | --- |
| Room records, replication and command answers | Existing replica and client modules | Display data and outcomes through the established interface |
| Visibility, sheet policy, formulas and preset rules | Existing `src/core` modules | Their resolved results; no copied policy |
| UI workflow state and transitions | Flow-specific framework-independent module | Current view and user events, not transition ordering |
| Commands, subscriptions and lifecycle | The flow's caller; for navigation, the window's handlers and effects | Its own lifetime; no startup hidden in visual imports |
| DOM focus, scrolling and mounted targets | Browser-side implementation | Semantic intent plus actual DOM availability |
| Local widget interaction | Visual module or React Aria, where appropriate | Focus, hover and accessible interaction needed to draw the widget |
| Visual examples and interactions | Isolated catalogue or preview host | Explicit fixtures and events, without a live room |

This is not a ban on React hooks. Local widget state is different from workflow ownership. The navigation core may decide which target should receive focus; the browser determines whether the target is mounted and whether focus should move now.

Use the architecture vocabulary consistently: a **module** hides implementation behind an **interface** at a **seam**. **Depth** gives callers **leverage** and maintainers **locality**. An **adapter** is justified by real variation, not by a desire to make every dependency abstract.

## Scope and guardrails

- Cover UI behavior across the room window, settings, picker, builder and shared rendering. Preserve the one-renderer rule for the window and previews.
- Reuse separation already present in core, replica, builder document/store and WindowFrame. A new directory is not a new responsibility.
- Preserve current user behavior, access rules, hidden-tab behavior, preset and snapshot formats, room protocol and storage ownership.
- Keep this work separate from a React replacement, replica rewrite, deployment or visual redesign.
- Choose module shapes per flow. A successful navigation reducer does not require every widget to become a reducer.
- A registry, emitter, machine library or Storybook is a candidate mechanism, not an end-state acceptance criterion by itself.
- Follow the project's required task-spec and implementation workflow before any production-code task starts. This epic does not replace those specs.

## Hypotheses and falsification

Statuses are **untested**, **supported**, **rejected** or **inconclusive**. Record the artifact and its limits with each verdict. A design sketch supports feasibility, not working behavior.

| ID | Hypothesis | Check and rejection signal | Owner / current verdict |
| --- | --- | --- | --- |
| H1 | A framework-independent module can own a UI flow while rendering only consumes a coherent view and forwards events. | Exercise the navigation flow without React or DOM. Reject the proposed seam if transition ordering or workflow state remains in rendering, or tests still require mounting the window. | TASK-61.1, TASK-61.5 / supported for navigation; see the pilot outcome and its bounds below |
| H2 | Explicit state transitions simplify navigation more than the current render/effect chain. | Compare pure transitions, an active module and an existing-store-centered presenter. Pilot the approved choice. Reject any choice that merely moves the old chain, exposes many setters, or introduces more caller knowledge. A machine library must justify its own cost. | TASK-61.1, TASK-61.5 / supported for navigation; see the pilot outcome and its bounds below |
| H3 | A small, scoped event interface is enough; a general emitter may be unnecessary. | Trace projection updates, user events, command outcomes, open acknowledgments and DOM intents. Check stale completions and disposal. Add a general emitter only if actual delivery needs remain unmet; reject it if direct events and the existing subscription mechanism suffice. | TASK-61.1, TASK-61.6 / supported for inbound scoped event delivery within navigation and the executable picker experiment, including stale results and disposal. Production picker migration also uses direct reducer actions (TASK-61.8). The prototype has no async view publication/render subscription API; no general outbound-publication claim is made. Shared command runner rejected because execution requirements differ; see the second-flow and production outcomes |
| H4 | A registry makes isolated visual modules easier to select, compose or discover than plain imports. | Compare both against a representative frame and sheet view. Require a concrete lookup or composition need. Reject the registry if it only renames imports or requires broad shared context. | TASK-61.3 / rejected for current scope by the source audit of closed-union dispatch/no discovery need; equal-by-construction stories are not evidence |
| H5 | Storybook gives useful isolated state and interaction checks without Owlbear or replica startup. | Exercise real visual modules with explicit fixtures and events. Compare the dependency/configuration cost with the existing preview host. Reject tool-only setup as evidence; static stories alone do not prove asynchronous behavior. | TASK-61.3 / capability supported; adoption rejected for the current scope on 2026-11-14. The existing preview host shows the same modules with no new dependency, and the states a catalogue would add (an answered command, a real GM) need fixture work Storybook does not remove. Cost measured: two dev dependencies, 180 lock entries, a second Vite config, a 7 MB static catalogue. See doc-3 |
| H6 | The separation learned from navigation transfers to a materially different UI flow. | Choose a second flow after the pilot. Record what transfers and what stays specific. Reject a shared mechanism if the second use needs flags, duplicated state or a larger interface than separate modules. | TASK-61.6 / supported by the executable picker experiment and the completed production picker migration (TASK-61.8); pure rules/facts/external effects transfer, while attempt identity, sequential ports and lifecycle stay flow-specific. The owner confirmed the four live label/popover scenarios; the caller and deferred limits remain explicit |

## Navigation alternatives and accepted direction

Three fresh-context explorations produced these candidate shapes. They did not run tests or implement a pilot.

Detailed findings, the reconciled recommendation and a reproducible projection-store observation are in [doc-2: navigation and visual isolation research](<doc-2 - Research-framework-independent-navigation-and-visual-isolation.md>). Read it before continuing TASK-61.1 or preparing the approval gate. The observation shows intermediate raw atom notifications, not a broken React window or a validated architecture.

| Shape | What sits behind the seam | Expected leverage | Cost or unresolved issue |
| --- | --- | --- | --- |
| Pure transitions plus an external runner | State, transition priorities and effects represented as data | Direct, DOM-free scenario checks; no React or store dependency in the transition module | The runner still needs ordering, effect identity and lifecycle rules. It must not become a second owner of navigation decisions. |
| Active event-driven module | State, subscriptions, serialized events, asynchronous command outcomes and disposal | One caller interface covers a full flow outside React | Queue and effect-consumption machinery may be more infrastructure than this flow needs. Coherent view publication must be demonstrated. |
| Existing-store-centered presenter | State and flow rules in the current nanostores idiom, with commands and outcomes handled there | Small migration for the current caller; no new subscription library | Can remain coupled to projection-store shape. Whole-queue draining may lose mount-dependent focus intents. |

The owner selected pure transitions inside a separate navigation module, retaining React rendering, after this comparison. The implemented shape is pure rules with the window as their only caller; ADR 0002 records the interface. None of the alternatives established a need for a global bus, dynamic registry or new machine library.

Questions that were open before approval: who builds the coherent display snapshot; how browser focus facts enter pure transitions without DOM reads inside them; how command completion relates to record appearance; how stale results become inert; when acknowledgments execute; and how focus/reveal intents survive until mount. The pilot outcome below records how each was answered.

## End-state coverage map

The functional audit is recorded in [doc-3](<doc-3 - Audit-and-experiment-UI-ownership-Storybook-and-registry.md>), including detailed inputs, state, effects, test surfaces, file-group mapping and explicit unresolved questions. The summary below records final dispositions and completed migration owners. The review corrections and starting ownership map remain historical evidence in doc-3.

| UI flow | Starting evidence | Final disposition |
| --- | --- | --- |
| Window navigation | `src/ui/main.tsx` owns workflow and reads DOM focus; `sheet-body.tsx:72-101` consumes reveal after mount | **Meets goal**: TASK-61.5, one pure reducer in `src/ui/navigation.ts`, `useReducer` and browser effects in the window; ADR 0002 |
| Window frame and sidebar/tab drawing | WindowFrame has a data/callback model; direct imports work in the isolated host | **Meets goal**: existing seam; Storybook rejected (TASK-61.3), the preview host remains the catalogue |
| Field editing and repeat-block actions | Draft/save/outcome rules span hooks and local values; repeat focus shares mount-dependent intents | **Owner exclusion** (2026-11-14): `use-field-edit.ts` carries IME, blur and pagehide behavior under browser tests; a migration is reopened only by a field bug that the current shape causes |
| Dice interaction in the window | Evaluation/policy already outside React; button owns its visual request state | **Meets goal**: evaluation and visibility live in core and replica; the button keeps only its shown state |
| Settings upload, import and wipe confirmations | `src/ui/settings/`, `src/ui/preset-actions.tsx` own file/check/confirm/outcome workflows | **Meets goal**: TASK-61.10, TASK-61.11 and TASK-61.12 are Done. Pure `wipe-actions-reducer.ts`, `preset-upload-reducer.ts` and `snapshot-actions-reducer.ts` own transitions; their components retain commands and browser effects. The wipe probe led to the two separate migrations, not a shared framework |
| Token picker | React effects own link-arrival, label ports, timeout and close/retry | **Meets goal**: TASK-61.8 is Done. `src/ui/picker/link-picker-reducer.ts` owns the rules, `link-picker.tsx` holds `useReducer` and the ports, and local attempt identity protects same-target retries. The owner confirmed label writes and automatic popover closure in all four live scenarios; notes are in TASK-61.8 |
| Map-selection interaction in the window | Headless observation exists; main still supplies platform selection effects | **Meets goal**: `map-selection.ts` owns observation lifetime and stale reads; the select/deselect calls in `main.tsx` are the component's effects, as the shape prescribes |
| Builder document, draft and undo | Document/store already separate edits/history/draft from React | **Meets goal**: `document.ts` and `builder-store.ts` own edits, history and draft without React |
| Builder tree, forms and preview selection | Rename consequences and shown-tab rule remain candidates; tree-collapse oracle not located | **Meets goal** for the preview shown tab: TASK-61.9, `src/builder/preview-navigation.ts`; `PreviewPane` no longer updates state during render. **Owner exclusion** (2026-11-14) for tree collapse and rename consequences: no located oracle, no user-visible gain |
| Standalone preview and shared sheet rendering | One renderer retained; four contexts carry implicit cell inputs; pure cell-kind dispatch has no plugin lookup need | **Meets goal**: one renderer; its reveal consumer entered the navigation pilot |

Every row now finishes as **meets goal with evidence** or **owner-approved exclusion**. No required migration remains open. An unaudited row is not an exclusion.

## Work graph

| Task | Outcome | Prerequisites |
| --- | --- | --- |
| TASK-61.1 | Compare navigation module shapes and H1/H2/H3 trade-offs | Done; comparison in doc-2, decision in ADR 0002, behavior in the TASK-61.5 pilot |
| TASK-61.2 | Verify ownership and coverage across all UI flows | Completed functional audit, review corrections accepted |
| TASK-61.3 | Test visual isolation, registry and Storybook hypotheses | Done; registry and Storybook rejected for the current scope |
| TASK-61.4 | Owner-approved separation contract and pilot scope | Superseded by the owner's direct approval of the pilot; archived |
| TASK-61.5 | Done; production navigation pilot with behavioral evidence | TASK-61.2; owner explicitly approved implementation, superseding the earlier prototype gate |
| TASK-61.6 | Done; executable picker experiment, bounded H3/H6 support; production was unchanged by that experiment | TASK-61.5 |
| TASK-61.7 | Done; every coverage row disposed, three migration tasks created, the rest excluded by the owner on 2026-11-14 | TASK-61.6 |
| TASK-61.8 | Done; production picker reducer and owner-confirmed live label/popover checks | TASK-61.7 |
| TASK-61.9 | Done; builder preview decides its shown tab outside render | TASK-61.7 |
| TASK-61.10 | Done; wipe reducer probe supported separate preset-upload and snapshot-import migrations | TASK-61.7 |
| TASK-61.11 | Done; preset-upload confirmation uses its own pure reducer | TASK-61.10 |
| TASK-61.12 | Done; snapshot-import confirmation uses its own pure reducer | TASK-61.10 |

TASK-61.7 identified three migrations. The wipe probe then produced TASK-61.11 and TASK-61.12, each with its own reducer. All five production migrations are now Done. TASK-63 concerns projection, room-copy and catch-up state in a separate epic; it is not unfinished UI-separation scope.

## Evidence and completion

- Declare an independent oracle before changing tests. Use the existing product and architecture contracts, not expected values derived from the new module itself.
- Check flow behavior through the same interface used by its caller. Keep browser checks for actual focus, scrolling, mounting and accessible interaction.
- Check navigation selection, hidden-tab fallback, repeated open requests, create/delete outcomes, role changes, stale asynchronous completions and disposal. Preserve client ordering guarantees.
- Visual examples prove the states and interactions they exercise. They do not replace flow tests or the owner's live Owlbear check.
- Measure caller knowledge, ownership duplication and required test environment before and after. Lines, file counts, function counts and hook counts are observations, not success thresholds.
- At each stage, record whether H1-H6 changed and which coverage rows remain. Retire a test only with its protected contract and replacement named.

Close TASK-61 only when its acceptance criteria are verified: the owner has confirmed the end state; hypotheses have evidence-backed verdicts; navigation and a second flow have supplied evidence; visual isolation has been demonstrated; every coverage row has a final disposition; and all required migration tasks are complete. A navigation demo, architecture diagram or Storybook installation alone cannot close the epic.

## Epic closeout checklist

All closeout items below are verified. This closes the owner-approved scope, including its exclusions, rather than claiming that all React state or all deferred issues have been removed.

- [x] Owner confirmed the end state (2026-11-13) and the shape for every flow (ADR 0002, CLAUDE.md block, 2026-11-14).
- [x] H1-H6 carry evidence-backed verdicts: see *Hypotheses and falsification*.
- [x] Navigation supplied production evidence: TASK-61.5, `src/ui/navigation.ts`, ADR 0002.
- [x] A second flow supplied evidence: TASK-61.6, `prototypes/ui-second-flow/README.md`.
- [x] Visual isolation demonstrated and the Storybook/registry hypotheses closed: TASK-61.3, doc-3.
- [x] Every coverage row has a final disposition: *End-state coverage map*, TASK-61.7.
- [x] TASK-61.8 link picker: Done, with the owner's four live-room checks in its notes (implementation PR #18, closeout PR #20).
- [x] TASK-61.9 builder preview tab: Done.
- [x] TASK-61.10 wipe probe: Done; the shape paid off and led to separate TASK-61.11 and TASK-61.12 migrations.
- [x] TASK-61.11 preset-upload confirmation and TASK-61.12 snapshot-import confirmation: both Done.

## Epic closeout outcome

All 11 current child tasks are Done and have complete acceptance criteria. TASK-61.4 remains archived because direct owner approval superseded that gate.

| Epic criterion | Completion evidence |
| --- | --- |
| 1. Owner-confirmed end state | Owner confirmation and target ownership above; ADR 0002 and the project instructions retain React rendering with flow-specific pure reducers. |
| 2. Hypotheses and consequences | H1-H6 have bounded verdicts above. Registry and Storybook adoption are rejected for the accepted scope; untested publication requirements remain explicit. |
| 3. Navigation production pilot | TASK-61.5, `src/ui/navigation.ts`, unchanged browser contracts and the recorded passing checks in its task notes. |
| 4. Transfer to a second flow | TASK-61.6 experiment, followed by TASK-61.8 production integration and owner-confirmed label/popover behavior. |
| 5. Visual isolation | TASK-61.3 and doc-3: real visual modules exercised without Owlbear or replica; the preview host remains the catalogue. |
| 6. Complete coverage dispositions | The final coverage map above; required migrations TASK-61.8 through TASK-61.12 are Done, and other retained React behavior has explicit owner exclusions or already-separated owners. |
| 7. Consistent architecture and remaining work | ADR 0002, the completed picker spec, direct reducer tests and browser-effect ownership agree. Existing glossary terms remain unchanged; deferred issues stay in `deferred-work.md`. |

Per-child verification results belong to their recorded code states; this documentation closeout claims no new runtime test run. The owner-reported live checks cover the four picker label/popover scenarios, not every SDK behavior or lifecycle interval.

The stable-prop assumption in the picker, the unverified intermediate role-delivery interval, and pre-existing overlapping file-read candidates remain documented limits. Closing this epic neither fixes them nor widens the accepted scope. Owner exclusions for field editing, repeat blocks, tree collapse, rename consequences and small integration cleanups remain in force.

## Durable references

- `GLOSSARY.md` and `docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md`.
- `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md`: AD-4, AD-7, AD-10, AD-18, AD-20 through AD-26.
- `_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md`: navigation, focus and preview contracts.
- `tests/open.e2e.ts`, `tests/sidebar.e2e.ts`, `tests/tabs.e2e.ts`, `tests/hidden-tabs.e2e.ts`, `tests/builder.e2e.ts` and the flow-specific tests discovered during the audit.
- Initial source survey: revision `8c7a204`. Re-read code on pickup; this document is durable intent, not a cache of the current implementation.

## Production pilot authorization

The owner asked for the existing window connected to an independent navigation module, with current behavior preserved and checked for completeness and noncontradiction. This superseded the TASK-61.4 prototype walkthrough gate for this slice; it did not settle Storybook adoption or close the broader research tasks. The first implementation added a coherent projection snapshot, an integration layer, effect objects with ids and sampled browser-focus events. The owner's review found that machinery larger than the rules it carried, and it was removed. ADR 0002 and the TASK-61.5 spec record the implemented shape.

## Navigation pilot outcome

The window runs navigation through one pure reducer, `transition(state, event)` in `src/ui/navigation.ts`. `WindowRoot` in `src/ui/main.tsx` holds it with `useReducer`, sends sheet commands from its handlers, and performs browser effects (sidebar reveal, open acknowledgment, focus after a lost control) in effects keyed on one state field each. The projection store, replica client and `window-view.ts` are unchanged. The contract is `_bmad-output/implementation-artifacts/spec-task-61.5-navigation.md`; the code is pull request #1 on `refactor/navigation-machine`.

Before the pilot, React owned preset-arrival priority, create/delete waits, selection fallback, operation outcomes and focus/reveal ordering during render, with no unit test. Now those rules have 23 reducer tests that run without React or the DOM. Browser tests keep owning mounted behavior, focus and scrolling. Core still owns visibility and tab policy; replica still owns room data.

The pilot rejected its own first answers to the open questions above. A coherent projection snapshot published by the store, an integration layer that ran command effects, effect objects with ids and claim-once delivery, a browser-focus sampling round trip and reveal identity each solved a problem the reducer shape does not have. The reducer receives its facts from a React effect after a committed render, so React's batching is the complete input step. A sheet key identifies an in-flight create or delete, because a sheet id is fresh per creation and one delete per sheet is in flight. A state field read by one effect runs that effect once. An accepted limit: a refused delete followed by a second confirm of the same sheet within the command timeout does not move the focus after the second succeeds.

Validation on the final branch: 2863 unit tests and all 512 Chromium browser tests passed with `tests/` unchanged from `master`; format, lint, typecheck and build passed. A live Owlbear room was not checked; browser tests use the mock platform. No deployment ran.

H1 is supported for navigation. H2 is supported: render-phase state updates are gone and the caller no longer knows transition ordering; line counts were not the measure. At the navigation pilot, H3 remained inconclusive across flows and H6 was untested. H4 is rejected and H5 is closed: capability supported, adoption rejected for the current scope. The second-flow outcome below updates H3/H6 without changing the navigation design. At the navigation pilot's close, TASK-61 remained open for the remaining coverage rows and production migrations. Their subsequent completion is recorded in the closeout outcome above.


## Second-flow outcome: picker experiment (TASK-61.6)

The executable experiment is `prototypes/ui-second-flow/`; its README records the full baseline revision `fd7ed425e88d344e1217bf559c0c9b31888ff568`, reproduction commands, independent oracles, caller knowledge, transfer table and limits. Picker was selected over settings because link arrival, item-label ports, bounded waits and same-target close retry differ from navigation confirmation.

Pure `picker-flow.ts` owns readiness, defaults, matching-replica-arrival priority, role checks, label/notification/close sequence and retry identity. The experimental `picker-caller.ts` executes injected ports and scheduling, then reports outcomes. Core keeps token validation, target comparison and grouping policy; replica/client keeps records and command timeouts. No production interface or renderer changed.

Final isolated verification passed 58 cases: 57 behavioral cases and one absent-DOM environment precondition. Eight deliberate defects produced behavioral assertion failures; exact source restoration returned the caller checks to green. These checks run without React, DOM, Owlbear or replica startup and prove caller decisions, not SDK behavior or production lifecycle equivalence. Review corrected effects continuing after synchronous disposal and added checks for late command failures, deadline timing, timer cleanup and retry combinations.

H3 is supported for inbound scoped event delivery within these two flows. The picker caller has a state getter but no async view publication or render subscription API; outbound delivery requirements remain untested. H6 is supported for executable picker decisions: pure rules, supplied facts and external effects transfer, not renderer publication or production lifecycle. Navigation uses fresh sheet keys and React effects; picker retries need a new local attempt id and sequential platform-port stages. A shared runner, machine helper or library is rejected for now because these two uses do not have matching execution requirements. In production the picker takes navigation's shape, set in ADR 0002: a pure reducer, `useReducer` and effects in `link-picker.tsx`; the prototype's caller is a test harness.

Final project checks passed: format, lint, typecheck, 2920 unit cases (plus one skipped prototype-only environment precondition), all 512 Chromium browser cases and build. Explicit prototype lint/format/typecheck passed. The browser run needed a local Node workaround, recorded in the prototype README; repository settings and tests were unchanged. Application source/tests and dependencies match the baseline, so full checks prove that application, not a migrated picker. No live-room calls or deployment ran.

Facts and returned state are borrowed immutable snapshots, including nested objects; mutations outside events are unsupported. Scheduling/cancellation callbacks must not throw. Answered-without-arrival and unresolved close can wait indefinitely, as in the baseline; only label read/write/notification waits are bounded. No scheduler-exception machinery, second command timer or close timeout was added.

At the end of TASK-61.6, production picker migration remained open and required separate approval and integration evidence. TASK-61.8 subsequently supplied the production integration and owner-confirmed label/popover checks. The experiment alone did not settle the other coverage rows or close TASK-61; completed migrations and owner exclusions are recorded above. Remaining limits stay in `_bmad-output/implementation-artifacts/deferred-work.md`.
