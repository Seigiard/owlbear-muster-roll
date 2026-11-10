# Spine Pair Review — Muster Roll

## Overall verdict

**Revise before stories.** The shell, the tab model, the token system and the document shape are sound, and the pair has almost no bloat. A builder cannot yet build from it without product decisions in five areas: the first paint before data arrives, snapshot import, the name of a sheet, the mapping of preset cells to the screen, and the status of a player who is not "owner with edit".

Severity counts: 0 critical, 10 high, 23 medium, 11 low. Severity is the harm to a builder. The owner decided that the preset defines all sheet and NPC arrangement, so this review does not report a missing stat layout. Where the spine imposes an arrangement, this review reports that as a conflict with that decision.

Checks that ran as scripts: every `{path.to.token}` reference, every `sources` path, every reference to `imports/` and `mockups/`, and the contrast of the fallback hex values.

## 1. Flow coverage — thin

Checked: all 16 capabilities in `SPEC.md` against the six Key Flows. Every capability appears in a flow header. All six flows have a named protagonist, numbered steps and a climax. Four citations have no matching step, and four flows have no failure path.

### Findings

- **high** A sheet has no naming surface. Flow "Oleg prepares the campaign" step 2 says "fills in the first character". Flow "ten skeletons" step 1 creates "Скелет 1" with "+ NPC". The Character header row says only "Name always", and the NPC block row says "Header with name". No row says what "+" creates, what default name it gives, or how the GM changes a name. AD-2 stores `name` on the `sheet:` record and allows only a GM to write it. The tab label, the numbered copy names (CAP-16) and the token picker all depend on this name. `mockups/shell.html` also shows a preset field "Имя" that mirrors the header, so a builder cannot tell whether the two values are one value. *Fix:* add one rule for each of these: the default name on create, the place to edit the name (for example, the header name is a Field value for the GM), and the statement that the sheet name is separate from preset fields.
- **high** CAP-13 "the GM sees their count" has no surface. Flow "Oleg protects and moves the room" and the Voice row "Import" do not mention dropped values. AD-9 computes the count before the confirmation, so the data is available. The Import copy also does not warn that owners and rights reset, and the GM learns this only after the action. *Fix:* add `{count}` to the Import confirmation when it is above zero, and add one clause about the reset of owners and rights.
- **high** The import flow breaks on "another computer". Step 3 of "Oleg protects and moves the room" imports a snapshot on a new computer. The export file holds values and token links, and no preset (`storage-and-sync.md`, AD-9 "Scope"). AD-9 validates the file against the current preset. The flow starts because the room copy did not fit, so the new computer has no preset and no room copy. The state "No preset" offers only "Загрузить пресет". It also says "Tabs are hidden" and does not say if the gear stays. The mock keeps the gear but renders the empty state for it, so Settings is unreachable there. *Fix:* add the preset upload as a step, state that the gear and Settings stay available with no preset, and say what "Загрузить снимок" does with no preset (disable it with a reason, or refuse with a message).
- **medium** Four capability citations have no step behind them. CAP-5 (flow 1), CAP-7 and CAP-11 (flow 3), and the export half of CAP-12 (flow 1). Flow 4 begins with "Oleg edits the file" and no flow downloads it. *Fix:* add the step, or remove the citation and point to the Component Pattern or State Pattern row that covers it.
- **medium** Four flows have no failure path where one applies. "Ten skeletons": a bad formula on the attack roll. "Changes the preset": an invalid file, and the GM cancels the confirmation. "Protects and moves the room": an invalid or newer file. "Players read with no GM": the room has no snapshot. *Fix:* add one line to each, and point to the state rows that section 4 asks for.
- **low** Flow 1 is titled "prepares" but step 3 needs Liza in the room, because the Access panel lists only present players and players who already hold rights. This is correct for the data model. The flow should say that Liza has already joined.

## 2. Token completeness — thin

Checked: 51 references, 26 unique, in `DESIGN.md`. All resolve, and `{spacing.3}` resolves to the quoted key `'3'`. `EXPERIENCE.md` has no token references, so it has nothing to resolve. Its `{count}` and `{field}` are copy placeholders. Each colour has a hex value. No light value exists.

### Findings

- **high** Five tokens have no runtime source and no light value: `{colors.warning-surface}`, `{colors.warning-text}`, `{colors.danger-surface}`, `{colors.danger-text}` and `{colors.line}`. The Colors table omits them. The only rule is "Keep the same hue in light mode". The Accessibility Floor requires 4.5:1 "in both Owlbear themes". A Pending value uses `{colors.warning-text}` directly on the page surface, and that is about 1.35:1 on white. This value is the only sign that a player's edit has not applied. The rubric rates a missing light pair as critical. This review rates it high because a dark-theme build still works and the fix is small. *Fix:* add light values for these five tokens, with a `-light` suffix, or derive them from the theme mode and state the formula.
- **medium** `{colors.surface-bar}`, `{colors.surface-tab}` and `{colors.surface-stripe}` are "Tints of `theme.background.default`". The document gives no amount and no direction per theme. Two builders will produce two palettes, and nobody can check the 4.5:1 floor. *Fix:* state the mix, for example with `color-mix` percentages per `theme.mode`.
- **medium** `{colors.line}` on `{colors.surface}` is 1.43:1. The dotted underline in this colour is the only sign that a value can be edited, and tablets have no hover. The mock uses `#777`, which is 2.82:1. *Fix:* use a stronger token for this underline, at 3:1 or more.
- **medium** `{colors.text-muted}` is 4.43:1 on `{colors.surface}` and 3.99:1 on `{colors.surface-tab}`. Both are below the floor. No component rule uses this token, so a builder does not know where it applies. *Fix:* assign it to named uses and lighten the fallback.
- **low** Seven tokens have no use anywhere: `{rounded.lg}`, `{spacing.1}`, `{spacing.2}`, `{spacing.4}`, `{typography.sheet-title}`, `{components.button-primary}` and `{components.button-secondary}`. *Fix:* assign them in the Components table (section 3), or delete them.

## 3. Component coverage — thin

Checked: each component name in both files.

| Name | DESIGN.md Components | EXPERIENCE.md Component Patterns |
| --- | --- | --- |
| Tab bar / Tab | Tab | Tab bar (name differs) |
| Character header | Missing | Present |
| Access panel | Missing | Present |
| Field value / Field row | Field row | Field value (name differs) |
| Pending value | Present | Missing (State Patterns only) |
| Repeat row | Missing | Present |
| Section | Present | Missing |
| Chip | Present | Missing (mentioned in Character header) |
| Dice button | Present | Present |
| Roll result | Not needed, Owlbear renders it | Present |
| NPC block | Missing | Present |
| Make copies | Missing | Present |
| Status banner | Present | Present |
| Confirmation | Missing | Present |
| Link picker | Missing | Present |
| Token menu | Not needed, Owlbear renders it | Missing (IA only) |
| Settings body | Missing | Missing (IA only) |
| Empty state, "⋯" menu, buttons | Missing (buttons have tokens only) | Missing |

### Findings

- **high** The Token menu has no behavior row, and an owner decision is missing. `.memlog.md` line 20 records that players see "Открыть лист" only on tokens linked to a character, so an NPC token shows them nothing. `EXPERIENCE.md` does not say this. Without it, a builder can show a menu item that does nothing. These are also undefined: which items the GM sees on a linked token, how the GM removes or replaces a link, what a click on the token status chip does, and whether a sheet can have many tokens. The data model allows many tokens per sheet, and the Link picker lists sheets that already have a token. *Fix:* add a Token menu row with a matrix of role, link state and items, and state the rule for replace, remove and many tokens.
- **high** The spine has no contract for preset cells, and it contradicts the owner's layout decision. `preset-format.md` has three cell kinds: `text`, `field` and `dice`. `DESIGN.md` "Field row" fixes "Label left, value right". That is a hard-coded arrangement, and a row can hold several values in a `columns` grid. The Accessibility Floor requires a name "from its preset label", but a `field` has only a type and an id in the format. A label is a separate `text` cell. Inline flow (a section with no `columns`) has no visual rule. A `text` cell has no component at all. *Fix:* define the mapping per cell kind, define the source of the accessible name (for example, the nearest preceding `text` cell in the row, or a new `label` key that architecture adds), and scope "Label left, value right" to the two-cell row.
- **medium** Field value has one rule for three field types. Undefined: whether a `check` toggles and saves on one click, how a read-only `check` looks, what happens with non-numeric input in a `number` field (AD-2 stores a JSON number), and how an empty value looks and accepts a click. "`Enter` commits a text or number field" also blocks line breaks, and DummySheet, the named reference, has a multi-line notes block. AD-12 refuses an oversized record "at input with an error", and no surface shows that error. *Fix:* add one row per field type, and state if `text` is single-line.
- **medium** Settings has no behavior rows. The IA lists "Preset and room snapshot import and export, room copy status". The grouping, the status wording, the size meter and the preset summary exist only in the mock. Nothing says where the notice "Формат листов изменён." appears. Nothing says what "Скачать пресет" and "Скачать снимок" do with no preset. *Fix:* add a Settings row with its sections, its status values and the place of each result message.
- **medium** Roll result has no template, although rolls are the climax of two flows. Voice and Tone has no entry for it. The mock shows the character name, but CAP-6 requires the roller's name. With ten skeletons, the GM also needs the NPC name. Roll-under needs a form for success or failure. *Fix:* add a template with the roller, the sheet, the dice cell, the result and the outcome, and align the `name` field of AD-13 to it.
- **medium** The Access panel has gaps. A radio group cannot be cleared, so a GM cannot remove an owner. The empty list is not defined. `getPlayers` lists other GM connections and can list one player many times, so the list needs a filter. A guest in a new browser has a new id and appears as a second row with the same name. The mock's guest warning is not in the spine. *Fix:* add a "no owner" option, an empty line, a rule for filtering and duplicates, and the warning text.
- **medium** The Tab bar rules are incomplete. `.memlog.md` line 14 says the arrow in the sketch is the scroll affordance, and the spine says only "scroll horizontally". A laptop mouse with no horizontal wheel has no way to reach hidden tabs. Nothing makes the active tab scroll into view when a token opens it. The "+" button sits among the tabs but is not a tab, which a react-aria `TabList` does not allow directly. *Fix:* state the affordance, the scroll-into-view rule, and that "+" is outside the `TabList` for roles.
- **medium** Interactive visual states and control sizes are missing from `DESIGN.md`. It has no focus, pressed or disabled rule, and the Accessibility Floor requires visible focus. The mock sets `outline:0` on editable values. The floor requires 32 px controls "on touch screens", while Responsive says "Tablet and laptop behave the same". The dense field rows in the mock are about 24 px high. *Fix:* add a focus token and rule, a disabled rule, and one sizing rule that fits both statements.
- **medium** Visual rules are missing for Character header, Access panel, NPC block, Repeat row, Confirmation, Link picker, the "⋯" menu, the empty state and the buttons. *Fix:* add rows that reuse the existing tokens, and unify the names Tab and Tab bar, and Field row and Field value.
- **medium** Confirmation has no placement or focus rule. "One inline confirmation" does not say where it appears. Voice and Tone has no copy for delete, the one confirmation that deletes a whole sheet. *Fix:* define the location, the focus move and the delete copy, including the sheet name.
- **low** Make copies does not define the input form, the limits or the numbering. The mock uses `prompt()`. Undefined: numbering when the source name has no number, numbering after a deletion, and where copies appear. A large count can push the room past the snapshot limit. *Fix:* add an inline number input with a maximum, and one numbering rule.
- **low** Repeat row is scoped to "Sheets", but AD-2 lets NPC copies carry `rep:` records. Its empty state and the label of the remove control are not defined. *Fix:* change the scope to "Sheets, NPCs" and name the control.
- **low** The bad formula message has no rule for when it clears or how it fits inside a `columns` grid. "Нет значения" is also wrong for a non-numeric value. *Fix:* clear it on the next successful roll or field change, and state its position.

## 4. State coverage — thin

Checked: each IA surface against the states that apply.

| Surface | Covered | Missing |
| --- | --- | --- |
| Window, cold load | Last known copy | First paint with no copy, end of catch-up with no data |
| Character tab | Pending, denied, confirmed, remote edit | Owner and editor status, sheet deleted while open, repeat-row pending |
| NPC tab | No NPCs | NPC deleted while the GM is on it, scroll target gone |
| Settings | Snapshot skipped | Invalid file, newer file, upload during catch-up, status when fine |
| Access panel | None | Empty list, no owner |
| Token menu | None | Linked or unlinked per role |
| Link picker | None | No sheets exist |

### Findings

- **high** The first paint is undefined, and the empty states can appear wrongly. "Loading" says "Shows the last known copy at once". AD-11 says players do not persist, so a joining player has no copy, and neither does a GM in a new browser. AD-7 starts every client in `catching-up`. The state rows "No preset" and "No characters" have no condition that separates "no data yet" from "the room has none". A builder who renders the projection directly shows "ГМ ещё не настроил листы." to every player on join, and shows the GM a live "Загрузить пресет" button on a room that has data. Catch-up can also end on timeout, for a player with no GM and no snapshot, and no state covers that end. *Fix:* add a "catching up" row with a neutral loading treatment, state that the empty states render only after catch-up ends with no preset or sheets, and add a row with its own copy for no GM and no snapshot.
- **high** The Character header cannot show two of four real access states. The panel has an independent owner radio and an edit checkbox, and CAP-3 grants edit per player and per character. The header offers only "Ваш лист" or "Только чтение". A non-owner with edit rights reads "Только чтение" and can edit. An owner with no edit rights reads "Ваш лист" and cannot edit. The mock treats owner as editor (`edit=gm||own`), so a builder who copies it breaks CAP-3. *Fix:* the owner decides: either owner implies edit, or the header gains a third status. Then state the full matrix.
- **high** File failures have no surface. Flow 1 says the file "shows the error", and it does not say where or with what copy. Nothing covers a snapshot file that fails validation or has a higher `v`. AD-12 forbids reading such a file. An oversized preset that cannot fit one message (AD-12) also has no surface. *Fix:* add state rows and copy for an invalid preset, an invalid snapshot and a newer file, with one location, and state that nothing changes.
- **medium** The rule for "Ждёт" is ambiguous. AD-4 keeps every player edit pending until a `commit`, also when a GM is online. The state table ties the mark to "No GM responds", and the mock shows it only then. A builder must choose between a mark that flashes on every edit and a mark that appears only offline. In the second case, an edit during the wait for `gmLink` to time out shows nothing. *Fix:* state that the mark shows after a named delay, or only when `gmLink` is offline, and say what the field shows until then.
- **medium** Blur can overwrite a newer value. "A focused field keeps its text until blur", and "Saves on blur". A GM who clicks a field without typing, while another client changes it, writes the old text back. "`Esc` restores the value from before the edit" is also unclear after a typing pause has already saved, and after a remote change. *Fix:* state that a blur with no change sends nothing, and define Esc after an autosave and after a remote change.
- **medium** Upload and import during catch-up are undefined. AD-14 refuses an upload while `catching-up`. AD-7 enters that state whenever a page becomes visible, so a GM who returns to the tab can hit it often. The spine does not say if the buttons are disabled or the action waits. A GM's own edit during catch-up also enters the pending queue (AD-7), but "Ждёт" is defined for players only. *Fix:* add a rule for both.
- **medium** A sheet can disappear while it is open. Another GM can delete it, or an import can replace it. The spine does not say which tab becomes active, or what happens to a window that a token opened on a removed NPC. Deletion by the GM on the active tab has the same gap. *Fix:* add one fallback rule for the active tab.
- **medium** Repeat rows have no pending state. A player can add or remove a row (SPEC assumption), and AD-4 queues the edit, but "Ждёт" is defined only for a value in a field. A row added with no GM online has no treatment, and neither does a removed row. *Fix:* define how a pending add and a pending remove look.
- **medium** The no-GM copy promises more than the architecture gives. "Правки отправятся, когда он вернётся." The pending queue is in the background page and is not persisted (AD-4, AD-11). A reload or closing the room loses the edit. *Fix:* qualify the copy, or add a rule that warns on leaving, or accept the loss and record it.
- **low** Banner priority covers danger over warning only. Two dangers (snapshot skipped and local save failed) and two warnings (no GM and new version) have no order. *Fix:* give one total order.
- **low** The notice text does not fit every cause. AD-8 step 5 raises "the same notice" for a failed read-back, and step 1 raises a notice for a snapshot that does not decode or has a higher `v`. "Копия не влезла в комнату" is wrong for these. *Fix:* add copy per cause, or use one wording that fits all of them.
- **low** A live change of access or role has no rule. A revoke can arrive while a field has focus, and a role change (AD-5) can remove the NPC tab while it is active. *Fix:* add one line for each.

## 5. Visual reference coverage — adequate

Checked: four files in `imports/` and `mockups/`. All are linked and all exist. `.working/` holds pre-promotion copies, and `.working/shell.html` matches `mockups/shell.html`.

### Findings

- **medium** The mock contradicts the spine in places that a builder is likely to copy. The spine wins by rule, but neither spine lists these. `outline:0` on editable values, `edit=gm||own`, the character name in the roll toast, lowercase status text, "токен есть" in place of "Токен привязан", "Доступ: Брок правит" in place of "Доступ", `prompt()` for copies, and a pending colour `#e0a13e` in place of `{colors.warning-text}`. Mock-only content: the size meter, the guest warning and the preset summary. *Fix:* add a short list of known differences, or update the mock.
- **low** The two sketches are listed together in Foundation. They are not placed at the IA or Tab bar section, and the text does not say what each shows. *Fix:* link each at its section, with a short description.
- **low** The rule that the spines win appears in both files, and the rubric asks for one statement. The two statements also differ in scope. *Fix:* keep one statement.

## 6. Bloat & overspecification — strong

Nothing to report. Pixel values appear only where no token applies. The tables carry the content, and the spec is not restated.

## 7. Inheritance discipline — adequate

Checked: `sources` paths, capability names, terms, and each behavior row against the spec and the architecture.

### Findings

- **high** "Columns wrap" contradicts CAP-5. `DESIGN.md` Layout and `EXPERIENCE.md` Responsive say that `columns` wrap in narrow windows. In `preset-format.md`, `columns` means that "All rows of the section share one grid", and CAP-5 success is that they align. A wrapped grid does not align. The mock shows a different concept: whole sections side by side in a flex-wrap container, as in DummySheet. The preset format has no property for this. *Fix:* the owner decides what narrows: sections wrap as blocks, with an aligned grid inside each (then the preset format needs a section property, or the rule is the shell's), or the grid scrolls. State the choice, and state what happens with a grid wider than the window.
- **medium** The `sources` path to the architecture is broken in both files. `../architecture/...` resolves to `ux-designs/architecture/`. The correct path is `../../architecture/...`. The reverse link in `ARCHITECTURE-SPINE.md` is also broken. It needs `../../ux-designs/...`. *Fix:* correct the three paths.
- **medium** AD-10 reads as a closed list of commands, and it does not hold actions that the spine requires. Missing: create, rename and delete a sheet; change owner or edit right; link a token; open a sheet from a token. The last one also needs a way to tell an open window which tab to show. *Fix:* extend AD-10 through an architecture update, or state that the list is an example.
- **medium** Terms drift. "Room copy" and "room snapshot" mean the same thing in different rows, and the export file is also called a snapshot. "Owner" has no source term: the spec says "player link" and the architecture says `plink`. The spine says "one window", and the architecture says "popover and sheet views" and "windows". In Russian, "копия" means both the room copy and an NPC duplicate. *Fix:* add a short glossary, and use one term per concept.
- **low** Flow 4 says the confirmation "names how many values will be erased". AD-14 returns removed field ids. *Fix:* state which count the copy shows, and align AD-14.

## 8. Shape fit — strong

`DESIGN.md` sections are in canonical order. `EXPERIENCE.md` has all required sections. Inspiration & Anti-patterns is present and triggered by DummySheet. Responsive & Platform is present and short. No invented sections. Key Flows comes before Inspiration, unlike both examples, but that order is not locked.

## Mechanical notes

- Frontmatter: both files have `status: draft` and four `sources` entries, one broken. `stack.md` is not listed, and the architecture repeats what the UX needs.
- Token references: none unresolved. No Mermaid in either file.
- The IA row for the NPC tab omits the token menu, and Foundation says a token opens it.
- IA and flows say "Right-click on a token". Owlbear on a tablet has no right-click, and Interaction Primitives says tap and click are the same. Use "token menu".
- "+ NPC" has a position only in the mock. The spine mentions it only under "No NPCs" and in flow 2.
- Voice and Tone: "Ждёт" is a third-person verb. The project owner's copy rule for a status asks for a noun, adjective, participle or similar, for example "Ожидает отправки". "+ строка" and "+ NPC" are commands with no verb. The spec dictates "Формат листов изменён", so that message is an accepted exception to "The result of an action repeats its word".
- `.memlog.md` line 12 records a divider before the NPC tab. Neither spine nor the mock has it.
