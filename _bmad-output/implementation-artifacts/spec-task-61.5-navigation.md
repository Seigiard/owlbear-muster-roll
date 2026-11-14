# TASK-61.5: window navigation pilot

## Scope

This pilot keeps navigation decisions independent from React rendering while
leaving room data, visibility policy, and the existing renderer in their current
owners. It does not complete the wider UI separation epic.

The earlier projection, lifecycle, and effect-consumption interface design is
superseded by [ADR 0002](../../docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md).
The implemented boundary is one pure reducer in `src/ui/navigation.ts`,
`useReducer` in `src/ui/main.tsx`, and browser effects in that window.

## Boundaries and ownership

| Concern | Owner |
| --- | --- |
| Navigation decisions | `transition(state, event)` in `src/ui/navigation.ts` |
| Room data and policy | Existing projection store, replica client, and core modules |
| Rendering | `WindowRoot` and the existing sheet and shell components |
| Commands | Create/delete handlers in `WindowRoot`, with sheet keys for stale-outcome checks |
| Browser facts and work | Effects in `WindowRoot`; the reducer never reads the DOM |

## Reducer boundary

`NavigationState` contains only selected tabs, per-sheet template-tab choices,
preset arrival state, awaited create/delete sheet keys, delete confirmation,
open-request identity, and focus/reveal intents. `NavigationEvent` carries the
values needed by a rule and has no operation ids, reveal ids, effect objects, or
projection value.

`projection` carries only `isGm`, visible `tabIds`, and `presetState`. It applies
preset arrival, created-sheet arrival, deletion disappearance, role demotion,
selection fallback, and stale confirmation/reveal cleanup. Other events cover
sidebar and template-tab selection, create/delete outcomes, open requests, and
matching focus/reveal completion.

Answered create/delete outcomes leave the awaited sheet key until the matching
record change arrives. Refused and timed-out outcomes clear only the matching
sheet key. This preserves the existing delta-before-answer behavior without
operation counters.

## Window behavior

The window reads notices, sync, room-copy status, pending entries, and open
requests from their existing atoms. It reads role, preset, records, and links
through `useWindowView`. Handlers dispatch navigation events and send sheet
commands themselves. The effects keyed by `tabReveal`, `takenOpen`, and
`focusAfterLoss` perform scrolling, acknowledgement, and DOM focus work. The
`tabReveal` and `focusAfterLoss` effects dispatch completion events; `takenOpen`
stays set as the open-request identity after acknowledgement, so a replay is
ignored.

The selected sidebar entry remains derived during render: a listed selection is
used, the GM Settings entry stays pinned, and another selection falls back to
the first visible sheet or Settings. The browser suite remains the owner of
rendered behavior, DOM focus, and mount-dependent repeat-block reveal behavior.

## Validation

The pure reducer tests cover selection, visible template tabs, create/delete
identity, preset arrival, role demotion, open requests, stale completion, and
matching focus/reveal completion. Existing browser contracts remain unchanged.

The pilot is one implemented flow. No shared runner, event bus, registry, or
second-flow abstraction is justified by this slice. Live Owlbear validation and
the wider UI-separation work remain outside its scope.
