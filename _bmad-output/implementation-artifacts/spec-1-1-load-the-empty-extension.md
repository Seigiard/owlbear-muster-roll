---
title: '1.1 Load the Empty Extension in a Live Owlbear Room'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '079cb3814793b581197005d2fda27b060e3c3b74'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository holds only planning documents, so no later story has a build, a test setup or a page that Owlbear can load. Backlog task: TASK-3.

**Approach:** Scaffold the Architecture Stack and Structural Seed at the repository root, with one port layer that has an Owlbear adapter and a mock adapter. Prepare the production build and hand the owner a checklist for the deploy and the live-room check.

## Boundaries & Constraints

**Always:** Install the exact versions of the Architecture Stack table, with no ranges. Only `src/platform/obr` imports `@owlbear-rodeo/sdk`. `src/core` has no DOM or SDK import. Both adapters satisfy one `Platform` type. Production origin is `https://musterroll.2249364.xyz/`.

**Never:** Run `wrangler deploy` or any other deploy. Add records, merge, persistence, the replica engine, the theme, the shell or the copy catalog (Stories 1.2 to 1.4). Bundle the SDK into a mock build. Carry code over from the probe without need.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Production build | `vite build` | `dist/` has `index.html`, `background.html`, `manifest.json`, `_headers`; JS and CSS under hashed names | Build fails on a missing entry |
| SDK import outside the adapter | `import OBR from '@owlbear-rodeo/sdk'` in `src/ui/*` | `oxlint` exits non-zero | N/A |
| SDK import in the adapter | Same import in `src/platform/obr/*` | `oxlint` exits 0 | N/A |
| Mock page load | Playwright opens `/index.html` in mock mode | Page renders; console has no error | Test fails |
| Mock listener removed | Unsubscribe, then send | Listener is not called | N/A |
| Static headers | `GET /manifest.json`, `/index.html`, `/background.html` from local `wrangler dev` | `Access-Control-Allow-Origin: https://www.owlbear.rodeo` and `Cache-Control: no-cache` | Owner repeats on production |

</frozen-after-approval>

## Code Map

- `../ttrpg-tools/{.oxfmtrc.json,lefthook.yml,bunfig.toml,test-setup.ts}` -- sibling tooling to reuse, with Vite in place of Astro.
- `git show prototype/owlbear-probe:prototypes/owlbear-probe/public/manifest.json` -- proven manifest shape. The window is 720 by 600 (UX-DR7), not the probe size.
- `git show prototype/owlbear-probe:prototypes/owlbear-probe/vite.config.ts` -- two-entry build and mock mode through a Vite alias.
- `~/.claude/skills/install-anti-slop/scripts/install.mjs` -- vendors the lint plugin to `tools/oxlint/anti-slop/`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `bun.lock` -- exact Stack versions plus `wrangler`, `@oxlint/plugins`, `@types/bun`; scripts `dev`, `build`, `lint`, `format`, `typecheck`, `test`, `test:browser`, `prepare` -- AC 1.
- [x] `tsconfig.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `lefthook.yml`, `tools/oxlint/anti-slop/` -- strict with `skipLibCheck`, type-aware lint, SDK import restricted outside `src/platform/obr` -- AC 2 and 3.
- [x] `vite.config.ts`, `index.html`, `background.html` -- two entries; `@/platform/current` resolves to `obr` or, in `mock` mode, `mock` -- AC 1 and 4.
- [x] `public/manifest.json`, `public/_headers`, `public/icon.svg`, `wrangler.toml` -- Workers static assets with `html_handling = "none"` and the custom domain -- AC 5 and 6.
- [x] `src/core/json.ts` -- JSON value types that ports share -- keeps `core` as the base layer.
- [x] `src/platform/ports.ts`, `src/platform/obr/index.ts`, `src/platform/mock/index.ts` -- ten ports, `Platform` type, two adapters -- AC 4.
- [x] `src/replica/background-main.ts`, `src/ui/main.tsx` -- wait for the platform to be ready; the window renders an empty root -- AC 6.
- [x] `bunfig.toml`, `test-setup.ts`, `src/platform/mock/index.test.ts`, `playwright.config.ts`, `tests/smoke.e2e.ts` -- mock behavior and page load -- AC 4.

**Acceptance Criteria:** the six criteria of TASK-3. Criteria 5 and 6 are human gates: the agent verifies the headers on local `wrangler dev` and writes the owner's checklist.

## Implementation Notes

- `src/ui/main.css` is added beyond the Code Map. The first matrix row expects hashed CSS, and the file holds only the Tailwind import. `source('..')` limits the class scan to `src`, because the default scan reads the planning documents and changes the build output.
- `no-restricted-imports` also blocks SDK subpaths. The pattern needs `/**`, because `/*` did not match `@owlbear-rodeo/sdk/lib/types/Theme`.
- Lint exits 0 with 3 `no-unsafe-type-assertion` warnings, all in `src/platform/obr/index.ts`. SDK data arrives as `unknown`, and each assertion has a SAFETY comment. Core schemas parse the data in later stories.
- Dynamic `import()` of the SDK is not covered by the lint rule.
- `manifest.json` uses 520 by 640, as this spec says. UX-DR7 names 720 by 600 and assigns the size check to the first interface story.
- Not run as written: `rm -rf node_modules dist` and `bunx playwright install chromium` were refused by the permission system. The clean install ran in a fresh copy with `bun install --frozen-lockfile`. Playwright ran on the installed Chromium 1248 through a scratch config. `bun run test:browser` needs `bunx playwright install chromium` (build 1254) on this machine.

Owner checklist (AC 5 and AC 6):

1. Run `bun install --frozen-lockfile && bunx vite build && bunx wrangler deploy`.
2. Run `curl -I` on `https://musterroll.2249364.xyz/manifest.json`, `/index.html` and `/background.html`. Each must send `Access-Control-Allow-Origin: https://www.owlbear.rodeo` and `Cache-Control: no-cache`.
3. Add `https://musterroll.2249364.xyz/manifest.json` to a live Owlbear room.
4. Open the Muster Roll window as GM. Confirm no console error in the window frame and in the background page frame.

Corrections after review:

- `manifest.json` now uses 720 by 600 from UX-DR7. The earlier note about 520 by 640 no longer applies.
- `bun run test:browser` now passes as written, because Chromium build 1254 is installed.
- `wrangler.toml` has a `[build]` command, so `bunx wrangler deploy` builds first. This replaces step 1 of the checklist above.
- Step 2 of the checklist must also confirm status 200 on each URL. A 307 still carries both headers.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Edge: oxfmt blocks a commit when all staged files are ignored | medium | Reproduced with exit 2. Patched with `--no-error-on-unmatched-pattern`. |
| Edge: window stays blank without OBR ready | false | Owlbear is the only host of this page, and it sends ready. Mock mode covers the plain browser. |
| Edge: localStorage failure escapes StoragePort | false | No caller exists in this change. Deferred to Story 1.3, which owns persistence. |
| Edge: mock allows calls before ready | low | Real, but rejected: a guard adds a branch for a mistake no code makes yet. |
| Edge: throwing listener in mock dispatch | low | Rejected: a test-only path, and the fix adds isolation logic. |
| Edge: subscribe during mock dispatch | low | Rejected: no caller does this, and the fix adds code to a test double. |
| Edge: same callback subscribed twice in mock | low | Rejected: no caller does this. |
| Edge: mock passes values by reference | low | Direct correction. Patched with `structuredClone`. |
| Edge: bun test resolves the alias to obr | medium | Reproduced with `window is not defined`. Patched in `tsconfig.json`. |
| Edge: `.env.*` not ignored | low | Confirmed with `git check-ignore`. Patched. |
| Edge: deploy of a stale or mock dist | medium | Patched with a `[build]` command. |
| Edge: SDK request check covers only the window | low | Patched in the smoke test. |
| Blind: mock LOCAL and storage do not cross pages | maybe-false | No window-to-replica path exists yet. Deferred to Stories 1.3 and 1.4. |
| Blind: bun test resolves the alias to obr | medium | Same defect as the Edge row. Patched. |
| Blind: adapter paths not restricted by lint | medium | Reproduced. Patched in `.oxlintrc.json`. |
| Blind: oxfmt blocks a commit | medium | Same defect as the Edge row. Patched. |
| Blind: no local path into Owlbear or the mock | low | Direct correction. Patched with dev CORS, tunnel host and `dev:mock`. |
| Blind: mock delivery too forgiving | low | Cloning patched. Asynchronous delivery rejected: no ordering consumer exists yet. |
| Blind: PlayerPort has no role change | false | No caller exists in this change. Deferred to Story 2.2, which adds the trigger. |
| Blind: StoragePort has no failure contract | false | Same as the Edge row. Deferred to Story 1.3. |
| Blind: mock cannot be driven as another role | false | No test needs it here. Later stories extend the mock with their consumers. |
| Blind: production path has no automated check | medium | Same root cause as the first verification gap. Patched with `tests/build.test.ts`. |
| Blind: env files not ignored | low | Same defect as the Edge row. Patched. |
| Verification: production adapter selection unverified | medium | Filed with a mutation that shipped the mock. Patched with `tests/build.test.ts`. |
| Verification: background smoke passes without the page | medium | Filed with a mutation. Patched in the smoke test and the build test. |
| Verification: served headers have no repeatable check | low | Deferred as filed. The owner checklist now requires status 200. |
| Verification: SDK boundary verified only by hand | low | Deferred as filed. |
| Verification other: oxfmt blocks a commit | medium | Same defect as the Edge row. Patched. |
| Verification other: tests run only by hand | false | AC 3 names lint, format and typecheck hooks only. |

## Design Notes

- The `icon.svg` name stays stable because the manifest names it. It gets no-cache like the manifest, and this is the one unhashed asset the browser fetches.
- `html_handling = "none"` keeps `/index.html` and `/background.html` as served paths. The default handling redirects them to extensionless URLs, and the `_headers` rules would then need to name both forms.
- Port methods follow the SDK names and hold only what the architecture documents use. Later stories extend them.

## Verification

**Commands:**
- `rm -rf node_modules dist && bun install --frozen-lockfile && bunx vite build` -- expected: exit 0 and the files of the first matrix row.
- `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` -- expected: exit 0.
- A temporary SDK import in `src/ui` and in `src/platform/obr` -- expected: lint red, then green.
- `bunx wrangler dev` with `curl -I` -- expected: the headers of the last matrix row.

**Manual checks (if no CLI):**
- Owner: `wrangler deploy`, add `https://musterroll.2249364.xyz/manifest.json` to a live room, open the window, confirm no console error in the window and the background page.
