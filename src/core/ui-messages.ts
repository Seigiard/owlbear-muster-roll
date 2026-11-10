import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { recordSchema } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

export const UI_CHANNEL = 'app.muster-roll/ui';

const idSchema = z.string().min(1).max(64);

const sequenceSchema = z.number().int().nonnegative();

export const noticeSchema = z.enum(['local-save-failed']);

const projectionRequestSchema = z.strictObject({
  t: z.literal('projection-request'),
  nonce: idSchema,
});

const projectionSchema = z
  .strictObject({
    t: z.literal('projection'),
    nonce: idSchema,
    engine: idSchema,
    seq: sequenceSchema,
    i: z.number().int().positive(),
    n: z.number().int().positive(),
    records: z.array(recordSchema),
    notices: z.array(noticeSchema),
  })
  .refine((part) => part.i <= part.n);

const deltaSchema = z.strictObject({
  t: z.literal('delta'),
  engine: idSchema,
  seq: sequenceSchema,
  records: z.array(recordSchema),
  notices: z.array(noticeSchema),
});

// A command is an intent. Strict objects refuse any message that also carries k, d, c or a.
// The id and the name are checked by the engine, so a bad one gets a rejection, not silence.
// The window picks the sheetId, so it can select the new tab when the delta arrives.
const sheetCreateSchema = z.strictObject({
  type: z.literal('sheet-create'),
  sheetId: z.string(),
  kind: z.enum(['pc', 'npc']),
  name: z.string(),
});

const sheetRenameSchema = z.strictObject({
  type: z.literal('sheet-rename'),
  sheetId: z.string(),
  name: z.string(),
});

// The window sends the deflated data, not the JSON, because a preset over the message limit as
// JSON can still fit once deflated. The engine decodes and validates it again.
const presetUploadSchema = z.strictObject({
  type: z.literal('preset-upload'),
  data: z.base64().min(1),
});

const commandIntentSchema = z.discriminatedUnion('type', [
  sheetCreateSchema,
  sheetRenameSchema,
  presetUploadSchema,
]);

const commandSchema = z.strictObject({
  t: z.literal('command'),
  id: idSchema,
  command: commandIntentSchema,
});

const commandRejectedSchema = z.strictObject({
  t: z.literal('command-rejected'),
  id: idSchema,
  reason: z.enum([
    'too-large',
    'invalid-preset',
    'sheets-exist',
    'invalid-sheet-id',
    'sheet-exists',
    'unknown-sheet',
    'deleted-sheet',
    'invalid-name',
  ]),
});

const windowMessageSchema = z.discriminatedUnion('t', [projectionRequestSchema, commandSchema]);

const engineMessageSchema = z.discriminatedUnion('t', [
  projectionSchema,
  deltaSchema,
  commandRejectedSchema,
]);

export type Notice = z.infer<typeof noticeSchema>;

export type Command = z.infer<typeof commandIntentSchema>;

export type CommandMessage = z.infer<typeof commandSchema>;

export type CommandRejectedMessage = z.infer<typeof commandRejectedSchema>;

export type RejectionReason = CommandRejectedMessage['reason'];

export type ProjectionRequestMessage = z.infer<typeof projectionRequestSchema>;

export type ProjectionMessage = z.infer<typeof projectionSchema>;

export type DeltaMessage = z.infer<typeof deltaSchema>;

export type WindowMessage = z.infer<typeof windowMessageSchema>;

export type EngineMessage = z.infer<typeof engineMessageSchema>;

export type UiMessageFailure = 'invalid-message';

export function parseWindowMessage(candidate: JsonValue): Result<WindowMessage, UiMessageFailure> {
  const parsed = windowMessageSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-message');
}

export function parseEngineMessage(candidate: JsonValue): Result<EngineMessage, UiMessageFailure> {
  const parsed = engineMessageSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-message');
}
