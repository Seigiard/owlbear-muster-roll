import { createPickerCaller, type PickerPorts } from './picker-caller';
import type { PickerFacts } from './picker-flow';

export const TARGET = { sheetId: 'arag', instanceId: null };
export const BLOCK = { sheetId: 'npc', instanceId: 'gob' };

export const READY: PickerFacts = {
  loaded: true,
  firstCatchUpDone: true,
  role: 'GM',
  arrived: null,
};

export type Deferred<Value> = {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: () => void;
};

export type PickerRig = {
  caller: ReturnType<typeof createPickerCaller>;
  calls: string[];
  reads: Deferred<string | null>[];
  links: Deferred<'answered' | 'refused' | 'timed-out'>[];
  writes: Deferred<void>[];
  notifications: Deferred<void>[];
  closes: Deferred<void>[];
  advance: (ms: number) => void;
  pendingTimers: () => number;
};

export function rig(tokenId = 't1'): PickerRig {
  const calls: string[] = [];
  const reads: Deferred<string | null>[] = [];
  const links: Deferred<'answered' | 'refused' | 'timed-out'>[] = [];
  const writes: Deferred<void>[] = [];
  const notifications: Deferred<void>[] = [];
  const closes: Deferred<void>[] = [];
  let now = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let nextTimer = 0;

  const ports: PickerPorts = {
    readLabel: (id) => {
      calls.push(`read:${id}`);

      return enqueue(reads);
    },
    link: (id, target) => {
      calls.push(`link:${id}:${target.sheetId}:${target.instanceId ?? '-'}`);

      return enqueue(links);
    },
    writeLabel: (id, label) => {
      calls.push(`write:${id}:${label}`);

      return enqueue(writes);
    },
    notifyLabelFailure: () => {
      calls.push('notify');

      return enqueue(notifications);
    },
    close: () => {
      calls.push('close');

      return enqueue(closes);
    },
    schedule: (ms, callback) => {
      const id = nextTimer++;
      timers.set(id, { at: now + ms, callback });

      return () => {
        timers.delete(id);
      };
    },
  };

  return {
    caller: createPickerCaller(tokenId, ports, {
      labelReadTimeoutMs: 20,
      labelWriteTimeoutMs: 50,
    }),
    calls,
    reads,
    links,
    writes,
    notifications,
    closes,
    advance: (ms) => {
      const end = now + ms;

      while (true) {
        const next = [...timers].toSorted((a, b) => a[1].at - b[1].at)[0];

        if (next === undefined || next[1].at > end) {
          break;
        }

        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }

      now = end;
    },
    pendingTimers: () => timers.size,
  };
}

export async function open(label: string | null = ''): Promise<ReturnType<typeof rig>> {
  const testRig = rig();
  testRig.caller.facts(READY);
  testRig.reads[0]!.resolve(label);
  await flush();

  return testRig;
}

export async function flush(): Promise<void> {
  await Promise.resolve();
}

function enqueue<Value>(queue: Deferred<Value>[]): Promise<Value> {
  const deferred = Promise.withResolvers<Value>();
  queue.push({
    promise: deferred.promise,
    resolve: deferred.resolve,
    reject: () => deferred.reject(new Error('controlled port failure')),
  });

  return deferred.promise;
}
