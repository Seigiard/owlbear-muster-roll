import { nextCounter, type Version } from '@/core/merge';

export type VersionMinter = {
  mint: (key: string, highestKnownCounter: number) => Version;
};

export function createVersionMinter(connectionId: string): VersionMinter {
  const lastMintedByKey = new Map<string, number>();

  return {
    mint: (key, highestKnownCounter) => {
      const c = nextCounter(highestKnownCounter, lastMintedByKey.get(key) ?? 0);

      // The caller's knowledge can lag behind this connection's own last edit.
      lastMintedByKey.set(key, c);

      return { c, a: connectionId };
    },
  };
}
