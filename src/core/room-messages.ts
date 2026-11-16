import { z } from 'zod';

import { FORMAT_VERSION } from '@/core/format-version';
import { fragmentRecords } from '@/core/message-size';
import type { JsonValue } from '@/core/json';
import { compareGenerations } from '@/core/merge';
import { recordSchema, type VersionedRecord } from '@/core/records';
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

// AD-4: one player edit, named by its `(k, c, a)`. A GM's answer echoes it, so the player clears,
// retries or drops exactly the entry it sent.
const editIdSchema = z.strictObject({
  k: z.string().min(1),
  c: z.number().int().positive(),
  a: z.string().min(1),
});

// `acks` echoes the `(k, c, a)` of every player proposal the commit answers, also when the batch
// carries a newer record of that key. A commit of a GM's own edits has none. No format version
// change: nothing is released yet, and an older commit with no `acks` reads as `[]`.
const commitSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('commit'),
  records: z.array(recordSchema).min(1),
  acks: z.array(editIdSchema).default([]),
});

// AD-4: a player's edit of one record, sent until a GM client answers it. The player never merges
// it itself.
const proposeSchema = z
  .strictObject({
    v: z.literal(FORMAT_VERSION),
    g: generationSchema,
    t: z.literal('propose'),
    records: z.array(recordSchema).length(1),
    i: z.number().int().positive().default(1),
    n: z.number().int().positive().default(1),
  })
  .refine((message) => message.i <= message.n);

// AD-4: a GM client refused a proposal, echoing its `(k, c, a)`. `denied`: the player has no right
// to it. `stale`: its `c` is not above the GM's, and `current` is the GM's record of the key, which
// the player applies its patch to.
const rejectSchema = z
  .strictObject({
    v: z.literal(FORMAT_VERSION),
    g: generationSchema,
    t: z.literal('reject'),
    k: z.string().min(1),
    c: z.number().int().positive(),
    a: z.string().min(1),
    reason: z.enum(['denied', 'stale']),
    current: recordSchema.optional(),
  })
  .refine((message) =>
    message.reason === 'stale' ? message.current?.k === message.k : message.current === undefined,
  );

// AD-7: a client's catch-up nonce `r`, a nanoid.
const nonceSchema = z.string().min(1).max(64);

const stateRequestSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('state-request'),
  r: nonceSchema,
});

// Message `i` of the `n` one responder sends for `r`. `records` is a JSON array of complete records,
// deflated and base64-encoded; `decodeStateRecords` reads it.
const stateSchema = z
  .strictObject({
    v: z.literal(FORMAT_VERSION),
    g: generationSchema,
    t: z.literal('state'),
    r: nonceSchema,
    i: z.number().int().positive(),
    n: z.number().int().positive(),
    records: z.base64().min(1),
  })
  .refine((message) => message.i <= message.n);

// AD-6: a client that heard no GM for half the timeout asks whether one is there.
const pingSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('ping'),
});

// AD-6, AD-7: a GM client's answer to `ping`, with the `recordDigest` of all its records.
const aliveSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('alive'),
  digest: z.number().int().min(0).max(0xffffffff),
});

// zod's number refuses Infinity and NaN, so a received result is always a finite roll.
const rollResultSchema = z.strictObject({
  roll: z.number(),
  faces: z.array(z.number().int().positive()),
  target: z.number().nullable(),
  targetFaces: z.array(z.number().int().positive()),
  outcome: z.enum(['success', 'failure']).nullable(),
});

// AD-13: one roll, evaluated once by the roller. Receivers show the names as sent and never
// recompute; `id` is a nanoid they deduplicate by.
const rollSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('roll'),
  id: z.string().min(1).max(64),
  sheetId: z.string().min(1).max(64),
  // AD-13: computed once from the sheet's template when the roller accepted the request. A player
  // shows only `false`.
  hidden: z.boolean(),
  roller: z.string(),
  sheetName: z.string(),
  cell: z.string(),
  result: rollResultSchema,
});

// AD-9: the new generation of an import or a wipe. The data comes through catch-up or the room
// copy.
const resetSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  g: generationSchema,
  t: z.literal('reset'),
});

const roomMessageSchema = z.discriminatedUnion('t', [
  commitSchema,
  proposeSchema,
  rejectSchema,
  stateRequestSchema,
  stateSchema,
  pingSchema,
  aliveSchema,
  rollSchema,
  resetSchema,
]);

export type CommitMessage = z.infer<typeof commitSchema>;

export type EditId = z.infer<typeof editIdSchema>;

export type ProposeMessage = z.infer<typeof proposeSchema>;

export type RejectMessage = z.infer<typeof rejectSchema>;

export type RejectReason = RejectMessage['reason'];

export type StateRequestMessage = z.infer<typeof stateRequestSchema>;

export type StateMessage = z.infer<typeof stateSchema>;

export type PingMessage = z.infer<typeof pingSchema>;

export type AliveMessage = z.infer<typeof aliveSchema>;

export type RollMessage = z.infer<typeof rollSchema>;

export type ResetMessage = z.infer<typeof resetSchema>;

// What a roll carries apart from the envelope.
export type RollContent = Omit<RollMessage, 'v' | 'g' | 't'>;

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

// A commit as sent: `acks` goes only with a commit that answers proposals.
export type CommitEnvelope = Omit<CommitMessage, 'acks'> & { acks?: EditId[] };

// The envelope of a commit with no records and no acks, measured by the size splitter.
export function commitEnvelope(generation: Generation): CommitEnvelope {
  return { v: FORMAT_VERSION, g: generation, t: 'commit', records: [] };
}

export function proposeMessage(generation: Generation, record: VersionedRecord): ProposeMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'propose', records: [record], i: 1, n: 1 };
}

export function proposeMessages(generation: Generation, record: VersionedRecord): ProposeMessage[] {
  const fragments = fragmentRecords([record]);

  return fragments.map((fragment, index) => ({
    ...proposeMessage(generation, fragment),
    i: index + 1,
    n: fragments.length,
  }));
}

// Why a GM client rejects a proposal: `stale` always carries the GM's current record, `denied` none.
export type RejectAnswer = { reason: 'denied' } | { reason: 'stale'; current: VersionedRecord };

export function rejectMessage(
  generation: Generation,
  edit: EditId,
  answer: RejectAnswer,
): RejectMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'reject', ...edit, ...answer };
}

// The `(k, c, a)` that names a record as an edit.
export function editIdOf(record: Pick<VersionedRecord, 'k' | 'c' | 'a'>): EditId {
  return { k: record.k, c: record.c, a: record.a };
}

export function sameEditId(first: EditId, second: EditId): boolean {
  return first.k === second.k && first.c === second.c && first.a === second.a;
}

export function stateRequestMessage(generation: Generation, r: string): StateRequestMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'state-request', r };
}

export function pingMessage(generation: Generation): PingMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'ping' };
}

export function rollMessage(generation: Generation, content: RollContent): RollMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'roll', ...content };
}

export function resetMessage(generation: Generation): ResetMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'reset' };
}

export function aliveMessage(generation: Generation, digest: number): AliveMessage {
  return { v: FORMAT_VERSION, g: generation, t: 'alive', digest };
}
