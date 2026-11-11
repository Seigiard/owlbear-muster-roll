# CLAUDE.md

Muster Roll is an Owlbear Rodeo extension that keeps a room's characters and NPCs on GM-owned sheets, laid out by a JSON preset. Built with bun, TypeScript, React 19, Vite, Tailwind 4, react-aria-components, zod and nanostores. It has no backend: static files on Cloudflare at `https://musterroll.2249364.xyz/`.

## Project map

- `src/core/` - pure domain logic: records, merge, access, visibility, preset, formula, snapshot, messages
- `src/replica/` - the engine that runs in the background page: replica, pending edits, catch-up, room copy
- `src/platform/` - ports, plus the `obr/` adapter (Owlbear SDK) and the `mock/` adapter (dev and tests)
- `src/ui/` - the React window, token picker and settings; interface text in `src/ui/copy.ts`
- `src/preview/`, `scripts/`, `preview.html` - the dev-only preset preview
- `tests/` - Playwright e2e (`*.e2e.ts`) and helpers in `tests/support/`; unit tests sit beside their source as `*.test.ts`
- `docs/` - the user-facing preset format and example; decisions in `docs/adr/`
- `presets/` - preset files the preview lists
- `public/` - `manifest.json` and `_headers`
- `tools/oxlint/` - vendored anti-slop lint rules
- `backlog/` - tasks, managed by the `backlog` CLI
- `_bmad-output/` - product spec (`specs/spec-muster-roll/SPEC.md`), architecture (`planning-artifacts/architecture/`), UX, per-task specs and `deferred-work.md` (`implementation-artifacts/`), forge sessions
- `prototypes/owlbear-probe/` - an early platform spike, not shipped

## Domain language

Name things with the terms in [GLOSSARY.md](GLOSSARY.md): in code, specs, docs, task text and replies. Read it before you name a new concept, and update it when a term is added or its meaning changes.

<important if="you need to run commands to build, test, lint, format, or preview">

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server with the Owlbear adapter, for a live room through a tunnel |
| `bun run dev:mock` | Dev server with the mock adapter, no Owlbear needed |
| `bun run preview [path]` | Opens the preset preview page; a path adds that preset file and opens it first |
| `bun run build` | Production build into `dist/` |
| `bun run lint` | `oxlint --type-aware` |
| `bun run format` | `oxfmt` over the repository |
| `bun run typecheck` | `tsc --noEmit` |
| `bun test` | Unit tests |
| `bun run test:browser` | Playwright e2e against the mock dev server |
| `bun run prepare` | Installs the lefthook git hooks |

- The full check before a commit: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build`.
- `bun run test:browser` needs Chromium. Run it outside the sandbox.
</important>

<important if="you are about to deploy, release, push, or touch wrangler.toml or the production URL">

- Deploying is the owner's step: `bunx vite build && bunx wrangler deploy`. Never run `wrangler deploy`.
- The repository has no remote. Commit locally and never push.
- The production origin never changes: it scopes each GM's `localStorage`, the only full copy of their data.
</important>

<important if="you are importing the Owlbear SDK or adding a platform capability">

- Only `src/platform/obr/` imports `@owlbear-rodeo/sdk`. Other code imports the adapter through `@/platform/current`; a lint rule enforces this.
- A new capability is a port in `src/platform/ports.ts`, with both the OBR and the mock adapter.
</important>

<important if="you are evaluating dice formulas or changing formula syntax">
- Formulas run only through the parser in `src/core/formula.ts`. Never `eval` or `new Function`: presets are shared files.
</important>

<important if="you are deciding what a player or a GM can see">
- Views get sheets only through `src/core/visibility.ts`. NPCs are hidden in the interface only: every client holds their records.
</important>

<important if="you are adding timers, retries, or behavior that runs while a tab is hidden">
- Timers only schedule work. No rule may depend on timer accuracy, because hidden tabs throttle them. A GM is online only when a GM client answers.
</important>

<important if="you are changing the preset format or its checks">
- Update `docs/preset-format.md` and `_bmad-output/specs/spec-muster-roll/preset-format.md` with the change. `docs/example-preset.json` must keep parsing; a test checks it.
</important>

<important if="you are writing or changing interface text">
- Interface text is Russian and lives in `src/ui/copy.ts`.
</important>

<important if="you are writing or changing tests">

- Unit tests use `bun:test` with `#given` / `#when` / `#then` comments.
- E2E tests run the app on the mock adapter. URL parameters in `src/platform/mock/client-params.ts` set the role, the player and faults; `tests/support/room.ts` seeds rooms.
- The mock proves app logic only. Behavior in a live Owlbear room needs the owner's check.
</important>

<important if="you are implementing a backlog task or a feature">
- Work goes through `bmad-build`: a spec in `_bmad-output/implementation-artifacts/spec-*.md`, an implementation, three reviews, and the full check. Deferred findings go to `_bmad-output/implementation-artifacts/deferred-work.md`.
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
