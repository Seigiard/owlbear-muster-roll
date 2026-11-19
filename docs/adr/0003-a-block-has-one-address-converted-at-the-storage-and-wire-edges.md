---
status: accepted
---

# A block has one address, converted at the storage and wire edges

Code named a repeat block in five forms: the `blk:` storage key, an even-length `path` of (repeat scope id, block id) pairs, the scope path of the even-indexed elements, the `{sectionId, instanceId, path?}` triple of the wire commands, and `LinkTarget` with an `instanceId` kept as a "compatibility view". Every consumer converted between them by hand, so each nested-repeat fix repaired one more consumer (commits 76d0305, bc92efb, ff5c71f, 836da18, 3abef2f) and `isLegacyInstanceTarget` guarded links written with a wrong scope id. The owner accepted on 2026-11-18 that code holds a block in one form only.

## Decision

- A **block address** is the sheet id plus the full path of (repeat scope id, block id) pairs from the sheet root down to the block. An empty path names the sheet root. `src/core/block-address.ts` owns it as plain readonly data built only through its constructor functions, with key and parse, parent, scope path, section id, block id, descendant test and equality.
- The storage format and the wire format stay at v4. The `blk:` key, the `link:` data (`s` plus optional `path`), the wire commands with `sectionId`, `instanceId` and optional `path`, and `open-sheet` convert to and from an address inside their zod schemas and in one serialisation point per wire. No other code holds a section id, an instance id or a partial path of its own.
- Repeat scopes and sections are looked up by scope path only; the single-level `*ById` lookups go, because the same id can appear at different depths.
- A tab of a repeat block is identified by its source index and the block address, not by a string that encodes the path.

## Considered options

- **Format v5 with a required full path everywhere.** Rejected: by the precedent of ADR-0001 a format bump refuses v4 rooms and snapshots, and the owner's rooms hold v4 data. The internal gain is the same without it.
- **Keep `sectionId` and `instanceId` as members of the address.** Rejected: they are derived from the path and would be a second representation that must agree with the first, which is the class of checks this decision removes.
- **A class with methods, or a branded type.** Rejected for now: core is pure functions over plain data with zod; a brand is added only if a migrating consumer is found to build an address by literal.

## Consequences

- `FieldPatchTarget` is `{kind: 'row', rowId}` or `{kind: 'rep', block}`; `LinkTarget` is `{block, cellId?}`; the internal `Command` holds a block address and no longer differs from its wire type by `readonly` alone.
- The DOM carries the address key for reveal, and the `block-revealed` navigation event carries an address.
- `isLegacyInstanceTarget` and the `instanceId` compatibility view are deleted; only the owner's test rooms hold data older than the November 2026 path fixes.
- The work lands as three PRs, core then replica then ui (TASK-114). The Builder preview kept the wire form until ADR-0005, which has it compose through the shared `src/core/compose.ts` module.
