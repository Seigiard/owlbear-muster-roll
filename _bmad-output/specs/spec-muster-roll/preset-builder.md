# Preset builder (v2)

A separate page on the deployed site (`musterroll.2249364.xyz`) where a GM builds or changes a preset without writing JSON. Every GM uses it, the owner included. Capabilities CAP-20 to CAP-28 in `SPEC.md`.

## Flow

1. Start blank, from a repository example (`docs/example-preset.json`, `tests/fixtures/presets/d20.json`, `tests/fixtures/presets/d6-pool.json`) or from a file.
2. Edit.
3. Download. Upload the file in the extension (CAP-8).

The extension settings have a button that opens the builder in a new tab. Exchange with the room is by file only.

## Editing model

- A structure tree (sections, rows, cells) with a form for the selected item.
- A live preview beside them, drawn by the extension's own sheet components.
- A click on a preview cell selects its item in the tree.

## Field ids

- Made once from the label at field creation: transliterated, follows the id rules, unique in scope.
- Kept when the label changes.
- Shown in the field form as the name for formulas.
- The GM may rewrite an id to a short name (`str`, `dex`, `attr_attack`).
- Formula inputs offer field ids as completions.

## Id rename

- Rewrites the id in every formula that resolves to that field, by whole word: `str` does not touch `str_tired`.
- Says how many formulas changed.
- Scopes follow the parser (`resolveFieldReference`): a template's fields outside repeat sections are one scope, and each repeat section is its own. Each template is separate.
- In a preset opened from a file, a changed id warns that the field's stored values in the room will be erased, because an upload erases values of removed ids (CAP-8).

## Draft, undo, validation

- One draft, saved by itself in the builder page's browser storage. The builder opens straight into the editor: on the draft if one exists, otherwise on an empty preset. No draft prompt. The page is a top-level tab, not the Owlbear iframe.
- Undo and redo for every edit.
- A file that fails the preset checks does not open. It shows the upload's refusal message. Fixing broken JSON is not the builder's job.
- Invalid states are allowed while editing. Each error shows at its tree item and its preview cell. A problem counter jumps to the first error.
- Download is enabled only when `parsePresetFile` accepts the preset, so a downloaded file always uploads.

## Coverage

The whole format of `docs/preset-format.md`:

- every sheet set and single sheet with its properties;
- section `title`, `width`, `columns`, `repeat` and linkable;
- every cell kind;
- `window`.

## Existing parts to reuse

| Part | Where | Use |
| --- | --- | --- |
| Format and refusal messages | `docs/preset-format.md` | Rules and message text |
| `parsePresetFile` | `src/core/preset.ts` | Open check and download gate |
| `encodePreset` | `src/core/preset.ts` | After v2: preset in the URL fragment |
| `resolveFieldReference` | `src/core/preset.ts` | Rename scopes |
| Preview page (TASK-40) | `src/preview/`, `bun run preview` | Base for the live preview |

## Rejected

| Option | Reason |
| --- | --- |
| In-place editing on the sheet | Needs a second sheet renderer. `columns`, `width`, `repeat` and ids would still need a side panel |
| A text markup instead of JSON | It is still writing |
| Hiding ids entirely | Formulas need a name for each field |
| Blocking edits that make the preset invalid | Forces one edit order |
| Handoff between the extension window and the builder tab through storage | The Owlbear iframe's storage is partitioned from a top-level tab |

## After v2

- **Room preset in the link.** The settings button passes the room's current preset in the URL `#fragment`, deflated with `encodePreset`, so it never reaches the server. Check first that the Owlbear iframe may open a new tab. The way back stays a file.
- **Direct write to the room.** Waits for the v2 server (D1).

## Build approach

Guidance for architecture, from research on 2026-11-11. Not product requirements.

- Build from parts, no editor library:
  - the tree is react-aria-components `Tree` with `useDragAndDrop`, already a dependency;
  - one store holds the preset itself, and undo/redo is a stack of past presets;
  - property forms for the five node kinds (section, row, text, field, dice) are written by hand;
  - the preview uses our sheet components, and each cell carries a path for click-to-select;
  - zod `issue.path` puts each error at its item.
- Rejected libraries:
  - Puck (MIT, React 19): own `Data` format needs a two-way converter, canvas-first UX, 0.x with an experimental UI override API, ~169 KB gz. Prototype it only if a canvas UX is wanted later.
  - Craft.js, GrapesJS, Form.io, react-form-builder2: own document models; Craft.js is stale.
  - SurveyJS Creator: commercial license.
  - Builder.io and Plasmic: hosted SaaS.
  - RJSF and JSON Forms: little gain for five node kinds, and a foreign look.
  - TTRPG sheet tools: no reusable parts.
- From dummy-sheet, ideas only. It has no license, so its code may not be copied:
  - new items start with sensible defaults, so the builder is never empty or broken;
  - an "add …" button closes each container, full width, naming what it adds;
  - the download file name holds the preset name and the time;
  - a clear split between preview and edit.
