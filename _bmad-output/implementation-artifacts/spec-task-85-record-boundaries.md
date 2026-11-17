---
title: 'TASK-85: Keep accepted v4 records and fixtures faithful to merge versions'
type: 'bugfix'
created: '2026-11-17'
status: 'ready-for-dev'
route: 'dispatch'
baseline_commit: '7335dbfd766d0747a835fd3d7c35a549f47aad0a'
review_loop_iteration: 0
context:
  - '{project-root}/GLOSSARY.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The v4 record parser accepts lifecycle metadata on records that are not blocks, while non-block merge does not include that metadata in its equal-version winner rule. Cell dictionaries also accept inherited object-property names that valid preset field ids reject, so a parsed cell can be lost during block merging. Finally, the shared fixture helper overwrites an explicitly newer same-value cell tuple with an older one.

**Approach:** Make the accepted-record boundary explicit: lifecycle belongs only to block records and cell ids follow the existing field-id rule. Preserve the v4 tuple supplied to the fixture helper, and protect the outcomes through public parser and merge consumers.

## Boundaries & Constraints

**Always:** Every accepted non-block record has one deterministic merge result in either argument order. A block may carry its lifecycle tuple; `preset`, `acl:`, `link:`, and `plink:` records reject it. Parsed cell ids are valid field ids, including the existing prototype-member exclusions. A supplied cell tuple remains unchanged when its value equals the base value and its counter or author is newer.

**Never:** Do not add a reader, converter, or compatibility branch for old record formats. Do not widen preset field ids, change normal non-block fixture shapes, or make intentionally invalid parser inputs valid. Do not change TASK-83 pending-overlay behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Non-block lifecycle | A `link:` or other non-block candidate carries `l` | `parseRecord` returns `invalid-record`; valid equal-version non-block records merge to the same literal winner in either order | Refuse before storage or merge |
| Inherited cell id | A block candidate has a `constructor` cell | `parseRecord` returns `invalid-record` | Refuse before the object lookup can read an inherited member |
| Same value, newer tuple | A fixture patch supplies `[10, 4, "gm-new"]` over `[10, 3, "gm-old"]` | The fixture retains the supplied tuple and merge observes the newer tuple | Preserve counter and author |

</frozen-after-approval>

## Code Map

- `src/core/records.ts` — `versionedRecordOf` currently grants optional `l` to every record form; `cellsSchema` currently accepts any nonempty string. Reuse `isFieldId` as the existing field-id policy. Keep block lifecycle validation and the `__proto__` dictionary guard.
- `src/core/merge.ts` — non-block merge chooses by `(c,a)` then JSON data. Do not change this rule once non-block lifecycle is rejected. `mergeBlock` owns only block lifecycle and cell merging.
- `tests/support/block-fixtures.ts` — `fixtureRecord` currently gives normal non-block fixtures a lifecycle and `fixturePatch` replaces a supplied equal-value tuple. Repair it after the consumer lock; deliberately invalid parser fixtures remain available.
- `src/core/records.test.ts` — parser boundary owner for lifecycle and field-id rejection.
- `src/core/merge.test.ts` — merge consumer owner for deterministic non-block records and fixture-supplied newer same-value tuples.
- `/Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/exploration.report.md` — navigation finding for TASK-85; verified against this checkout.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/records.test.ts` and `src/core/merge.test.ts` — lock parser and merge consumer regressions for all three criteria.
- [ ] `src/core/records.ts` — restrict lifecycle metadata to blocks and validate cells with the field-id policy.
- [ ] `tests/support/block-fixtures.ts` — retain normal valid non-block records without lifecycle and preserve explicit cell tuples.
- [ ] Run focused core owners and the required source checks at one stable SHA with durable output.

**Acceptance Criteria:**
- Given a parsed non-block record, when it is merged with the same version in either order, then both calls return one deterministic winner and a supplied lifecycle is rejected.
- Given a block candidate with an inherited-property field id, when parsed, then it is rejected before merging can lose a cell.
- Given a fixture patch with the same value and an explicitly newer tuple, when `mergeRecords` consumes it, then the newer counter and author remain.
- Given normal non-block fixtures and intentionally invalid parser inputs, when existing owners run, then their prior valid/invalid boundary stays unchanged.

## Design Notes

Rejecting invalid cell ids is preferable to preserving special object keys because the preset format already defines the shared accepted identifier set. Rejecting non-block lifecycle removes metadata that the non-block tie-breaker intentionally does not order; it avoids inventing a new merge ordering only for malformed v4 input.

## Verification

**Commands:**
- `bun test src/core/records.test.ts src/core/merge.test.ts` — expected under 1 minute; proves parser, deterministic non-block merge, and explicit fixture tuple behavior.
- `/Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/checks.py --cwd <checkout> --output <caller-run>/final-checks` through the prescribed `herdr-run --wait` launch — expected under 8 minutes; runs format, lint, typecheck, unit, browser, and build checks on one stable SHA.

## Implementation Notes

- Actual implementation base: `7335dbfd766d0747a835fd3d7c35a549f47aad0a`.
- TASK-79 and TASK-82 remain excluded. TASK-83's display-only pending overlay is unchanged.

## Spec Change Log

## Review Triage Log
