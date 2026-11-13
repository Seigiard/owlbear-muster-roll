# Adversary review — preset format v3 spine update (tabs, sidebar, one frame)

Reviewed: `ARCHITECTURE-SPINE.md` (status final, updated 2026-11-12, uncommitted amendment), against `SPEC.md` (CAP-33, CAP-34, CAP-35) and the "Tabs" section of `preset-format.md`. Focus: AD-4, AD-12, AD-13, AD-14, AD-18 ("Rule, tabs"), AD-21, AD-22, AD-23, AD-25, AD-26, the Visibility and Sheet names conventions and the capability map.

## Verdict

**Revise.** The model is sound: tabs never enter a record key (AD-14), so replication, merge, snapshot and the upload diff stay untouched. But the amendment adds a new coordinate (the tab) and a new visibility level without naming one owner for either. Two units can each obey every AD and still:

- roll the wrong dice cell and send a GM-only tab's roll to every player (finding 1);
- show a player "Без имени" for a sheet whose name field sits on a hidden tab, while the roll names it (finding 2);
- offer a player an editable name that the GM always refuses (finding 3);
- give a player "Открыть лист" on a token linked to a repeat block on a hidden tab, and open that tab (finding 4).

Each fix is one or two sentences of AD text. None changes the paradigm.

## Method

- For each amended AD I built two units one level down and designed each from the AD text alone. A pair counts as a hole when both units obey every AD and still clash.
- I read the current code to see which seams the v3 rewrite will cut: `src/core/sheets.ts`, `src/core/visibility.ts`, `src/core/access.ts`, `src/core/dice-roll.ts`, `src/core/preset.ts`, `src/core/token-links.ts`, `src/core/storage-key.ts`, `src/replica/engine.ts` (projection near line 560, open path near line 660, roll path near line 1830), `src/ui/sheet-tabs.ts`, `src/ui/shell/`, `src/preview/preview-page.tsx`. Where today's code shows the natural migration path, the finding cites it.
- Pairs that hold are listed at the end.

## Findings

| # | Pair | Kind | ADs | Severity |
| --- | --- | --- | --- | --- |
| 1 | Window dice button vs replica roll path (`prepareDiceRoll`) | Clashing coordinate shape | 13, 18, 22, 23, 24 | Critical |
| 2 | `core/visibility` record filter vs sidebar entries and Sheet names | Clashing shared data | 18, 26, Visibility, Sheet names | High |
| 3 | Sheet header name input vs `core/access` | Two owners of one decision | 4, 18, 26 | High |
| 4 | `core/token-links` and the open path vs `core/visibility` link filter | Two owners of one decision | 18, 19, Visibility | High |
| 5 | Window chosen-tab state vs the frame's tab list | Clashing identity, hidden tab leak | 18, 26 | Medium |
| 6 | Builder store selection vs builder preview tab state | Two owners of one decision | 21, 23, 26 | Medium |
| 7 | Builder draft with no tab vs the preset structure schema | Lost draft | 21, 22 | Medium |
| 8 | AD-11 storage key `mr2` vs AD-12 `v: 3` | Conflicting paths | 11, 12 | Medium |
| 9 | Player roll on a hidden tab vs the GM forged-roll rule | Unstated refusal | 13 | Low |
| 10 | `ui/sidebar-entries` vs `core/access` owned-first order | Two orderers | 26, Visibility | Low |
| 11 | Builder tree for a one-tab template vs AD-25 drop rule | Unreachable drop | 23, 25 | Low |

---

### 1. A dice cell has no single address

**Unit A: the window's dice button and the builder preview.** AD-23 fixes the cell address as `data-cell="{tab}.{section}.{row}.{cell}"`, and AD-22 fixes the problem path as `(template, tab, section, row, cell)`. Both use a section index inside its tab. The window, built from the same `SheetBody`, sends a roll request with `{ tabIndex, sectionIndex, rowIndex, cellIndex, instanceId }`, section index inside the tab. AD-13 asks only that "the roll request names the cell's location".

**Unit B: the replica roll path.** Today `prepareDiceRoll` (`src/core/dice-roll.ts:89`) reads `layout.sections[place.sectionIndex]`, with `TemplateLayout = Pick<Template, 'sections'>`, and `resolveFieldReference` takes `TemplateRowPlace = { sectionIndex, rowIndex }`. The cheapest v3 port keeps both and passes a flattened layout, `{ sections: template.tabs.flatMap(tab => tab.sections) }`. That is correct for formula scope, because "ids resolve ... in the sheet, across all its tabs". AD-13 then computes `hidden` "from the tab that holds the dice cell's row". AD-18 cannot help: it "locates a row by its first field id", but a row of only labels and dice cells has no field and no `rowId` (AD-2). So unit B maps its flat index back to a tab by counting.

**Clash.** For any dice cell on tab 2 or later, A's tab-relative `sectionIndex` lands on a section of tab 1 in B's flat list. B rolls another cell, or answers `not-dice`. Worse, B takes `hidden` from the tab that holds the wrong cell. A roll from a GM-only tab can go out with `hidden: false` and target `everyone` (CAP-35 broken). The same split breaks AD-24: the builder calls `formula-rename` and `resolveFieldReference` with tab-relative places, and core reads them as flat ones, so a rename rewrites formulas in the wrong rows.

**Fix (AD-18, AD-13).** Add to AD-18 "Rule, tabs": "A cell's location is `{ tab, section, row, cell }`: the index in the template's `tabs`, the section index inside that tab, the row and the cell. The roll request, `data-cell`, problem paths and `resolveFieldReference` use this one shape, and one `core` function resolves it to the tab, the section and the cell." In AD-13 replace "The roll request names the cell's location" with "The roll request names the cell by its AD-18 location and, in a repeat section, its `instanceId`. `hidden` is the AD-18 visibility of the tab that location resolves to."

---

### 2. Records of a hidden tab: in the player's projection or not

**Unit A: `core/visibility`.** The Visibility convention now reads "A player sees the preset, the sheets of visible templates with their dependents, their visible tabs, and live links to visible sheets and to repeat blocks on visible tabs." The engine builds every player projection through `visibleRecords` (`engine.ts:569`, `:879`, `:910`). A careful implementer reads "their visible tabs" as a record rule and drops the `row:` and `rep:` records whose row or section sits on a hidden tab, as it already drops links to repeat blocks on hidden tabs.

**Unit B: `ui/sidebar-entries`, the sheet header and the token label.** They name a sheet through the one `core` function, `sheetName(records, preset, sheetId)`, which reads the name field's `row:` record from the records it gets. In the window those are the projection.

**Clash.** SPEC: "A sheet set's name field may sit on any tab, a hidden one included. The sheet's name still shows in the sidebar." With A's reading, a player's sidebar and header show the fallback label, while the roll message, named by the replica from the full view (`engine.ts:1858`), shows the real name. The same holds for a repeat block named by its first field. Both units obey the letter.

**Fix (Visibility convention).** "`core/visibility` filters records by template only: a player's projection keeps the `row:` and `rep:` records of hidden tabs, because hiding is at the interface only. A hidden tab is dropped from the tab list and its content is not drawn. Links are the one record form filtered by tab: a link to a repeat block on a hidden tab is dropped." The second sentence of the Sheet names convention then needs no change.

---

### 3. A name field on a hidden tab: editable in the header, refused by access

**Unit A: the sheet header.** AD-26 puts the sheet header outside the tab row and the content area, so it shows whatever tab is open. Today `SheetHeader` draws the name as an input whenever `nameField !== null && editing !== null` (`src/ui/sheet/sheet-header.tsx:93`), and the window passes `editing` for a player with a live `acl:`. `preset-format.md` says of the name field: "It may sit on any tab. Anyone with write access may edit it."

**Unit B: `core/access`.** AD-4 now passes a `row:` record "only on a sheet of a visible template whose row or repeat section is on a visible tab". The player's own pre-check in `pending-edits` runs the same check (`proposalAllowed`).

**Clash.** A player who owns a sheet whose name field sits on a GM-only tab sees an editable name in the header. Every rename is dropped at the pre-check, or denied by the GM, with the denied notice. Each unit obeys its rule. The spec itself disagrees: SPEC line 193 refuses any player edit on a hidden tab, and `preset-format.md` lets anyone with write access edit the name field.

**Fix (AD-4).** "Whether a player may edit one field is one predicate in `core/access`, the same one the GM runs: the sheet's write rule, the player's `acl:`, and the tab visibility of the field's row. The header's name input, the sheet's inputs and the repeat block tools read it." The owner also picks one answer for the spec. The likely one: a name field on a hidden tab is read-only for players, so `preset-format.md` changes to "Anyone with write access may edit it on a visible tab".

---

### 4. Token menu and open path keep a template-level check

**Unit A: `core/visibility`.** Per the Visibility convention it drops, for a player, a link to a repeat block on a hidden tab.

**Unit B: `core/token-links` and the replica open path.** AD-18 "Rule, tabs" binds only "Views, `core/access` and rolls". The token menu is none of those: it is built in the background from the full replica (`src/replica/token-menu.ts`). Today `openEntry` and `openTarget` (`src/core/token-links.ts:247`, `:285`) and `openTargetShown` (`engine.ts:665`) check only `templateShownTo(role, policy.template)`. AD-19 says nothing about tabs. So unit B, unchanged, obeys every AD.

**Clash.** A player gets "Открыть лист" on a token linked to a repeat block on a GM-only tab, which CAP-35 forbids. The replica then delivers `open-sheet` with that `instanceId`. The window, following CAP-14 ("opens the sheet on the tab that holds it"), selects the hidden tab (see finding 5 for what it then draws). Meanwhile the window's projection has no such link, so selection marks and the token menu disagree.

**Fix (AD-18, AD-19).** In AD-18 "Rule, tabs" replace the last sentence with: "Whether a role sees a sheet, a tab or a link target is one `core/visibility` function. Views, `core/access`, rolls, the token menu, the open request and selection marks read it." In AD-19 add: "A role sees a link only while that function shows its target: the template for a sheet link, and also the section's tab for a repeat block link."

---

### 5. Which tab is open, and is it allowed

**Unit A: the window's chosen-tab state.** AD-26 makes the chosen tab "client UI state" and gives the frame "the tabs of the open sheet, the selected sheet and tab". Tabs have no id, and `title` is optional and not unique. A natural key is the position in the list the window drew, which for a player is the list of visible tabs.

**Unit B: the open path, the builder and the preview.** They address a tab by its index in the template's full `tabs` list: AD-23 `data-tab-index`, AD-22 paths, and the tab of a repeat block found by its section id (AD-18).

**Clash.** On a template whose first tab is GM-only, a player's visible tab 0 is template tab 1. An `open-sheet` that resolves to template tab 1 selects the player's second visible tab, or nothing. After an upload that hides or removes a tab, or after a role change (AD-5), a kept index can point at a now-hidden tab. If the window draws content for the chosen index without checking it again, a player sees a GM-only tab.

**Fix (AD-26).** "A tab is addressed by its index in the template's `tabs`. The frame gets only the tabs `core/visibility` shows, each with that index. One function picks the open tab from the chosen one: the chosen tab while the role sees it, else the first tab the role sees, else none. It runs on every projection, preset and role change, and the content area draws only its result."

---

### 6. The builder preview has two tab owners

**Unit A: the builder store.** AD-21 owns the selection. AD-23 says "A click on a tab selects the tab". A tree click on a cell selects that cell's uid.

**Unit B: the builder preview through the AD-26 frame.** AD-26: "The chosen tab of each sheet is client UI state". AD-23: "with every tab shown". One implementer reads that as every tab listed in the tab row, one shown at a time. Another reads it as every tab's content stacked, so marks on every tab stay visible.

**Clash.** With A plus the first reading of B, the GM selects a cell on tab 3 in the tree while the preview shows tab 1. The selection mark and the problem mark sit on an undrawn tab. With the second reading the preview no longer looks like the window, which AD-23 exists to prevent. `preview.html` has the same gap: the code calls it "as a player sees it", and AD-23 says "every tab shown" only for the builder preview.

**Fix (AD-23).** "The builder preview and `preview.html` list every tab, hidden ones included, and show one at a time. In the builder preview the shown tab follows the store selection: the tab that holds the selected item, else the tab shown before. A click on a tab selects that tab."

---

### 7. A draft with no tab is dropped on reload

**Unit A: `core/preset`.** "Every template has a list of at least one tab", so the file schema takes `tabs: z.array(tabSchema).min(1)` inside `templateSchema`. Today `presetStructureSchema` (`src/core/preset.ts:125`) widens only the top-level `templates` and `window`, and reuses `templateSchema` as is.

**Unit B: the builder.** AD-22 lets the builder produce "a template with no tabs (at the template)" as a problem. AD-21 writes the draft after every change, and drops a draft "that fails the preset structure schema" on load.

**Clash.** A GM removes the last tab of a template to rebuild it, then reloads the page. The draft fails the structure schema, and the whole draft is gone, not only that template.

**Fix (AD-21).** "The structure schema accepts a template with no tabs, a tab with no sections and a preset with no templates. Only `parsePresetFile` refuses them."

---

### 8. Storage key format still says `mr2`

**Unit A: the storage writer, read from AD-11.** AD-11 still reads `mr2:{roomId}:{n}:{a}:{k}` "where `2` is the format version", and "No migration from `mr1` exists".

**Unit B: the room copy reader, read from AD-12.** "The current `v` is 3 ... No migration from `v: 1` or `v: 2` exists". Today `STORAGE_FORMAT = mr${FORMAT_VERSION}` (`src/core/storage-key.ts:8`), so the code would move to `mr3`.

**Clash.** An implementer who follows AD-11 literally keeps `mr2`. A GM client then loads its v2 records, a v2 `preset` among them, as current (AD-7 step one merges persisted records first), while the snapshot reader refuses the same data as older format. The room holds a preset no client decodes, so players see nothing and the GM gets no "older format" path to a wipe.

**Fix (AD-11).** "A GM client persists a record under `mr{v}:{roomId}:{n}:{a}:{k}`, where `v` is the AD-12 version. No migration from `mr1` or `mr2` exists; their keys are deleted by a wipe (AD-9)."

---

### 9. A player's roll on a hidden tab

AD-13 makes a player show only `hidden: false` and makes a GM client treat a player's `hidden: true` roll as forged. It does not say that a player's replica refuses such a request. Today the refusal follows from `rollShownTo(role, policy.hidden)` (`engine.ts:1838`), which is template-level. A port that adds a separate tab check for `hidden` and keeps the template-level refusal sends a `hidden: true` roll from a player when a stale window rolls just after an upload hid the tab. The roll also goes to the dice extension as `gm_only` from a player client. **Fix (AD-13):** "A player's replica refuses a roll request whose `hidden` is true and sends nothing."

### 10. Two orderers of the sidebar

AD-26 says only `ui/sidebar-entries` groups and orders the sidebar "from `core/visibility` and `core/sheets`". The owner-first order lives in `core/access` (`ownedFirst`, `ownedSheetIds`), and `preset-format.md` puts a player's own sheets first *in their group*. Today `tabEntries` (`src/ui/sheet-tabs.ts:62`) moves owned sheets ahead of every entry. A port that keeps it obeys AD-26 and breaks the groups. **Fix (AD-26):** "... from `core/visibility`, `core/sheets` and `core/access` ownership; owned sheets come first inside their group."

### 11. The tree may hide a one-tab template's tab

The window draws no tab row for a one-tab template, and that tab may have no title. A tree implementer can mirror that and hide the tab node. AD-25 accepts a section only "into a tab", so such a template accepts no section drop. **Fix (AD-25):** "The tree shows every tab node, an untitled single tab included."

---

## Pairs that hold

- **Upload diff vs record keys.** AD-14 keeps tabs out of keys, and the diff matches by field id across the template. A section moved between tabs keeps `rep:` keys and links. A removed tab's fields count as removed only when no other tab holds the id.
- **`core/access` vs the AD-18 locator for player edits.** Every `row:` key has a field (`rowId`) and every `rep:` key a section id. Both are unique in the template, so access finds the tab without a cell location. Only the roll path needs finding 1.
- **Builder document vs `toPreset` vs the parser.** AD-21 nests tab under template and section under tab, the same as the file. AD-22 paths add the tab index in the same place. The shapes match.
- **Visible template whose every tab is hidden.** The sidebar lists its sheets (template-level), the frame gets an empty tab list, and access denies every field. No unit disagrees, once finding 5 says what "none" draws.
- **Wire version.** `v: 3` covers messages, snapshot and file together through one constant. A v2 client drops v3 messages and asks for a reload. Only the storage key wording (finding 8) lags.
- **Chosen tab outside records.** AD-26 keeps it out of records, messages and snapshots, so no merge or digest sees it.
