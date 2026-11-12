# Verification review (format v3, sidebar and tabs): Muster Roll architecture spine

Checked on 2026-11-12 against the uncommitted `ARCHITECTURE-SPINE.md` (amended for preset format v3: required template `tabs`, GM-only tabs, a sidebar instead of the window tab bar), with the code at commit `6c8785b`. The spine was not edited.

Lens: every committed decision that this update touched must be checked against reality, not only stated. (1) Do the code locations and modules that the amended rules name exist, or are they clearly new? (2) Does react-aria-components 1.22.1, as installed, support what the spine and the UX documents rely on? (3) Do the Stack versions still match `package.json`?

## Verdict

**Pass with required changes.** The Stack table is exact. Every named module exists or is clearly new. React Aria supports a vertical tab list and a deeper drag-and-drop tree. Two rule gaps must be closed before the v3 build:

- **F1.** The tab visibility rule (AD-18) names views, `core/access` and rolls as its readers. The token menu and the open-sheet path also decide visibility, and today they call `templateShownTo` directly. CAP-35 needs them to hide repeat blocks on hidden tabs.
- **F2.** AD-18 locates a row by its first field id. A dice cell can sit in a row with no field, so a roll cannot find its tab that way. AD-13 relies on a "location" that the spine does not define.

F3 to F8 are smaller.

## Evidence used

| Source | Used for |
| --- | --- |
| `package.json`, `bun.lock` (resolved entries), `bun --version`, `tsconfig.json` | Stack |
| `src/ui/shell/{window-shell,tab-bar}.tsx`, `src/ui/sheet-tabs.ts`, `src/ui/main.tsx` | AD-26 frame, sidebar model |
| `src/preview/preview-page.tsx`, `src/builder/preview-pane.tsx`, `src/builder/structure-tree.tsx`, `src/builder/document.ts` | AD-21, AD-23, AD-25, AD-26 |
| `src/core/{format-version,storage-key,preset,access,visibility,sheets,token-links,dice-roll,ui-messages}.ts`, `src/replica/engine.ts` | AD-4, AD-12, AD-13, AD-18, Visibility convention |
| `src/ui/sheet/{preset-cell,preset-section}.tsx` | AD-23 data attributes |
| `.oxlintrc.json` | Whether any lint rule enforces AD-20 or AD-26 |
| `react-aria-components` 1.22.1, `react-aria` 3.53.1, `@react-types/shared` 3.37.0 under `/Users/seigiard/Projects/owlbear-muster-roll/node_modules` | Tabs orientation, Tree drag and drop |
| `SPEC.md`, `preset-format.md`, `EXPERIENCE.md`, `forged-idea.md`, `.memlog.md` diff, `GLOSSARY.md` | What the rules must serve |

This worktree has no `node_modules`. The package check used the main checkout. Its `package.json` is identical to this worktree's, and its `bun.lock` entry for `react-aria-components` is identical.

## 1. Named code locations

| Name in the spine or memlog | State | Evidence |
| --- | --- | --- |
| `src/ui/shell` | Exists | `window-shell.tsx`, `tab-bar.tsx` |
| `WindowShell` | Exists, and it is the frame today | `src/ui/shell/window-shell.tsx:28`, used at `src/ui/main.tsx:797` |
| `preview.html` / `src/preview/preview-page.tsx` | Exists | `preview.html` at the root. `SheetFrame` (`preview-page.tsx:189-230`) builds its own `Tabs` + `TabBar` + `CONTENT_CLASS` frame |
| Builder preview / `src/builder/preview-pane.tsx` | Exists | Builds its own `Tabs` + `TabBar` + `CONTENT_CLASS` frame (`preview-pane.tsx:107-140`) |
| Memlog claim "three hand-built frames" | **True** | The two frames above, plus `WindowShell` |
| `src/ui/sheet-tabs.ts` (`tabEntries`) | Exists. The memlog names `ui/sidebar-entries` as its successor | `sheet-tabs.ts:25`. It also holds `playerMayEdit` (`:73`) and reads `core/access` (`ownedSheetIds`) |
| `ui/sidebar-entries` | New | No file |
| `core/visibility` | Exists | `templateShownTo`, `sheetShownTo`, `visibleRecords`, `visibleSheets`, `rollShownTo` |
| `core/access` | Exists | `proposalAllowed`, `checkProposal` (`access.ts:139-195`) |
| `core/sheets` | Exists | `resolveSheet`, `sheetPolicy`, `sheetName` |
| `FORMAT_VERSION` in `src/core/format-version.ts` | Exists, value `2` | `format-version.ts:2`. AD-12 "the current `v` is 3" is a target. See F7 |
| `core/preset` locators | Exist, ready to take tabs | `plainRow`, `plainRowIdOf`, `repeatSectionById` take a `TemplateLayout = Pick<Template, 'sections'>` (`preset.ts:148, 316-339`) |
| Id scope "unique in their template scope" (AD-18) | **True today** | All non-repeat fields of a template are one scope, and repeat section ids are unique per template (`preset.ts:451, 484`). `preset-format.md:92` keeps the sheet scope "across all its tabs" |
| `presetProblems`, `parsePresetFile`, `formatPresetFile` | Exist | `preset.ts:196, 267, 388` |
| `fromPreset`, `toPreset`, `apply` | Exist | `document.ts:80, 90`, `builder-store.ts:92` |
| `CellPreviewContext`, `data-cell`, `data-section-index`, `data-row-index` | Exist. `data-tab-index` is new | `preset-cell.tsx:75, 106`, `preset-section.tsx:149-439` |
| Roll `hidden` computed once | Exists | `engine.ts:1831-1856`, from `policy.hidden` |
| Roll request location | Exists without a tab | `dicePlaceSchema` = `{ sectionIndex, rowIndex, cellIndex, instanceId }` (`dice-roll.ts:34`), carried by `roll-request` (`ui-messages.ts:398`) |

## 2. react-aria-components 1.22.1

| Need | Source of the need | Result | Evidence |
| --- | --- | --- | --- |
| Vertical tab list for the sidebar | `EXPERIENCE.md:153` | **Confirmed** | `AriaTabListProps.orientation?: Orientation`, default `horizontal` (`react-aria/dist/types/src/tabs/useTabList.d.ts`). `TabsProps` extends it (`react-aria-components/dist/types/src/Tabs.d.ts:8`). `useTabList` sets `aria-orientation` (`react-aria/dist/private/tabs/useTabList.mjs:58`) |
| `Up` and `Down` move in the sidebar | `EXPERIENCE.md:153` | **Confirmed** | `TabsKeyboardDelegate.getKeyAbove/getKeyBelow` return `null` only for horizontal (`react-aria/dist/private/tabs/TabsKeyboardDelegate.mjs:41-48`). `Left` and `Right` also still move in a vertical list |
| Group headings and dividers in the tab list, a heading that "names its group for a screen reader" | `EXPERIENCE.md:153` | **Not supported as a list feature** | The Tabs export has `Tabs`, `TabList`, `TabPanels`, `TabPanel`, `Tab`, `TabsContext`, `TabListStateContext`, `SelectionIndicator` only (`exports/Tabs.d.ts:2-7`). `private/Tabs.mjs` has no section or header node. An ARIA `tablist` owns only `tab` elements. See F3 |
| Buttons ("+ Добавить") among the tabs | `EXPERIENCE.md:101, 153` | Works with the current workaround | `tab-bar.tsx:66-130`: a `display: contents` `TabList` with buttons outside it, placed by flex `order` |
| `Tree` with `useDragAndDrop` and `onMove` | AD-25 | **Confirmed** | `TreeProps.dragAndDropHooks` (`Tree.d.ts:82`). `DragAndDropOptions` extends `DroppableCollectionProps`, which has `onMove` and `getDropOperation` (`@react-types/shared/src/dnd.d.ts:238, 264`) |
| A new node level (tab between template and section) | AD-21, AD-25 | **Confirmed** | `Tree` nests to any depth. `structure-tree.tsx:56-123` already gives each kind its own drag type (`MOVABLE_KINDS`, `:61`) and checks drops in `getDropOperation`. A tab level is one more kind and one more container rule |

Not run: nested `Tabs` (the tab row inside a sidebar `TabPanel`). Each `Tabs` provides its own `TabsContext`, so no conflict is expected, but no build or test checked it.

## 3. Stack

All 24 versioned package rows match the `package.json` pins and the resolved `bun.lock` entries exactly. `bun --version` is 1.4.4, which matches `packageManager`. "Node 22.12 or later" matches `engines.node: >=22.12.0`. `skipLibCheck: true` is in `tsconfig.json:10`. The installed `react-aria-components` is 1.22.1.

Information only, as in the TASK-41 review: the table leaves out `fast-check` 4.10.2, `@oxlint/plugins` 1.93.0 and `@types/bun` 1.4.4. No rule depends on them.

## 4. Findings

### F1 — medium: the token menu and the open-sheet path are not readers of the tab rule

AD-18 "Rule, tabs" says "Views, `core/access` and rolls take a tab's visibility only from this rule". CAP-35 also needs "players get no token menu on its linkable repeat blocks". Three paths decide that today, and each reads template visibility only:

- `core/token-links.ts:285` (`openEntry`, the "Открыть лист" filter) and `:247` (`openTarget`) call `templateShownTo`.
- `replica/engine.ts:667` (`openTargetShown`) calls `sheetShownTo`.
- `core/visibility.ts:76` (`visibleRecords`, `link:` branch) calls `templateShownTo`.

The Visibility convention now says a player sees "live links ... to repeat blocks on visible tabs", which covers the last path. The first two are not views, so the convention does not clearly bind them. The CAP-35 row in the map names neither AD-19 nor `core/token-links`.

*Fix:* in AD-18 "Rule, tabs", add the token menu and open-sheet requests to the readers. Add AD-19 and `core/token-links` to the CAP-35 row.

### F2 — medium: AD-18 cannot locate the tab of a dice cell in a row with no field

AD-18 locates "a row by its first field id, and a repeat section by its id". AD-2 says "Rows with no field have no record". A row with only labels and a dice cell has no first field id, so this rule cannot find its tab. AD-13 says `hidden` comes from "the tab that holds the dice cell's row" and that "the roll request names the cell's location", but no rule defines that location. Today the location is `dicePlaceSchema` (`dice-roll.ts:34`): a section index over the template's sections, a row index, a cell index and an instance id, with no tab.

*Fix:* in AD-18, add that a place (tab, section, row and cell index) gives its tab directly. In AD-13, say the roll request's place holds the tab index.

### F3 — medium (UX document): the sidebar's group headings have no React Aria support

`EXPERIENCE.md:153` makes the sidebar "a vertical react-aria tab list" in which "a group heading names its group for a screen reader". In 1.22.1, `TabList` has no section or header node, and an ARIA `tablist` may own only tabs. Headings, dividers and "+ Добавить" must sit outside the list, as `tab-bar.tsx` does with "+" today. Then nothing ties a heading to its tabs for a screen reader. Vertical orientation and `Up`/`Down` are confirmed.

*Fix:* in `EXPERIENCE.md`, state the mechanism. For example, each tab's accessible description names its group through `aria-describedby` on the heading, and the headings and dividers stay outside the `TabList` with the `display: contents` and `order` layout of `tab-bar.tsx`. Another option: drop the screen-reader claim.

### F4 — low: AD-26 collides with AD-20's import list for the builder

The builder preview draws the sidebar "in preset order, as in the window" (`EXPERIENCE.md:295`). AD-26 says only `ui/sidebar-entries` orders the sidebar. AD-20 lets `src/builder` import only "the sheet, shell, primitive, theme and copy modules of `src/ui`". The memlog puts `sidebar-entries` at the `src/ui` top level (as `sheet-tabs.ts` is), so the builder could not import it. No lint rule enforces AD-20 (`.oxlintrc.json` restricts only the SDK and the adapters). AD-20's list is also out of date already: the builder imports `@/ui/download`, `@/ui/preset-errors` and `@/preview/{themes,stub-rolling}`.

*Fix:* put the sidebar model under `src/ui/shell`, or add `sidebar-entries` to AD-20's list. Update AD-20 for the imports it already has.

### F5 — low: AD-26 does not name its frame or its inputs fully

- AD-26 says `src/ui/shell` "owns one frame component" and that "`WindowShell` ... render[s] through it". `WindowShell` is the frame in `src/ui/shell` today. The rule does not say if the frame is new and `WindowShell` becomes a consumer, or if `WindowShell` becomes the frame.
- The navigation model lists sidebar entries, tabs, the selected sheet and tab, and the content. It does not name Settings at the bottom, the "+" actions (absent in the builder preview), or the selection mark (CAP-32).
- "Only `ui/sidebar-entries` groups and orders the sidebar, from `core/visibility` and `core/sheets`" leaves out `core/access`. Own sheets first needs `ownedSheetIds`, as `sheet-tabs.ts:49` does today.
- Only the memlog says `sheet-tabs.ts` goes away. The spine does not, and it does not say where `playerMayEdit` (`sheet-tabs.ts:73`) moves.

*Fix:* name the frame component and its file. Say `sheet-tabs.ts` is replaced. Add Settings, actions and the selection mark to the model, and `core/access` to the inputs.

### F6 — low: GLOSSARY.md still uses "tab" for a sheet

`GLOSSARY.md` has no **Tab** or **Sidebar entry** term. Line 46 says the name field names each sheet "on its tab", and line 156 puts the selection mark "on a tab". The spine and `preset-format.md:15` retire that meaning. The project rule puts a new or changed term in the glossary in the same commit.

*Fix:* add **Tab** and **Sidebar entry** to the glossary, and reword lines 46 and 156, in the first v3 commit.

### F7 — information: AD-12 "the current `v` is 3" is a target

`FORMAT_VERSION` is `2` (`format-version.ts:2`). One constant drives the message schemas, the snapshot and file codecs, and the storage prefix `mr{v}` (`storage-key.ts:8`). After the bump, an adopting GM client deletes the room's `mr2:` keys (`storage-key.ts:96-104`, AD-9). This matches the no-migration decision in `SPEC.md:143` and `preset-format.md:156`. No change needed.

### F8 — information: the Structural Seed omits the pages AD-26 names

AD-26 names `preview.html`, but the Structural Seed lists only `index.html`, `builder.html` and `background.html`, and the layer table has no `src/preview`. `picker.html` is missing too.

*Fix:* add `preview.html`, `picker.html` and `src/preview` to the seed, with a note that `src/preview` is dev-only.

## 5. Claims that held

- AD-14: tabs never enter a record key. True: `row:` and `rep:` keys use field ids only (AD-2), and the id scope is the template, not the tab (`preset.ts:451`).
- AD-4: `core/access` judges one record against the template layout (`proposalJudgement`). A tab check fits there and in `src/replica/pending-edits` through `core/access`.
- AD-13: `hidden` is computed in one place (`engine.ts:1831`), so a tab-aware value changes one function.
- AD-21, AD-22, AD-23, AD-25: the document, problem paths, data attributes and drag kinds are all index- and kind-based today, so a tab level extends each one without a new mechanism.
