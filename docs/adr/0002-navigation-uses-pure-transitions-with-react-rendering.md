---
status: accepted
---

# Navigation uses pure transitions; React renders the result

At acceptance, the window mixed navigation rules with React rendering and effects. Navigation now uses pure transitions inside a separate module and keeps React for rendering and browser interaction. The owner accepted this direction on 2026-11-13 so behavior can be exercised without mounting React, while the existing renderer and React Aria interaction remain usable.

## Consequences

- The reducer in `src/ui/navigation.ts` owns selected sheets and tabs, transition priorities, awaited create/delete sheet keys and semantic focus/reveal intents. `useReducer` in the window runs it; pure transitions depend on neither React nor the DOM.
- The window reads room data from the existing atoms and `useWindowView`, sends commands in its handlers, and performs browser effects in the window. There is no pending-operation identity, effect-consumption interface or flow-specific integration layer.
- Browser code applies focus and scrolling when their targets mount. Core remains the owner of visibility and sheet policy; replica remains the owner of room data.
- This chooses an architectural shape, not an implementation library, registry, generic emitter or shared machine runtime. TASK-61.5 records the reducer boundary and supersedes the earlier projection, lifecycle and effect-consumption interface design.
- Navigation is the first implemented validation slice of the wider UI-separation epic, not its completion. The existing window now uses this design; the remaining UI flows have not migrated.

## Considered options

- **Keep workflow transitions in React hooks.** This would retain the mounting dependency for behavior tests and leave rendering responsible for transition ordering.
- **Introduce a generic actor or event-bus framework first.** The first flow does not yet demonstrate the repeated needs that would justify that shared seam. A second flow must provide that evidence.

The goal, hypotheses and rollout coverage live in `backlog/docs/doc-1 - Epic-framework-independent-UI-behavior-and-simple-rendering.md`; the initial comparison lives in doc-2 beside it.
