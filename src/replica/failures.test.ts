import { describe, expect, test } from 'bun:test';
import { SendFailure } from '@/platform/ports';
import { createFailureSink, DIAGNOSTICS_LIMIT } from './failures';

describe('failure sink', () => {
  test('keeps the newest diagnostics last and drops the oldest beyond its limit', () => {
    // #given
    let timestamp = 0;
    const sink = createFailureSink({ now: () => timestamp++ });

    // #when
    for (let index = 0; index <= DIAGNOSTICS_LIMIT; index += 1) {
      sink.report(
        new SendFailure({
          kind: 'failed',
          reason: `failure ${index}`,
          channel: 'state',
        }),
      );
    }

    // #then
    expect(sink.recent().map((diagnostic) => ({ tag: diagnostic.tag, at: diagnostic.at }))).toEqual(
      Array.from({ length: DIAGNOSTICS_LIMIT }, (_, index) => ({
        tag: 'SendFailure',
        at: index + 1,
      })),
    );
  });
});
