---
title: 'TASK-64: Extract the remaining engine machines'
type: 'refactor'
created: '2026-11-15'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'f354412658a2d37ee2fe91909ec03f160a7c2826'
review_loop_iteration: 0
context:
  - '{project-root}/backlog/docs/doc-4 - TASK-64.4-Engine-state-machine-map-and-extraction-order.md'
---

<frozen-after-approval reason="owner-confirmed map and explicit implement-spec request">

## Intent

**Problem:** `startReplicaEngine` still nests the roll, generation, command and protocol machines, preventing independent unit tests.

**Approach:** Complete TASK-64.5 → TASK-64.6 → TASK-64.7 → TASK-64.9 in the confirmed map's order. Use injected-port modules for rolls, generation and protocol. Keep command routing pure, with effectful preset and replay loops.

## Boundaries & Constraints

**Always:** Preserve behavior and existing engine tests unchanged. Keep CatchUp, RoomCopy, party-roster and pending-edits interfaces. Keep the preset cache and GM-presence helper in engine wiring. Extract the map's functions and qualified callbacks. Reuse core rules; extracted modules import no platform adapter.

**Never:** Introduce a shared machine runtime, a second CatchUp interpreter, new guards or a new protocol. Move neither scene ownership nor retained lifecycle wiring. Deploying is not part of this work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Roll | Request with current pending view | Prepare once; keep hidden fixed; evaluate and send through existing dice and broadcast seams | Preserve refused, waiting-access, local fallback and failure outcomes |
| Async roll | Role, generation or stopped changes across waits | Read live getters at the existing source points | Preserve current stop and refusal behavior |
| Local generation change | Live GM imports or wipes | Flush old commits → complete save → replace → writeImport → reset | Failed save removes partial data; supersession refuses with data-replaced |
| Remote adoption | Higher generation is staged | Save → replace → roomCopy.replaced | Synchronous saveAdoption false keeps adoption open |
| Commands | Role, importing and catch-up context | Pure decision chooses apply, queue, propose or reject | Preset and replay loops stop the correct batch on a failed write |
| Room ingress | Concurrent arrivals and sender lookup | One serialized ingress; one AD-5 gate; original dispatch and sender order | Rejected admission has no handler effects; handler error permits later arrivals |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts`: machine bodies and retained wiring; doc-4 supplies the complete inventory.
- `src/replica/{dice-extension,room-copy,pending-edits}.ts`: injected-port patterns.
- `src/replica/{catch-up,party-roster,record-store,composers,pending-queue}.ts`: preserve public seams.
- `src/core/room-messages.ts`: reuse AD-5 admission and schemas.
- `src/replica/engine-{roll,dice-extension,import,wipe,catch-up,preset,propose,sync,liveness}.test.ts`: existing contracts; reuse TASK-63.3 adoption races.
- `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md`: layer table, diagram and AD-4/5/7/9/13/14.

## Tasks & Acceptance

**Execution:**

- [ ] `src/replica/engine.ts` and roll module — TASK-64.5: preserve live getter points; add independent tests.
- [ ] `src/replica/engine.ts` and generation module — TASK-64.6: move owned state; expose approved getters and operations.
- [ ] `src/replica/engine.ts` and command module — TASK-64.7: preserve actual-apply feedback in batch and replay loops.
- [ ] `src/replica/engine.ts` and protocol module — TASK-64.9: move serialized ingress and all mapped dispatch.
- [ ] `ARCHITECTURE-SPINE.md` — name all extracted replica modules and reconcile layer table and diagram with code.
- [ ] `backlog/` — record objective completion evidence for the four tickets and the epic through the CLI.

**Acceptance Criteria:**

- Given an extracted machine, when tested independently, then every ticket scenario passes without room-rig.
- Given unchanged engine tests, when run after extraction, then all pass.
- Given generation replacement, when save or writeImport is pending, then reset cannot precede completion.
- Given a failed batch write, when commands continue, then the correct batch stops.
- Given delayed lookup or handler failure, when later messages arrive, then order and continuation remain intact.
- Given the integration, when checked and reviewed, then required checks pass and blocking findings are resolved.

## Implementation Notes

- The user requested all four tickets and a PR with auto-merge. The confirmed map settles the architecture; no new product decision is required.
- `implement-spec` owns scheduling and integration. Each ticket uses `tdd`; one closing `code-review` covers the integration branch.
- Setup: runner exits 0 with no configuration; install the frozen Bun lockfile.
- Mock/browser evidence excludes live Owlbear host behavior.

## Spec Change Log

## Review Triage Log

## Design Notes

Keep generation's two linear sequences distinct and CatchUp's interpreter unique. Command loops observe actual write results. `clearDeletedLinks` eligibility stays scene wiring; its `link-clear` enters the command module.

## Verification

**Commands:**

- `bunx oxfmt --ignore-path .gitignore --check .` — executable files are formatted; excluded Markdown is skipped.
- `bun run lint` — existing layer restrictions and source rules pass.
- `bun run typecheck` — extracted APIs and callers agree.
- `bun test` — unit, engine and integration contracts pass.
- `bun run test:browser` — Chromium app flows pass.
- `bun run build` — shipped entries compile.
- `backlog task view <touched-id> --plain`, `backlog doctor`, touched-path format check and `git diff --cached --check` — task metadata and patch integrity pass.
