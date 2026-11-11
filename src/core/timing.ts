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
  readonly openRequestTtlMs: number;
  readonly proposeResendStartMs: number;
  readonly proposeResendMaxMs: number;
  readonly editDeniedQuietMs: number;
  readonly pendingMarkDelayMs: number;
  readonly presetRequestTimeoutMs: number;
  readonly incompleteRequestStartMs: number;
  readonly incompleteRequestMaxMs: number;
  // A window gives up on a snapshot import with no answer. Longer than the preset wait, as the
  // import writes the room copy before it answers.
  readonly snapshotImportTimeoutMs: number;
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
  // FR14: a sheet "Открыть лист" asked for waits this long for a window. A window opened by hand
  // later shows its own first tab.
  openRequestTtlMs: 15000,
  // AD-4: a player resends a `propose` with no answer after this long, then after twice as long
  // each time, up to the max. A `stale` answer starts the wait again.
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  // UX-DR29: "Нет прав на правку" shows once for `denied` answers within this long of the last one
  // shown, so one revoke that refuses several pending keys shows one notification.
  editDeniedQuietMs: 2000,
  // UX-DR3: a player's edit with no answer this long shows "Ожидает". With no GM it shows at once.
  // The window keeps this timer, so a hidden background page cannot hold the mark back.
  pendingMarkDelayMs: 1000,
  // AD-14: a preset diff or upload with no answer this long gives up, so the button never waits
  // forever.
  presetRequestTimeoutMs: 15000,
  // AD-9: a client whose new generation is not complete stays in catch-up past its timeout and asks
  // for the state again after this long, then after twice as long each time, up to the max.
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

// An access change with no answer this long shows that it failed, so the panel never waits forever.
export const ACCESS_CHANGE_TIMEOUT_MS = 5000;

// CAP-31: a window gives up on a wipe with no answer after this long. As long as the snapshot
// import wait, as a wipe also writes the room copy before it answers.
export const WIPE_TIMEOUT_MS = 60000;

// A browser may read a download's object URL after the click returns, so it lives this long.
export const DOWNLOAD_URL_LIFETIME_MS = 30000;

// A scene read that failed is tried again after this long, while the scene stays as it was.
export const SCENE_READ_RETRY_MS = 500;

// The link picker's waits. A pick with neither its link nor a rejection by `pickTimeoutMs` counts
// as failed. A token label read with no answer by `labelReadTimeoutMs` counts as unreadable, so a
// hung read never blocks linking. A label write, or its failure notification, with no answer by
// `labelWriteTimeoutMs` counts as failed, so the picker still closes.
export type LinkPickerTiming = {
  pickTimeoutMs: number;
  labelReadTimeoutMs: number;
  labelWriteTimeoutMs: number;
};

export const LINK_PICKER_TIMING: LinkPickerTiming = {
  pickTimeoutMs: 5000,
  labelReadTimeoutMs: 2000,
  labelWriteTimeoutMs: 5000,
};

// TASK-36: the dice extension's waits, each from the moment it starts. A readiness probe gets
// `probeWaitMs` for an answer. A roll probes again when the last probe is older than
// `probeMaxAgeMs`. A roll with no result `resultTimeoutMs` after it was asked for rolls locally. An
// unanswered probe at start is tried again `startProbeRetries` times, after `startProbeRetryMs` and
// then twice as long each time, for an extension that loads after Muster Roll. A roll the GM has not
// yet allowed waits `accessWaitMs` longer, as `dicex` holds it that long for the GM's answer (its
// `ACCESS_DECISION_TIMEOUT_MS`).
export type DiceExtensionTiming = {
  probeWaitMs: number;
  probeMaxAgeMs: number;
  resultTimeoutMs: number;
  startProbeRetries: number;
  startProbeRetryMs: number;
  accessWaitMs: number;
};

export const DICE_EXTENSION_TIMING: DiceExtensionTiming = {
  probeWaitMs: 1000,
  probeMaxAgeMs: 60000,
  resultTimeoutMs: 30000,
  startProbeRetries: 3,
  startProbeRetryMs: 2000,
  accessWaitMs: 25000,
};
