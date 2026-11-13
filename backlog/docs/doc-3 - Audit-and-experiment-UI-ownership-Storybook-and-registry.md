---
id: doc-3
title: 'Audit and experiment: UI ownership, Storybook and registry'
type: specification
created_date: '2026-11-13T10:10:00Z'
updated_date: '2026-11-13T10:40:00Z'
tags:
  - architecture
  - ui-decoupling
  - research
  - storybook
---
# UI ownership audit and Storybook/registry experiment

## Decision and scope

The owner accepted **pure transitions inside a separate navigation module; React remains rendering**. ADR-0002 records that direction. Exact navigation interfaces and a production migration are still pending.

This research covers TASK-61.2 and TASK-61.3. The inventory contains 64 non-test TypeScript/TSX modules: 44 in `src/ui`, 13 in `src/builder` and 7 in `src/preview`, at revision `8c7a204`. This is a functional ownership audit, not a line-by-line correctness review or a claim that all UI paths were executed.

Two read-only audits examined window workflows and builder/picker/preview workflows independently. The coordinator reconciled their recommendations and ran the Storybook experiment below. Existing application tests were read for their test surface; the full suite and a live Owlbear room were not run.

## Verdicts

- **H1/H2:** the navigation shape is accepted as direction, not yet behaviorally validated. The pilot remains TASK-61.5.
- **H3:** no general event bus is justified by this audit. Keep semantic events scoped to a flow; reconsider shared delivery only after the second flow supplies evidence.
- **H4:** reject a runtime visual registry for the present scope on source-audit grounds. `preset-cell.tsx:130-172,301-326` dispatches on the closed `cell.kind` / `field.type` union owned by core; no plugin/discovery requirement was found. The registry story holds the identical three component references, so its equal browser result is true by construction, not evidence for this verdict.
- **H5:** capability supported for the sampled frame/sheet and components reacting to a refused promise; fit and comparative maintenance cost are not judged. Storybook 10.6.7 built without live-room runtime imports. Editable views still depend on hooks, contexts, stores and an artificial fixture; they are not production states expressed as data/events-only.
- **H6:** untested. Link picker is the preferred preliminary candidate; settings confirmations are an alternative. Selection remains deferred until after the navigation pilot under TASK-61.6 AC#1. Neither was extracted or executed in Storybook.

## Ownership matrix

Disposition: **separated** means the existing seam already earns its depth; **candidate** means a bounded future extraction may pay; **open** means an ownership or oracle decision remains. A candidate is not automatic permission to migrate.

| Flow and inputs | Workflow vs local state | Effects and current owner | Test surface / independent oracle | Disposition and next work |
| --- | --- | --- | --- | --- |
| Navigation: projection, role, open request, user events and sampled DOM focus | Selected sheet/tab, preset arrival, create/delete waits and confirmation lifetime are workflow state in `ui/main.tsx:198-221,329-522`; DOM reads at :420,491 influence focus decisions | Commands/outcomes, acknowledgeOpen, focus/reveal; mount-time half in `sheet-body.tsx:72-101`; core still owns policy and tab resolution | Existing open/sidebar/tabs/hidden-tabs/characters/delete browser checks; AD-7/10/18/26 and FR14 | **candidate**: TASK-61.5 includes confirmation lifetime, browser-focus input, semantic intents and their mount-time consumer |
| Loading/empty/content choice: readiness, preset, GM link, room-copy outcome | Which content kind to show is a display decision currently written as JSX in `main.tsx:729-794` | Rendering only; no new room owner | Catch-up/no-GM/preset browser checks; AD-7 and no-GM read rules | **candidate**: include resolved content kind in the pilot view, without moving JSX into the core |
| Banner: notices and sync | No workflow state in `banner-message.ts` | Pure message selection | `banner-message.test.ts`; current notice and catch-up contracts | **separated**: retain |
| Projection/client/view intake | Assembly, sequence gaps, command timeout and answer identity already live outside rendering; preset decode/initial-role fallback still sit next to the hook | `replica-client.ts`, `projection-store.ts`, `window-view.ts` | Existing dedicated tests; AD-10; doc-2 executable raw-atom observation | **open**: define a complete navigation input at the existing update seam; do not treat one atom notification as a transaction |
| Text/number field editing: record, focus, typed value, save mode, outcome | Draft, baseline, held value, refusal and save decisions are workflow-shaped; IME/focus and browser events are local | `sheet/use-field-edit.ts:66-90,119-317`: timer, patch, pagehide/unmount flush; `local-field-values.ts` feeds shown roll values | Field-edit/characters browser checks; UX save rules and AD-10/12 | **open**: assess after two flows. Preserve IME, pause/blur/pagehide behavior; do not classify all field state as disposable widget state |
| Check/select fields | Local displayed/held value around one patch; field acceptance remains core-owned | Same editing module and command interface | Existing field-edit/selection browser checks; preset field types and patch contract | **open** with field editing; no separate generic field machine now |
| Repeat add/remove: instance ids and command outcomes | Wait-until-visible and focus-target intent in `use-repeat-blocks.ts:21-102` | Patch commands and DOM focus | Repeat-block browser checks; UX add/remove focus rules | **candidate** only as a later consumer of the pilot's intent-lifetime lesson; TASK-61.7 |
| Repeat duplicate dialog | Count text, local validation and its own pending outcome stay local to the dialog | `duplicate-count.tsx`, `preset-section.tsx`; core composes duplicates | Mounted duplicate-count checks and duplicate browser checks; duplicate-count and command contracts | **separated enough**: no new shared mechanism on current evidence |
| Dice button: local shown values, request/outcome, signature | Rolling/waiting/error presentation is local; evaluation and visibility are already outside React | `dice-button.tsx:64-121`; replica owns the actual roll | Roll/dice-extension browser checks; AD-13 | **separated enough**: catalogue candidate, not another evaluator or global machine |
| Header/access: sheet, party, records and own command outcomes | Access panel tracks per-operation outcomes; popover open/Escape/focus remain local widget interaction | `sheet-header.tsx:30-40,75-89,143-150`, `access-panel.tsx:60-106`; real store plus injected command function | Mounted access-panel checks and access/owner browser checks; AD-4 and ownership rule | **candidate** for a later headless flow if useful. Experiment proves current port/store-level isolation; it does not justify exporting a private reducer solely for tests |
| Preset upload: file, diff, confirmation, catch-up, outcome | Workflow phases and identity guards live in `preset-actions.tsx` | File read, diff request, confirmed command, refocus | Preset/preset-change browser checks; AD-14 and single-confirmation rules | **candidate**: bounded settings-flow work after navigation; TASK-61.6/61.7 |
| Snapshot import/export: file, current preset, check, confirmation | Import phases and count-changed response in `settings/snapshot-actions.tsx:59-119`; export is a file effect | File read/download, requestSnapshotCheck, snapshot-import, focus | Snapshot browser checks; AD-9 and confirmation rules | **candidate**: keep distinct effects; do not prematurely make one flagged upload framework |
| Wipe: catch-up, confirmation, outcome | Confirmation/sending state in `settings/wipe-actions.tsx` | wipe command and refocus | Wipe browser checks and text helper tests; AD-9/CAP-31 | **candidate** with settings; one confirmed destructive intent, no storage ownership moved into UI |
| Map selection: platform selection and scene changes | `map-selection.ts` already handles observation lifetime and stale reads; main builds the view | Platform select/deselect still invoked through `main.tsx:252-274`; pure marks in core | `map-selection.test.ts`, selection browser checks; CAP-32 | **separated**, with a small integration cleanup candidate; TASK-61.7 |
| Pending marks: pending edits, sync, clock | Pure mark/deadline rules plus a headless runner already exist | `pending-marks.ts` owns scheduling; sheet selectors draw results | `pending-marks.test.ts`; UX-DR28/AD-4 | **separated**: retain |
| Main-window, picker, builder and preview startup | Entry modules create roots, stores and browser listeners; room entries also start clients | `ui/main.tsx:102-165`, `ui/picker/main.tsx`, `builder/main.tsx`, `preview/main.tsx`; no reusable room-root lifetime interface | Current browser startup checks; AD-10/20/23 | **open** for room entries: split entry wiring from reusable render during the pilot; catalogue imports must not start live windows. Builder/preview keep their existing standalone entries |
| Link picker: token, projection, pick, label ports and outcomes | Read-once label, sent pick, finish-on-replica-arrival, role gate and retry lifetime live in React effects | `ui/picker/link-picker.tsx:69-97,103-217`; commands, scene read/write, timeout, notification and close | Mounted link-picker scenarios and link browser checks; UX-DR22 for list only; label sequence in `spec-4-7-offer-the-sheet-name-as-the-token-label.md:31-32,48-51,97,101` and EXPERIENCE.md:115 | **candidate** for selection after the pilot, TASK-61.6; keep core pickerGroups/target rules; platform-port behavior still requires the owner's live-room check |
| Builder document/history/draft: edits, selection, storage | `builder/document.ts` and `builder-store.ts:51-64` already own document edits, undo/redo/coalescing/draft | Injected DraftStorage; no React requirement | Document/store tests and builder browser checks; AD-21 | **separated**: reuse, not re-extract |
| Builder problems/download/file name | Pure validation/gating and format; focus-to-first-problem is a DOM intent | `builder/problems.ts`, `file-name.ts`; page sends a focus request to tree | Problems/file-name tests; AD-22 and UX download contract | **separated** for rules; **open** for sharing a proven focus-intent shape |
| Builder open/replace: file/example/empty and current draft | request/fileMessage/skip-confirmation rules in `builder-page.tsx:54-111` | file.text(), validation, store.open; confirmation widget owns Cancel/Escape focus | Builder browser checks; AD-22 and EXPERIENCE.md:299 | **candidate**: small decision seam; overlapping file reads remain unexamined, not a claimed bug |
| Builder tree/DnD: document, selection, collapsed state, drop target | DnD translation/expanded state is widget work; collapse over selection also changes document selection | `structure-tree.tsx:87-100,172-191`; document owns acceptsDrop/moveItem | Document tests and builder browser checks; AD-25; UX:290-291,318 | **open**: the precise collapse-to-selection rule has no located independent oracle; retain until that contract is confirmed |
| Builder forms/rename | Form text/caret local; rename consequences and origin-value warning span document and JSX callbacks | `item-form.tsx:325-331,656-681`; document owns formula-aware rename | Document rename tests, builder warning checks; AD-24 and UX:293 | **candidate**: consequences as flow behavior, not another form framework; TASK-61.7 |
| Formula suggestions | Scope already computed in document/core; open/active/caret are widget interaction | `formula-input.tsx` | Document/formula and builder browser checks; UX:294 | **separated**: retain widget ownership |
| Builder preview selected/shown tab and DOM marks | AD-23 selected-item tab fallback currently updates local state during render at `preview-pane.tsx:76-91` | Click-to-uid and mark selectors are browser work at :275-389 | Preview-record tests and builder browser checks; AD-23/UX:295 | **candidate**: apply navigation lessons to the small tab rule; do not add a second renderer |
| Shared sheet renderer: template, records, cell/field kind, editing/roll/preview/map contexts | Structural dispatch in `sheet/preset-cell.tsx:130-172,301-326` uses a closed core union; fields also consume FieldEditingContext, DiceSheetContext, CellPreviewContext and MapSelectionContext | `sheet-body.tsx`, `preset-section.tsx`, `preset-cell.tsx`; `sheet-body.tsx:72-101` applies navigation reveal after mount | Existing sheet/preview/browser contracts; AD-18/23/26; source context declarations at use-field-edit:96, dice-button:49, preset-cell:75, map-toggle:22 | **separated** as the one renderer, but not data/events-only; pilot must include its reveal consumer. Registry need was examined here and not found |
| Standalone preview: URL, file list, sample values | Selection is host-local; address/sample records are pure | `preview-page.tsx`, address/protocol/sample-records, dev fetch/HMR | Preview browser and sample-record tests; AD-23/26 | **separated** for its current purpose; no need to force it through the room navigator |
| Shell and primitives | WindowFrame is data/callback-driven; sidebar entries pure; tooltip/pointer/focus/React Aria state is widget-local | `shell/`, `primitives/`, `reveal.ts` | Sidebar tests and primitives browser fixture; AD-26/accessibility contract | **separated**: plain imports suffice. Legacy WindowShell cleanup is optional, not an epic success condition |
| Theme, copy, errors, download adapters | Theme/token and error/text functions already separate decisions; browser persistence/download remains at the edge | `ui/theme.ts`, `copy.ts`, `preset-errors.ts`, `download.ts`; `builder/theme-choice.ts`, `examples.ts`; preview bootstrap/themes | Existing theme/copy/error tests and browser theme/download checks | **separated**: retain. Colour/style redesign is outside this epic |

## Second-flow recommendation and remaining questions

The preferred preliminary candidate for TASK-61.6 is **link picker link-and-label**; select the actual second flow only after the pilot. It shares navigation's command → wait for record / end on refusal rule, and adds external label read/write timeouts and close/retry sequencing. The shared rule makes transfer measurable; the platform effects make the test different from DOM reveal. Existing mounted scenarios provide an inventory, not an oracle copied from the new implementation. The sequence oracle is `spec-4-7-offer-the-sheet-name-as-the-token-label.md:31-32,48-51,97,101`; EXPERIENCE.md:115 covers the offered label, while UX-DR22 covers only the list. Platform-port behavior needs the owner's live-room check.

The picker remains a migration candidate: `ui/picker/link-picker.tsx:69-97,103-217` owns the read-once label, pending pick, refusal, finish-on-arrival, role-gated label write and close/retry in React effects. `core/token-links` already owns choice grouping and target rules. Keep those owners.

Settings upload/import/wipe is the alternative second flow. It tests file → check → confirm → command and catch-up cancellation. Do not choose both before the first pilot supplies evidence.

Open decisions for TASK-61.4: coherent projection publication; how browser focus state is sampled and supplied as transition input without reading DOM inside a pure transition; and mount-dependent intent lifetime. Later decisions: field draft/IME ownership; tree-collapse selection oracle; and whether the second flow warrants a shared runner. The repeated command-settlement rule appears in main, use-repeat-blocks, access-panel, link-picker and use-field-edit; H3/H6 should test that pattern before generalizing it.

File-to-row mapping rule: every `main.tsx` belongs to startup; the three sheet structural renderers belong to Shared sheet renderer; sheet behavior modules belong to their named editing/roll/access/repeat/pending/map rows; shell and primitives map by directory. Builder's document/store, problems/file-name, page, tree, forms/formula, preview records/pane and theme/examples map to their named rows. Preview address/protocol/sample/stub belong to Standalone preview; preview themes belong to Theme. Remaining UI intake/text/browser-adapter files map to Projection, Banner, Theme or their named settings flow. No inventory file is excluded by this grouping.

Three stateless files are explicit in that mapping: `sheet/delete-confirmation.tsx` belongs to Navigation confirmation; `settings/settings-view.tsx` composes the three settings flow rows; `settings/room-copy-text.ts` belongs to settings status text under Theme/copy/adapters.

## Executed experiment

Location: throwaway worktree on `spike/ui-isolation-20261113`, based on `8c7a204`. Only its package/lock and `prototypes/ui-isolation` files changed; `git diff --name-only -- src` was empty. Main-worktree application dependencies and production source were unchanged.

Added two direct dev dependencies in that worktree: `storybook@10.6.7` and `@storybook/react-vite@10.6.7`. Registry metadata declares Vite 8 and React 19 compatible peers; the actual build used Vite 8.3.7 and React 19.3.1.

Run: `bun install --ignore-scripts`, then `bun run spike:ui:build`; serve `storybook-static` and open the iframe stories. A separate Storybook Vite config reused React, Tailwind, the `@` alias and the existing theme. It did not load the application's live-entry Vite configuration. No addons were required.

The import guard is configured to reject obr/mock adapters, the Owlbear SDK, `src/replica` and `ui/replica-client`; it did not fire, and no negative control ran. It is a denylist, not a general entry-module guard; live entries also fail here because `@/platform/current` has no alias. The manifest lists 46 emitted source modules, not every loaded module. Fable's independent runtime-import graph found 48 loaded modules (including format-version and json, not emitted) and no SDK/adapters/replica/client. Its separate built-JS search covered SDK strings only and found none. The story touches 26 of the 64 audited TS/TSX modules; this establishes sampled isolation, not purity or full-UI execution.

| Probe | Observation | What it proves / does not prove |
| --- | --- | --- |
| Direct imports | Real frame showed two sheet entries and two tabs; switching to combat displayed a dice cell; selecting the other sheet changed the header | Rendering and host-driven selection work outside a room; no navigation core was implemented |
| Registry lookup | The same three imported component references were used; the same view followed the same actions | Equal by construction. This probe cannot adjudicate H4; its verdict rests on the source audit |
| Editable field | After typing 15 and leaving the field, field-patch was logged; displayed text stayed 15 while pending; controlled not-allowed refusal returned it to 10 | Components mount and react to a refused promise outside a room. Displayed text alone does not independently prove the held-value mechanism |
| GM access panel | Controls mounted; checkbox logged acl-set; the same refused/not-allowed promise displayed the failure message | Port/store-level isolation only. The artificial fixture passes can-edit status alongside GM controls, unlike production |

Build exited 0. Output contained 31 files / 7,255,917 bytes. Warnings: Node module.register deprecation and a preview chunk over 500 kB. That is catalogue output, not a change to the production application bundle. Installation's total package count is not an incremental dependency count.

Fixture limits: successful settlement is not expressible without adding a record-update path, because SheetBody/Header use a static Map and AccessPanel uses a separate projection store; production uses shared records and AD-10 delta-before-answer ordering. Only refused/not-allowed ran, not answered, timed-out or too-large. The header combines can-edit status, GM controls and null editing, a state production never renders. Four contexts provide implicit inputs; MapSelectionContext used its default. The screenshot is this artificial fixture, not a production UI state. Browser observations are hand-recorded; the archive has no browser driver. Storybook does not typecheck, and prototypes are excluded from the project tsconfig.

No real roll, picker, settings, builder interaction, accessibility audit or full regression suite ran. The fixture's selection state is not a proposed navigation implementation.

## Practical outcome

Use Storybook as a candidate interactive catalogue, with direct imports and explicit fixtures. It can exercise current real modules without a live room today. Do not require every module to be moved to a new registry or every hook to disappear before this is useful.

Before adoption, compare the catalogue's maintenance cost with the existing preview and primitives fixture; that fit decision remains open. The scratch lockfile adds 180 package entries, including optional bindings and Babel packages, and re-hoists two existing transitive packages while preserving their prior nested versions. This count is a lockfile delta, not the installer total or a production bundle increase. Capability is supported; comparative fit is inconclusive. Keep flow tests headless and browser checks for actual DOM behavior.

## Evidence and validation

The companion HTML report includes the editable-panel screenshot, source archive, module manifest, observations and built Storybook. The archive contains the exact scratch inputs and lockfile; no source commit or production migration is claimed. Its reproducible baseline is `8c7a204`.

Original observation artifacts remain unchanged: their `reachableSourceModules: 46` means emitted modules, and `heldWhilePending` is an observed displayed value, not independent proof of a held-value mechanism. The corrected interpretation is the one stated in this document.

Claude Fable 5.2 first returned REVISE. It independently checked source citations, inventory, runtime-import graph, SDK strings in built JS, sizes/hash and raw-atom behavior; it did not rerun the build/browser/full suite/live room. Its delta validation returned ACCEPT on all B1-B5 corrections, with no remaining blockers. Both verdict files remain preserved. This validates the corrected research claims, not production navigation or Storybook adoption.

After that ACCEPT, its three nonblocking editorial notes were applied: H3-H5 falsification criteria restored in doc-1; built-JS search attributed only to SDK strings; three stateless files named in the mapping. No experiment or production source changed. ADR-0002 was not reopened. AD-26's WindowShell wording is a known stale pointer to reconcile when the shell is touched, not an unrequested production cleanup.

Official references: https://storybook.js.org/docs/get-started/frameworks/react-vite and https://storybook.js.org/docs/builders/vite. Both were read; markdown.new returned HTTP 403, so the official pages were fetched directly. Package peer compatibility was also read from registry.npmjs.org metadata for the exact installed version.
