import type { PartyEntry } from '@/core/access';
import { jsonByteLength, splitBatch } from '@/core/message-size';
import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type {
  DeltaMessage,
  EngineMessage,
  Notice,
  ProjectionMessage,
  RoomCopyStatus,
  SyncState,
} from '@/core/ui-messages';
import { visibleRecords, type PlayerRole } from '@/core/visibility';

type PublisherSync = Omit<SyncState, 'role'>;

export type WindowPublisherState = {
  role: PlayerRole;
  replica: ReadonlyMap<string, VersionedRecord>;
  // The pending view contains only keys whose pending value differs from the replica.
  pendingView: ReadonlyMap<string, VersionedRecord>;
  notices: readonly Notice[];
  sync: PublisherSync;
  roomCopy: RoomCopyStatus;
  party: readonly PartyEntry[];
};

export type WindowPublisherOptions = {
  send: (message: EngineMessage) => Promise<void>;
  newId: () => string;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  state: () => WindowPublisherState;
};

export type WindowPublisher = {
  publish: () => void;
  project: (nonce: string) => boolean;
  restart: () => void;
};

type Part = { records: VersionedRecord[]; pending: VersionedRecord[] };

type Header = {
  notices: readonly Notice[];
  sync: SyncState;
  roomCopy: RoomCopyStatus;
  party: readonly PartyEntry[];
  signature: string;
};

type VisibleState = {
  records: Map<string, VersionedRecord>;
  pending: Map<string, VersionedRecord>;
  header: Header;
};

type HeldState = VisibleState;

// Owns the window stream and compares the state a window holds with the current visible state.
export function createWindowPublisher(options: WindowPublisherOptions): WindowPublisher {
  let engineId = options.newId();
  let sequence = 0;
  let held: HeldState | undefined;
  let projected = false;
  let restartPending = false;
  let lastComparison: VisibleState;
  const answeringNonces = new Set<string>();

  function publish(): void {
    if (!projected) {
      const current = visibleState();

      const changed =
        !sameRecordMap(lastComparison.records, current.records) ||
        !sameRecordMap(lastComparison.pending, current.pending);

      const content: Part & { withdrawn: string[] } = {
        records: [],
        pending: [],
        withdrawn: [],
      };

      if (restartPending || changed) {
        // Update the comparison before sending. The receiver can synchronously ask for a
        // projection while the delta is being delivered.
        lastComparison = current;
        restartPending = false;
        sendDelta(content, current.header);
      }

      return;
    }

    const current = visibleState();

    const previousHeld = held!;

    // A record can become visible or stop being visible without changing itself: a row arrives with
    // its sheet, a link points to a newly visible sheet, or the preset changes a template's
    // visibility. Comparing the complete visible set catches all of those changes.
    const withdrawn = withdrawnKeys(previousHeld, current);

    const records = [...current.records.values()].filter((record) => {
      const previous = previousHeld.records.get(record.k);

      return withdrawn.includes(record.k) || !sameRecord(previous, record);
    });

    const pending = [...current.pending.values()].filter((record) => {
      const previous = previousHeld.pending.get(record.k);

      return withdrawn.includes(record.k) || !sameRecord(previous, record);
    });

    const content = { records, pending, withdrawn };

    if (
      records.length === 0 &&
      pending.length === 0 &&
      withdrawn.length === 0 &&
      previousHeld.header.signature === current.header.signature
    ) {
      return;
    }

    sendDelta(content, current.header);
    held = current;
  }

  function project(nonce: string): boolean {
    if (answeringNonces.has(nonce)) {
      return false;
    }

    // A window repeats its request until the first part arrives, so one already answered and still
    // queued must not be answered twice. The request is also a change signal: state that changed
    // without an explicit publisher call is sent before the full projection.
    publish();

    const current = visibleState();
    const largestCount = current.records.size + current.pending.size + 1;

    const envelope: ProjectionMessage = {
      t: 'projection',
      nonce,
      engine: engineId,
      seq: sequence,
      i: largestCount,
      n: largestCount,
      records: [],
      pending: [],
      notices: [...current.header.notices],
      sync: current.header.sync,
      roomCopy: current.header.roomCopy,
      party: [...current.header.party],
    };

    const parts = splitParts(
      [...current.records.values()],
      [...current.pending.values()],
      jsonByteLength(envelope),
    );

    if (parts === null) {
      console.error('Muster Roll could not split a projection');

      return false;
    }

    answeringNonces.add(nonce);
    projected = true;
    restartPending = false;
    held = current;

    const sends = parts.map((part, index) => {
      try {
        return options.send({ ...envelope, i: index + 1, n: parts.length, ...part });
      } catch (error) {
        return Promise.reject(error);
      }
    });

    Promise.all(sends)
      .then(() => {
        answeringNonces.delete(nonce);
      })
      .catch((error) => {
        console.error('Muster Roll could not send a projection', error);
      });

    return true;
  }

  function restart(): void {
    engineId = options.newId();
    sequence = 0;
    projected = false;
    lastComparison = visibleState();
    restartPending = true;
  }

  function visibleState(): VisibleState {
    const source = options.state();
    // The records as the windows show them: the replica, with the pending view over it. A sheet's
    // template is read from here, so a row is judged by its sheet even when the sheet is not in the
    // batch.
    let known: ReadonlyMap<string, VersionedRecord> = source.replica;

    if (source.role !== 'GM') {
      const playerKnown = new Map(source.replica);

      for (const [key, record] of source.pendingView) {
        playerKnown.set(key, record);
      }

      known = playerKnown;
    }

    const preset = options.presetOf(known.get('preset'));

    const records = new Map(
      visibleRecords(source.role, preset, [...source.replica.values()], known).map((record) => [
        record.k,
        record,
      ]),
    );

    // The full pending view the windows show over the replica. When it ends or a player's proposal
    // is answered, withdrawn keys make the replica's record show again.
    const pending = new Map(
      visibleRecords(source.role, preset, [...source.pendingView.values()], known).map((record) => [
        record.k,
        record,
      ]),
    );

    const sync = { ...source.sync, role: source.role };

    return {
      records,
      pending,
      header: {
        notices: source.notices,
        sync,
        roomCopy: source.roomCopy,
        party: source.party,
        signature: JSON.stringify([source.notices, sync, source.roomCopy, source.party]),
      },
    };
  }

  lastComparison = visibleState();

  function sendDelta(content: Part & { withdrawn: string[] }, header: Header): boolean {
    const envelope: DeltaMessage = {
      t: 'delta',
      engine: engineId,
      seq: sequence + content.records.length + content.pending.length + 1,
      records: [],
      pending: [],
      withdrawn: content.withdrawn,
      notices: [...header.notices],
      sync: header.sync,
      roomCopy: header.roomCopy,
      party: [...header.party],
    };

    const parts = splitParts(content.records, content.pending, jsonByteLength(envelope));

    if (parts === null) {
      console.error('Muster Roll could not split a delta');

      return false;
    }

    for (const [index, part] of parts.entries()) {
      sequence += 1;

      // A window drops withdrawn keys before it takes the records, so only the first part withdraws.
      const withdrawn = index === 0 ? content.withdrawn : [];

      try {
        options.send({ ...envelope, seq: sequence, withdrawn, ...part }).catch((error) => {
          console.error('Muster Roll could not send a delta', error);
        });
      } catch (error) {
        console.error('Muster Roll could not send a delta', error);
      }
    }

    return true;
  }

  return { publish, project, restart };
}

function sameRecord(
  first: VersionedRecord | undefined,
  second: VersionedRecord | undefined,
): boolean {
  return (
    first === second ||
    (first !== undefined &&
      second !== undefined &&
      first.c === second.c &&
      first.a === second.a &&
      JSON.stringify(first.d) === JSON.stringify(second.d))
  );
}

function sameRecordMap(
  first: ReadonlyMap<string, VersionedRecord>,
  second: ReadonlyMap<string, VersionedRecord>,
): boolean {
  if (first.size !== second.size) {
    return false;
  }

  for (const [key, record] of first) {
    if (!sameRecord(record, second.get(key))) {
      return false;
    }
  }

  return true;
}

function withdrawnKeys(previous: HeldState, current: VisibleState): string[] {
  return [
    ...new Set([
      ...[...previous.pending.keys()].filter((key) => !current.pending.has(key)),
      ...[...previous.records.keys()].filter((key) => !current.records.has(key)),
    ]),
  ];
}

// Records first, then the pending view, each split under the message limit. `null` when a record
// cannot fit one message.
function splitParts(
  records: readonly VersionedRecord[],
  pendingView: readonly VersionedRecord[],
  envelopeBytes: number,
): Part[] | null {
  if (records.length === 0 && pendingView.length === 0) {
    return [{ records: [], pending: [] }];
  }

  const recordParts = records.length === 0 ? null : splitBatch(records, envelopeBytes);
  const pendingParts = pendingView.length === 0 ? null : splitBatch(pendingView, envelopeBytes);

  if (recordParts !== null && !recordParts.ok) {
    return null;
  }

  if (pendingParts !== null && !pendingParts.ok) {
    return null;
  }

  return [
    ...(recordParts?.value.map((part) => ({ records: part, pending: [] })) ?? []),
    ...(pendingParts?.value ?? []).map((part) => ({ records: [], pending: part })),
  ];
}
