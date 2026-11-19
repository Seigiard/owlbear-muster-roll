---
status: accepted
---

# Command composition lives in core, and the Builder preview shares it

The Builder preview applied window commands with its own code: `repeat-block-add` and `repeat-block-delete` with its own version and lifecycle minting, `field-patch` through core helpers, and `repeat-block-duplicate` answered without effect. The replica composed the same commands in `src/replica/composers.ts`. The semantics of versions, orders, block keys and tombstones therefore existed twice, and each nested-path fix landed in both places (2e468aa touched the preview). The 2026-11-18 architecture review named this as candidate 3. The owner decided the route on 2026-11-19.

## Decision

- Composing a command into records is a core concern. `src/replica/composers.ts` moves to `src/core/compose.ts` with its exports unchanged: `createComposers(connectionId)`, `ComposeContext`, `blockLinkTombstones` and the preset-upload composers. It imports only `src/core`.
- The engine and the Builder preview call that one module. The preview composes `field-patch`, `repeat-block-add`, `repeat-block-delete` and `repeat-block-duplicate` over its snapshot records with the engine's version minter under the author `builder`, mode `persisted`, `isGmPlayer: () => true`, and keeps its own write-policy check, its `setSnapshot` undo step and its `reconcileRecords` on a preset change. Every other command type stays answered without effect in the preview.
- AD-20 stands: `src/builder` imports nothing from `src/replica` or `src/platform` at runtime, and the lint rule keeps saying so. `src/preview/` is deleted.

## Considered options

- **Run the preview on the real engine over the in-memory mock platform** (the review's first proposal). Rejected: it reopens AD-20 and the explicit rejection in `_bmad-output/specs/spec-muster-roll/builder-and-dev.md` ("puts the mock adapter in production"), adds about 30-40 kB gzip to the builder page, makes preview edits asynchronous through the send queue and the projection store, and leaves undo without a history, because the engine has none.
- **Keep two implementations and test them against each other.** Rejected: the test would pin a duplicate instead of removing it; the deletion test says the preview's handler is a pass-through once the composer is reachable.
- **A re-export shim in `src/replica/composers.ts`.** Rejected: a shim is a module with no implementation; the four import lines in the replica change instead.

## Consequences

- `reconcileRecords` (moves blocks by `presetMoves`) and the engine's `presetDiff` (erases) stay different on purpose: a preset author edits structure often and expects sample values to survive a rename; a GM uploading a preset to a room gets the loss count and confirms.
- The preview's duplicate control starts working. The preview still shows no roll result; that gap is recorded in `deferred-work.md`, outside this decision.
- AD-23 in the architecture spine describes the preview as it is: value editing and dice rolls under the role's write policy, records composed by the shared module, no block tools, no pending marks.
- The notes in ADR-0003, `deferred-work.md` and TASK-114.3 that said the preview would run on the engine are corrected to this decision.
