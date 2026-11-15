import type { DiceRolling } from '@/ui/sheet/dice-button';
import { createLocalFieldValues } from '@/ui/sheet/local-field-values';

// The preview has no engine and no dice extension. A press settles at once as rolled, so the button
// returns to rest and shows no message.
export function createStubRolling(): DiceRolling {
  return {
    requestRoll: () =>
      Promise.resolve({ kind: 'answered' as const, answer: { code: 'rolled' as const } }),
    localValues: createLocalFieldValues(),
  };
}
