---
title: 'TASK-76: Block records with cell versions'
type: 'feature'
created: '2026-11-16'
status: 'done'
route: 'dispatch'
baseline_commit: '5dd5369678bfe7701a0c14c336fa7f7021ce4641'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/storage-and-sync.md'
  - '{project-root}/tools/mutants/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Row-level versions lose concurrent edits to different fields. Layout changes also rename value records.

**Approach:** Story 8: replace `sheet:`, `row:` and `rep:` with `blk:<sheet>[:<scopeId>:<blockId>]*`. Each block holds `order`, optional `set`, and `cells` with independently versioned `[value,counter,author]` entries.

## Boundaries & Constraints

**Always:** Presets remain v3: first-field repeat scope ids, existing links, permissions and commands. Data/wire/snapshots become v4; storage uses `mr4`. Merge is commutative, associative and idempotent. Order cells by counter then author. Clear with a versioned null cell. Null blocks defeat late cell edits. Preserve preset relocation over prior tombstones. Materialize single-sheet roots consistently.

**Never:** No converter, deployment, registry, nested-repeat feature, repeat tabs or token cells. Refuse old snapshots as older-version. Keep rejection of incompatible Builder drafts. Ask before switching to per-field records.

## I/O & Edge-Case Matrix

| State / input | Expected result |
|---|---|
| Concurrent different fields of one root or repeat block | Both literal values survive on all clients and reload |
| Same cell, reordered or repeated delivery | One deterministic latest version; merge laws hold |
| Clear versus delayed old value | Cell stays empty; `0` and `false` remain values |
| Block delete versus late edit, even a higher cell counter | Block and its links stay deleted |
| Preset moves fields between plain rows or scopes A → B → A | Plain key stays; relocation keeps block identity and surviving values |
| Player patch, stale/rejected proposal, catch-up replay | Check changed fields and visibility; preserve other cells and correct pending/ACK state |
| Same outer version, different cell coverage | Digest, read-back and UI detect the difference |
| Large assembled block | Split transport at cell boundaries under existing limits; reject an individually oversized cell before acceptance |
| Snapshot round-trip / old snapshot | Values and live links round-trip; reset rights; refuse v3 without writes |

</frozen-after-approval>

## Code Map

- `src/core/records.ts`, `merge.ts`, `field-patch.ts`: schemas, key helpers, tuple merge and clear.
- `src/core/sheets.ts`, `sheet-values.ts`, `access.ts`, `visibility.ts`, `token-links.ts`, `link-target.ts`, `repeat-block-duplicate.ts`: shared readers, policy and targets.
- `src/core/digest.ts`, `snapshot.ts`, `snapshot-file.ts`, `snapshot-import.ts`, `state-records.ts`, `message-size.ts`: completeness, codecs and transport.
- `src/replica/{composers,pending-edits,proposal-queue,pending-queue,record-store,commit-outbox}.ts`: writers, retries and persistence.
- `src/replica/engine.ts`, `room-protocol.ts`, `command-routing.ts`, `generation-flow.ts`, `catch-up.ts`, `room-copy.ts`, `window-publisher.ts`: lifecycle, persistence and delivery.
- `src/ui/projection-store.ts`, `sheet/sheet-header.tsx`, `sheet/sheet-body.tsx`: pending marks, names and formula invalidation. `src/builder/{builder-store,preview-pane,preview-records}.ts(x)` and `src/preview/sample-records.ts` also write records.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/format-version.ts`, `storage-key.ts`, `preset.ts`, `src/builder/document.ts`, `builder-page.tsx` — separate preset v3 from data v4; update version consumers and storage helpers.
- [x] `src/core/{records,merge,field-patch,preset-migrate}.ts` and mapped readers — implement lifecycle, cell merge, root metadata and migration.
- [x] `src/core/digest.ts`, `snapshot*.ts`, `state-records.ts`, `message-size.ts`, `room-messages.ts`, `ui-messages.ts` — update codecs, coverage checks and bounded cell fragments.
- [x] `src/replica/` files in Code Map — use shared merge throughout; keep proposal identity, access checks, persistence, catch-up and coalescing correct.
- [x] Mapped `src/ui/`, `src/builder/`, `src/preview/` consumers — adapt tuple reads/writes, fragment assembly and field-specific pending marks.
- [x] `src/core/*.test.ts`, `src/replica/*.test.ts`, `tests/support/{room,room-rig}.ts`, `tests/{sync,repeat-blocks,snapshot,builder-snapshot}.e2e.ts` — port fixtures and protect matrix behaviors; preserve Builder round-trips.
- [x] `src/core/snapshot-size.test.ts`, `_bmad-output/specs/spec-muster-roll/storage-and-sync.md` — measure the existing d20 room without shrinking its workload or 1500-byte margin.
- [x] `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md` — align AD-2/3/4/7/8/11/12/14/18/19 with this transitional format; preserve other contracts.
- [x] Verify changed behaviors with calibrated regressions. Broad mutation sweeps and controls are superseded by the user's instruction to use only targeted verification; they are not reported as passed.

**Acceptance Criteria:**
- Given two GM clients, when each edits a different field of one block, then both values persist on both clients and after reload.
- Given export, import, catch-up, room copy and Builder, when records cross these boundaries, then they use blocks and preserve values, clears and applicable deletions.
- Given the unchanged d20 workload, when the size test runs, then the measured bytes and margin are recorded; a failed margin remains blocking.

## Design Notes

Separate block lifecycle from cell versions and proposal identity. Only creation or preset relocation starts a later lifecycle. Preserve field-clear markers and no-op reference identity.

Commits carry changed cells; persistence and views hold assembled blocks. Fragment full-state and projection traffic too. Manual snapshots keep plain values and links, without replica versions or tombstones: sheet root `cells`, and blocks addressed by scope/block paths, replace positional rows.

## Verification

- Declare oracles before test edits; replace `engine-sync.test.ts`'s lost-neighbor expectation with exact values. Observe red then green.
- Run `CLAUDE.md`'s full checks and Backlog validation. Mock tests do not prove Owlbear behavior.
- Reuse the completed functional checks. Run only tests for a concrete finding in changed code; no further broad mutation sweeps or full-suite reruns.

## Implementation Notes

- The user approved implementation in this session on 2026-11-16, then clarified that data and snapshot backward compatibility is not needed. Old formats remain unsupported; there is no converter.
- Production readers and writers use block records, per-cell tuples and an independent `l: [counter, author]` lifecycle. Commits carry changed cells; persistence, room copies and visible projections hold assembled records. Proposal ACK identity, stale/resend handling, preset relocation, manual snapshots, Builder and browser fixtures are ported.
- The full unit suite passes: 3350 passed, 1 skipped, 0 failed across 124 files. The full Playwright suite passes: 541/541. The corrected v1 wipe fixture passes 6/6 after inline review found two accidentally duplicated/malformed storage entries.
- Formatter, lint, typecheck, production build, `git diff --check`, `backlog doctor` and `backlog task view TASK-76 --plain` pass. Lint reports warnings but no errors.
- The unchanged d20 workload measures 11434 bytes, leaving 4066 bytes. The 1500-byte gate passes.
- The merge regressions were observed red with block merging disabled, then green. Storage regressions were observed red with data version 3, then green. Additional temporary faults proved coverage for neighbor-cell preservation, relocation lifecycle, resent-creation lifecycle bounds and duplicate snapshot paths/instance ids.
- Matrix evidence:
  - Different-field concurrency: `engine-blocks.test.ts` covers roots, repeat blocks, storage and reload; `sync.e2e.ts` covers two browser GMs.
  - Same-cell ordering, clear markers and delete versus late higher counters: `block-merge.test.ts`; `engine-blocks.test.ts` also covers link deletion.
  - Relocation A → B → A: `engine-blocks.test.ts` and `preset-migrate.test.ts`.
  - Player patch, stale/rejected proposal, resend and ACK state: `block-boundaries.test.ts`, `access.test.ts`, `engine-propose.test.ts`, `proposal-queue.test.ts` and `pending.e2e.ts`.
  - Coverage-sensitive digest/read-back/UI, bounded cell fragmentation and oversized-cell rejection: `block-boundaries.test.ts` and `block-projection.test.ts`.
  - Snapshot round-trip, duplicate rejection and old-version refusal: `block-boundaries.test.ts`, `snapshot-file.test.ts`, `snapshot-import.test.ts` and `snapshot.e2e.ts`.
- Parent matrix audit confirmed the listed behavioral owners against source and completed unit/browser evidence. Implementation commit: `156c4dba4110b942cd905eba3f6be75f631e46a1`. Focused review completed; findings are tracked in TASK-81 through TASK-85 instead of expanding this implementation.
- Retired v3 row-identity cases map to explicit v4 coverage rather than disappearing:
  - Separate plain-row records and row relocation are impossible because all plain fields share `blk:<sheet>`; `engine-sync.test.ts` and `engine-blocks.test.ts` now assert exact concurrent cell values in one assembled root, including storage and reload.
  - Row-level `(c, a)` winner tests now assert per-cell winners. Concurrent edits to different cells both survive; sequential edits preserve the untouched cell's original version.
  - Duplicate `blk:<sheet>` root/row fixtures now use one canonical record with root metadata and all cells. Delete and restart tests assert one root tombstone.
  - Clear-removes-key cases now assert a versioned null cell. This protects a clear from delayed older values and keeps `0` and `false` distinct from empty.
  - Oversized delete tests no longer manufacture duplicate row identities. They use many distinct descendant block paths and still prove bounded split transport.
- Snapshot duplicate coverage is v4-native: `snapshot-file.test.ts` rejects duplicate full block paths and reuse of one final instance id under two paths in a sheet.
- Verification resumed on 2026-11-16:
  - All 19 `engine-*.test.ts` files pass: 703 tests. `engine-client.test.ts` passes 138/138 and `engine-sync.test.ts` passes 37/37.
  - The complete unit suite passes: 3347 passed, 1 skipped, 0 failed across 124 files. TypeScript typecheck passes.
  - Red/green calibration killed four temporary production faults: dropping a newly seen neighbor cell, omitting the relocation lifecycle marker, accepting a resent block whose lifecycle counter exceeds its proposal counter, and accepting duplicate snapshot block paths or repeated instance ids. Each narrow test passed again after restoring production code.
- The user explicitly rejected broad checks after the excessive run. The core sweep was cancelled with exit 130 after 35m29.722s: partial 800 killed, 103 survived, 3 timed out out of 1319 inventoried mutations. Baseline comparison was not reached. This is CANCELLED/INCOMPLETE, not a passing result. Runner cleanup removed all six temporary worktrees and its pool; no live probe process remains. Additional sweeps and controls were not run. Machine-readable cancellation evidence is retained outside the repository in `task76-probe-core-cancelled-156c4db.json` under the session's approved temporary directory.

## Spec Change Log

## Review Triage Log

- Iteration 1: no runtime contract gap found. Fixed stale v3 identity comments. Found and corrected a test-fixture defect in `tests/wipe.e2e.ts`: two historical v1 storage keys had been collapsed to the same v4 key and one JSON value was malformed. The corrected six-test file passes.

### Parent review: three independent lenses

The owner explicitly requested follow-up issues rather than extending this task. The following deferrals include defects introduced by this change, not only pre-existing issues. They remain unresolved; review completion does not mean defect-free.

| Finding | Verdict | Evidence and disposition |
|---|---|---|
| Blind 1: preset upload reissues untouched cell versions | high | `composers.ts` remints all planned cells; reviewer reproduced a concurrent hp edit being overwritten. Follow-up TASK-82. |
| Blind 2: stripped fields omitted rather than cleared | medium | `mintedPatch` only enumerates the stripped patch; absent fields survive union merge after an interrupted upload. Follow-up TASK-82. |
| Blind 3: oversized stale response becomes denied | medium | `room-protocol.ts` explicitly falls back to denied when the read-back exceeds one message. Follow-up TASK-81. |
| Blind 4: projection fragments ignore actual envelope budget | medium | `splitParts` fragments first using the default reserve, then applies the actual envelope; reviewer reproduced rejected projection delivery. Follow-up TASK-81. |
| Blind 5: proposal assembly lacks byte/part/retention bounds | medium | The assembler bounds only its number of map entries; the resource-exhaustion consequence is a code-traced risk. Follow-up TASK-81. |
| Blind 6: pending display loses to a newer applied cell | medium | Projection uses replica merge for pending display; reviewer reproduced displayed 30 with pending intent 20. Follow-up TASK-83. |
| Blind 7: repeated root serialization | low | Every plain row now serializes the same root in `sheetValuesSignature`; no measured slowdown is claimed. Follow-up TASK-84. |
| Blind 8: non-block lifecycle breaks equal-version commutativity | low | Schema accepts `l`, while non-block merge ignores it. Normal composers do not emit this case. Follow-up TASK-85. |
| Blind 9: prototype-named parsed cells break merge | low | The record schema accepts names that valid preset field ids forbid; inherited lookup can lose the parsed cell. Follow-up TASK-85. |
| Blind 10: fixture discards explicit same-value versions | medium | `fixturePatch` replaces explicit tuples when values equal the base value, hiding version-only scenarios. Follow-up TASK-85. |
| Edge 1: large stale proposals lose pending edits | medium | Same verified fallback as Blind 3; retained as a separate review finding. Follow-up TASK-81. |
| Edge 2: unbounded assembly bytes | medium | Same verified missing bounds as Blind 5; no memory-exhaustion incident is claimed. Follow-up TASK-81. |
| Verification gap: no multi-part proposal admission regression | medium | Existing proposal tests send one part; large-block tests cover state assembly instead. Missing test must prove no early persistence/ACK and all-field access validation. Follow-up TASK-81. |
