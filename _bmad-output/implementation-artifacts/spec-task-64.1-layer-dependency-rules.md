---
title: 'TASK-64.1: enforce the layer dependency rules with lint overrides'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '83e53366aec7529a9c0752f2efa480d7791912b2'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The architecture layer boundaries are documented but most dependency rules are not enforced, allowing replica, core, platform and builder imports to drift. Interface copy also sits under `src/ui` even though the background replica uses it.

**Approach:** Add Oxlint per-layer import restrictions while preserving the existing SDK and adapter controls, and exempt only `src/replica/room-rig.ts` until TASK-64.2 moves it. Move shared interface copy to `src/copy.ts`, update its importers, and document the shared path.

</frozen-after-approval>

## Implementation Notes

- Investigation found no user-visible intent gap or irreversible operation, so the small semantic lint change plus mechanical import relocation uses the `oneshot` route.
- Interface copy moved verbatim from `src/ui/copy.ts` to `src/copy.ts`; all former `@/ui/copy` importers, including existing tests and browser tests, now use `@/copy`. `CLAUDE.md` names the shared path.
- `.oxlintrc.json` adds core, replica, platform and builder restrictions. The replica override now applies to tests; the five existing cross-layer tests route their UI types and client helpers through the exempt `room-rig.ts`, whose TASK-64.2 removal comment remains the only file-level exemption. The platform adapter override still allows the Owlbear SDK and preserves the direct-adapter restriction.
- Scratch controls under `controls/` ran `bun run lint` against forbidden imports for every named layer target, plus the existing SDK and direct-adapter restrictions. Every negative control returned exit status 1 with `no-restricted-imports`; allowed imports, including the SDK in `src/platform/obr`, returned exit status 0. Scratch source files were removed after each run.
- D1 review-fix controls under `controls/d1-before-*` reproduced the wildcard deviation before the fix: removing only `src/replica/**`'s test exclusion made `bun run lint` reject the five UI imports with `no-restricted-imports` (exit 1), then restored the original config. Temporary `.test.ts` probes for UI, builder and preview imports were each rejected by `bun run lint` (exit 1); the room-rig exception control passed with no wildcard test exclusion.
- D1 final checks passed on the corrected working tree: format, lint, typecheck, unit (3010 tests) and build logs are under `controls/d1-{format,lint,typecheck,unit,build}.*`; browser first reported one unrelated selection timeout (519 passed), then the unchanged-state retry passed all 520 tests under `controls/d1-browser-retry.*`.

## Review Triage Log

- Review 01 routed `bugs-1` / Blind Hunter 2 as a major AC2 finding: the wildcard replica-test exclusion was broader than the sole `room-rig.ts` exemption. D1 corrected it by removing the wildcard and routing the five existing test capabilities through the exempt rig. No permanent test was added because Oxlint owns import matching and AC6 requires scratch CLI checks.
- Review 01 deferred `bugs-2` / Blind Hunter 1: relative-import bypasses are outside the alias-only AC wording and no current violation exists.
- Review 01 deferred Blind Hunter 3: a builder UI-entrypoint allowlist is outside AC4 and no changed runtime occurrence establishes it.
- Review 01 deferred Blind Hunter 4: additional React-wrapper restrictions are outside AC1 and no current core wrapper violation is reported.
- Review 01 rejected Blind Hunter 5: a permanent lint-test inventory has no local oracle; AC6 explicitly requires temporary scratch checks and implementation notes.
- Review 02-after-fix completed with 2/2 healthy sources, zero critical or major findings, and no open questions. Parent verified the final unit and unchanged-state browser retry counts.
