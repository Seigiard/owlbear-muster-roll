export type Timing = {
  readonly sendSpacingMs: number;
  readonly rateLimitBackoffStartMs: number;
  readonly rateLimitBackoffMaxMs: number;
  readonly projectionRequestRepeatMs: number;
  readonly projectionIncompleteTimeoutMs: number;
  readonly fieldSavePauseMs: number;
  readonly catchUpTimeoutMs: number;
  readonly stateAnswerDelayMinMs: number;
  readonly stateAnswerDelayMaxMs: number;
  readonly gmLinkTimeoutMs: number;
  readonly snapshotPauseMs: number;
  readonly snapshotJitterMs: number;
};

export const TIMING: Timing = {
  sendSpacingMs: 50,
  // Measured: refused sends worked again within about 1 second.
  rateLimitBackoffStartMs: 250,
  rateLimitBackoffMaxMs: 4000,
  projectionRequestRepeatMs: 500,
  // Outlasts one longest backoff wait.
  projectionIncompleteTimeoutMs: 6000,
  // A typing pause this long saves a field, so a save never goes out per keystroke.
  fieldSavePauseMs: 800,
  // AD-7: a client with no complete answer this long leaves catch-up with what it holds.
  catchUpTimeoutMs: 4000,
  // A GM client answers a `state-request` after a random delay in this range, so one answer
  // usually goes out and the other GM clients see it and stay quiet.
  stateAnswerDelayMinMs: 20,
  stateAnswerDelayMaxMs: 300,
  // AD-6: a client that heard no GM client this long shows "no connection to GM", and it pings
  // after half of it.
  gmLinkTimeoutMs: 20000,
  // AD-8: a GM client writes the room copy once edits pause this long, plus a random part of the
  // jitter, so GM clients that saw one edit do not write together.
  snapshotPauseMs: 3000,
  snapshotJitterMs: 2000,
};

// A browser may read a download's object URL after the click returns, so it lives this long.
export const DOWNLOAD_URL_LIFETIME_MS = 30000;
