export type Timing = {
  readonly sendSpacingMs: number;
  readonly rateLimitBackoffStartMs: number;
  readonly rateLimitBackoffMaxMs: number;
  readonly projectionRequestRepeatMs: number;
  readonly projectionIncompleteTimeoutMs: number;
  readonly fieldSavePauseMs: number;
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
};

// A browser may read a download's object URL after the click returns, so it lives this long.
export const DOWNLOAD_URL_LIFETIME_MS = 30000;
