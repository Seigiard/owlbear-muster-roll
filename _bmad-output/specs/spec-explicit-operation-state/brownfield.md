# Scope and delivery order

## Existing ownership

The task views and doc-1 coverage map were checked on 2026-11-14. Task status can change; read the current task when picking up work.

| Existing task | Evidence and consequence |
| --- | --- |
| TASK-61.7, Done | Disposed the UI coverage map. Dice already meets the UI goal. Field editing and repeat blocks have owner exclusions. This spec preserves those dispositions. |
| TASK-61.8, To Do | Fully owns production picker migration: read gating, offer default, replica-arrival priority, GM check, notification/close order, same-target attempt identity and stale completion handling. It also owns the live Owlbear check. Reuse it without duplication or reparenting. |
| TASK-61.10, In Progress | Owns the wipe reducer probe and the decision on preset upload and snapshot import. This epic adds no settings work or dependency on that decision. |
| TASK-48, Done | Already extracted catch-up, GM link, drift and adoption decisions. CAP-3 strengthens state inside that owner. |
| TASK-50, Done | Already extracted room-copy operations and supplied deterministic coverage. CAP-2 strengthens its internal lifecycle. |

TASK-61.10 had an existing working-tree edit when this spec was prepared. This work leaves it intact.

The prior survey identified dice as a small candidate based on `rolling`, `waitingForGm` and `message`. That observation remains true, but does not override the accepted UI disposition. The earlier recommendation to begin a new picker task is superseded by reuse of TASK-61.8.

## Backlog sequence

| Order | Task | Contract | Complexity added |
| --- | --- | --- | --- |
| 1 | TASK-61.8, existing child of TASK-61 | Existing picker criteria | Established UI reducer model and attempt identity |
| 2 | TASK-63.1, child of TASK-63 | CAP-1 | Local projection phases, assembly and ordered delivery |
| 3 | TASK-63.2, child of TASK-63 | CAP-2 | Serialized async writes, verification and import interaction |
| 4 | TASK-63.3, child of TASK-63 | CAP-3 | Adoption, late answers, liveness and drift interactions |

Backlog dependencies enforce this sequence. TASK-63 owns only the three new slices. The dependencies limit concurrent work and carry lessons forward; they introduce no runtime dependency between the modules. TASK-61.8 retains all its existing acceptance criteria, including the owner live-room check.

Each task starts with current-code research under the project implementation workflow. Its task-specific spec belongs in `_bmad-output/implementation-artifacts/`. This epic contract does not replace that research or prescribe an implementation plan.

## Evidence to reuse

Paths below are relative to the repository root.

- Projection: `src/ui/replica-client.ts`, `src/ui/replica-client.test.ts`, `src/replica/engine-client.test.ts`.
- Room copy: `src/replica/room-copy.ts`, `src/replica/room-copy.test.ts`, engine room-copy/import/wipe suites. Read `_bmad-output/implementation-artifacts/spec-task-50-room-copy-module.md` for the prior rule and mutation matrix.
- Catch-up: `src/replica/catch-up.ts`, its deterministic tests and engine catch-up/liveness/no-GM suites. Read `_bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md` for the adoption seam and mutation matrix.
- Independent protocol rules: AD-6 through AD-9 in `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md`.

Existing task completion proves earlier work, not this refactor. Use the current suites and relevant prior mutation cases to check preserved behavior. New tests require an independent oracle; source-shape assertions are not behavioral evidence.
