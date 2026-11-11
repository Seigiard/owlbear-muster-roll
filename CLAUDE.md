# CLAUDE.md

Muster Roll is an Owlbear Rodeo extension that keeps the sheets of one room, such as the party, the NPCs and a shared inventory, under the GMs' control, laid out by a JSON preset. Built with bun, React and Vite; `package.json` lists the rest. It has no backend: static files on Cloudflare.

## Project map

- `src/core/` - pure domain logic, with no platform or React imports
- `src/replica/` - the engine that runs in the background page and owns the room's data
- `src/platform/` - ports, plus the `obr/` adapter (Owlbear SDK) and the `mock/` adapter (dev and tests)
- `src/ui/` - the React window, token picker and settings
- `src/preview/`, `scripts/`, `preview.html` - the dev-only preset preview
- `tests/` - Playwright e2e (`*.e2e.ts`) and helpers in `tests/support/`
- `docs/` - the user-facing preset format and example; decisions in `docs/adr/`
- `presets/` - preset files the preview lists
- `public/` - `manifest.json` and `_headers`
- `tools/oxlint/` - vendored anti-slop lint rules
- `backlog/` - tasks, managed by the `backlog` CLI
- `_bmad-output/` - product spec (`specs/spec-muster-roll/SPEC.md`), architecture (`planning-artifacts/architecture/`), UX, per-task specs and `deferred-work.md` (`implementation-artifacts/`), forge sessions
- `prototypes/owlbear-probe/` - an early platform spike, not shipped

## Domain language

Name domain concepts with the terms in [GLOSSARY.md](GLOSSARY.md) wherever you write. Read it before you use or coin a domain term. A new term or a changed meaning lands in the glossary in the same commit.

<important if="you are preparing a commit or running build, test, lint, format, or preview commands">

`package.json` lists the scripts. What it does not say:

- `bun run dev` serves the Owlbear adapter and needs a tunnel for a live room; `bun run dev:mock` needs no Owlbear.
- `bun run preview [path]` adds that preset file to the preview's list and opens it first.
- The full check before a commit: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`. Lefthook runs only lint and format on staged files, so the rest of the check is yours.
- `bun run test:browser` needs Chromium. Run it outside the sandbox.
</important>

<important if="you are about to deploy, release, push, or touch wrangler.toml or the production URL">

- Deploying is the owner's step. Your part ends at `bun run build` and a local commit.
- The repository has no remote, so work ends at a local commit.
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
- Update `docs/preset-format.md`, `_bmad-output/specs/spec-muster-roll/preset-format.md` and `docs/example-preset.json` with the change. The example's parse test is the completion check.
</important>

<important if="you are writing or changing interface text">
- Interface text is Russian and lives in `src/ui/copy.ts`.
</important>

<important if="you are writing or changing tests">

- Unit tests sit beside their source as `*.test.ts` and use `bun:test` with `#given` / `#when` / `#then` comments.
- E2E tests run the app on the mock adapter. URL parameters in `src/platform/mock/client-params.ts` set the role, the player and faults; `tests/support/room.ts` seeds rooms.
- The mock proves app logic only. Behavior in a live Owlbear room needs the owner's check.
</important>

<important if="you are implementing a backlog task or a feature">
- Work goes through the `bmad-build` skill and ends on the full check. Its spec lives in `_bmad-output/implementation-artifacts/spec-*.md`; deferred findings go to `deferred-work.md` beside it.
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
