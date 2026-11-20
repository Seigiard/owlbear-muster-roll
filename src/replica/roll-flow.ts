import { dicePlusDice, dicePlusTarget } from '@/core/dice-plus';
import { createBoundedIdSet } from '@/core/bounded-id-set';
import { fitsOneMessage } from '@/core/message-size';
import {
  listedFaces,
  randomFaces,
  type FaceSource,
  type RandomSource,
} from '@/core/formula-evaluate';
import { rollNotificationText, type RollCopy } from '@/core/roll-text';
import {
  parseRoomMessage,
  rollMessage,
  type RollContent,
  type RollMessage,
} from '@/core/room-messages';
import { prepareDiceRoll, type DiceRollFailure, type PreparedDiceRoll } from '@/core/dice-roll';
import { resolveSheet, sheetName } from '@/core/sheets';
import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { Result } from 'better-result';
import type { Generation } from '@/core/storage-key';
import type { RollOutcome, RollRequestMessage } from '@/core/ui-messages';
import { rollShownTo, rollTargetShownTo, type PlayerRole } from '@/core/visibility';
import { DiceExtensionFailure } from '@/platform/ports';
import type { DiceExtension } from '@/replica/dice-extension';
import {
  MessageRejectedFailure,
  RecordTooLargeFailure,
  type FailureReporter,
} from '@/replica/failures';

const RECENT_REQUEST_ID_LIMIT = 256;

const RECENT_ROLL_ID_LIMIT = 256;

type EvaluatedRoll = Omit<RollContent, 'id' | 'roller'>;

type PreparedRoll = Pick<EvaluatedRoll, 'sheetId' | 'hidden' | 'sheetName'> & {
  dice: PreparedDiceRoll;
};

export type RollSender = {
  role: PlayerRole;
  name: string;
};

export type RollFlowPorts = {
  report?: FailureReporter;
  pendingView: () => ReadonlyMap<string, VersionedRecord>;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  role: () => PlayerRole;
  signal: AbortSignal;
  generation: () => Generation;
  importing: () => boolean;
  dice: Pick<DiceExtension, 'ready' | 'roll'>;
  gmInParty: () => boolean;
  playerId: string;
  playerName: () => Promise<string>;
  random: RandomSource;
  newId: () => string;
  sendRemote: (message: RollMessage) => Promise<boolean>;
  replyOutcome: (requestId: string, outcome: RollOutcome) => void;
  notify: (text: string) => void | Promise<void>;
  rollCopy?: RollCopy;
};

export type RollFlow = {
  handleRollRequest: (message: RollRequestMessage) => void;
  receiveRoll: (message: RollMessage, sender: RollSender) => void;
};

// The roll pipeline is independent from the room, window, and platform adapters. The engine wires
// these ports to its live state and transport.
export function createRollFlow(ports: RollFlowPorts): RollFlow {
  const report = ports.report ?? (() => undefined);
  const recentRequestIds = createBoundedIdSet(RECENT_REQUEST_ID_LIMIT);
  const recentRollIds = createBoundedIdSet(RECENT_ROLL_ID_LIMIT);

  // AD-13: the roller's replica evaluates once, from the values its windows show: the replica with
  // its pending edits, and the window's own unsent text and input errors over them. A roll writes
  // nothing, so a player and a client in catch-up roll too. The values are read at the request. A
  // local roll comes first: a field error, or an arithmetic error with its faces, sends nothing
  // anywhere, and it stands in when the dice extension gives no faces (TASK-36). Other faces from
  // the extension can still give an arithmetic error, after its dice showed.
  function handleRollRequest(message: RollRequestMessage): void {
    if (recentRequestIds.has(message.id)) {
      return;
    }

    recentRequestIds.add(message.id);

    // AD-9: an importer sends nothing to the room until its room copy is written, so no dice show
    // for a roll it cannot send. `sendRoll` checks again for an import that starts mid-roll.
    if (ports.importing()) {
      ports.replyOutcome(message.id, { code: 'failed' });

      return;
    }

    const prepared = prepareRoll(message);

    if (!prepared.isOk()) {
      ports.replyOutcome(message.id, prepared.error);

      return;
    }

    const local = evaluatedWith(prepared.value, randomFaces(ports.random));

    if (!local.isOk()) {
      ports.replyOutcome(message.id, local.error);

      return;
    }

    void rollWithDice(message.id, prepared.value, local.value);
  }

  // AD-13, AD-18: `hidden` is computed once here from the sheet's template and the dice cell's tab;
  // every output of the roll uses it. A player's replica refuses a hidden roll.
  function prepareRoll(message: RollRequestMessage): Result<PreparedRoll, RollOutcome> {
    const view = ports.pendingView();
    const preset = ports.presetOf(view.get('preset'));
    const policy = resolveSheet(view, preset, message.sheetId);

    const hidden = policy !== null && !rollTargetShownTo('PLAYER', policy.template, message.place);

    if (policy === null || !rollShownTo(ports.role(), hidden)) {
      return Result.err({ code: 'refused' });
    }

    const dice = prepareDiceRoll(
      policy.template,
      view,
      message.sheetId,
      message.place,
      new Map(Object.entries(message.shown)),
    );

    if (!dice.isOk()) {
      return Result.err(rollFailure(dice.error));
    }

    return Result.ok({
      sheetId: message.sheetId,
      hidden,
      // "" for an empty name: every client shows the fallback label.
      sheetName: sheetName(view, preset, message.sheetId) ?? '',
      dice: dice.value,
    });
  }

  // TASK-36: the faces come from the dice extension of this client when it is ready and can roll
  // every term, and the 3D dice show to the clients that see the notification. With no extension,
  // an error, a refusal of access, a result that does not match, or no result in time, the local
  // roll goes out. A roll the GM has not allowed yet still goes to the extension, which holds it
  // for the GM's answer, and the window says it waits for that answer.
  async function rollWithDice(
    requestId: string,
    prepared: PreparedRoll,
    local: EvaluatedRoll,
  ): Promise<void> {
    let roller: string;

    try {
      roller = await ports.playerName();
    } catch (error) {
      report(new MessageRejectedFailure({ reason: String(error) }));
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    const dice = dicePlusDice(prepared.dice.terms);

    if (dice === null) {
      console.info('Muster Roll rolled locally: unsupported dice');
      await sendRoll(requestId, local, roller);

      return;
    }

    const readiness = ports.signal.aborted ? 'absent' : await ports.dice.ready();
    const stoppedAfterReadiness = ports.signal.aborted;

    if (!stoppedAfterReadiness && (readiness === 'absent' || readiness === 'refused')) {
      console.info(
        readiness === 'absent'
          ? 'Muster Roll rolled locally: no dice extension answered'
          : 'Muster Roll rolled locally: access refused',
      );
    }

    // The role can change while the name is read or the probe answers. `sendRoll` refuses such a
    // roll, and no dice show for it.
    if (
      readiness === 'absent' ||
      readiness === 'refused' ||
      stoppedAfterReadiness ||
      !rollShownTo(ports.role(), prepared.hidden)
    ) {
      await sendRoll(requestId, local, roller);

      return;
    }

    // With no GM in the room the extension refuses at once, so the window shows no wait for one.
    if (readiness === 'pending' || (readiness === 'unknown' && ports.gmInParty())) {
      ports.replyOutcome(requestId, { code: 'waiting-access' });
    }

    const faces = await ports.dice.roll({
      terms: prepared.dice.terms,
      notation: dice.notation,
      playerId: ports.playerId,
      playerName: roller,
      rollTarget: dicePlusTarget(prepared.hidden),
    });

    // A stopped page sends nothing more, and its wait was no failure of the extension.
    if (ports.signal.aborted) {
      return;
    }

    if (!faces.isOk()) {
      if (faces.error.code === 'stopped') {
        return;
      }

      report(new DiceExtensionFailure({ reason: faces.error.reason }));
      console.info('Muster Roll rolled locally: the dice extension gave no faces');
      await sendRoll(requestId, local, roller);

      return;
    }

    console.info('Muster Roll rolled with the dice extension');

    // The extension's faces are the roll, and its dice already showed, so no local roll follows
    // them, even when they give an arithmetic error.
    let evaluated: Result<EvaluatedRoll, RollOutcome>;

    try {
      evaluated = evaluatedWith(prepared, listedFaces(faces.value));
    } catch (error) {
      report(new MessageRejectedFailure({ reason: String(error) }));
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    if (!evaluated.isOk()) {
      ports.replyOutcome(requestId, evaluated.error);

      return;
    }

    await sendRoll(requestId, evaluated.value, roller);
  }

  // The roller's name is read at roll time. `REMOTE` does not echo to the sender, so this client
  // shows its own roll through the same id check as a received one, once the room has it.
  async function sendRoll(
    requestId: string,
    evaluated: EvaluatedRoll,
    roller: string,
  ): Promise<void> {
    if (ports.signal.aborted) {
      return;
    }

    // The role can change while the name is read or the dice roll.
    if (!rollShownTo(ports.role(), evaluated.hidden)) {
      ports.replyOutcome(requestId, { code: 'refused' });

      return;
    }

    // AD-9: a roll would name the importer's new generation before its room copy is written.
    if (ports.importing()) {
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    const message = rollMessage(ports.generation(), { id: ports.newId(), roller, ...evaluated });

    // A roll a receiver would drop, or one too large to send, never goes out.
    const parsed = parseRoomMessage(message);

    if (!parsed.isOk()) {
      report(new MessageRejectedFailure({ reason: parsed.error }));
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    if (!fitsOneMessage(message)) {
      report(new RecordTooLargeFailure({}));
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    const sent = await ports.sendRemote(message);

    if (ports.signal.aborted) {
      return;
    }

    if (!sent) {
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    receiveRoll(message, { role: ports.role(), name: roller });
    ports.replyOutcome(requestId, { code: 'rolled' });
  }

  function receiveRoll(message: RollMessage, sender: RollSender): void {
    if (recentRollIds.has(message.id)) {
      return;
    }

    recentRollIds.add(message.id);

    const forged = sender.role !== 'GM' && message.hidden;

    // AD-13: a roll shows once per id, and a player shows only one with `hidden: false`. Only this
    // background page shows it, so it shows with the window closed. It never enters the replica. A
    // player cannot see a hidden sheet, so a hidden roll from a player is forged, and the name shown
    // is the one the party lists for the sender.
    if (forged || !rollShownTo(ports.role(), message.hidden) || ports.rollCopy === undefined) {
      return;
    }

    const roller = sender.name === '' ? message.roller : sender.name;
    const text = rollNotificationText({ ...message, roller }, ports.rollCopy);

    Promise.resolve(ports.notify(text)).catch((error) => {
      report(new MessageRejectedFailure({ reason: String(error) }));
    });
  }

  return { handleRollRequest, receiveRoll };
}

function rollFailure(failure: DiceRollFailure): RollOutcome {
  return failure.code === 'not-dice' ? { code: 'refused' } : failure;
}

function evaluatedWith(
  prepared: PreparedRoll,
  faces: FaceSource,
): Result<EvaluatedRoll, RollOutcome> {
  const rolled = prepared.dice.roll(faces);

  if (!rolled.isOk()) {
    return Result.err(rollFailure(rolled.error));
  }

  return Result.ok({
    sheetId: prepared.sheetId,
    hidden: prepared.hidden,
    sheetName: prepared.sheetName,
    cell: prepared.dice.cell,
    result: rolled.value,
  });
}
