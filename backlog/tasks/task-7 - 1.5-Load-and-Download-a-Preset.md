---
id: TASK-7
title: 1.5 Load and Download a Preset
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-1
milestone: >-
  Epic 1: GM Runs the Campaign Sheets

  The GM loads a preset for any game system, creates and fills characters and
  NPCs, and keeps every change after a reload. The extension is live on its
  permanent URL.

  **FRs covered:** FR1, FR4, FR5, FR12, FR17
dependencies:
  - TASK-6
references:
  - _bmad-output/planning-artifacts/epics.md
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
type: feature
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to upload a JSON preset and download it again, So that sheets fit my game system and I can reuse the format in another room.

Story 1.5 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
**FRs covered:** FR2, FR9, FR10, FR11

### Epic 3: Players Edit Their Own Characters
The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
**FRs covered:** FR3, FR15, FR19

### Epic 4: Dice and Tokens at the Table
Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
**FRs covered:** FR6, FR7, FR14, FR16, FR18

### Epic 5: Change the Format and Move the Campaign
The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
**FRs covered:** FR8, FR13

## Epic 1: GM Runs the Campaign Sheets

The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a room with no preset, after the first full projection has arrived **When** the GM opens the window **Then** the window shows "Загрузить пресет" and the gear (UX-DR27) **And** the gear replaces the content area with Settings, with the section "Пресет" (UX-DR9, UX-DR23)
- [ ] #2 **Given** a valid file with a character template and a short NPC template **When** the GM presses "Загрузить пресет" **Then** `core/preset` accepts `text`, `field` and `dice` cells, and `columns`, `repeat` and `width` sections (FR4) **And** the file is stored as the `preset` record, deflated and base64-encoded **And** the JSON keys and an annotated example preset are committed in the repository
- [ ] #3 **Given** a preset that uses one id in the character template and in the NPC template **When** the GM uploads it **Then** it is accepted, because each template and each repeat template row is its own scope
- [ ] #4 **Given** an invalid file, a duplicate field id within one scope, or a record that cannot fit one message **When** the GM uploads it **Then** "Файл не подошёл: {reason}. Ничего не изменено." appears under the button, and no data changes
- [ ] #5 **Given** a preset with a field id that does not match `^[A-Za-z_][A-Za-z0-9_]*$`, matches `^[dD][0-9]+$`, or equals `floor`, `ceil` or an `Object.prototype` member name, a repeat section that does not hold exactly one template row with at least one field, two repeat sections with one `sectionId`, a row of a `columns` section with more cells than the grid, an unknown `width` value or field type, a formula with a syntax error or an unknown function, a formula over 200 characters, or a dice term over the limits **When** the GM uploads it **Then** the same bad file message appears, and no data changes **And** `core/formula` parses every formula with this grammar: integer literals, field ids, `+ - * /` and parentheses, `floor()`, `ceil()`, `NdM` with literal `N` from 1 to 100 and literal `M` from 1 to 1000, and at most one comparison from `<= < >= >` **And** a row of a `columns` section with fewer cells than the grid leaves the trailing grid cells empty
- [ ] #6 **Given** a file with a higher format `v` **When** the GM uploads it **Then** "Файл из более новой версии. Перезагрузите страницу." appears under the button, and no data changes
- [ ] #7 **Given** a loaded preset **When** the GM presses "Скачать пресет" **Then** the file holds structure and no values, and carries the current `v` (FR12) **And** uploading that file in another room gives the same structure
- [ ] #8 **Given** a file with no `v`, or a lower `v` and no registered migration **When** the GM uploads it **Then** the bad file message appears, and no data changes
- [ ] #9 **Given** no preset is loaded **When** Settings renders **Then** "Скачать пресет" is disabled with "Сначала загрузите пресет." (UX-DR23) **And** in each Settings section the upload action comes first and uses `button-primary`, and the others use `button-secondary` (UX-DR23)
- [ ] #10 **Given** sheets already exist **When** Settings renders **Then** "Загрузить пресет" is disabled with the temporary reason "Удалите листы, чтобы заменить пресет."
<!-- AC:END -->
