import { z } from 'zod';

import { FORMAT_VERSION } from '@/core/format-version';
import type { JsonValue } from '@/core/json';
import { compareGenerations } from '@/core/merge';
import { recordSchema } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { generationSchema, type Generation } from '@/core/storage-key';
import type { PlayerRole } from '@/core/visibility';

// AD-5: room traffic, always sent with destination REMOTE.
export const SYNC_CHANNEL = 'app.muster-roll/sync';

// Every `t` of AD-12. Only those with a schema below are ever parsed; the gate knows them all, so a
// later story adds a schema and a handler, not a rule.
export type RoomMessageType =
  | 'commit'
  | 'propose'
  | 'reject'
  | 'ping'
  | 'alive'
  | 'state-request'
  | 'state'
  | 'reset'
  | 'roll';

// The message's generation compared with the receiving client's own.
export type GenerationRelation = 'lower' | 'equal' | 'higher';

// `null` is a connection id the party does not know.
export type SenderRole = PlayerRole | null;

// "Known player" is any party member with a known connection id, GMs included.
type AdmissionRule = {
  sender: 'GM' | 'known-player';
  generations: readonly GenerationRelation[];
};

type AdmissionTable = { readonly [Type in RoomMessageType]: AdmissionRule };

const ANY_GENERATION: readonly GenerationRelation[] = ['lower', 'equal', 'higher'];

// The whole AD-5 table. A combination it does not list is dropped.
const ADMISSION: AdmissionTable = {
  commit: { sender: 'GM', generations: ['equal'] },
  reject: { sender: 'GM', generations: ['equal'] },
  state: { sender: 'GM', generations: ['equal', 'higher'] },
  reset: { sender: 'GM', generations: ['higher'] },
  alive: { sender: 'GM', generations: ANY_GENERATION },
  propose: { sender: 'known-player', generations: ['equal'] },
  ping: { sender: 'known-player', generations: ANY_GENERATION },
  'state-request': { sender: 'known-player', generations: ANY_GENERATION },
  roll: { sender: 'known-player', generations: ANY_GENERATION },
};

// Only `v` is read first, so a message shape of a newer build cannot break the version check.
const envelopeSchema = z.looseObject({ v: z.number().int().nonnegative() });

const commitSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('commit'),
  records: z.array(recordSchema).min(1),
});

const roomMessageSchema = z.discriminatedUnion('t', [commitSchema]);

export type CommitMessage = z.infer<typeof commitSchema>;

export type RoomMessage = z.infer<typeof roomMessageSchema>;

// `newer-version` asks the UI for a reload. The other two are dropped in silence.
export type RoomMessageFailure = 'invalid-message' | 'older-version' | 'newer-version';

export function parseRoomMessage(candidate: JsonValue): Result<RoomMessage, RoomMessageFailure> {
  const envelope = envelopeSchema.safeParse(candidate);

  if (!envelope.success) {
    return err('invalid-message');
  }

  if (envelope.data.v > FORMAT_VERSION) {
    return err('newer-version');
  }

  if (envelope.data.v < FORMAT_VERSION) {
    return err('older-version');
  }

  const parsed = roomMessageSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-message');
}

export function generationRelation(message: Generation, own: Generation): GenerationRelation {
  const ordering = compareGenerations(message, own);

  if (ordering === 0) {
    return 'equal';
  }

  return ordering > 0 ? 'higher' : 'lower';
}

export function admitRoomMessage(
  t: RoomMessageType,
  sender: SenderRole,
  relation: GenerationRelation,
): boolean {
  const rule = ADMISSION[t];

  if (sender === null || (rule.sender === 'GM' && sender !== 'GM')) {
    return false;
  }

  return rule.generations.includes(relation);
}

// The envelope of a commit with no records, measured by the size splitter.
export function commitEnvelope(generation: Generation): CommitMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'commit', records: [] };
}
