---
id: doc-2
title: 'Research: framework-independent navigation and visual isolation'
type: guide
created_date: '2026-11-13T09:51:00Z'
updated_date: '2026-11-13T10:03:00Z'
tags:
  - epic
  - architecture
  - ui-decoupling
  - research
---
# Navigation core and visual isolation: research

## Status and scope

Research for TASK-61.1 under TASK-61. Read `doc-1` for the overall goal and work graph. On 2026-11-13 the owner accepted its direction: pure transitions inside a separate navigation module; React remains rendering. ADR-0002 records that decision. This research still does not approve an exact interface or production implementation.

The owner chose framework-independent behavior, retained React rendering, and selected navigation as the first validation slice. The larger goal covers the rest of the UI. The Storybook/registry experiment and full ownership audit remain TASK-61.3 and TASK-61.2.

Source revision: `8c7a204`, inspected on 2026-11-13. Three fresh-context, read-only explorations informed the comparison. The coordinator checked their claims against source and ran one projection-store observation. No navigation prototype, Storybook setup, full test suite or live Owlbear check ran.

## Source-grounded findings

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Navigation decisions live inside rendering | `src/ui/main.tsx:329-522`: preset arrival, created/deleted sheet handling, open requests, fallback, acknowledgment and focus effects | Moving JSX alone will not produce depth. The new module must own transition ordering. |
| A pure visible-view function already exists | `src/ui/window-view.ts:32-40`: `windowViewOf`; preset decoding and initial-role fallback currently live alongside the React hook at lines 21-29, 42-57 | Reuse the existing visibility owner. A headless caller still needs a deliberate projection-to-view step. |
| WindowFrame already accepts data and callbacks | `src/ui/shell/window-frame.tsx:47-62`; current room and preview callers | A frame story need not start replica. Actual Storybook integration is untested. |
| A read-only sheet can already render outside a room | `src/builder/preview-pane.tsx:207-251`, `src/preview/stub-rolling.ts` | Reuse the existing shared renderer and stub rolling rather than introducing a registry to achieve basic isolation. |
| The editable GM header is not only display data | `src/ui/sheet/sheet-header.tsx:30-40, 143-150`: a projection-store slice and sendCommand reach AccessPanel | Isolating WindowFrame does not isolate the whole window. Separate later work must cover embedded workflow ownership. |
| Focus/reveal depends on mounting | `src/ui/sheet/sheet-body.tsx:72-101`: requestAnimationFrame, target lookup, completion callback and later focus | A headless core should retain semantic intent until the browser-side implementation can apply or invalidate it. Draining every effect before a target mounts is unsafe as a design rule. |
| Successful command answers have an ordering contract | Architecture AD-10; `src/replica/engine.ts:635-644`; `src/ui/replica-client.ts:226-255` | Keep effect delta before command-done. Do not justify a new queue by incorrectly claiming that production messages have arbitrary order. |
| Raw projection subscriptions observe intermediate state | Executed observation below; `src/ui/projection-store.ts:100-112, 124-148` | A headless subscriber cannot assume that each individual atom notification is a complete input snapshot. |

These are structural observations, not proven user-visible defects. Existing React behavior was not shown broken.

## Executed observation: projection updates are not one atom notification

The experiment used the real `createProjectionStore`, not a mock of its notifications. It subscribed to `$records`, `$sync` and `$loaded`, then called `replaceAll` and a role-changing `applyDelta`.

Observed sequence:

| Callback / return | loaded | role | record keys |
| --- | --- | --- | --- |
| replaceAll: records listener | false | PLAYER | sheet:demo |
| replaceAll: sync listener | false | GM | sheet:demo |
| replaceAll: loaded listener | true | GM | sheet:demo |
| replaceAll returned | true | GM | sheet:demo |
| applyDelta: records listener | true | GM | empty |
| applyDelta: sync listener | true | PLAYER | empty |
| applyDelta returned | true | PLAYER | empty |

This proves what a raw subscriber can observe. It does not prove a torn React frame or an incorrect navigation decision. Before the pilot, define one complete projection-input step for navigation. Candidates include a completed-update signal or a coherent snapshot at the existing client/store integration. Choose by locality; do not introduce a generic bus to mask incomplete updates.

Reproduce from the repository root with Bun:

```sh
bun -e '
import { createProjectionStore } from "./src/ui/projection-store.ts";
const p = createProjectionStore();
const sample = event => console.log(JSON.stringify({ event, loaded: p.$loaded.get(), role: p.$sync.get().role, keys: [...p.$records.get().keys()] }));
p.$records.listen(() => sample("records"));
p.$sync.listen(() => sample("sync"));
p.$loaded.listen(() => sample("loaded"));
p.replaceAll([{ k: "sheet:demo", d: { set: "pc", order: 0 }, c: 1, a: "gm" }], [], [], { state: "live", firstCatchUpDone: true, gmAnswered: true, gmLink: "online", role: "GM" });
sample("replaceAll returned");
p.applyDelta([], [], ["sheet:demo"], [], { state: "catching-up", firstCatchUpDone: true, gmAnswered: true, gmLink: "online", role: "PLAYER" });
sample("applyDelta returned");
'
```

## Alternative A: pure transition module

The interface takes state plus an event and returns new state plus effect descriptions. A separate flow-specific runner receives complete projection inputs, invokes commands, feeds their outcomes back and publishes the display view.

- **Depth:** transition priorities, stale-operation identity and fallback rules sit behind the seam.
- **Locality:** behavior can be checked with literal event scenarios and without stores or DOM.
- **Leverage:** the same transitions can serve a headless test and the live window.
- **Cost:** the runner still has real responsibilities. If both runner and transition module decide navigation, complexity is duplicated rather than hidden.
- **Constraint:** focus and reveal are durable intents with identity and completion, not disposable callback lists.

This is the strongest form of framework independence, but a reducer alone does not make the whole window independent of React.

## Alternative B: active event-driven module

The interface exposes the current view, user-event dispatch, subscriptions and disposal. The module also owns incoming observations, command outcomes and their lifetime. An internal pure transition may still implement the rules.

- **Depth:** the caller does not coordinate asynchronous outcomes or projection observations.
- **Locality:** lifecycle and workflow decisions belong to one module.
- **Leverage:** a non-React host can drive the whole flow through the same interface.
- **Cost:** a mailbox, effect-claim protocol and subscription graph can become a new framework. Neither source evidence nor the single pilot proves they are all needed.
- **Constraint:** subscribing to several raw projection atoms is not sufficient; the executed observation shows intermediate inputs.

This shape is useful if coordination remains substantial after a pure transition is extracted. A general emitter is not an automatic requirement.

## Alternative C: existing-store-centered presenter

The interface uses the existing nanostores style: a readable view, semantic actions and disposal. The module owns the navigation state and translates command outcomes. Rendering reads the view and forwards actions.

- **Depth:** callers stop knowing the ordered render-time state updates.
- **Locality:** fits existing projection and pending-mark conventions without another subscription library.
- **Leverage:** lower integration cost for the current React caller and possible catalogue host.
- **Cost:** direct projection-shape knowledge can spread into the presenter. Store update timing and effect consumption still need explicit rules.
- **Constraint:** nanostores is not React, so using it does not violate framework independence. Store-shaped setters exposed to rendering would still be shallow.

This is the smallest migration hypothesis, not evidence that a store alone simplifies the behavior.

## Recommendation: pure rules in a flow-specific headless module

Combine A's pure transition rules with C's existing host infrastructure where it helps. Give the window one flow-level interface for a coherent view and semantic events. Keep command/subscription coordination in that module's implementation, not in React render. Keep the transition computation independent of both React and nanostores.

The owner accepted this architectural shape in ADR-0002. Exact external types, paths, snapshot publication and intent consumption remain to be settled through TASK-61.4. Four meaningful operations can be simpler than three operations that require callers to know hidden ordering rules; method count is not a depth metric.

Use existing ReplicaClient command/outcome behavior. Keep visibility in core, replica mutations in the background, and UI navigation local to the window. Browser-side code applies semantic focus/scroll intents after the correct target mounts. A second flow must justify any shared runtime, registry or emitter.

The deletion test: deleting this flow module would force the window to reconstruct transition priorities, pending-operation identity and intent lifetime. Deleting a generic registry or emitter should not force duplicated business knowledge; if it only restores direct calls, that mechanism has not earned its seam.

## Catalogue and registry: separate questions

1. **Basic isolation is already feasible in part.** Existing previews draw WindowFrame, SheetHeader and SheetBody without Owlbear. This is executable product code, not a new catalogue experiment.
2. **Full interactive isolation is not established.** GM access controls and editing interfaces still take flow-related dependencies. TASK-61.3 must distinguish a static read-only story from an editable GM interaction.
3. **Storybook is untested here.** It is absent from current package scripts/dependencies and no setup ran. Compare its actual value with the current preview host before adopting it.
4. **A registry solves lookup, not separation.** Story files can import visual modules directly. A registry needs a real discovery/composition requirement; one shared frame does not demonstrate that requirement.

Storybook may host static display states and interaction checks. Headless flow tests protect transition rules and outcomes. Browser tests protect mounted behavior, focus, scrolling and accessibility. None substitutes for the other merely because it has a visual interface.

## Pilot evidence and stop conditions

The pilot should preserve independently specified outcomes for preset arrival, missing selection fallback, hidden tabs, token open requests, create/delete results, demotion, stale completions and disposal. Use AD-7, AD-10, AD-18, AD-26 and the existing UX rules as oracles.

Checks must distinguish semantic correctness from self-consistency. A round-trip through the same encoder/decoder, a reducer-derived expected value, or a mock returning the asserted answer is insufficient. Existing browser checks remain evidence only when actually run against the pilot.

Revisit the design if transitions still require DOM tests, React effects still decide workflow, focus intents vanish before mounting, or multiple owners must reconstruct one display view. Do not solve these failures by weakening the user behavior or hiding ordering assumptions in a generic queue.

## Remaining research and task state

- TASK-61.1 has preliminary alternatives, a recommendation and one integration observation. It remains In Progress until the precise lifecycle and effect rules are reconciled and the recommendation is ready for owner review.
- TASK-61.2 still owns the complete UI ownership audit; this navigation study is not that audit.
- TASK-61.3 still owns the actual registry/Storybook experiment; neither hypothesis has a positive or negative verdict from this study alone.
- TASK-61.4 is the owner-approval gate. TASK-61.5 is the production pilot. TASK-61.6 checks transfer to a second flow; TASK-61.7 creates the remaining migrations.
- H1-H6 remain untested as end-to-end architecture claims. The projection notification behavior above is demonstrated independently; it is a design constraint, not validation of a proposed architecture.
