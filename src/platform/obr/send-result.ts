import { z } from 'zod';

import { err, ok } from '@/core/result';
import type { SendResult } from '@/platform/ports';

const rateLimitHitSchema = z.object({ error: z.object({ name: z.literal('RateLimitHit') }) });

export async function toSendResult(send: () => Promise<void>): Promise<SendResult> {
  try {
    await send();

    return ok(undefined);
  } catch (cause) {
    if (rateLimitHitSchema.safeParse(cause).success) {
      return err({ kind: 'rate-limited' });
    }

    return err({ kind: 'failed', reason: describeRejection(cause) });
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
