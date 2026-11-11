import { z } from 'zod';

import type { DiceTerm, DieFace } from '@/core/formula-evaluate';
import type { JsonValue } from '@/core/json';
import { err, ok, type Result } from '@/core/result';

// TASK-36: the Dice+ broadcast protocol, as the `dicex` fork and the commercial Dice+ implement it.
// Every message goes with destination `LOCAL`. Replies to a roll come on channels named by `source`.
export const DICE_PLUS_SOURCE = 'app.muster-roll';

export const DICE_PLUS_READY_CHANNEL = 'dice-plus/isReady';

export const DICE_PLUS_ROLL_REQUEST_CHANNEL = 'dice-plus/roll-request';

export const DICE_PLUS_RESULT_CHANNEL = `${DICE_PLUS_SOURCE}/roll-result`;

export const DICE_PLUS_ERROR_CHANNEL = `${DICE_PLUS_SOURCE}/roll-error`;

// TASK-36: the `dicex` fork lets a source roll only after a GM of the room allows it. A client
// asks on this channel, and the answers come on the source's access channel.
export const DICE_PLUS_REQUEST_ACCESS_CHANNEL = 'dice-plus/request-access';

export const DICE_PLUS_ACCESS_CHANNEL = `${DICE_PLUS_SOURCE}/access`;

// The `error` of a roll error when the GM has not allowed this source, and when no GM is in the
// room to allow it. Both are refusals of access, not of the formula.
export const DICE_PLUS_NOT_PERMITTED = 'not-permitted';

export const DICE_PLUS_NO_GM = 'no-gm';

// The dice this client asks the extension for, in the order `dicex` fills its result groups: its
// dice set order, whatever the notation's order. A d100 is left out: `dicex` reports it as a
// tens-only d100 group beside a stray d10, with no combined face, so a d100 rolls locally.
const DICE_PLUS_SIDES: readonly number[] = [4, 6, 8, 10, 12, 20];

const DICE_PLUS_MAX_TERM_DICE = 20;

const DICE_PLUS_MAX_DICE = 50;

// `everyone` shows the 3D dice on every client, `gm_only` on GM clients only.
export const dicePlusTargetSchema = z.enum(['everyone', 'gm_only']);

export const dicePlusRollRequestSchema = z.object({
  rollId: z.string().min(1),
  playerId: z.string(),
  playerName: z.string(),
  rollTarget: dicePlusTargetSchema,
  diceNotation: z.string(),
  showResults: z.boolean(),
  timestamp: z.number(),
  source: z.string(),
});

// `source` makes `dicex` say in its reply whether the GM allowed this source.
export const dicePlusReadyProbeSchema = z.object({
  requestId: z.string().min(1),
  timestamp: z.number(),
  source: z.string().optional(),
});

// A probe on the same channel has no `ready`, so it never parses as a reply. A reply with no
// `permitted`, as the commercial Dice+ sends, lets every source roll.
export const dicePlusReadyReplySchema = z.object({
  requestId: z.string(),
  ready: z.boolean(),
  permitted: z.boolean().optional(),
});

export const dicePlusAccessRequestSchema = z.object({
  requestId: z.string().min(1),
  source: z.string(),
});

// `pending`: a GM was asked, and a second answer follows with `allowed`, `denied` or `timeout`.
// `no-gm`: no GM is in the room to answer. `allowed` and `denied` can also be the room's stored
// answer, sent at once.
export const dicePlusAccessStatusSchema = z.enum([
  'allowed',
  'denied',
  'pending',
  'no-gm',
  'timeout',
]);

export const dicePlusAccessReplySchema = z.object({
  requestId: z.string(),
  status: dicePlusAccessStatusSchema,
});

// What a reply on the result or the error channel must hold to be matched to a request at all.
export const dicePlusReplySchema = z.object({ rollId: z.string() });

// The reason an error reply gives, when it gives one as text.
export const dicePlusErrorTextSchema = z.object({ error: z.string() });

// Only the fields this client reads. The extension also sends totals and a summary, which cannot
// apply field values or a comparison, so the evaluator takes the faces alone.
const dicePlusRollResultSchema = z.object({
  rollId: z.string(),
  result: z.object({
    groups: z.array(
      z.object({
        diceType: z.string(),
        dice: z.array(z.object({ value: z.number() })),
      }),
    ),
  }),
});

export type DicePlusTarget = z.infer<typeof dicePlusTargetSchema>;

export type DicePlusRollRequest = z.infer<typeof dicePlusRollRequestSchema>;

export type DicePlusReadyProbe = z.infer<typeof dicePlusReadyProbeSchema>;

export type DicePlusAccessRequest = z.infer<typeof dicePlusAccessRequestSchema>;

export type DicePlusAccessStatus = z.infer<typeof dicePlusAccessStatusSchema>;

// What the extension rolls for a formula: its terms merged by sides and ordered as `dicex` fills
// its result groups, as one notation of positive terms, such as `3d6+1d8` for `2d6 + 1d8 - 1d6`.
// The evaluator applies signs and arithmetic itself, and takes the faces back in tree order.
export type DicePlusDice = { notation: string; groups: DiceTerm[] };

// `null` when the formula has no dice or any term is one the extension is not asked for, so the
// roll stays local.
export function dicePlusDice(terms: readonly DiceTerm[]): DicePlusDice | null {
  const total = terms.reduce((sum, term) => sum + term.count, 0);

  const supported = terms.every(
    (term) => DICE_PLUS_SIDES.includes(term.sides) && term.count <= DICE_PLUS_MAX_TERM_DICE,
  );

  if (terms.length === 0 || !supported || total > DICE_PLUS_MAX_DICE) {
    return null;
  }

  const groups = DICE_PLUS_SIDES.flatMap((sides) => {
    const count = terms
      .filter((term) => term.sides === sides)
      .reduce((sum, term) => sum + term.count, 0);

    return count === 0 ? [] : [{ count, sides }];
  });

  return {
    notation: groups.map((group) => `${group.count}d${group.sides}`).join('+'),
    groups,
  };
}

// AD-13: the roll's `hidden`, computed once, also picks where its dice show: a hidden sheet's only on
// GM clients, as its notification.
export function dicePlusTarget(hidden: boolean): DicePlusTarget {
  return hidden ? 'gm_only' : 'everyone';
}

// The faces of a result in the tree order of `terms`. A result counts only with one group per
// group of `dicePlusDice(terms)`, in its order, each named `d{sides}` and holding `count` integer
// faces in 1..sides. `dicex` reports a d10 that shows 10 as 0, so a d10's 0 counts as 10. The
// failure says why.
export function dicePlusFaces(
  terms: readonly DiceTerm[],
  data: JsonValue,
): Result<DieFace[], string> {
  const dice = dicePlusDice(terms);
  const parsed = dicePlusRollResultSchema.safeParse(data);

  if (dice === null) {
    return err('the formula has no dice the extension rolls');
  }

  if (!parsed.success) {
    return err('the result does not parse');
  }

  const { groups } = parsed.data.result;

  if (groups.length !== dice.groups.length) {
    return err(`the result has ${groups.length} dice groups, not ${dice.groups.length}`);
  }

  const bySides = new Map<number, number[]>();

  for (const [index, expected] of dice.groups.entries()) {
    const group = groups[index];
    const faces = group?.dice.map((die) => faceOf(expected.sides, die.value)) ?? [];

    if (group?.diceType !== `d${expected.sides}`) {
      return err(`group ${index + 1} is not d${expected.sides}`);
    }

    if (faces.length !== expected.count) {
      return err(`group ${index + 1} has ${faces.length} dice, not ${expected.count}`);
    }

    const bad = faces.find((face) => !Number.isInteger(face) || face < 1 || face > expected.sides);

    if (bad !== undefined) {
      return err(`group ${index + 1} has the face ${bad}`);
    }

    bySides.set(expected.sides, faces);
  }

  // Each term takes the next faces of its sides, so same-sided terms keep their order.
  return ok(
    terms.flatMap((term) =>
      (bySides.get(term.sides)?.splice(0, term.count) ?? []).map((face) => ({
        sides: term.sides,
        face,
      })),
    ),
  );
}

function faceOf(sides: number, value: number): number {
  return sides === 10 && value === 0 ? 10 : value;
}
