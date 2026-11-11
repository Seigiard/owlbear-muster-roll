import { atom } from 'nanostores';

import { ok } from '@/core/result';
import type { RollOutcomeMessage } from '@/core/ui-messages';
import type { DiceRolling } from '@/ui/sheet/dice-button';
import { createLocalFieldValues } from '@/ui/sheet/local-field-values';

// The preview has no engine and no dice extension. A press settles at once as rolled, so the button
// returns to rest and shows no message.
export function createStubRolling(): DiceRolling {
  const $rollOutcomes = atom<ReadonlyMap<string, RollOutcomeMessage>>(new Map());
  let presses = 0;

  return {
    requestRoll: () => {
      presses += 1;

      const id = `preview-roll-${presses}`;
      const outcomes = new Map($rollOutcomes.get());

      outcomes.set(id, { t: 'roll-outcome', id, outcome: { code: 'rolled' } });
      $rollOutcomes.set(outcomes);

      return ok(id);
    },
    $rollOutcomes,
    localValues: createLocalFieldValues(),
  };
}
