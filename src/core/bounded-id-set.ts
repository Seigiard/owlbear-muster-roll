export type BoundedIdSet = {
  add: (id: string) => void;
  has: (id: string) => boolean;
  delete: (id: string) => void;
};

// A Set iterates in insertion order, so the first id is always the oldest.
export function createBoundedIdSet(limit: number): BoundedIdSet {
  const ids = new Set<string>();

  return {
    add: (id) => {
      ids.add(id);

      if (ids.size > limit) {
        for (const oldest of ids) {
          ids.delete(oldest);
          break;
        }
      }
    },
    has: (id) => ids.has(id),
    delete: (id) => {
      ids.delete(id);
    },
  };
}
