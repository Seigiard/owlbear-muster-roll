---
title: 'TASK-56: read and write room data in three e2e files through the room helpers'
type: 'refactor'
created: '2026-11-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7b05722e217be9c4e0b5c899add901c5cb5f732f'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-47-shared-engine-test-rig.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `tests/preset.e2e.ts`, `tests/preset-change.e2e.ts` and `tests/snapshot.e2e.ts` build, seed or filter AD-11 storage keys (`mr2:{roomId}:{n}:{a}:{k}`) by hand, through `'mr2:'` literals, `STORAGE_PREFIX` and raw `localStorage` calls. A later key format change would have to touch them too. TASK-47 removed the same knowledge from the engine unit tests.

**Approach:** Give `tests/support/room.ts` the few helpers these files still lack, and move the three files onto them. `tests/support/room.ts` stays the only e2e place, beside `tests/wipe.e2e.ts`, that knows the key format. Test bodies keep their assertions; only how they reach storage changes.

## Boundaries & Constraints

**Always:**
- Every test in the three files that passed before passes after, with the same name and the same `expect` call sites and expected values. Prove it: the Playwright JUnit list of test names for the three files is the same before and after, and a per-test count of `expect` call sites (test bodies plus the local helpers they call) is the same before and after.
- A helper that replaces a key filter selects exactly the keys the old code selected, on the same page and device. A helper that selects fewer keys can turn `toEqual([])`, `every(...)` and `toEqual(keysBefore)` into checks that pass on nothing; the Verification probe guards against that.
- Seeding writes the same storage entries (same keys, same record text, author included) before the background starts, as the old code did.
- The only test-body edits allowed: a raw key or prefix replaced by a helper call that yields the same key or key set, a local storage helper replaced by one in `tests/support/room.ts`, and a raw seed replaced by a seed through records. Any other edit is reported in Implementation Notes with the reason.
- A red test is a defect report: find why the helper differs from the old code and fix the helper. Never delete, skip, loosen or narrow a test.
- Follow the CLAUDE.md test rules, the oxlint rules and the TypeScript rules.

**Never:**
- No change under `src/` (another lane edits it), in `tests/wipe.e2e.ts`, or in any other e2e file. Other files keep using `STORAGE_PREFIX`; it stays exported.
- No new tests, no merged or split tests, no change to how long a test waits.
- `tests/support/room.ts` must not import `src/core/storage-key.ts`: the e2e tests stay an independent check of the format the app writes.

</frozen-after-approval>

## Code Map

- `tests/support/room.ts` -- `STORAGE_PREFIX` (generation 0, no author), `seedStorage(page, records, presetText, device)` (always seeds the preset), `presetRecord(text)`, `storedData(page, key)`, `storedRecords(page, prefix)`, private `storageKeyForPage(page, key)` (device from the page URL), `deviceKeys`. `src/replica/room-rig.ts` `storageKey(key, generation = { n: 0, a: '' })` is the naming model for the unit side.
- `tests/preset.e2e.ts` -- `PRESET_KEY`, `SHEET_KEY` from `STORAGE_PREFIX`; local `seedStorage(page, key, value)` at lines ~363 (preset only, `fileText({ rows: [] })`), ~432 (sheet `SAVED_SHEET` only, author `mock-connection`, no preset), ~456-457 (sheet then example preset); local `storedKeys` (every key starting `mr2:`, used by `toEqual([])` and `windowSideRefusal`); local `storedPreset` (raw read of `PRESET_KEY`, inflates `d`).
- `tests/preset-change.e2e.ts` -- imports `STORAGE_PREFIX`; local `keysOutside(page, prefix)` = keys starting `mr2:` and not under generation 0, asserted `otherGenerations: []` (~line 269). `storedPreset` already uses `storedData`.
- `tests/snapshot.e2e.ts` -- `MOCK_ROOM = 'mr2:mock-room:'`, `FIRST_GENERATION`; local `keysUnder(page, prefix)`. Uses: record keys of every generation stripped of the generation part (~334); key lists before/after (~348, 367, 424, 438, 441); every key under generation 0 (~370, 403); every key under generation `{ n: 1, a: gm.connectionId }` and that generation holds `sheet:mira` (~502-510).
- `tests/wipe.e2e.ts` -- out of scope, keeps its keys.

## Tasks & Acceptance

**Execution:**
- [x] `tests/support/room.ts` -- add the missing helpers: a storage key of a record under a given generation (default generation 0); a read of the room's storage keys on a page's device that can serve each old filter exactly; a way to tell a key's generation and its record key; seeding of records with no preset (let `seedStorage` reuse it). Names and shapes are the implementer's, in the file's style, each with a one-line comment. -- one owner of the key format.
- [x] `tests/preset.e2e.ts`, `tests/preset-change.e2e.ts`, `tests/snapshot.e2e.ts` -- move every key build, seed and key read onto `tests/support/room.ts` helpers; drop the local storage helpers and the `STORAGE_PREFIX` import they no longer need.

**Acceptance Criteria:**
- Given the three files, when searched, then none contains `mr2:`, `STORAGE_PREFIX` or `localStorage`.
- Given every `tests/*.e2e.ts` file, when searched for `mr[0-9]+:`, then only `tests/wipe.e2e.ts` matches; `tests/support/room.ts` holds the format for the rest.
- Given the baseline at `baseline_commit`, when the three files run on the branch, then the same JUnit test names pass, none is skipped, and the per-test `expect` counts are equal.
- Given the equivalence probe, when the three files run with it, then every replaced key read returned the same keys as the old filter, and the reads behind `every(...)` and `toEqual(keysBefore)` returned non-empty lists.

## Verification

**Commands:**
- `bunx playwright test tests/preset.e2e.ts tests/preset-change.e2e.ts tests/snapshot.e2e.ts --reporter=junit` (outside the sandbox, `PLAYWRIGHT_JUNIT_OUTPUT_NAME` set), at `baseline_commit` and on the branch; extract sorted `classname + name` and skipped/failed counts -- expected: equal lists, 0 skipped, 0 failed.
- A scratchpad script that counts `expect` call sites per `test(...)` block and per local helper in the three files, at `baseline_commit` and on the branch -- expected: equal counts.
- Equivalence probe (temporary, never committed): make each new key read also compute the old raw filter in the browser, throw on a difference, and log the list size; run the three files -- expected: all pass, no throw, and non-empty lists for the filters behind `every(...)` and `toEqual(keysBefore)`.
- `rg -n "mr[0-9]+:|STORAGE_PREFIX|localStorage" tests/preset.e2e.ts tests/preset-change.e2e.ts tests/snapshot.e2e.ts` -- expected: no match. `rg -ln "mr[0-9]+:" tests/*.e2e.ts` -- expected: only `tests/wipe.e2e.ts`.
- Full check from CLAUDE.md: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` (outside the sandbox), `bun run build` -- expected: all pass.

## Implementation Notes

- Built through `implement` → `tdd` (checks-only path, no new tests): batch 1 (implementer turns 1-2) and batch 2 (review fixes, turns 1-2), all on tier low+. Run directory: `~/.claude/artifacts/tdd-20261112-142811/task-56-room-helpers-in-e2e/`; its `ticket.md` records each rejected attempt (D1-D5) and its evidence.
- Helpers added to `tests/support/room.ts`: `storageKey(key, generation = { n: 0, a: '' })`, `roomKeys(page)` (every `mr2:` key on the page's device, any room id, in storage order), `storageKeyParts(key)` (generation and record key), `isStorageKeyInGeneration(key, generation)` (the base prefix test `startsWith(storageKey('', generation))`, so a key of another room belongs to no generation), `seedRecords(page, records, device)` (records under generation 0 with no preset; `seedStorage` shares its writer and keeps the preset-first order). Types `StorageGeneration`, `StorageKeyParts`.
- Rejected attempts, each fixed before acceptance: D1 the last snapshot assertion had dropped the generation from `sheet:mira`; D2 the first equivalence probe compared `roomKeys` with its own prefix; D3 `seedStorage` had reversed the seed order; D4 an unused `prefix` option; D5 the generation check ignored the room id, which let `otherGenerations` skip a generation-0 key of another room.
- Test-body edits outside the allowed kinds: none. One seed order differs from the base by design: `tests/preset.e2e.ts` "with a preset and a sheet…" wrote the sheet, then the preset; it now goes through `seedStorage`, which writes the preset first. Both land before the background starts (round 1 judged this immaterial).
- `storedPreset` in `tests/preset.e2e.ts` now reads through `storedData` (as `tests/preset-change.e2e.ts` already did): an absent preset gives `ABSENT` instead of a parse throw, and the assertions fail either way.
- No-weakening controls, base `f1724df`: JUnit list of the three files equal (60 tests, 0 skipped, 0 failed); per-test `expect` call sites equal (39 test blocks, 165 in total with `tests/support/room.ts`); a temporary probe compared every `roomKeys` result with raw `Object.keys(localStorage).filter((key) => key.startsWith('mr2:'))` in all 60 tests: no difference, non-empty reads of 6, 8 and 16 keys behind `every(...)` and `toEqual(keysBefore)`.
- Full check on the merged state `7b8e642`: oxfmt check pass, `bun run lint` exit 0 (warnings only, none on a changed line), `bun run typecheck` pass, `bun test` 2655 pass / 0 fail, `bun run test:browser` 492 passed, `bun run build` pass.
- Commits: the chain's four commits were reorganized into one test slice, `6df2c39` (chain kept at `refs/tdd/tdd-20261112-142811/task-56-room-helpers-in-e2e/chain`). Master `dcc2fce` merged in as `7b8e642`.

## Review Triage Log

- Active layer: `code-review-carryover` only (blind-hunter, edge-case-hunter, verification-gap are off). Code-review rounds 01-initial (mixed-terra, 9/9 sources, 3 minor: narrowed key reads, a pasted generation lambda, a wrong `seedRecords` comment; all fixed in batch 2) and 02-after-fix (final, 2/2 sources, no findings). Carry-over: no open decision, no unresolved critical or major, no finding deferred by code-review, no criterion corrected by code-review. Empty list.

