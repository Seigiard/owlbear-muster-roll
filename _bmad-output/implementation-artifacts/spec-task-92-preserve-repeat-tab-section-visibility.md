# TASK-92: Preserve section visibility in repeat-tab authorization

## Scope

A visible repeat tab can contain both player-visible and GM-only sections. The repeat-tab adapter must not erase a source section's visibility when authorization resolves a field or token target.

## Evidence

The confirmed review finding `bugs+impl-codex-2` reports that `repeatSectionPlace` creates a synthetic section with the tab visibility. `fieldTargetShownTo` therefore permits a player field patch in a GM-only source section. The same projection makes `linkTargetShownTo` accept a token target in that section.

## Plan

1. Add public room-rig regressions with a visible repeat tab containing visible and GM-only sections. Exercise player commands and a raw player proposal against the hidden field, plus player token opening for the hidden target.
2. Preserve source section visibility at the field and link authorization boundaries, while retaining visible fields and all GM access.
3. Trace the command, proposal and open consumers through the real engine paths; do not claim record-level privacy.
4. Run focused regressions, calibrate their assertions, then run format, lint, typecheck, Bun, build, and the parent-authorized browser suite.

## Boundaries

- Do not change record replication or claim data privacy: visibility controls interface and action authorization only.
- Preserve TASK-90's receiving-GM repeat-tab lifecycle regressions.
- Do not change repeat-tab lifecycle admission or extend nested-repeat support.
