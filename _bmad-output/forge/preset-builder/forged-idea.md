# Forged idea: preset builder (TASK-38)

Outcome: hardened. Input for `bmad-spec` (update `SPEC.md`), then `bmad-ux`.

## Decisions

- **Who:** every GM, the owner included. Nobody wants to write JSON.
- **Where:** a separate page on the deployed site (`musterroll.2249364.xyz`), not inside the Owlbear window. This matches `SPEC.md` ("a separate preset editor with preview", past the POC); only that item moves into v2. The in-extension editor stays a non-goal.
- **Flow:** start blank, from a repository example (`example-preset`, `d20`, `d6-pool`) or from a file → edit → download. A button in the extension settings opens the builder in a new tab.
- **Exchange with the room (v2):** by file only. Download from the extension, edit, upload to the extension.
- **Editing model:** a structure tree (sections, rows, cells) with a form for the selected item, beside a live preview drawn by the extension's own sheet components (TASK-40). A click on a preview cell selects it in the tree.
- **Field ids:**
  - made once from the label (transliterated, id rules, unique in scope);
  - kept when the label changes;
  - shown in the field form as the name for formulas;
  - the GM may rewrite them (`str`, `dex`, `attr_attack`).
- **Id rename:** rewrites the id in every formula that refers to that field, by whole word, and says how many changed. Scopes follow the parser: template fields outside `repeat`, and each `repeat` row.
- **Changed id in a loaded preset:** warns that the field's stored values in the room will be erased (5.1 erases values of removed ids).
- **Formulas:** offer field ids as completions.
- **Draft:** one draft, saved by itself in the page's browser storage (a top-level tab, not the Owlbear iframe); offered on the next visit.
- **Undo and redo:** for every edit.
- **Invalid file on open:** a file that fails the preset checks does not open. It shows the upload's message.
- **Invalid states while editing:** allowed. Each error shows at its tree item and its preview cell, with a problem counter that jumps to the first.
- **Download:** enabled only when `parsePresetFile` accepts the preset, so a downloaded file always uploads.
- **Coverage:** the whole format:
  - both templates;
  - section `title`, `width`, `columns` and `repeat`;
  - every cell kind;
  - `window`.

## Rejected

- **In-place editing on the sheet:** it needs a second sheet renderer, and `columns`, `width`, `repeat` and ids would still need a side panel.
- **A text markup instead of JSON:** it is still writing.
- **Hiding ids entirely:** formulas need a name for each field.
- **Blocking edits that would make the preset invalid:** it forces one edit order.
- **Direct handoff between the extension window and the builder tab through storage:** the Owlbear iframe's storage is partitioned from a top-level tab.

## Build approach (after research, 2026-11-11)

- Build from parts, no editor library:
  - the tree is react-aria-components `Tree` with `useDragAndDrop`, already a dependency;
  - one store holds the preset itself, and undo/redo is a stack of past presets;
  - property forms for the five node kinds (section, row, text, field, dice) are written by hand;
  - the preview uses our sheet components, and each cell carries a path for click-to-select;
  - zod `issue.path` puts each error at its item.
- Rejected:
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

## After v2

- **Room preset in the link:** the settings button passes the room's current preset in the URL `#fragment`, deflated with `encodePreset`, so it never reaches the server. Check first that the Owlbear iframe may open a new tab. The way back stays a file.
- **Direct write to the room:** waits for the v2 server (D1).

## Side finding

- `docs/preset-format.md:132` still says upload is disabled while sheets exist. That is stale since 5.1.
