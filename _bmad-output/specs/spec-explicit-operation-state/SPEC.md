---
id: SPEC-explicit-operation-state
companions:
  - state-machines.md
  - brownfield.md
  - ../../../docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
  - ../../../GLOSSARY.md
sources: []
---

# Explicit operation state

## Why

Maintainers must reconstruct valid phases from separate flags and nullable values in projection delivery, room-copy writes and catch-up. The modules already exist. Make their internal state express which data belongs to each phase, so a transition can change in one place without changing room behavior. Deliver small slices in increasing order of protocol complexity under TASK-63.

## Capabilities

- **CAP-1**
  - **intent:** Maintainers can reason about projection delivery from one phase-valid state.
  - **success:** Complete projections publish coherently; sequence gaps recover; buffered command answers survive recovery; phase-specific data has one owner.
- **CAP-2**
  - **intent:** Maintainers can reason about room-copy writes and deferred work from an explicit operation lifecycle.
  - **success:** Ordinary and import writes retain their serialization, triggers during writes remain accounted for, and only verified writes report success.
- **CAP-3**
  - **intent:** Maintainers can distinguish ordinary catch-up from incomplete generation adoption without reconstructing flag combinations.
  - **success:** Ordinary timeout can exit; incomplete adoption retries; failed adoption saves preserve old data; late complete answers retain their meaning.

## Constraints

- Preserve existing public interfaces, room messages, storage and snapshot formats, role rules and timeouts.
- Keep projection delivery, room-copy operations and catch-up decisions in their existing modules. Keep staging, persistence and replica swap in the engine.
- Use local phase-specific state. Keep independent dimensions independent; details and preservation cases are in `state-machines.md`.
- Reuse TASK-61.8 for picker work and TASK-61.10 for settings decisions. Follow the ownership and sequencing rules in `brownfield.md`.
- Keep existing behavioral guarantees, including documented limitations. Route discovered defects separately rather than silently changing behavior during refactoring.
- Judge behavior against independent contracts and existing suites. Record an oracle before editing tests; typecheck alone does not prove protocol behavior.
- Each slice must show production use, phase invariants, before/after caller knowledge and the project full check. Fewer flags or more files alone do not establish improvement.

## Non-goals

- Repeating completed module extraction in TASK-48 or TASK-50.
- New picker, settings, dice, field-editing or repeat-block migrations.
- Expanding this work to the send queue or dice-extension module.
- A shared state-machine library, event bus, runner, protocol redesign, UI redesign or deployment.

## Success signal

TASK-63.1 through TASK-63.3 use phase-owned production state through their existing interfaces. Existing delivery, persistence and catch-up behavior remains verified. A maintainer can locate each phase invariant and transition without reconciling independent writable phase flags.

## Assumptions

- Preserve the accepted dice disposition from TASK-61.7; a cosmetic union alone does not justify reopening it.
- Complete TASK-61.8 before the new slices to reuse its lessons. This is a work-order dependency, not runtime coupling.
