---
id: doc-1
title: 'Epic: framework-independent UI behavior and simple rendering'
type: specification
created_date: '2026-11-13T09:43:00Z'
updated_date: '2026-11-13T14:39:00Z'
tags:
  - epic
  - architecture
  - ui-decoupling
  - research
---
# Framework-independent UI behavior and simple rendering

## North star

Muster Roll separates UI behavior from rendering across the room window, builder, picker and shared previews. A visual module receives explicit display data and reports user events. Workflow state, transitions and asynchronous outcome rules can run without React, DOM, Owlbear or replica startup.

React remains the rendering technology. Navigation is the first validation slice, not the scope of the final goal. The epic stays open after that slice.

The intended benefit is less caller knowledge: a change to one interaction should not require reconstructing rules scattered through render, effects and command callbacks. A smaller useState count or more files does not prove that benefit.

## Authority and current state

- Parent: **TASK-61**. This document holds the overall goal, hypotheses, decisions and coverage map. Child tasks hold their own acceptance criteria and researched plans.
- Owner-confirmed on 2026-11-13: make behavior framework-independent; retain React for rendering; validate navigation first; preserve the overall goal in a Backlog epic with tasks and hypotheses.
- Accepted direction on 2026-11-13: pure transitions inside a separate navigation module; React remains rendering. See `docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md`.
- Current stage: the owner approved the real navigation state-machine pilot after the audit and rejected further toy-simulator UX reapproval. TASK-61.5 is Done on `refactor/navigation-machine`; the wider epic remains open. Preserve current behavior and verify transition completeness/noncontradiction. Storybook adoption and comparative catalogue maintenance fit remain separate and unresolved. The earlier Fable ACCEPT covers corrected research claims, not production code.
- Existing domain names come from `GLOSSARY.md`. Existing architecture decisions remain authoritative until explicitly revised.
- Before starting or resuming a child task, read this document. After its evidence changes a hypothesis or coverage row, update this document through the Backlog CLI.

## Target ownership

| Concern | Intended owner | What rendering knows |
| --- | --- | --- |
| Room records, replication and command answers | Existing replica and client modules | Display data and outcomes through the established interface |
| Visibility, sheet policy, formulas and preset rules | Existing `src/core` modules | Their resolved results; no copied policy |
| UI workflow state and transitions | Flow-specific framework-independent module | Current view and user events, not transition ordering |
| Commands, subscriptions and lifecycle | Explicit integration code around the flow | Its own lifetime; no startup hidden in visual imports |
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
- Choose module shapes per flow. A successful navigation state machine does not require every widget to become a machine.
- A registry, emitter, machine library or Storybook is a candidate mechanism, not an end-state acceptance criterion by itself.
- Follow the project's required task-spec and implementation workflow before any production-code task starts. This epic does not replace those specs.

## Hypotheses and falsification

Statuses are **untested**, **supported**, **rejected** or **inconclusive**. Record the artifact and its limits with each verdict. A design sketch supports feasibility, not working behavior.

| ID | Hypothesis | Check and rejection signal | Owner / current verdict |
| --- | --- | --- | --- |
| H1 | A framework-independent module can own a UI flow while rendering only consumes a coherent view and forwards events. | Exercise the navigation flow without React or DOM. Reject the proposed seam if transition ordering or workflow state remains in rendering, or tests still require mounting the window. | TASK-61.1, TASK-61.5 / supported for navigation; see the pilot outcome and its bounds below |
| H2 | Explicit state transitions simplify navigation more than the current render/effect chain. | Compare pure transitions, an active module and an existing-store-centered presenter. Pilot the approved choice. Reject any choice that merely moves the old chain, exposes many setters, or introduces more caller knowledge. A machine library must justify its own cost. | TASK-61.1, TASK-61.5 / supported for navigation; see the pilot outcome and its bounds below |
| H3 | A small, scoped event interface is enough; a general emitter may be unnecessary. | Trace projection updates, user events, command outcomes, open acknowledgments and DOM intents. Check stale completions and disposal. Add a general emitter only if actual delivery needs remain unmet; reject it if direct events and the existing subscription mechanism suffice. | TASK-61.1, TASK-61.6 / inconclusive; no general bus need found; test the shared command-settlement pattern on the second flow |
| H4 | A registry makes isolated visual modules easier to select, compose or discover than plain imports. | Compare both against a representative frame and sheet view. Require a concrete lookup or composition need. Reject the registry if it only renames imports or requires broad shared context. | TASK-61.3 / rejected for current scope by the source audit of closed-union dispatch/no discovery need; equal-by-construction stories are not evidence |
| H5 | Storybook gives useful isolated state and interaction checks without Owlbear or replica startup. | Exercise real visual modules with explicit fixtures and events. Compare the dependency/configuration cost with the existing preview host. Reject tool-only setup as evidence; static stories alone do not prove asynchronous behavior. | TASK-61.3 / sampled capability supported; comparative fit inconclusive. Static-record/artificial-GM fixture cannot express success; 180 added lock entries. See doc-3 |
| H6 | The separation learned from navigation transfers to a materially different UI flow. | Choose a second flow after the pilot. Record what transfers and what stays specific. Reject a shared mechanism if the second use needs flags, duplicated state or a larger interface than separate modules. | TASK-61.6 / untested |

## Navigation alternatives and accepted direction

Three fresh-context explorations produced these candidate shapes. They did not run tests or implement a pilot.

Detailed findings, the reconciled recommendation and a reproducible projection-store observation are in [doc-2: navigation and visual isolation research](<doc-2 - Research-framework-independent-navigation-and-visual-isolation.md>). Read it before continuing TASK-61.1 or preparing the approval gate. The observation shows intermediate raw atom notifications, not a broken React window or a validated architecture.

| Shape | What sits behind the seam | Expected leverage | Cost or unresolved issue |
| --- | --- | --- | --- |
| Pure transitions plus an external runner | State, transition priorities and effects represented as data | Direct, DOM-free scenario checks; no React or store dependency in the transition module | The runner still needs ordering, effect identity and lifecycle rules. It must not become a second owner of navigation decisions. |
| Active event-driven module | State, subscriptions, serialized events, asynchronous command outcomes and disposal | One caller interface covers a full flow outside React | Queue and effect-consumption machinery may be more infrastructure than this flow needs. Coherent view publication must be demonstrated. |
| Existing-store-centered presenter | State and flow rules in the current nanostores idiom, with commands and outcomes handled there | Small migration for the current caller; no new subscription library | Can remain coupled to projection-store shape. Whole-queue draining may lose mount-dependent focus intents. |

The owner selected pure transitions inside a separate navigation module, retaining React rendering, after this comparison. The accepted shape combines pure rules with flow-specific integration; exact interfaces remain open. None of the alternatives established a need for a global bus, dynamic registry or new machine library.

Resolve before approval: who builds the coherent display snapshot; how browser focus facts enter pure transitions without DOM reads inside them; how command completion relates to record appearance; how stale results become inert; when acknowledgments execute; and how focus/reveal intents survive until mount. Preserve existing client ordering guarantees.

## End-state coverage map

The functional audit is recorded in [doc-3](<doc-3 - Audit-and-experiment-UI-ownership-Storybook-and-registry.md>), including detailed inputs, state, effects, test surfaces, file-group mapping and explicit unresolved questions. The summary below records its current dispositions, not completed migrations. Fable's initial REVISE and corrections are preserved there.

| UI flow | Starting evidence | Next disposition |
| --- | --- | --- |
| Window navigation | `src/ui/main.tsx` owns workflow and reads DOM focus; `sheet-body.tsx:72-101` consumes reveal after mount | Implemented pilot TASK-61.5; coherent input, browser facts and identified mount completion are explicit |
| Window frame and sidebar/tab drawing | WindowFrame has a data/callback model; direct imports work in the isolated host | Existing seam retained; Storybook capability sampled, adoption fit open |
| Field editing and repeat-block actions | Draft/save/outcome rules span hooks and local values; repeat focus shares mount-dependent intents | Field ownership open after H6; repeat intent is a later candidate, TASK-61.7 |
| Dice interaction in the window | Evaluation/policy already outside React; button owns its visual request state | Separated enough for current scope; retain |
| Settings upload, import and wipe confirmations | `src/ui/settings/`, `src/ui/preset-actions.tsx` own file/check/confirm/outcome workflows | Candidates; settings is a preliminary second-flow alternative, selection after pilot |
| Token picker | React effects own link-arrival, label ports, timeout and close/retry | Preferred preliminary H6 candidate, not yet selected; owner live-room check needed for ports |
| Map-selection interaction in the window | Headless observation exists; main still supplies platform selection effects | Retain existing seam; small later integration cleanup candidate |
| Builder document, draft and undo | Document/store already separate edits/history/draft from React | Meets separation goal at this seam; reuse |
| Builder tree, forms and preview selection | Rename consequences and shown-tab rule remain candidates; tree-collapse oracle not located | Mixed candidate/open; retain local widget and DOM adapters, TASK-61.7 |
| Standalone preview and shared sheet rendering | One renderer retained; four contexts carry implicit cell inputs; pure cell-kind dispatch has no plugin lookup need | Shared renderer retained, not data/events-only; include reveal consumer in navigation pilot |

Each row must finish as **meets goal with evidence**, **requires linked migration**, or **owner-approved exclusion**. An unaudited row is not an exclusion.

## Work graph

| Task | Outcome | Prerequisites |
| --- | --- | --- |
| TASK-61.1 | Compare navigation module shapes and H1/H2/H3 trade-offs | Current research; In Progress |
| TASK-61.2 | Verify ownership and coverage across all UI flows | Completed functional audit, Fable corrections accepted |
| TASK-61.3 | Test visual isolation, registry and Storybook hypotheses | In Progress |
| TASK-61.4 | Owner-approved separation contract and pilot scope | TASK-61.1, TASK-61.2, TASK-61.3 |
| TASK-61.5 | Production navigation pilot with behavioral evidence | TASK-61.2; owner explicitly approved implementation, superseding the earlier prototype gate |
| TASK-61.6 | Second-flow experiment; validate transfer before sharing mechanisms | TASK-61.5 |
| TASK-61.7 | Bounded migration tasks for every remaining coverage gap | TASK-61.6 |

TASK-61.7 produces the later migration tasks; it does not finish those migrations. Those tasks remain children of TASK-61. Create their plans only after researching the actual current code. A failed hypothesis can change or remove proposed work without changing the overall goal.

## Evidence and completion

- Declare an independent oracle before changing tests. Use the existing product and architecture contracts, not expected values derived from the new module itself.
- Check flow behavior through the same interface used by its caller. Keep browser checks for actual focus, scrolling, mounting and accessible interaction.
- Check navigation selection, hidden-tab fallback, repeated open requests, create/delete outcomes, role changes, stale asynchronous completions and disposal. Preserve client ordering guarantees.
- Visual examples prove the states and interactions they exercise. They do not replace flow tests or the owner's live Owlbear check.
- Measure caller knowledge, ownership duplication and required test environment before and after. Lines, file counts, function counts and hook counts are observations, not success thresholds.
- At each stage, record whether H1-H6 changed and which coverage rows remain. Retire a test only with its protected contract and replacement named.

Close TASK-61 only when its acceptance criteria are verified: the owner has confirmed the end state; hypotheses have evidence-backed verdicts; navigation and a second flow have supplied evidence; visual isolation has been demonstrated; every coverage row has a final disposition; and all required migration tasks are complete. A navigation demo, architecture diagram or Storybook installation alone cannot close the epic.

## Durable references

- `GLOSSARY.md` and `docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md`.
- `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md`: AD-4, AD-7, AD-10, AD-18, AD-20 through AD-26.
- `_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md`: navigation, focus and preview contracts.
- `tests/open.e2e.ts`, `tests/sidebar.e2e.ts`, `tests/tabs.e2e.ts`, `tests/hidden-tabs.e2e.ts`, `tests/builder.e2e.ts` and the flow-specific tests discovered during the audit.
- Initial source survey: revision `8c7a204`. Re-read code on pickup; this document is durable intent, not a cache of the current implementation.

## Production pilot authorization

The owner requested the existing window connected to an independent state machine, with current behavior preserved and checked. The owner also explicitly requested completeness and noncontradiction checks. This supersedes the earlier TASK-61.4 prototype walkthrough gate for this slice; it does not settle Storybook adoption or close the broader research tasks. TASK-61.5 records the implementation plan. The implementation must provide a coherent projection input, identity-safe command outcomes, sampled browser-focus facts, and mount-aware intent consumption. The original research remains intact in the main checkout.

## Navigation pilot outcome

The real window now uses pure transitions in `src/ui/navigation-machine.ts`, an observable flow in `src/ui/navigation.ts`, and projection/command integration in `src/ui/navigation-integration.ts`. Implementation commit: `a0968d8c690f0b153f1c02be9e0789d3a2afd637` on `refactor/navigation-machine`. The existing renderer remains in use. The contract and transition table are `_bmad-output/implementation-artifacts/spec-task-61.5-navigation.md`.

Before the pilot, React owned preset-arrival priority, create/delete waits, selection fallback, operation outcomes and focus/reveal ordering. Now those workflow rules sit behind the navigation interface. The caller renders one coherent snapshot, forwards events and sampled browser focus, and applies claimed browser effects. Core still owns visibility and tab policy; replica still owns room data.

The pilot rejected three assumptions. Separate raw atom notifications were not a complete projection, so the store now publishes one completed snapshot. Sheet/block matching did not identify a particular mount request, so a reproduced same-target reopen led to reveal identity in the browser handshake. Re-deriving every view on each event repeatedly decoded the same preset, so the flow now keeps one bounded projection/preset cache.

Validation on clean candidate `18a2cf47de61b31438f25a7a059ee0ae072880a2`: 2869 unit tests and all 512 Chromium browser tests passed; format, lint, typecheck and build passed. The navigation/projection/integration group contains 45 tests. The earlier independent baseline passed 74 existing navigation browser contracts. Local commit packaging at `3e1808a4d74447c1b3c989bbee718bfba0da6d4e` has an identical tree to the validated candidate.

The initial code review used six sources and found confirmation lifetime, preset derivation and several guard-check gaps. The routed fixes added observed-red regressions and corrected the false-green assertions. Confirming review used two sources with the final profile and reported no critical or major defect. This confirming profile does not claim to search for new minor issues. The owner-requested cleanup is complete in `930bb90ade3f82be8d8d582137961ef407d038af`: unused setters/re-exports and both unused state fields were removed. The remaining interfaces passed format, lint, typecheck, 2869 unit tests, 512 browser tests and build; no UX behavior was added. Final negative-control calibration made all six named guard/publication assertions fail under faithful temporary regressions, then restored the isolated checkout clean. Earlier controls also covered fallback, operation identity, last-id handling, effect claiming and stopped completions.

Completeness has a stated bound: exhaustive handling of the closed event union, an explicit guard/transition/effect table, 8 length-three traces over two open ids, 4 mixed lifecycle traces, and focused guard/race regressions. These checks are not a mathematical proof over arbitrary ids, presets or record maps. A live Owlbear room was not checked; browser tests use the mock platform. No deployment ran.

H1 is supported for the navigation interface. H2 has an executed caller comparison and source review, not a line-count or hook-count success claim. H3 needs no general bus for this flow but remains inconclusive across flows. H4/H5 are unchanged; Storybook adoption remains unresolved. H6 is untested. TASK-61 stays open; TASK-61.6 must select and validate a second flow before shared mechanisms or broader migrations are proposed.
