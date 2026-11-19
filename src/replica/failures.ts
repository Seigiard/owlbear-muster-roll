import { TaggedError } from 'better-result';

import {
  DiceExtensionFailure,
  MetadataFailure,
  NotificationFailure,
  PartyReadFailure,
  PlayerReadFailure,
  SendFailure,
  type SendFailureData,
  StorageFailure,
  type StorageFailureData,
} from '@/platform/ports';
import type { RecordStoreFailure } from '@/replica/record-store';

export const DIAGNOSTICS_LIMIT = 20;

export class SendDroppedFailure extends TaggedError('send-dropped')<{
  channel?: string;
  reason?: string;
}> {}

export class RecordTooLargeFailure extends TaggedError('record-too-large')<{
  key?: string;
}> {}

export class MessageRejectedFailure extends TaggedError('message-rejected')<{
  reason?: string;
}> {}

export class OpenRequestLostFailure extends TaggedError('open-request-lost')<{
  reason?: string;
}> {}

export class ProposeDroppedFailure extends TaggedError('propose-dropped')<{
  key?: string;
  reason?: string;
}> {}

export type ReplicaFailure =
  | DiceExtensionFailure
  | MetadataFailure
  | NotificationFailure
  | OpenRequestLostFailure
  | PartyReadFailure
  | PlayerReadFailure
  | ProposeDroppedFailure
  | RecordTooLargeFailure
  | SendDroppedFailure
  | SendFailure
  | InstanceType<typeof StorageFailure>
  | MessageRejectedFailure;

export type FailureReporter = (failure: ReplicaFailure) => void;

export function taggedSendFailure(failure: SendFailure | SendFailureData): SendFailure {
  return failure instanceof SendFailure ? failure : new SendFailure(failure);
}

export function taggedStorageFailure(
  failure: StorageFailure | StorageFailureData,
): InstanceType<typeof StorageFailure> {
  return failure instanceof StorageFailure ? failure : new StorageFailure(failure);
}

export function recordStoreFailure(failure: RecordStoreFailure): ReplicaFailure {
  if (failure === 'invalid-record' || failure === 'invalid-storage-key') {
    return new MessageRejectedFailure({ reason: failure });
  }

  return taggedStorageFailure(failure);
}

export type Diagnostic = {
  tag: string;
  at: number;
  detail?: string;
};

export function report(failure: ReplicaFailure): Omit<Diagnostic, 'at'> {
  return {
    tag: failure._tag,
    detail: failure.match({
      DiceExtensionFailure: (value) => value.reason,
      MetadataFailure: (value) => `${value.operation}: ${value.reason}`,
      NotificationFailure: (value) => value.reason,
      'open-request-lost': (value) => value.reason,
      PartyReadFailure: (value) => value.reason,
      PlayerReadFailure: (value) => `${value.field}: ${value.reason}`,
      'propose-dropped': (value) => value.reason,
      'record-too-large': (value) => value.key,
      'send-dropped': (value) => value.reason,
      SendFailure: (value) => `${value.channel ?? ''}: ${value.reason ?? value.kind}`,
      StorageFailure: (value) => `${value.operation}: ${value.reason}`,
      'message-rejected': (value) => value.reason,
    }),
  };
}

export type FailureSink = {
  report: FailureReporter;
  recent: () => readonly Diagnostic[];
  subscribe: (listener: (entry: Diagnostic, failure: ReplicaFailure) => void) => () => void;
};

export function createFailureSink(options: { limit?: number; now: () => number }): FailureSink {
  const limit = Math.max(0, Math.floor(options.limit ?? DIAGNOSTICS_LIMIT));
  const diagnostics: Diagnostic[] = [];
  const listeners = new Set<(entry: Diagnostic, failure: ReplicaFailure) => void>();

  function add(failure: ReplicaFailure): void {
    if (limit === 0) {
      return;
    }

    const entry: Diagnostic = { ...report(failure), at: options.now() };

    if (diagnostics.length === limit) {
      diagnostics.shift();
    }

    diagnostics.push(entry);

    for (const listener of listeners) {
      listener(entry, failure);
    }
  }

  return {
    report: add,
    recent: () => [...diagnostics],
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
