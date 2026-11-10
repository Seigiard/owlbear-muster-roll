import { deflateToBase64 } from '@/core/deflate';
import type { JsonValue } from '@/core/json';
import type { VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

export const MESSAGE_BYTE_LIMIT = 15000;

// Room left for a message around one record, so a record that passes input always fits later.
const RECORD_ENVELOPE_RESERVE_BYTES = 512;

const encoder = new TextEncoder();

export type SplitFailure = 'item-too-large';

export function jsonByteLength(value: JsonValue): number {
  return encoder.encode(JSON.stringify(value)).length;
}

export function fitsOneMessage(message: JsonValue): boolean {
  return jsonByteLength(message) < MESSAGE_BYTE_LIMIT;
}

// A record must fit one message both as JSON (commit, projection) and alone after deflate and
// base64 (`state`), or an answer would have to leave it out.
export function recordFitsOneMessage(record: VersionedRecord): boolean {
  const limit = MESSAGE_BYTE_LIMIT - RECORD_ENVELOPE_RESERVE_BYTES;

  return jsonByteLength(record) < limit && deflateToBase64(JSON.stringify([record])).length < limit;
}

// `envelopeBytes` is the size of the whole message with an empty item array. The caller measures
// it at the largest values its counters can reach, so every part stays under the limit.
export function splitBatch<Item extends JsonValue>(
  items: readonly Item[],
  envelopeBytes: number,
): Result<Item[][], SplitFailure> {
  const capacity = MESSAGE_BYTE_LIMIT - 1 - envelopeBytes;
  let current: Item[] = [];
  let used = 0;
  // An empty batch still makes one message, because a projection of no records must arrive.
  const parts = [current];

  for (const item of items) {
    const bytes = jsonByteLength(item);

    if (bytes > capacity) {
      return err('item-too-large');
    }

    const separator = current.length === 0 ? 0 : 1;

    if (used + separator + bytes > capacity) {
      current = [item];
      parts.push(current);
      used = bytes;
    } else {
      current.push(item);
      used += separator + bytes;
    }
  }

  return ok(parts);
}
