import { z } from 'zod';

import { Result } from 'better-result';
import { SendFailure, type SendResult } from '@/platform/ports';

const rateLimitHitSchema = z.object({ error: z.object({ name: z.literal('RateLimitHit') }) });

export async function toSendResult(
  send: () => Promise<void>,
  channel?: string,
): Promise<SendResult> {
  try {
    await send();

    return Result.ok(undefined);
  } catch (cause) {
    if (rateLimitHitSchema.safeParse(cause).success) {
      return Result.err(new SendFailure({ kind: 'rate-limited', channel }));
    }

    return Result.err(
      new SendFailure({ kind: 'failed', reason: describeRejection(cause), channel }),
    );
  }
}

function describeRejection(cause: unknown): string {
  if (cause instanceof Error) {
    return String(cause);
  }

  try {
    // JSON.stringify returns undefined for undefined, whatever its type declares.
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return String(cause);
  }
}
