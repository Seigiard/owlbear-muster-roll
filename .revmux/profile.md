# Muster Roll — review profile

## What it is

- An Owlbear Rodeo extension: static files on Cloudflare, no backend. TypeScript, React, Vite, bun, Tailwind 4, react-aria.
- One owner, a small group of GMs and players in live game rooms. There is no ops team and no server log.
- Two surfaces:
  - the in-room window, with a background replica that owns the room's data and syncs it between clients over Owlbear metadata and broadcast;
  - the standalone preset Builder (`builder.html`, `src/builder/`), where a GM authors a JSON preset and saves it as a file.

## What a real failure looks like

- Room data is lost or diverges between clients: an edit that does not survive a reload, a GM and a player that see different values, a room copy that overwrites newer data.
- A GM's `localStorage` copy is lost or orphaned. It is the only full copy of their data, and it is scoped to the production origin.
- A player sees a hidden sheet, tab, section or row in the interface, or can edit a sheet without write access.
- A preset file that the Builder saves is rejected by "Загрузить пресет", or a valid preset loses values on upload.
- A formula runs code. Presets are shared files, so formulas run only through `src/core/formula.ts`, never `eval` or `new Function`.
- A behavior depends on timers firing in a hidden tab. Timers only schedule work; a rule decides on the answer it received.
- In the Builder: a draft is lost, a file is overwritten without its confirmation, or the keyboard treegrid, the drag reorder or the problem navigation breaks.

## Blast radius

- Replica, storage and sync bugs reach every client in a room and can destroy a campaign's records. Rate them hardest.
- UI and Builder bugs affect one GM's session and are recoverable unless they lose data or files.

## Reporting bar

- Report what a GM or a player would hit in a real room or Builder session, or a deviation from a documented rule below.
- Noise here:
  - hypothetical races or limits with no path from real Owlbear behavior;
  - "add a test" when the code is correct and a test already locks the behavior;
  - style preferences that the linters and `oxfmt` do not enforce.
- The mock adapter proves app logic only. A finding that depends on live Owlbear host behavior should say so, not assert it.

## Where the rules live

- `CLAUDE.md`: project map, check matrix by path, platform, formula, visibility and timer rules, test conventions.
- `GLOSSARY.md`: domain terms. A new or changed term must land there in the same commit.
- `docs/adr/0001`–`0005`: presets as lists of templates, UI flows as pure reducers with React rendering, block addresses, replica transition tables, command composition shared with the Builder preview.
- `_bmad-output/specs/spec-muster-roll/SPEC.md` and its companions: the product contract. `docs/preset-format.md` is the user-facing preset format.
- `_bmad-output/planning-artifacts/ux-designs/…/DESIGN.md` and `EXPERIENCE.md`: UX contract.
- `formal/<area>/`: TLA+ models of the replica. `coverage.txt` names the code each model describes, and `formal/drift.sh` fails when that code changes without the model.
- `.oxlintrc.json` with `tools/oxlint/` (anti-slop and `muster-roll` rules).

## Deliberate conventions

- Only `src/platform/obr/` imports `@owlbear-rodeo/sdk`; other code goes through `@/platform/current`. A new capability is a port in `src/platform/ports.ts` with both an OBR and a mock adapter.
- Views get sheets only through `src/core/visibility.ts`. A hidden sheet is hidden in the interface only: every client holds its records, by design.
- Interface text is Russian and lives in `src/copy.ts`. Code, comments, docs and commits are English.
- `className` is built with `clsx` and named variants with `cva` (lint rule `muster-roll/no-hand-assembled-classname`).
- Unit tests sit beside their source as `*.test.ts` with `#given` / `#when` / `#then` comments. E2E tests run on the mock adapter. Engine tests use `tests/support/room-rig.ts`.
- `src/core/` has no platform or React imports.
- Deploying is the owner's step. The production origin stays `https://musterroll.2249364.xyz/`.
- `prototypes/` is not shipped.

## Languages a change usually touches

- TypeScript and TSX, CSS (Tailwind 4), Playwright e2e, Markdown docs and specs, TLA+ in `formal/`.
