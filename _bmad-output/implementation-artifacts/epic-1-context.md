# Epic 1 Context: GM Runs the Campaign Sheets

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the greenfield Muster Roll Owlbear Rodeo extension to the point where one GM can load a JSON preset for any game system, create and fill characters and NPCs, and keep every change after a reload, on the permanent production URL. This epic lays the foundation later epics extend: tooling, ports, the record model, the background-page replica and the preset-driven sheet UI.

## Stories

- Story 1.1: Load the Empty Extension in a Live Owlbear Room
- Story 1.2: See a Window That Belongs to Owlbear
- Story 1.3: Keep the GM's Records Safe in the Browser
- Story 1.4: Own the Replica in the Background Page
- Story 1.5: Load and Download a Preset
- Story 1.6: Create and Name Characters
- Story 1.7: Delete a Sheet With One Confirmation
- Story 1.8: See a Sheet Laid Out by the Preset
- Story 1.9: Edit Fields in Place
- Story 1.10: Keep a Different Number of Rows per Character
- Story 1.11: Keep NPCs on Their Own Tab

## Requirements & Constraints

- A preset holds structure only (section → rows → cells), with a character template and a short NPC template in one file. Values are stored apart, by field id.
- Cells: `text` (fixed label, no value), `field` (`text`, `number` or `check`, stable id), `dice` (formula over field ids). Sections: `columns`, inline flow without it, `repeat`, `width` (`1/3`, `1/2`, `full` by default).
- Ids resolve inside the row first, then the same sheet, never across sheets.
- A second game system must work with no code change. The extension does not know what a stat means.
- A refused preset file changes nothing. Formulas are validated at upload by an own parser, never `eval` or `new Function`.
- Deploys and live-room checks are human gates. The agent prepares the build and a checklist, and does not deploy.

## Technical Decisions

**Stack.** bun, TypeScript 7 strict with `skipLibCheck: true`, Vite with two entry pages (`index.html`, `background.html`), React 19, react-aria-components, nanostores, Tailwind 4, zod 4, fflate, nanoid, oxlint, oxfmt, lefthook, `bun test` with happy-dom, Playwright against the mock adapter. Install the exact versions pinned in the architecture stack table.

**Layers.** `src/core` is pure, with no DOM or SDK. `src/replica` is the engine in the background page. `src/platform` holds ports plus `obr/` and `mock/` adapters. `src/ui` is React and nanostores, a projection of the replica. Only `src/platform/obr` imports `@owlbear-rodeo/sdk`, enforced by lint.

**Records.** A record is `{ k, d, c, a }`: key, data, counter, author connection id. `d: null` is a tombstone. Merge replaces the whole `d`. Only these keys exist:

| Key | Data |
| --- | --- |
| `preset` | Preset JSON, deflated and base64-encoded |
| `sheet:{sheetId}` | `{ kind: "pc" \| "npc", name, order }` |
| `row:{sheetId}:{rowId}` | `{ fieldId: value }` for one preset row |
| `rep:{sheetId}:{sectionId}:{instanceId}` | `{ order, cells: { fieldId: value } }` |
| `acl:{sheetId}:{playerId}`, `plink:{sheetId}:{playerId}` | `{ name }` |
| `link:{tokenId}` | `sheetId` |

- `rowId` and `sectionId` are the id of the first `field` in the preset row. Rows with no field have no record.
- Values are JSON numbers, strings or booleans by field type. An empty field has no key.
- `sheetId` and `instanceId` are nanoids. `order` ties break by id.
- Deleting a sheet tombstones its `row:`, `rep:`, `acl:`, `link:` and `plink:` records in one batch.

**Versions.** A beats B when `(A.c, A.a) > (B.c, B.a)`, with `c` numeric and `a` a string. Only `core/merge` compares versions. A new edit takes the highest known `c` for the key + 1. Device time never enters a version.

**Persistence.** A GM client stores each record under `mr1:{roomId}:{n}:{a}:{k}`, with generation `{ n: 0, a: "" }` before any import. One synchronous step reads, merges and sets. Player clients persist nothing. The origin `https://musterroll.2249364.xyz/` scopes this storage and must not change after the first real session.

**Replica ownership.** Only `src/replica` mutates the replica, composes `d`, mints `c` or calls room broadcast and metadata. Windows talk to it on `app.muster-roll/ui` with destination `LOCAL`. Commands are intents and never carry a whole record. Handlers tolerate an echo of their own message. A window sends `projection-request` and gets a full projection through `core/visibility`, then deltas.

**Sending.** All sends on both channels use one serial queue, starting at 50 ms spacing, with backoff on `RateLimitHit`. One function keeps each message under 15000 UTF-8 bytes of JSON. A record that cannot fit one message is refused at input.

**Conventions.** Zod schemas in `core` parse every inbound message, stored record and file. `core` returns results for expected failures, and `replica` reports them through notices. All timeouts, pauses and spacing live in one constants module that tests inject. Timers only schedule work. Fields send on blur or a typing pause, never per keystroke. Files are kebab-case.

## UX & Interaction Patterns

- Colors map at runtime from `OBR.theme` and update with no reload. Hex values of theme-mapped tokens are for tests and mocks only.
- System font only, no shadows inside the window, no color coding for game concepts, no icons where a word fits except the gear.
- The window is a tab bar, one optional banner and one scrolling content area. Settings replaces the content area.
- Characters and NPCs never share a list. NPC and the gear stay pinned at the right. If the active sheet disappears, the first available tab becomes active.
- Editing is in place, with no edit mode. An invalid value stays in the field with an error under it and is not saved.
- A confirmation is one inline block at the top of the content area, and focus moves to "Отменить".
- Every interface string comes from one catalog with the exact Russian text of the experience spec.
- Every control has a 2 px focus outline and a touch target at least 32 px high. No hover-only controls and no drag. Disabled controls show a text reason.
- `mockups/shell.html` is a layout reference only, and the written UX documents win on conflict.

## Cross-Story Dependencies

- 1.1 provides the scaffold, ports and mock. 1.2 provides the theme, shell, shared primitives and copy catalog.
- 1.3 provides merge, schemas and persistence for 1.4. 1.4 provides the constants module, send queue, projection and banner.
- 1.5 comes before the sheet stories 1.6 to 1.11. Its formula parser only validates here, and Epic 4 evaluates and rolls.
- 1.8 renders what 1.9 makes editable. 1.10 reuses the 1.9 validation. 1.11 reuses the 1.7 confirmation and the 1.9 and 1.10 editing.
- Temporary limits that later epics lift: `core/visibility` is a pass-through and a player client shows only the loading text; dice cells render as static labels; preset upload is disabled while sheets exist.
- Room sync, the player pending queue, catch-up and the room copy come in later epics. The record model and send queue must already fit them.
