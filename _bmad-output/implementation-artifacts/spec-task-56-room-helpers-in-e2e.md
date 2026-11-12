---
title: 'TASK-56: read and write room data in three e2e files through the room helpers'
type: 'refactor'
created: '2026-11-12'
status: 'in-progress'
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
- [ ] `tests/support/room.ts` -- add the missing helpers: a storage key of a record under a given generation (default generation 0); a read of the room's storage keys on a page's device that can serve each old filter exactly; a way to tell a key's generation and its record key; seeding of records with no preset (let `seedStorage` reuse it). Names and shapes are the implementer's, in the file's style, each with a one-line comment. -- one owner of the key format.
- [ ] `tests/preset.e2e.ts`, `tests/preset-change.e2e.ts`, `tests/snapshot.e2e.ts` -- move every key build, seed and key read onto `tests/support/room.ts` helpers; drop the local storage helpers and the `STORAGE_PREFIX` import they no longer need.

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

