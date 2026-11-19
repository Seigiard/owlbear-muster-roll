import { describe, expect, test } from 'bun:test';

import { blockAddress } from '@/core/block-address';
import type { RenderedTab } from '@/core/preset';

import { sameRenderedTab } from './rendered-tabs';

const TAB = { sections: [] };

function renderedTab(sourceIndex: number, path: readonly string[] | null): RenderedTab {
  const block = path === null ? null : blockAddress('npc', path);

  if (path !== null && block === null) {
    throw new Error('fixture must be a block address');
  }

  return {
    sourceIndex,
    tab: TAB,
    block:
      block === null
        ? null
        : {
            block,
            name: path === null || path.length === 0 ? 'Root' : (path.at(-1) ?? ''),
          },
  };
}

describe('sameRenderedTab', () => {
  test('recognises the same source and block address', () => {
    // #given
    const first = renderedTab(2, ['npc', 'a', 'attack', 'x']);
    const second = renderedTab(2, ['npc', 'a', 'attack', 'x']);

    // #when
    const same = sameRenderedTab(first, second);

    // #then
    expect(same).toBe(true);
  });

  test('rejects a different source index', () => {
    // #given
    const first = renderedTab(2, ['npc', 'a']);
    const second = renderedTab(3, ['npc', 'a']);

    // #when
    const same = sameRenderedTab(first, second);

    // #then
    expect(same).toBe(false);
  });

  test('rejects a different block even when the source index is the same', () => {
    // #given
    const first = renderedTab(2, ['npc', 'a', 'attack', 'x']);
    const second = renderedTab(2, ['npc', 'b', 'attack', 'x']);

    // #when
    const same = sameRenderedTab(first, second);

    // #then
    expect(same).toBe(false);
  });

  test('recognises two root tabs of the same source', () => {
    // #given
    const first = renderedTab(0, null);
    const second = renderedTab(0, null);

    // #when
    const same = sameRenderedTab(first, second);

    // #then
    expect(same).toBe(true);
  });
});
