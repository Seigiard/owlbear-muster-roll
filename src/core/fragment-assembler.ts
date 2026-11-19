import { assembleRecords } from '@/core/merge';
import { jsonByteLength } from '@/core/message-size';
import type { VersionedRecord } from '@/core/records';

export type FragmentAssemblerLimits = {
  maxParts: number;
  maxBytes: number;
  maxAssemblies: number;
  retentionMs: number;
};

export type FragmentAssemblerPart = {
  i: number;
  n: number;
  record: VersionedRecord;
};

export type AssemblyOutcome =
  | { kind: 'complete'; record: VersionedRecord }
  | { kind: 'waiting' }
  | { kind: 'ignored' }
  | {
      kind: 'dropped';
      reason: 'too-many-parts' | 'count-mismatch' | 'duplicate-part' | 'too-large';
    };

export type FragmentAssembler = {
  add: (key: string, part: FragmentAssemblerPart, now: number) => AssemblyOutcome;
  clear: () => void;
};

export const GM_FRAGMENT_ASSEMBLER_LIMITS: FragmentAssemblerLimits = {
  maxParts: 32,
  maxBytes: 480_000,
  maxAssemblies: 32,
  retentionMs: 60_000,
};

type Assembly = {
  n: number;
  parts: Map<number, VersionedRecord>;
  bytes: number;
  firstPartAt: number;
};

export function createFragmentAssembler(limits: FragmentAssemblerLimits): FragmentAssembler {
  const assemblies = new Map<string, Assembly>();

  function add(key: string, part: FragmentAssemblerPart, now: number): AssemblyOutcome {
    if (part.n > limits.maxParts) {
      return { kind: 'dropped', reason: 'too-many-parts' };
    }

    for (const [assemblyKey, assembly] of assemblies) {
      if (now - assembly.firstPartAt >= limits.retentionMs) {
        assemblies.delete(assemblyKey);
      }
    }

    let assembly = assemblies.get(key);

    if (assembly === undefined) {
      if (assemblies.size >= limits.maxAssemblies) {
        const oldest = assemblies.keys().next().value;

        if (oldest !== undefined) {
          assemblies.delete(oldest);
        }
      }

      assembly = {
        n: part.n,
        parts: new Map<number, VersionedRecord>(),
        bytes: 0,
        firstPartAt: now,
      };
      assemblies.set(key, assembly);
    }

    if (assembly.n !== part.n) {
      assemblies.delete(key);

      return { kind: 'dropped', reason: 'count-mismatch' };
    }

    const previous = assembly.parts.get(part.i);

    if (previous !== undefined) {
      if (JSON.stringify(previous) !== JSON.stringify(part.record)) {
        assemblies.delete(key);

        return { kind: 'dropped', reason: 'duplicate-part' };
      }

      return { kind: 'ignored' };
    }

    const bytes = jsonByteLength(part.record);

    if (assembly.bytes + bytes > limits.maxBytes) {
      assemblies.delete(key);

      return { kind: 'dropped', reason: 'too-large' };
    }

    assembly.parts.set(part.i, part.record);
    assembly.bytes += bytes;

    if (assembly.parts.size !== assembly.n) {
      return { kind: 'waiting' };
    }

    assemblies.delete(key);

    return {
      kind: 'complete',
      record: assembleRecords(assembly.parts.values()).get(part.record.k) ?? part.record,
    };
  }

  function clear(): void {
    assemblies.clear();
  }

  return { add, clear };
}
