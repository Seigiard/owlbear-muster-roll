import { dicePlusDice, dicePlusTarget, type DicePlusTarget } from '@/core/dice-plus';
import { fitsOneMessage } from '@/core/message-size';
import {
  listedFaces,
  randomFaces,
  type DiceTerm,
  type DieFace,
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
import { err, ok, type Result } from '@/core/result';
import type { Generation } from '@/core/storage-key';
import type { RollOutcome, RollRequestMessage } from '@/core/ui-messages';
import { rollShownTo, tabShownTo, type PlayerRole } from '@/core/visibility';

type EvaluatedRoll = Omit<RollContent, 'id' | 'roller'>;

type PreparedRoll = Pick<EvaluatedRoll, 'sheetId' | 'hidden' | 'sheetName'> & {
  dice: PreparedDiceRoll;
};

export type RollSender = {
  role: PlayerRole;
  name: string;
};

export type RollDiceReadiness = 'absent' | 'permitted' | 'pending' | 'unknown' | 'refused';

export type RollDiceFailure = { code: 'failed'; reason: string } | { code: 'stopped' };

export type RollDiceRequest = {
  terms: readonly DiceTerm[];
  notation: string;
  playerId: string;
  playerName: string;
  rollTarget: DicePlusTarget;
};

export type RollDicePort = {
  ready: () => Promise<RollDiceReadiness>;
  roll: (request: RollDiceRequest) => Promise<Result<DieFace[], RollDiceFailure>>;
};

export type RollFlowPorts = {
  pendingView: () => ReadonlyMap<string, VersionedRecord>;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  role: () => PlayerRole;
  stopped: () => boolean;
  generation: () => Generation;
  dice: RollDicePort;
  gmInRoom: () => boolean;
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
// these ports to its live state and transport when the extraction is completed.
export function createRollFlow(ports: RollFlowPorts): RollFlow {
  const recentRequestIds = new Set<string>();
  const recentRollIds = new Set<string>();

  function handleRollRequest(message: RollRequestMessage): void {
    if (recentRequestIds.has(message.id)) {
      return;
    }

    recentRequestIds.add(message.id);

    const prepared = prepareRoll(message);

    if (!prepared.ok) {
      ports.replyOutcome(message.id, prepared.error);

      return;
    }

    const local = evaluatedWith(prepared.value, randomFaces(ports.random));

    if (!local.ok) {
      ports.replyOutcome(message.id, local.error);

      return;
    }

    void rollWithDice(message.id, prepared.value, local.value).catch(() => {
      console.error('Muster Roll could not complete a roll');
      ports.replyOutcome(message.id, { code: 'failed' });
    });
  }

  function prepareRoll(message: RollRequestMessage): Result<PreparedRoll, RollOutcome> {
    const view = ports.pendingView();
    const preset = ports.presetOf(view.get('preset'));
    const policy = resolveSheet(view, preset, message.sheetId);

    const hidden =
      policy !== null && !tabShownTo('PLAYER', policy.template, message.place.tabIndex);

    if (policy === null || !rollShownTo(ports.role(), hidden)) {
      return err({ code: 'refused' });
    }

    const dice = prepareDiceRoll(
      policy.template,
      view,
      message.sheetId,
      message.place,
      new Map(Object.entries(message.shown)),
    );

    if (!dice.ok) {
      return err(rollFailure(dice.error));
    }

    return ok({
      sheetId: message.sheetId,
      hidden,
      // An empty name makes every client show the fallback label.
      sheetName: sheetName(view, preset, message.sheetId) ?? '',
      dice: dice.value,
    });
  }

  async function rollWithDice(
    requestId: string,
    prepared: PreparedRoll,
    local: EvaluatedRoll,
  ): Promise<void> {
    let roller: string;

    try {
      roller = await ports.playerName();
    } catch (error) {
      console.error('Muster Roll could not read the player name for a roll', error);
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    const dice = dicePlusDice(prepared.dice.terms);

    if (dice === null) {
      await sendRoll(requestId, local, roller);

      return;
    }

    const readiness = ports.stopped() ? 'absent' : await ports.dice.ready();

    if (
      readiness === 'absent' ||
      readiness === 'refused' ||
      ports.stopped() ||
      !rollShownTo(ports.role(), prepared.hidden)
    ) {
      await sendRoll(requestId, local, roller);

      return;
    }

    if (readiness === 'pending' || (readiness === 'unknown' && ports.gmInRoom())) {
      // The waiting-access reply is intentionally left for the extraction implementation turn.
    }

    const faces = await ports.dice.roll({
      terms: prepared.dice.terms,
      notation: dice.notation,
      playerId: ports.playerId,
      playerName: roller,
      rollTarget: dicePlusTarget(prepared.hidden),
    });

    if (ports.stopped()) {
      return;
    }

    if (!faces.ok) {
      if (faces.error.code === 'stopped') {
        return;
      }

      await sendRoll(requestId, local, roller);

      return;
    }

    let evaluated: Result<EvaluatedRoll, RollOutcome>;

    try {
      evaluated = evaluatedWith(prepared, listedFaces(faces.value));
    } catch (error) {
      console.error('Muster Roll could not apply the dice extension faces', error);
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    if (!evaluated.ok) {
      ports.replyOutcome(requestId, evaluated.error);

      return;
    }

    await sendRoll(requestId, evaluated.value, roller);
  }

  async function sendRoll(
    requestId: string,
    evaluated: EvaluatedRoll,
    roller: string,
  ): Promise<void> {
    if (ports.stopped()) {
      return;
    }

    if (!rollShownTo(ports.role(), evaluated.hidden)) {
      ports.replyOutcome(requestId, { code: 'refused' });

      return;
    }

    const message = rollMessage(ports.generation(), { id: ports.newId(), roller, ...evaluated });

    if (!parseRoomMessage(message).ok || !fitsOneMessage(message)) {
      ports.replyOutcome(requestId, { code: 'failed' });

      return;
    }

    const sent = await ports.sendRemote(message);

    if (ports.stopped()) {
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

    if (forged || !rollShownTo(ports.role(), message.hidden) || ports.rollCopy === undefined) {
      return;
    }

    const roller = sender.name === '' ? message.roller : sender.name;
    const text = rollNotificationText({ ...message, roller }, ports.rollCopy);

    Promise.resolve(ports.notify(text)).catch(() => {
      console.error('Muster Roll could not show a roll');
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

  if (!rolled.ok) {
    return err(rollFailure(rolled.error));
  }

  return ok({
    sheetId: prepared.sheetId,
    hidden: prepared.hidden,
    sheetName: prepared.sheetName,
    cell: prepared.dice.cell,
    result: rolled.value,
  });
}
