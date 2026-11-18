import { z } from 'zod';

import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';
import { FORMAT_VERSION } from '@/core/format-version';
import {
  fitsOneMessage,
  fragmentRecords,
  jsonByteLength,
  MESSAGE_BYTE_LIMIT,
} from '@/core/message-size';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import type { StateMessage } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';

// Records of a JSON size this large usually deflate under one message. A group that does not is
// halved until it does, so the guess costs time and never a lost record.
const RAW_GROUP_BYTES = MESSAGE_BYTE_LIMIT * 4;

// A group holds up to RAW_GROUP_BYTES and one more record, so an honest answer stays far below.
export const STATE_INFLATED_BYTE_LIMIT = RAW_GROUP_BYTES * 2;

const stateRecordsSchema = z.array(recordSchema);

// `skipped` holds the keys of records that do not fit one message even alone. Input refuses such a
// record, so one here is broken.
export type StateAnswer = { messages: StateMessage[]; skipped: string[] };

export type StateRecordsFailure = 'invalid-records';

type EncodedPart = { records: string };

export function encodeStateRecords(records: readonly VersionedRecord[]): string {
  return deflateToBase64(JSON.stringify(records));
}

export function decodeStateRecords(data: string): Result<VersionedRecord[], StateRecordsFailure> {
  const text = inflateFromBase64(data, STATE_INFLATED_BYTE_LIMIT);

  if (!text.ok) {
    return err('invalid-records');
  }

  try {
    const parsed = stateRecordsSchema.safeParse(JSON.parse(text.value));

    return parsed.success ? ok(parsed.data) : err('invalid-records');
  } catch {
    return err('invalid-records');
  }
}

// AD-7: the full answer to `r`, as `state` messages that each hold complete records and stay under
// the size limit after deflate and base64. No records still make one message, so the asker can
// count a complete answer.
export function stateAnswer(
  generation: Generation,
  r: string,
  records: readonly VersionedRecord[],
): StateAnswer {
  const skipped: string[] = [];
  const parts: EncodedPart[] = [];

  // Measured at the largest counters a message can carry.
  function fits(encoded: string): boolean {
    return fitsOneMessage({
      v: FORMAT_VERSION,
      g: generation,
      t: 'state',
      r,
      i: Number.MAX_SAFE_INTEGER,
      n: Number.MAX_SAFE_INTEGER,
      records: encoded,
    });
  }

  function place(group: readonly VersionedRecord[]): void {
    const encoded = encodeStateRecords(group);

    if (fits(encoded)) {
      parts.push({ records: encoded });

      return;
    }

    const [only] = group;

    if (group.length === 1 && only !== undefined) {
      skipped.push(only.k);

      return;
    }

    const middle = Math.ceil(group.length / 2);

    place(group.slice(0, middle));
    place(group.slice(middle));
  }

  for (const group of rawGroups(fragmentRecords(records))) {
    place(group);
  }

  if (parts.length === 0) {
    parts.push({ records: encodeStateRecords([]) });
  }

  const messages = parts.map((part, index): StateMessage => {
    return {
      v: FORMAT_VERSION,
      g: generation,
      t: 'state',
      r,
      i: index + 1,
      n: parts.length,
      records: part.records,
    };
  });

  return { messages, skipped };
}

function rawGroups(records: readonly VersionedRecord[]): VersionedRecord[][] {
  const groups: VersionedRecord[][] = [];
  let current: VersionedRecord[] = [];
  let used = 0;

  for (const record of records) {
    const bytes = jsonByteLength(record);

    if (current.length > 0 && used + bytes > RAW_GROUP_BYTES) {
      groups.push(current);
      current = [];
      used = 0;
    }

    current.push(record);
    used += bytes;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}
