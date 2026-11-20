# CLAUDE.md

Muster Roll is an Owlbear Rodeo extension that keeps the sheets of one room, such as the party, the NPCs and a shared inventory, under the GMs' control, laid out by a JSON preset. Built with bun, React and Vite; `package.json` lists the rest. It has no backend: static files on Cloudflare.

## Project map

- `src/core/` - pure domain logic, with no platform or React imports
- `src/replica/` - the engine that runs in the background page and owns the room's data
- `src/platform/` - ports, plus the `obr/` adapter (Owlbear SDK) and the `mock/` adapter (dev and tests)
- `src/ui/` - the React window, token picker and settings
- `scripts/` - the dev and live port-contract launchers
- `tests/` - Playwright e2e (`*.e2e.ts`) plus shared support; `tests/support/room-rig.ts` is Bun-only and `tests/support/room.ts` is browser support
- `docs/` - the user-facing preset format and example; decisions in `docs/adr/`
- `presets/` - standalone preset examples checked by `src/core/preset.test.ts`
- Builder examples are `docs/example-preset.json` and `tests/fixtures/presets/`.
- `public/` - `manifest.json` and `_headers`
- `tools/oxlint/` - vendored anti-slop lint rules
- `formal/` - TLA+ models of the replica; each `formal/<area>/` has a project skill that runs it and a `coverage.txt` naming the code it describes
- `backlog/` - tasks, managed by the `backlog` CLI
- `_bmad-output/` - product spec (`specs/spec-muster-roll/SPEC.md`), architecture (`planning-artifacts/architecture/`), UX, per-task specs and `deferred-work.md` (`implementation-artifacts/`), forge sessions
- `prototypes/owlbear-probe/` - an early platform spike, not shipped

## Domain language

Name domain concepts with the terms in [GLOSSARY.md](GLOSSARY.md) wherever you write. Read it before you use or coin a domain term. A new term or a changed meaning lands in the glossary in the same commit.

<important if="you are running dev or Owlbear scripts">

`package.json` lists the scripts. What it does not say:

- `bun run dev` serves and opens the standalone builder with no Owlbear or tunnel.
- `bun run dev:owlbear` serves the Owlbear adapter through cloudflared and prints its manifest URL.
</important>

<important if="you are preparing a commit, resolving a merge, or choosing or running local checks">

The paths in the commit choose the checks. For a normal commit, inspect `git diff --cached --name-status` (both paths of a rename). Combine the matching rows.

| Paths | Local checks |
|---|---|
| Source or tests (`src/`, `tests/`, `scripts/`, `tools/`, `test-setup.ts`), root HTML entry pages, shipped assets or presets (`public/`, `presets/`), `package.json`, `bun.lock`, or configuration consumed by these checks | Full check: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run mutants` (on committed files; it refuses a dirty target), `bun run test:browser`, `bun run build`. |
| Backlog records (`backlog/`) | Read each touched task with `backlog task view <id> --plain`: the CLI must read it and its fields must match the intended change. Run `backlog doctor` for ID and dependency diagnostics, the touched-path format check below, and `git diff --cached --check`. |
| Formal models: `formal/<area>/` or the model's skill in `.claude/skills/` | Run that area's `formal/<area>/check.sh` and `formal/drift.sh`. |
| Documentation: `docs/`, `_bmad-output/`, `GLOSSARY.md`, `CLAUDE.md`, or other Markdown outside source/test/config paths | Run the touched-path format check below and `git diff --cached --check`. Changes to `docs/preset-format.md` or `docs/example-preset.json` also require the example's parse test from the preset-format block. |

`bun run test:browser` needs Chromium; run it outside the sandbox. Node comes from `.node-version` (Node 26), which CI and Cloudflare Workers Builds both read. mise reads it only with `idiomatic_version_file_enable_tools` including `node`; otherwise install Node 26 another way and check `node -v`. Do not add `.tool-versions`: Workers Builds fails on it. Playwright starts Vite with `--no-turbo-fast-api-calls`, because Node 26.13.1 and earlier abort the server mid-run (nodejs/node#66870); keep the flag until a Node 26 release carries the fix.

When browser suites run concurrently in multiple checkouts, run `bun run test:browser --workers=1` in each checkout. If Playwright finishes and lists failed tests, save its log and copy `test-results/` aside. The rerun replaces `test-results/`. Wait for the other browser suites to finish. In the same checkout, run `bun run test:browser --last-failed --workers=1 --trace=on` before any other browser tests there. Compare the trace with the original failure. A passing rerun does not make the full suite green or show that load caused the failure. For startup errors, inspect the original runner and server output instead.

The touched-path format check is `bunx oxfmt --ignore-path .gitignore --no-error-on-unmatched-pattern --check <paths>`, with each existing touched path as a separate, quoted argument. `.oxfmtrc.json` excludes Markdown, `backlog/` and `_bmad-output/`; report them as skipped, not format-validated.

For paths outside the table, inspect their consumers; use the full check if they affect the app or its checks, or their effect is uncertain.

For a merge commit, record conflicted paths before resolving them. Classify those paths plus every extra manual edit, including edits to auto-merged files; cleanly auto-merged source stays outside the classification. A merge with only documentation and backlog conflicts therefore uses the smaller rows.

PR CI (`.github/workflows/ci.yml`) is the backstop: on every PR, docs-only included, it runs every full-check command except `bun run test:browser`, plus `formal/drift.sh`, and every `formal/*/check.sh` when the PR touches `formal/`. The smaller local sets defer those checks to CI. Browser tests remain a local responsibility for full-check commits only.

Lefthook (`lefthook.yml`) lints and formats matching staged files before a commit. Its pre-push hook runs `bun run typecheck` and `formal/drift.sh` on every push, docs-only pushes included. `formal/drift.sh` fails when a file a formal model covers changed after the model's sync commit; bring the model in line through its skill, then move `sync` in `formal/<area>/coverage.txt`.
</important>

<important if="you are about to deploy, release, or touch wrangler.toml or the production URL">

- Deploying is the owner's step. Your part ends at `bun run build` and a commit on a branch other than `master`.
- The production origin stays `https://musterroll.2249364.xyz/`: it scopes each GM's `localStorage`, the only full copy of their data.
</important>

<important if="you are importing the Owlbear SDK or adding a platform capability">

- Only `src/platform/obr/` imports `@owlbear-rodeo/sdk`. Other code imports the adapter through `@/platform/current`; a lint rule enforces this.
- A new capability is a port in `src/platform/ports.ts`, with both the OBR and the mock adapter.
</important>

<important if="you are evaluating dice formulas or changing formula syntax">
- Formulas run only through the parser in `src/core/formula.ts`. Never `eval` or `new Function`: presets are shared files.
</important>

<important if="you are deciding what a player or a GM can see">
- Views get sheets only through `src/core/visibility.ts`. A hidden sheet is hidden in the interface only: every client holds its records.
</important>

<important if="you are adding timers, retries, or behavior that runs while a tab is hidden">
- Timers only schedule work, because hidden tabs throttle them. A rule decides on the answer it received; an online GM is one whose client answers now.
</important>

<important if="you are changing the preset format or its checks">
- Update `docs/preset-format.md`, `_bmad-output/specs/spec-muster-roll/preset-format.md` and `docs/example-preset.json` with the change. The completion check is `bun test src/core/preset.test.ts`, which parses the example.
</important>

<important if="you are writing or changing interface text">
- Interface text is Russian and lives in `src/copy.ts`, shared by the UI and background replica.
</important>

<important if="you are writing or changing UI components">
- Build conditional `className` values with `clsx`; define named control variants with `cva`.
- Follow `muster-roll/no-hand-assembled-classname`, which enforces this `className` assembly rule.
</important>

<important if="you are writing or changing tests">

- Unit tests sit beside their source as `*.test.ts` and use `bun:test` with `#given` / `#when` / `#then` comments.
- Engine tests (`src/replica/engine-*.test.ts`) build rooms, clients, storage keys and timing with the Bun-only `tests/support/room-rig.ts`. A file states only the timings and the wait limit it changes.
- E2E tests run the app on the mock adapter. URL parameters in `src/platform/mock/client-params.ts` set the role, the player and faults; the browser-side `tests/support/room.ts` seeds rooms.
- TASK-64.3's shared port contract runs named Storage, Broadcast and Metadata scenarios against the real mock adapter in Bun and against real Chromium storage in the browser suite. It proves the adapter-port behavior exercised by those fixtures, not Owlbear host behavior.
- `bun run port-contract:live` serves an opt-in OBR harness. Install `tests/port-contract-live/manifest.json` through an HTTPS tunnel in two clients, use an empty test room, choose coordinator and peer with the same displayed run id, run the supported scenarios, and press cleanup. A normal browser tab is not an Owlbear host.
- The live harness records Storage, LOCAL/REMOTE recipients, one-sender arrival order, metadata merge/delete and listener snapshots. LOCAL uses a separate same-client extension context opened through the coordinator's popover port, not a same-page subscription. It also does not prove injected failures, host rate-limit quota or recovery, metadata capacity or silent drops, cross-client timing, or global multi-sender order.
- Live harness output is an observation report for manual comparison, not an automatic PASS/FAIL verdict. Compare it within the finite 2-second delivery wait and 100-ms quiet period, and inspect the coordinator, peer and hidden bridge iframe consoles. A missing observation can be a relay/control failure, so do not call it an Owlbear host defect without independent evidence. Wait for the peer before running, run one set at a time, avoid concurrent cleanup, keep both contexts open, and recreate paired actions after lifecycle or control trouble.
- The mock proves app logic and the shared port contract only. Any other behavior in a live Owlbear room needs the owner's check.
</important>

<important if="you are moving UI behavior out of a React component or separating rules from rendering">
- One shape for every UI flow, set by `docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md`: a pure reducer in its own module, `useReducer` in the component, and the commands, ports and browser effects in that same component, one `useEffect` per state field. `src/ui/navigation.ts` with `src/ui/main.tsx` is the model. The caller in `prototypes/ui-second-flow/` is a test harness.
</important>

<important if="you are implementing a backlog task or a feature">
- Work goes through the `bmad-build` skill and ends with the local checks selected by the changed-path rules above. Its spec lives in `_bmad-output/implementation-artifacts/spec-*.md`; deferred findings go to `deferred-work.md` beside it.
</important>

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.55.3 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
