---
id: TASK-36
title: Roll dice through the Owlbear dice extension API
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-11T04:41:00Z'
updated_date: '2026-11-11T16:06:00Z'
labels:
  - v2
dependencies: []
references:
  - https://github.com/owlbear-rodeo/dice
  - https://github.com/abottchen/dicex
  - >-
    _bmad-output/implementation-artifacts/spec-4-2-roll-a-dice-cell-and-show-the-result.md
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request after the first live check of Story 4.2 (TASK-25): dice rolls should go through a dice extension so players see real 3D dice, not only a notification. Story 4.2 evaluates the formula in the roller replica with Math.random and broadcasts the result. Candidates to research: the official Owlbear dice extension (https://github.com/owlbear-rodeo/dice), the community fork https://github.com/abottchen/dicex, or a fork of our own. It is not known yet whether either exposes an API another extension can call, or how a roll result comes back. The formula parser of Story 4.1 stays the only way to read a preset formula; no eval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The task records which dice extension and which API Muster Roll uses, or why a fork is needed, with links to the source
- [x] #2 Pressing a dice cell rolls the dice of its formula in the dice extension, visible to the same clients that see the roll notification today
- [x] #3 The roll notification and the comparison outcome use the dice values the dice extension rolled, not a separate local roll
- [x] #4 When the dice extension is not installed in the room, a roll still works as in Story 4.2
- [x] #5 An NPC roll stays hidden from players
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision (owner, 2026-11-11): own fork Seigiard/dicex of abottchen/dicex with a wider Dice+ API (public and GM-only targets, consent-based trust, app.muster-roll trusted by default), deployed to GitHub Pages; small PRs to upstream after owner review.
Build spec: _bmad-output/implementation-artifacts/spec-4-8-roll-dice-through-the-dice-extension.md
1. Core: dice terms in tree order, Dice+ notation, result validation, face source.
2. Replica: probe/request/timeouts over LOCAL broadcast; engine takes faces from the extension, falls back to a local roll.
3. Mock fake dice extension; engine and e2e tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research 2026-11-11 (from source):
- owlbear-rodeo/dice (GPL-3.0, no push since 2024-04-12): no API for other extensions; rolls only from its UI; values readable only from player metadata rodeo.owlbear.dice/*, not for hidden rolls; maintainers unlikely to accept PRs.
- abottchen/dicex (GPL-3.0 fork, active 2026-07) implements the Dice+ broadcast protocol: dice-plus/isReady handshake; dice-plus/roll-request {rollId, playerId, playerName, rollTarget, diceNotation, showResults, timestamp, source}; result on {source}/roll-result with per-die values and kept flags; errors on {source}/roll-error. Only the addressed player's client rolls. Notation: NdM with d4-d100 standard sides, kh/kl/d, explode, +/- integer modifiers. Visibility: any target other than everyone is hidden; everyone is also hidden unless the source id is in a hardcoded allowlist (com.abottchen.obr-forge-helper), so Muster Roll would need a PR or its own fork for public rolls.
- Dice+ (commercial, https://extensions.owlbear.rodeo/dice-plus, no public source) documents the same protocol with real gm_only, so one client covers both backends.
Permalinks: dicex ef79a207 src/plugin/dicePlusProtocol.ts, dicePlusBackgroundListeners.ts, dicePlusResultReporter.ts; official ccc32bec src/plugin/DiceRollSync.tsx.

Fork: https://github.com/Seigiard/dicex, installed from https://seigiard.com/dicex/manifest.json (seigiard.github.io redirects there without CORS). Visibility is the caller's: rollTarget everyone = public, self = roller only, dm/gm_only = roller and GM. The consent/allowlist idea was dropped by the owner. Client implemented per spec-4-8; review round 1 patched. Checks 2026-11-11: oxfmt, lint, typecheck, bun test 2037 pass, vite build, test:browser 398 passed twice. AC 2-5 proven against a fake extension that models dicex result shapes (src/replica/engine-dice-extension.test.ts, tests/dice-extension.e2e.ts). Open: owner live-room check with the fork; client follow-up for the GM access permission dicex is getting.
<!-- SECTION:NOTES:END -->
