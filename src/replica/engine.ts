import { nanoid } from 'nanoid';

import { partyEntries } from '@/core/access';
import { createBoundedIdSet } from '@/core/bounded-id-set';
import { recordDigest } from '@/core/digest';
import { newRecordId, type RecordIdKind } from '@/core/ids';
import { recordFitsOneMessage } from '@/core/message-size';
import { compareGenerations, mergeRecords, type Version } from '@/core/merge';
import { liveLinkTarget, type LinkTarget } from '@/core/link-target';
import { decodePreset, windowSizeOf, type Preset } from '@/core/preset';
import { NOTHING_ERASED } from '@/core/preset-migrate';
import { presetDataSchema, type VersionedRecord } from '@/core/records';
import type { RollCopy } from '@/core/roll-text';
import {
  aliveMessage,
  pingMessage,
  proposeMessages,
  stateRequestMessage,
  SYNC_CHANNEL,
} from '@/core/room-messages';
import { openTarget, tokensToUnlink } from '@/core/token-links';
import { stateAnswer } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import {
  DICE_EXTENSION_TIMING,
  TIMING,
  type DiceExtensionTiming,
  type Timing,
} from '@/core/timing';
import {
  parseWindowMessage,
  UI_CHANNEL,
  type EngineMessage,
  type Notice,
  type OpenSheetRequest,
  type RejectionReason,
} from '@/core/ui-messages';
import { linkTargetShownTo, type PlayerRole } from '@/core/visibility';
import type { BroadcastOptions, Platform } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import {
  createCatchUp,
  type CatchUp,
  type CatchUpDecision,
  type CatchUpTimer,
} from '@/replica/catch-up';
import { createCommitOutbox } from '@/replica/commit-outbox';
import { createComposers, type ComposeContext, type PresetUploadLoss } from '@/replica/composers';
import { createDiceExtension } from '@/replica/dice-extension';
import {
  createGenerationFlow,
  type GenerationFlow,
  type GenerationPersistence,
} from '@/replica/generation-flow';
import { createPartyRoster } from '@/replica/party-roster';
import { createCommandRouting, type CommandRouting } from '@/replica/command-routing';
import { createPendingQueue } from '@/replica/pending-queue';
import { createPendingEdits } from '@/replica/pending-edits';
import { createRecordStore } from '@/replica/record-store';
import { createRoomCopy, type RoomCopy } from '@/replica/room-copy';
import { createRollFlow } from '@/replica/roll-flow';
import { createRoomProtocol } from '@/replica/room-protocol';
import { watchSceneRemovals, type SceneWatch } from '@/replica/scene-watch';
import { createTokenMenu, type TokenMenuCopy } from '@/replica/token-menu';
import { createVersionMinter } from '@/replica/version-minter';
import { createWindowSizer } from '@/replica/window-size';
import { createWindowPublisher, type WindowPublisher } from '@/replica/window-publisher';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

const REMOTE: BroadcastOptions = { destination: 'REMOTE' };

// Enough for any burst of echoes, small enough to keep nothing forever.
const RECENT_COMMAND_ID_LIMIT = 256;

// Far more tokens than one session deletes while a link to one of them can still arrive.
const DELETED_TOKEN_LIMIT = 1024;

// Sits in the problem set, and no write clears it: a reload has to read the storage again.
const UNREADABLE_STORAGE_MARK = '(unreadable)';

// AD-9: a new generation whose save failed. Its keys name no record of the generation kept, so the
// mark goes with the next record saved, or when the replica is replaced.
const GENERATION_SAVE_MARK = '(generation-save)';

export type ReplicaEnginePlatform = Pick<
  Platform,
  | 'action'
  | 'broadcast'
  | 'contextMenu'
  | 'metadata'
  | 'notification'
  | 'party'
  | 'player'
  | 'popover'
  | 'scene'
  | 'storage'
>;

export type EngineTiming = Pick<
  Timing,
  | 'catchUpTimeoutMs'
  | 'stateAnswerDelayMinMs'
  | 'stateAnswerDelayMaxMs'
  | 'gmLinkTimeoutMs'
  | 'snapshotPauseMs'
  | 'snapshotJitterMs'
  | 'openRequestTtlMs'
  | 'proposeResendStartMs'
  | 'proposeResendMaxMs'
  | 'editDeniedQuietMs'
  | 'incompleteRequestStartMs'
  | 'incompleteRequestMaxMs'
>;

// Tests inject the timing, the ids, and the random source of the answer delay, the room copy jitter
// and the dice. `newId` makes the engine's own ids, such as nonces; `newRecordId` makes the sheet
// and instance ids of the records a command makes, such as a duplicate's.
export type ReplicaEngineOptions = {
  timing?: EngineTiming;
  newId?: () => string;
  newRecordId?: (kind: RecordIdKind) => string;
  random?: () => number;
  // TASK-36: the dice extension's waits.
  diceTiming?: DiceExtensionTiming;
  // The copy catalog's roll strings. The background page passes them; with none, no roll shows.
  rollCopy?: RollCopy;
  // The copy catalog's token menu labels. The background page passes them; with none, no token
  // menu is made.
  menuCopy?: TokenMenuCopy;
  // UX-DR29: the copy catalog's "Нет прав на правку". The background page passes it; with none, a
  // denied edit shows no notification.
  editDenied?: string;
  // UX-DR31: the copy catalog's "Данные комнаты заменены". The background page passes it; with
  // none, an adopted generation shows no notification.
  dataReplaced?: string;
};

export type ReplicaEngine = {
  stop: () => void;
  // Sends every waiting message at once, held commits included, for a page that is about to close.
  flushNow: () => void;
  // AD-7: the page became visible, resumed, or came back online.
  catchUp: () => void;
  // AD-8: the page became hidden, so a GM client writes the room copy at once. A hidden tab's
  // timers may not run.
  pageHidden: () => void;
};

type Persisted = { record: VersionedRecord; saved: boolean };

type LoadedReplica = {
  records: VersionedRecord[];
  problemKeys: Set<string>;
  persistence: GenerationPersistence | null;
};

// The decoded preset, kept while the `preset` record keeps its version.
type DecodedPreset = { c: number; a: string; preset: Preset };

export async function startReplicaEngine(
  platform: ReplicaEnginePlatform,
  sendQueue: SendQueue,
  options: ReplicaEngineOptions = {},
): Promise<ReplicaEngine> {
  const timing = options.timing ?? TIMING;
  const newId = options.newId ?? nanoid;
  const newRecordIdOf = options.newRecordId ?? newRecordId;
  const random = options.random ?? Math.random;

  const [startRole, connectionId, ownPlayerId] = await Promise.all([
    platform.player.getRole(),
    platform.player.getConnectionId(),
    platform.player.getId(),
  ]);

  const loaded = loadReplica(platform, startRole);
  const replica = new Map<string, VersionedRecord>();
  const problemKeys = loaded.problemKeys;
  const minter = createVersionMinter(connectionId);
  const composers = createComposers(connectionId);
  const recentCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);
  let decodedPreset: DecodedPreset | null = null;
  // TASK-33: the window follows the size of the `preset` record. `sizedFor` names the version the
  // size was last taken from, "" for no preset. It is null before the first size and after a failed
  // one, so the next replica change asks again.
  let sizedFor: string | null = null;

  const windowSizer = createWindowSizer(platform.action, () => {
    sizedFor = null;
  });

  const pending = createPendingQueue();
  // AD-5: re-read on every party change, and a change enters catch-up.
  let role = startRole;
  let generationFlow: GenerationFlow;
  const outbox = createCommitOutbox(sendQueue, () => generationFlow.generation());
  let stopped = false;
  let catchUp: CatchUp;

  // AD-4: a player's edits, one entry per key, until a GM client answers each. Only the newest
  // version of an entry is composed into the `propose` the queue takes.
  const pendingEdits = createPendingEdits({
    timing,
    playerId: ownPlayerId,
    connectionId,
    records: () => replica,
    catchingUp: () => catchUp.view().state === 'catching-up',
    presetOf,
    compose: (view, command) => composers.compose(dryContext(view), command),
    mint: minter.mint,
    now: () => performance.now(),
    enqueue: (compose) =>
      sendQueue.enqueueComposed(
        SYNC_CHANNEL,
        () => {
          const record = compose();

          if (record === null || stopped || role === 'GM') return null;
          const generation = generationFlow.generation();
          const [first, ...rest] = proposeMessages(generation, record);

          for (const part of rest) {
            sendQueue
              .enqueueComposed(
                SYNC_CHANNEL,
                () =>
                  stopped ||
                  role === 'GM' ||
                  compareGenerations(generation, generationFlow.generation()) !== 0
                    ? null
                    : part,
                REMOTE,
              )
              .catch((error) =>
                console.error('Muster Roll could not send a proposal fragment', error),
              );
          }

          return first ?? null;
        },
        REMOTE,
      ),
  });

  // AD-12: once a newer build has spoken in the room, the banner stays until a reload.
  let newerVersionSeen = false;
  // AD-10: the background owns the token menu. "Отвязать лист" runs as a GM command of this
  // engine, so it goes through the same checks, catch-up queue, storage and send as a window's.
  // No window owns the id of a command the menu issues, so this page shows its rejection.
  const menuCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);

  // TASK-36: the dice extension of this client, if one answers. It probes at start, and a GM
  // client asks it for access when the probe says the GM has not allowed Muster Roll yet.
  const diceExtension = createDiceExtension(
    platform.broadcast,
    options.diceTiming ?? DICE_EXTENSION_TIMING,
    newId,
    () => role === 'GM',
  );

  diceExtension.start();

  const tokenMenu =
    options.menuCopy === undefined
      ? null
      : createTokenMenu(platform, options.menuCopy, {
          unlink: (tokenId) => {
            const id = newId();

            menuCommandIds.add(id);
            commandRouting.handleCommand({
              t: 'command',
              id,
              command: { type: 'link-clear', tokenId },
            });
          },
          open: openFromToken,
        });

  // TASK-39: a GM client watches the open scene and clears the link of a token deleted from it,
  // through the same GM command path as "Отвязать лист". A player client never reads the scene.
  let sceneWatch: SceneWatch | null = null;
  // The ids of those commands. A refused clear is silent, because the token is gone and no GM could
  // act on a message about it. The token stays in `deletedTokens`, so the next check tries again.
  const sceneCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);
  // Item ids this GM client saw deleted from the open scene, oldest first, until the item shows in
  // the scene again. A link to one of them is cleared whenever this client is live and not
  // importing: one that waited out a catch-up or an import, and one that another GM client wrote
  // after the deletion.
  const deletedTokens = new Set<string>();

  // FR14: the sheet "Открыть лист" asked for, until a window acknowledges it. A newer press
  // replaces it. It is dropped once this role cannot see the sheet, the sheet is gone, Owlbear
  // refuses to open the window, or it outlives its lifetime.
  let heldOpen: OpenSheetRequest | null = null;
  // Read against the clock, not a timer, as a hidden tab's timers may not run.
  let heldOpenUntil = 0;

  // AD-11: a client that became GM persists every held record when its catch-up ends.
  let persistAllOnExit = false;
  let roleReads = 0;
  // Made after `stopped`, which its callback reads, and before `publisher`, which it also reads.
  // Its first replace follows the asynchronous party read; no await falls between this and the
  // publisher assignment.
  const roster = createPartyRoster(platform.party, followParty);
  // The digest of the replica, until the replica changes.
  let cachedDigest: number | null = null;
  let roomCopy: RoomCopy;
  const catchUpTimers = new Map<string, ReturnType<typeof setTimeout>>();

  catchUp = createCatchUp({
    timing,
    random,
    newId,
    now: () => Date.now(),
    role: () => role,
    vouches: () => generationFlow.persistence() !== null,
    generation: () => generationFlow.generation(),
    digest: ownDigest,
    commitsUnsent: () => outbox.hasUnsent(),
    hasData: () => replica.size > 0 || pending.entries().length > 0 || pendingEdits.size() > 0,
    saveAdoption: (generation, fromCopy) => generationFlow.saveAdoption(generation, fromCopy),
  });

  let publisher: WindowPublisher;
  let commandRouting: CommandRouting;

  for (const record of loaded.records) {
    merge(record);
  }

  // TASK-33: a saved preset sizes the window before the first catch-up ends.
  followWindowSize();

  roomCopy = createRoomCopy({
    metadata: platform.metadata,
    timing,
    random,
    schedule: (delayMs, run) => {
      const timer = setTimeout(run, delayMs);

      return () => clearTimeout(timer);
    },
    writable: canWriteRoomCopy,
    gm: () => role === 'GM',
    generation: () => generationFlow.generation(),
    records: () => [...replica.values()],
    receive: receiveRecords,
    adopt: (copy) => {
      const decisions = generationFlow.adoptFromCopy(copy);

      if (decisions.adoptionStaged.length > 0) {
        void runCatchUp(decisions.adoptionStaged).catch((error) => {
          console.error('Muster Roll could not complete adoption from the room copy', error);
        });
      }
    },
    newerVersion: raiseNewerVersion,
    changed: () => publisher.publish(),
  });

  commandRouting = createCommandRouting({
    role: () => role,
    importing: () => generationFlow.importing(),
    live: catchUp.live,
    acceptCommand,
    composers,
    records: () => replica,
    liveContext,
    dryContext,
    newRecordId: newRecordIdOf,
    pending,
    pendingEdits,
    apply,
    reject,
    commandDone,
    notifyDenied,
    publish: () => publisher.publish(),
    hasPersistence: () => generationFlow.persistence() !== null,
    flushOutbox: outbox.flush,
    addCommits: sendCommits,
    roomCopyEdited: roomCopy.edited,
    importFromSnapshot: (id, command) => generationFlow.importFromSnapshot(id, command),
    wipe: (id) => generationFlow.wipe(id),
    reply: (message) => {
      send(message).catch((error) => {
        console.error('Muster Roll could not answer a command', error);
      });
    },
  });

  publisher = createWindowPublisher({
    send,
    newId,
    presetOf,
    state: () => ({
      role,
      replica,
      pendingView: commandRouting.pendingViewRecords(),
      notices: currentNotices(),
      sync: catchUp.view(),
      roomCopy: roomCopy.status(),
      // UX-DR12: only a GM's access panel lists the party, so a player's windows get none.
      party: role === 'GM' ? partyEntries(roster.entries()) : [],
    }),
  });

  generationFlow = createGenerationFlow({
    initialPersistence: loaded.persistence,
    connectionId,
    records: () => replica,
    presetOf,
    role: () => role,
    stopped: () => stopped,
    acceptCommand,
    catchUp,
    interpretCatchUp: (decisions) => {
      void runCatchUp(decisions).catch((error) => {
        console.error('Muster Roll could not start adoption from the room copy', error);
      });
    },
    roomCopy,
    flush: outbox.flush,
    dropOutbox: outbox.drop,
    sendRemote: (message) => {
      sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE).catch((error) => {
        console.error('Muster Roll could not send the reset', error);
      });
    },
    replaceReplica: replaceReplicaRecords,
    clearPendingEdits: pendingEdits.clear,
    dropPendingWork: () => {
      for (const entry of pending.takeAll()) {
        const ids = entry.kind === 'intent' ? [entry.id] : entry.patches.map((patch) => patch.id);

        for (const id of ids) {
          reject(id, 'data-replaced');
        }
      }

      commandRouting.clearPendingIds();
      pendingEdits.clear();
    },
    notifyDataReplaced,
    markGenerationSaveFailed: () => {
      problemKeys.add(GENERATION_SAVE_MARK);
    },
    publish: () => publisher.publish(),
    clearDeletedLinks,
    reject,
    reply: (message) => {
      send(message).catch((error) => {
        console.error('Muster Roll could not report a generation result', error);
      });
    },
  });

  const rollFlow = createRollFlow({
    pendingView: commandRouting.pendingView,
    presetOf,
    role: () => role,
    stopped: () => stopped,
    generation: () => generationFlow.generation(),
    dice: diceExtension,
    gmInRoom,
    playerId: ownPlayerId,
    playerName: () => platform.player.getName(),
    random,
    newId,
    sendRemote: (message) => sendQueue.enqueueReported(SYNC_CHANNEL, message, REMOTE),
    replyOutcome: (id, outcome) => {
      send({ t: 'roll-outcome', id, outcome }).catch((error) => {
        console.error('Muster Roll could not answer a roll request', error);
      });
    },
    notify: (text) => platform.notification.show(text).then(() => undefined),
    rollCopy: options.rollCopy,
  });

  function merge(record: VersionedRecord): VersionedRecord {
    const current = replica.get(record.k);
    const winner = current === undefined ? record : mergeRecords(current, record);

    replica.set(winner.k, winner);
    cachedDigest = null;

    return winner;
  }

  function currentNotices(): Notice[] {
    const notices: Notice[] = problemKeys.size === 0 ? [] : ['local-save-failed'];

    notices.push(...roomCopy.notices());

    if (newerVersionSeen) {
      notices.push('new-version');
    }

    return notices;
  }

  function send(message: EngineMessage): Promise<void> {
    return sendQueue.enqueue(UI_CHANNEL, message, LOCAL);
  }

  function acceptCommand(id: string): boolean {
    if (recentCommandIds.has(id)) {
      return false;
    }

    recentCommandIds.add(id);

    return true;
  }

  function catchUpTimerKey(timer: CatchUpTimer): string {
    return timer.kind === 'request' || timer.kind === 'answer'
      ? `${timer.kind}:${timer.r}`
      : timer.kind;
  }

  function disarmCatchUpTimer(timer: CatchUpTimer): void {
    const key = catchUpTimerKey(timer);
    const handle = catchUpTimers.get(key);

    if (handle !== undefined) {
      clearTimeout(handle);
      catchUpTimers.delete(key);
    }
  }

  function armCatchUpTimer(timer: CatchUpTimer, delayMs: number): void {
    if (stopped) {
      return;
    }

    const key = catchUpTimerKey(timer);

    disarmCatchUpTimer(timer);

    const handle = setTimeout(() => {
      if (stopped) {
        return;
      }

      if (catchUpTimers.get(key) !== handle) {
        return;
      }

      catchUpTimers.delete(key);
      void runCatchUp(catchUp.fired(timer)).catch((error) => {
        console.error('Muster Roll could not run a catch-up timer', error);
      });
    }, delayMs);

    catchUpTimers.set(key, handle);
  }

  function runCatchUp(decisions: readonly CatchUpDecision[]): Promise<void> {
    if (stopped) {
      return Promise.resolve();
    }

    const reads: Promise<void>[] = [];

    for (const decision of decisions) {
      switch (decision.type) {
        case 'arm':
          armCatchUpTimer(decision.timer, decision.delayMs);
          break;
        case 'disarm':
          disarmCatchUpTimer(decision.timer);
          break;
        case 'entered': {
          if (decision.trigger !== 'start') {
            mergePersisted();
          }

          publisher.publish();

          break;
        }

        case 'read-room-copy':
          reads.push(
            roomCopy
              .read()
              .then(() => {
                if (stopped) {
                  return;
                }

                // Merge is idempotent, so a copy read while an answer ended catch-up still merges.
                return runCatchUp(catchUp.roomCopyRead(decision.r, decision.fresh));
              })
              .catch((error) => {
                console.error('Muster Roll could not continue a room copy read', error);
              }),
          );
          break;

        case 'read-party':
          reads.push(
            platform.party
              .getPlayers()
              .then((players) => {
                if (stopped) {
                  return;
                }

                return runCatchUp(catchUp.partyRead(decision.r, players));
              })
              .catch((error) => {
                console.error('Muster Roll could not read the party', error);
              }),
          );
          break;

        case 'request':
          sendQueue
            .enqueue(
              SYNC_CHANNEL,
              stateRequestMessage(generationFlow.generation(), decision.r),
              REMOTE,
            )
            .catch((error) => {
              console.error('Muster Roll could not ask for the room state', error);
            });
          break;
        case 'answer': {
          const answer = stateAnswer(generationFlow.generation(), decision.r, [
            ...replica.values(),
          ]);

          for (const key of answer.skipped) {
            console.error('Muster Roll left out a record too large for one state message', key);
          }

          for (const message of answer.messages) {
            sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE).catch((error) => {
              console.error('Muster Roll could not send the room state', error);
            });
          }

          break;
        }

        case 'alive':
          sendQueue
            .enqueue(SYNC_CHANNEL, aliveMessage(generationFlow.generation(), ownDigest()), REMOTE)
            .catch((error) => {
              console.error('Muster Roll could not answer a ping', error);
            });
          break;
        case 'ping':
          sendQueue
            .enqueue(SYNC_CHANNEL, pingMessage(generationFlow.generation()), REMOTE)
            .catch((error) => {
              console.error('Muster Roll could not ping the GM clients', error);
            });
          break;

        case 'caught-up':
          performCaughtUp(decision.exit);
          break;
        case 'show':
          publisher.publish();

          break;

        case 'gm-back':
          // A GM is back, so the edits that waited for one go out now, not after their backoff.
          pendingEdits.gmBack();
          break;
        case 'adopt':
          generationFlow.clearStaged(decision.hadData, decision.keepNonce);
          break;
      }
    }

    return Promise.all(reads).then(() => undefined);
  }

  // `changed` goes with `count-changed` only.
  function reject(
    id: string,
    reason: RejectionReason,
    changed: PresetUploadLoss = { count: 0, sheets: 0, digest: NOTHING_ERASED },
  ): void {
    if (sceneCommandIds.has(id)) {
      return;
    }

    if (menuCommandIds.has(id) && options.menuCopy !== undefined) {
      platform.notification.show(options.menuCopy.unlinkFailed, 'ERROR').catch((error) => {
        console.error('Muster Roll could not show a refused unlink', error);
      });
    }

    const message: EngineMessage =
      reason === 'count-changed'
        ? { t: 'command-rejected', id, reason, ...changed }
        : { t: 'command-rejected', id, reason };

    send(message).catch((error) => {
      console.error('Muster Roll could not reject a command', error);
    });
  }

  // A successful window command is answered after every delta part carrying its effect. Both
  // messages use the same queue, so a large delta cannot be overtaken by its answer. Engine-made
  // commands have no window waiting on their ids, so they stay silent.
  function commandDone(id: string): void {
    if (sceneCommandIds.has(id) || menuCommandIds.has(id)) {
      return;
    }

    send({ t: 'command-done', id }).catch((error) => {
      console.error('Muster Roll could not answer a command', error);
    });
  }

  // UX-DR21: a press on a token whose target this role cannot see opens nothing. Owlbear's filter
  // already hides such an item, but a press can race a link or role change. A repeat block target
  // opens its sheet scrolled to it (CAP-14).
  function openFromToken(tokenId: string): void {
    if (stopped) {
      return;
    }

    const target = openTarget(replica, presetOf(replica.get('preset')), tokenId, role);

    if (target === null) {
      return;
    }

    const id = newId();

    heldOpen =
      target.path === null || target.path === undefined
        ? { id, sheetId: target.sheetId, cellId: target.cellId ?? '' }
        : { id, sheetId: target.sheetId, path: target.path, cellId: target.cellId ?? '' };
    heldOpenUntil = Date.now() + timing.openRequestTtlMs;
    // No window opens for it, so a window opened by hand later does not jump to it.
    platform.action.open().catch((error) => {
      console.error('Muster Roll could not open its window', error);
      dropOpen(id);
    });
    // An open window takes it at once. A closed one asks for a projection when it opens.
    deliverOpen();
  }

  // Sent to every window. The first to acknowledge it ends the request, so a window that reloads or
  // connects later never gets it again.
  function deliverOpen(): void {
    dropStaleOpen();

    if (heldOpen === null) {
      return;
    }

    send({ t: 'open-sheet', ...heldOpen }).catch((error) => {
      console.error('Muster Roll could not ask a window to open a sheet', error);
    });
  }

  function dropStaleOpen(): void {
    if (
      heldOpen !== null &&
      (Date.now() >= heldOpenUntil || !openTargetShown(openRequestTarget(heldOpen)))
    ) {
      heldOpen = null;
    }
  }

  // The sheet is one this role sees, and a repeat block, when named, is live on a tab this role sees.
  function openTargetShown(target: LinkTarget): boolean {
    const live = liveLinkTarget(replica, presetOf(replica.get('preset')), target);

    return live !== null && linkTargetShownTo(role, live);
  }

  function openRequestTarget(request: OpenSheetRequest): LinkTarget {
    return {
      sheetId: request.sheetId,
      instanceId: request.path?.at(-1) ?? null,
      path: request.path,
      cellId: request.cellId,
    };
  }

  function dropOpen(id: string): void {
    if (heldOpen?.id === id) {
      heldOpen = null;
    }
  }

  // A party change reaches a GM's windows at once, so the access panel lists who is in the room.
  function followParty(): void {
    if (stopped) {
      return;
    }

    publisher.publish();
  }

  // AD-2: the menu follows every change of the replica or the role, once the first catch-up has
  // brought the room's links. It reads the replica, not the pending view, so a queued link shows
  // in the menu when it applies. Records that change nothing leave the filters as they were.
  function refreshTokenMenu(): void {
    if (tokenMenu !== null && !stopped && catchUp.view().firstCatchUpDone) {
      tokenMenu.update(replica, presetOf(replica.get('preset')), role);
    }
  }

  // TASK-33: every client sizes the window from the preset it holds, once it holds one or its first
  // catch-up found none. A size is taken once per version of the `preset` record. A preset this
  // build cannot read, as one a newer build wrote, keeps the current size.
  function followWindowSize(): void {
    const record = replica.get('preset');

    if (stopped || (record === undefined && !catchUp.view().firstCatchUpDone)) {
      return;
    }

    const version = record === undefined ? '' : `${record.c}:${record.a}`;

    if (version === sizedFor) {
      return;
    }

    sizedFor = version;

    const preset = presetOf(record);

    if (record !== undefined && preset === null) {
      return;
    }

    windowSizer.apply(windowSizeOf(preset));
  }

  // The replica changed: the token menu and the window size follow it.
  function followReplica(): void {
    refreshTokenMenu();
    followWindowSize();
  }

  // Only a GM client watches the scene. A fresh watch has seen no item, so a role change never counts
  // the tokens already gone as deleted.
  function followScene(): void {
    if (role === 'GM' && !stopped) {
      sceneWatch ??= watchSceneRemovals(platform.scene, {
        removed: unlinkRemoved,
        present: forgetPresent,
      });

      return;
    }

    sceneWatch?.stop();
    sceneWatch = null;
    deletedTokens.clear();
  }

  function unlinkRemoved(itemIds: readonly string[]): void {
    if (stopped || role !== 'GM') {
      return;
    }

    for (const itemId of itemIds) {
      deletedTokens.delete(itemId);
      deletedTokens.add(itemId);
    }

    // The oldest go first, so a long session keeps a bounded list.
    for (const oldest of deletedTokens) {
      if (deletedTokens.size <= DELETED_TOKEN_LIMIT) {
        break;
      }

      deletedTokens.delete(oldest);
    }

    clearDeletedLinks();
  }

  // An item back in the scene, as after an Owlbear undo, is not deleted, so the GM can link it again.
  function forgetPresent(itemIds: ReadonlySet<string>): void {
    for (const tokenId of deletedTokens) {
      if (itemIds.has(tokenId)) {
        deletedTokens.delete(tokenId);
      }
    }
  }

  // The live links of deleted tokens, once this GM client is live and not importing. One
  // `link-clear` per token, each with an id no window owns. Engine-made, so its id stays out of
  // `recentCommandIds`, which only guards against window repeats.
  function clearDeletedLinks(): void {
    if (stopped || role !== 'GM' || !catchUp.live() || generationFlow.importing()) {
      return;
    }

    for (const tokenId of tokensToUnlink(deletedTokens, replica)) {
      const id = newId();

      sceneCommandIds.add(id);
      commandRouting.runCommand(id, { type: 'link-clear', tokenId });
    }
  }

  function persist(record: VersionedRecord): Persisted {
    const currentPersistence = generationFlow.persistence();

    if (currentPersistence === null) {
      return { record, saved: true };
    }

    const { store, generation } = currentPersistence;
    const written = store.write(generation, record);

    if (written.ok) {
      problemKeys.delete(record.k);
      problemKeys.delete(GENERATION_SAVE_MARK);

      return { record: written.value, saved: true };
    }

    console.error('Muster Roll could not save a record', written.error);
    problemKeys.add(record.k);

    return { record, saved: false };
  }

  function liveContext(): ComposeContext {
    return { records: replica, mint: minter.mint, newRecordId: newRecordIdOf, isGmPlayer };
  }

  // FR19: a GM owns no sheet, so neither this client's player id nor one the party lists as a GM
  // takes an owner link.
  function isGmPlayer(playerId: string): boolean {
    return (
      playerId === ownPlayerId ||
      roster.entries().some((member) => member.id === playerId && member.role === 'GM')
    );
  }

  // Mints nothing: a version of the pending view never reaches the room or the storage.
  function dryContext(records: ReadonlyMap<string, VersionedRecord>): ComposeContext {
    return {
      records,
      mint: (_key, highestKnownCounter): Version => ({
        c: highestKnownCounter + 1,
        a: connectionId,
      }),
      newRecordId: newRecordIdOf,
      isGmPlayer,
    };
  }

  // A batch is saved in order and stops at its first failed write. The failed record and the ones
  // after it are not applied, so a retry of the command reaches them again. A single record keeps
  // its value after a failed write, and the notice asks the GM for a snapshot, unless it is part of
  // a batch the caller splits.
  function apply(
    records: readonly VersionedRecord[],
    stopsOnFailure = records.length > 1,
  ): VersionedRecord[] {
    const applied: VersionedRecord[] = [];

    for (const record of records) {
      const persisted = persist(record);

      if (!persisted.saved && stopsOnFailure) {
        break;
      }

      merge(persisted.record);
      applied.push(record);
    }

    followReplica();

    return applied;
  }

  // AD-4: a GM edit goes to the room after it is merged, persisted and shown. A GM whose storage
  // could not be read minted without the saved state, so its records stay in this client.
  function sendCommits(
    applied: readonly VersionedRecord[],
    acks: readonly { k: string; c: number; a: string }[] = [],
  ): void {
    if (generationFlow.persistence() !== null) {
      outbox.add(applied, acks);
    }
  }

  // The replica becomes the new generation's records. The windows get a new stream, as a delta
  // cannot take the old records out of them: each asks for a fresh projection.
  function replaceReplicaRecords(records: readonly VersionedRecord[]): void {
    replica.clear();
    cachedDigest = null;
    decodedPreset = null;

    // The keys that failed to save were the old generation's. Unreadable storage stays unreadable.
    for (const key of problemKeys) {
      if (key !== UNREADABLE_STORAGE_MARK) {
        problemKeys.delete(key);
      }
    }

    for (const record of records) {
      merge(record);
    }

    publisher.restart();
    dropStaleOpen();
    followReplica();
  }

  function notifyDenied(): void {
    if (options.editDenied === undefined) {
      return;
    }

    platform.notification.show(options.editDenied, 'ERROR').catch((error) => {
      console.error('Muster Roll could not show a denied edit', error);
    });
  }

  function gmInRoom(): boolean {
    return role === 'GM' || roster.entries().some((member) => member.role === 'GM');
  }

  // Decoded again only when the record's version changes, not on every press.
  function presetOf(record: VersionedRecord | undefined): Preset | null {
    if (record === undefined) {
      return null;
    }

    if (decodedPreset?.c === record.c && decodedPreset.a === record.a) {
      return decodedPreset.preset;
    }

    const data = presetDataSchema.safeParse(record.d);
    const decoded = data.success ? decodePreset(data.data) : null;

    if (decoded === null || !decoded.ok) {
      return null;
    }

    decodedPreset = { c: record.c, a: record.a, preset: decoded.value };

    return decoded.value;
  }

  // A GM client merges what it and the other tabs of its browser saved. A player persists nothing.
  function mergePersisted(): void {
    const currentPersistence = generationFlow.persistence();

    if (currentPersistence === null || role !== 'GM') {
      return;
    }

    const load = currentPersistence.store.loadGeneration(currentPersistence.generation);

    if (!load.ok) {
      console.error('Muster Roll could not read the saved records', load.error);

      return;
    }

    for (const key of load.value.corruptKeys) {
      problemKeys.add(key);
    }

    for (const record of load.value.records) {
      // A record too large for a message could never reach a window, so it counts as corrupt.
      if (!recordFitsOneMessage(record)) {
        problemKeys.add(record.k);
        continue;
      }

      merge(record);
    }

    followReplica();
  }

  function enterCatchUp(
    trigger: 'start' | 'page-return' | 'role' | 'generation' | 'drift' | 'gm-return',
  ): Promise<void> {
    if (stopped) {
      return Promise.resolve();
    }

    return runCatchUp(catchUp.enter(trigger));
  }

  // AD-8: only a live GM client that can vouch for its records writes, as only such a client
  // answers a `state-request`. Checked again after every await.
  function canWriteRoomCopy(): boolean {
    return !stopped && role === 'GM' && generationFlow.persistence() !== null && catchUp.live();
  }

  function notifyDataReplaced(): void {
    if (options.dataReplaced === undefined) {
      return;
    }

    platform.notification.show(options.dataReplaced).catch((error) => {
      console.error('Muster Roll could not show that the room data was replaced', error);
    });
  }

  function performCaughtUp(_exit: 'answered' | 'unanswered'): void {
    const currentPersistence = generationFlow.persistence();

    if (persistAllOnExit) {
      persistAllOnExit = false;

      // AD-9: a generation past the first is kept apart from its records, so one with no records
      // survives a reload too.
      const kept =
        currentPersistence === null || currentPersistence.generation.n === 0
          ? undefined
          : currentPersistence.store.markGeneration(currentPersistence.generation);

      if (kept !== undefined && !kept.ok) {
        console.error('Muster Roll could not keep its generation', kept.error);
      }

      for (const record of replica.values()) {
        // The store can hold a newer record from another tab of this browser.
        merge(persist(record).record);
      }
    }

    const replayed = commandRouting.replayPending();

    const pendingDenial = pendingEdits.caughtUp();

    if (pendingDenial.notify) {
      notifyDenied();
    }

    // Sent in `live`, so the windows drop the pending view in the same step. With no window yet,
    // the view is still brought up to date, as the first projection sends it.
    publisher.publish();

    for (const id of replayed.completed) {
      commandDone(id);
    }

    sendCommits(replayed.applied);
    // The first catch-up's end allows the menu and a size with no preset, and it merged what this
    // client had loaded.
    followReplica();
    clearDeletedLinks();

    // AD-8: a write owed from before, or the edits that waited, go into the room copy now.
    roomCopy.caughtUp(replayed.applied.length > 0);
  }

  // A GM client persists each record that changes its replica. A player client persists nothing.
  // A remote record is never sent on again.
  function receiveRecords(records: readonly VersionedRecord[]): VersionedRecord[] {
    const presetBefore = replica.get('preset');
    const changed: VersionedRecord[] = [];

    for (const record of records) {
      // A record this large could never reach a window, as with one read from storage.
      if (!recordFitsOneMessage(record)) {
        console.error('Muster Roll dropped a remote record too large for one message', record.k);
        continue;
      }

      const before = replica.get(record.k);
      let winner = merge(record);

      if (winner !== before) {
        // The store can hold a newer record from another tab of this browser.
        winner = merge(persist(winner).record);
        changed.push(winner);
      }
    }

    if (changed.length > 0) {
      followReplica();

      if (role !== 'GM' && pendingEdits.recordsChanged(presetBefore).notify) {
        notifyDenied();
      }
    }

    publisher.publish();

    // Another GM client may link a token this client saw deleted.
    if (changed.length > 0) {
      clearDeletedLinks();
    }

    return changed;
  }

  function ownDigest(): number {
    cachedDigest ??= recordDigest(replica.values());

    return cachedDigest;
  }

  async function rereadRole(): Promise<void> {
    roleReads += 1;

    const read = roleReads;
    let next: PlayerRole;

    try {
      next = await platform.player.getRole();
    } catch (error) {
      console.error('Muster Roll could not read its role', error);

      return;
    }

    if (stopped || read !== roleReads || next === role) {
      return;
    }

    changeRole(next);
  }

  function changeRole(next: PlayerRole): void {
    // A GM proposes nothing, so a promoted player's edits become its own GM edits below.
    const promoted = next === 'GM' ? pendingEdits.drain() : [];

    role = next;

    if (next !== 'GM') {
      pendingEdits.clear();
    }

    refreshTokenMenu();
    followScene();
    catchUp.replicaReplaced();
    // A new stream: the catch-up entry below sends a delta, and each window that gets it from a
    // new engine id asks for a projection of the records the new role sees.
    publisher.restart();
    persistAllOnExit = false;
    generationFlow.roleChanged(null);
    // Only a GM client writes the room copy, so a demoted one drops what it owed and its notice.
    roomCopy.demoted();

    if (next === 'GM') {
      // TASK-36: a GM client asks the dice extension for access, if it has none.
      diceExtension.becameGm();

      // As at start: the highest generation of this client and of what the storage holds.
      const store = createRecordStore(platform.storage, platform.metadata.getRoomId());
      const stored = store.readHighestGeneration();
      const currentGeneration = generationFlow.generation();

      const generation = stored.ok
        ? higherGeneration(currentGeneration, stored.value)
        : currentGeneration;

      const probe = stored.ok ? store.loadGeneration(generation) : stored;

      if (probe.ok) {
        generationFlow.roleChanged({ store, generation });
        persistAllOnExit = true;
      } else {
        console.error('Muster Roll could not read the saved records', probe.error);
        problemKeys.add(UNREADABLE_STORAGE_MARK);
      }
    }

    // AD-7: they wait in the GM's catch-up queue as intents and apply when it ends. No window knows
    // their ids, so a refusal then reaches none.
    for (const command of promoted) {
      pending.add(newId(), command);
    }

    void enterCatchUp('role');
  }

  function raiseNewerVersion(): void {
    if (newerVersionSeen) {
      return;
    }

    newerVersionSeen = true;
    publisher.publish();
  }

  const roomProtocol = createRoomProtocol({
    senderOf: roster.senderOf,
    role: () => role,
    stopped: () => stopped,
    generation: () => generationFlow.generation(),
    catchUp: {
      adopting: catchUp.adopting,
      answersOwn: catchUp.answersOwn,
      heard: catchUp.heard,
      stateRequested: catchUp.stateRequested,
      pingReceived: catchUp.pingReceived,
      aliveReceived: catchUp.aliveReceived,
      stateMerged: catchUp.stateMerged,
    },
    seeGeneration: generationFlow.seeGeneration,
    stageGeneration: generationFlow.stage,
    runCatchUp,
    onNewerVersion: raiseNewerVersion,
    records: () => replica,
    presetOf,
    live: catchUp.live,
    hasPersistence: () => generationFlow.persistence() !== null,
    apply,
    liveContext,
    receiveRecords,
    pendingEdits,
    publish: () => publisher.publish(),
    roomCopyEdited: roomCopy.edited,
    sendCommits,
    sendRemote: (message) => sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE).then(() => undefined),
    notifyDenied,
    rollFlow,
  });

  const unsubscribeRoom = platform.broadcast.onMessage(SYNC_CHANNEL, (event) => {
    roomProtocol.receive(event);
  });

  const unsubscribeUi = platform.broadcast.onMessage(UI_CHANNEL, (event) => {
    // Echoes of the engine's own messages fail this schema and stop here.
    const parsed = parseWindowMessage(event.data);

    if (!parsed.ok) {
      return;
    }

    if (parsed.value.t === 'projection-request') {
      if (publisher.project(parsed.value.nonce)) {
        // A window that just connected may be the one Owlbear opened for the request. It goes after
        // the projection in the same queue, so the window holds the sheet when the request arrives.
        deliverOpen();
      }
    } else if (parsed.value.t === 'preset-diff') {
      commandRouting.handlePresetDiff(parsed.value);
    } else if (parsed.value.t === 'roll-request') {
      rollFlow.handleRollRequest(parsed.value);
    } else if (parsed.value.t === 'open-sheet-ack') {
      dropOpen(parsed.value.id);
    } else if (parsed.value.t === 'snapshot-check') {
      generationFlow.checkSnapshot(parsed.value);
    } else {
      commandRouting.handleCommand(parsed.value);
    }
  });

  const unsubscribeParty = platform.party.onChange((players) => {
    catchUp.partyChanged(players);
    void rereadRole();
  });

  const unsubscribeRole = platform.player.onRoleChange(() => {
    void rereadRole();
  });

  const unsubscribeMetadata = platform.metadata.onMetadataChange(roomCopy.followed);

  followScene();

  const started = enterCatchUp('start');

  void runCatchUp(catchUp.watch()).catch((error) => {
    console.error('Muster Roll could not start the GM link watch', error);
  });
  // An alone GM is live when the engine resolves. A metadata or party read that never ends holds
  // the engine back no longer than the catch-up timeout, which by then ended catch-up.
  await settledWithin(started, timing.catchUpTimeoutMs);

  return {
    stop: () => {
      stopped = true;
      roomCopy.stop();

      for (const timer of catchUpTimers.values()) {
        clearTimeout(timer);
      }

      catchUpTimers.clear();
      pendingEdits.clear();
      unsubscribeUi();
      unsubscribeRoom();
      unsubscribeParty();
      unsubscribeRole();
      unsubscribeMetadata();
      roster.stop();
      outbox.stop();
      tokenMenu?.stop();
      diceExtension.stop();
      followScene();
    },
    flushNow: () => {
      // A closing page cannot wait for catch-up, so the intents it holds apply and go out now.
      if (!catchUp.live() && pending.entries().length > 0) {
        void runCatchUp(catchUp.closing()).catch((error) => {
          console.error('Muster Roll could not close catch-up', error);
        });
      }

      outbox.flush();
      sendQueue.flushNow();
    },
    catchUp: () => {
      roomCopy.pageReturned();
      void enterCatchUp('page-return');
    },
    pageHidden: () => {
      roomCopy.pageHidden();
    },
  };
}

// Resolves when `work` settles or after `milliseconds`, whichever comes first, and never rejects.
async function settledWithin(work: Promise<void>, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, milliseconds);
  });

  try {
    await Promise.race([work, deadline]);
  } catch (error) {
    console.error('Muster Roll could not start its catch-up', error);
  } finally {
    clearTimeout(timer);
  }
}

function higherGeneration(first: Generation, second: Generation): Generation {
  return compareGenerations(first, second) >= 0 ? first : second;
}

function loadReplica(platform: ReplicaEnginePlatform, role: PlayerRole): LoadedReplica {
  // AD-11: a player client has no persistence at all.
  if (role !== 'GM') {
    return { records: [], problemKeys: new Set(), persistence: null };
  }

  const store = createRecordStore(platform.storage, platform.metadata.getRoomId());
  // AD-9: a generation whose save stopped part way is no data.
  const removed = store.removeIncomplete();

  if (!removed.ok) {
    console.error('Muster Roll could not remove an incomplete generation', removed.error);
  }

  const highest = store.readHighestGeneration();

  if (!highest.ok) {
    console.error('Muster Roll could not read the saved records', highest.error);

    // Without the saved records a write would pick the wrong generation or reuse an order.
    return { records: [], problemKeys: new Set([UNREADABLE_STORAGE_MARK]), persistence: null };
  }

  const generation = highest.value;
  // AD-9: a run that stopped after it saved a new generation may have left the old one behind.
  const below = store.removeGenerationsBelow(generation);

  if (!below.ok) {
    console.error('Muster Roll could not remove a replaced generation', below.error);
  }

  const load = store.loadGeneration(generation);

  if (!load.ok) {
    console.error('Muster Roll could not read the saved records', load.error);

    return { records: [], problemKeys: new Set([UNREADABLE_STORAGE_MARK]), persistence: null };
  }

  const records: VersionedRecord[] = [];
  const problemKeys = new Set(load.value.corruptKeys);

  for (const record of load.value.records) {
    // A record too large for a message could never reach a window, so it counts as corrupt.
    if (recordFitsOneMessage(record)) {
      records.push(record);
    } else {
      problemKeys.add(record.k);
    }
  }

  return { records, problemKeys, persistence: { store, generation } };
}
