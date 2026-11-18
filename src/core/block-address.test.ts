import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import {
  blockAddress,
  blockKeyOf,
  blockPathSchema,
  childAddress,
  fieldPatchTargetOf,
  hasValidSegments,
  isDescendantOf,
  isLiveBlock,
  isSelfOrDescendantOf,
  keySegmentSchema,
  parentOf,
  parseBlockKey,
  sameAddress,
  scopePathOf,
  sectionIdOf,
  blockIdOf,
  sheetRootAddress,
  wireFieldPatchTargetOf,
  type BlockAddress,
} from './block-address';
import { parseRecord } from './records';

function address(sheetId: string, path: readonly string[] = []): BlockAddress {
  const value = blockAddress(sheetId, path);

  if (value === null) throw new Error('fixture must be a block address');

  return value;
}

describe('block keys', () => {
  test.each([
    ['the sheet root', 'blk:s1', { sheetId: 's1', path: [] }],
    ['one repeat level', 'blk:s1:npc:a', { sheetId: 's1', path: ['npc', 'a'] }],
    [
      'nested repeat blocks',
      'blk:s1:npc:a:atk:x',
      { sheetId: 's1', path: ['npc', 'a', 'atk', 'x'] },
    ],
  ])('round-trips %s', (_name, key, expected) => {
    // #when
    const parsed = parseBlockKey(key);

    // #then
    expect(parsed === null ? null : { address: parsed, key: blockKeyOf(parsed) }).toEqual({
      address: expected,
      key,
    });
  });

  test.each(['link:s1', 'blk:s1:npc', 'blk:s1:npc:', 'blk:s1::a', 'blk:s1:npc:a:atk'])(
    'refuses an invalid key %s',
    (key) => {
      // #then
      expect(parseBlockKey(key)).toBeNull();
    },
  );
});

describe('blockAddress', () => {
  test('keeps the root and repeat paths as readonly address data', () => {
    // #then
    expect([
      blockAddress('s1', []),
      blockAddress('s1', ['npc', 'a']),
      blockAddress('s1', ['npc', 'a', 'atk', 'x']),
    ]).toEqual([
      { sheetId: 's1', path: [] },
      { sheetId: 's1', path: ['npc', 'a'] },
      { sheetId: 's1', path: ['npc', 'a', 'atk', 'x'] },
    ]);
  });

  test('refuses an odd-length path', () => {
    // #then
    expect(blockAddress('s1', ['npc'])).toBeNull();
  });

  test('adds one repeat level to its parent', () => {
    // #then
    expect(childAddress(address('s1', ['npc', 'a']), 'atk', 'x')).toEqual({
      sheetId: 's1',
      path: ['npc', 'a', 'atk', 'x'],
    });
  });
});

describe('address views', () => {
  test('derives the parent, scope path, section and block id of a nested block', () => {
    // #given
    const nested = address('s1', ['npc', 'a', 'atk', 'x']);

    // #then
    expect({
      parent: parentOf(nested),
      scopePath: scopePathOf(nested),
      sectionId: sectionIdOf(nested),
      blockId: blockIdOf(nested),
    }).toEqual({
      parent: { sheetId: 's1', path: ['npc', 'a'] },
      scopePath: ['npc', 'atk'],
      sectionId: 'atk',
      blockId: 'x',
    });
  });

  test('gives root-specific views for a sheet address', () => {
    // #given
    const root = sheetRootAddress('s1');

    // #then
    expect({
      parent: parentOf(root),
      scopePath: scopePathOf(root),
      sectionId: sectionIdOf(root),
      blockId: blockIdOf(root),
    }).toEqual({ parent: null, scopePath: [], sectionId: null, blockId: null });
  });
});

describe('address comparison', () => {
  test('distinguishes descendants, siblings with a shared string prefix, and self', () => {
    // #given
    const parent = address('s1', ['npc', 'a']);

    // #then
    expect({
      nested: isDescendantOf(address('s1', ['npc', 'a', 'atk', 'x']), parent),
      stringPrefixOnly: isDescendantOf(address('s1', ['npc', 'ab', 'atk', 'x']), parent),
      self: isDescendantOf(parent, parent),
      selfOrNested: isSelfOrDescendantOf(address('s1', ['npc', 'a', 'atk', 'x']), parent),
      selfOrStringPrefixOnly: isSelfOrDescendantOf(
        address('s1', ['npc', 'ab', 'atk', 'x']),
        parent,
      ),
      selfOrSelf: isSelfOrDescendantOf(parent, parent),
      equal: sameAddress(parent, address('s1', ['npc', 'a'])),
      otherSheet: sameAddress(parent, address('s2', ['npc', 'a'])),
    }).toEqual({
      nested: true,
      stringPrefixOnly: false,
      self: false,
      selfOrNested: true,
      selfOrStringPrefixOnly: false,
      selfOrSelf: true,
      equal: true,
      otherSheet: false,
    });
  });
});

describe('address validation', () => {
  test('accepts key segments and even stored block paths', () => {
    // #then
    expect({
      segment: keySegmentSchema.safeParse('npc').success,
      path: blockPathSchema.safeParse(['npc', 'a', 'atk', 'x']).success,
      address: hasValidSegments(address('s1', ['npc', 'a'])),
    }).toEqual({ segment: true, path: true, address: true });
  });

  test('refuses empty or colon-delimited segments and an odd stored path', () => {
    // #then
    expect({
      emptySegment: keySegmentSchema.safeParse('').success,
      colonSegment: keySegmentSchema.safeParse('npc:a').success,
      oddPath: blockPathSchema.safeParse(['npc', 'a', 'atk']).success,
      emptyPath: blockPathSchema.safeParse([]).success,
      invalidAddress: hasValidSegments(address('s1', ['npc', ''])),
    }).toEqual({
      emptySegment: false,
      colonSegment: false,
      oddPath: false,
      emptyPath: false,
      invalidAddress: false,
    });
  });
});

describe('isLiveBlock', () => {
  const records = new Map([
    ['blk:s1:npc:a', fixtureRecord('blk:s1:npc:a', { order: 0, cells: {} }, 1, 'gm')],
    ['blk:s1:npc:b', fixtureRecord('blk:s1:npc:b', null, 2, 'gm')],
    ['blk:s1:npc:b:atk:x', fixtureRecord('blk:s1:npc:b:atk:x', { order: 0, cells: {} }, 3, 'gm')],
  ]);

  test('keeps the root and a live block', () => {
    // #then
    expect([
      isLiveBlock(records, sheetRootAddress('s1')),
      isLiveBlock(records, address('s1', ['npc', 'a'])),
    ]).toEqual([true, true]);
  });

  test('rejects a tombstoned block and every descendant below it', () => {
    // #then
    expect([
      isLiveBlock(records, address('s1', ['npc', 'b'])),
      isLiveBlock(records, address('s1', ['npc', 'b', 'atk', 'x'])),
    ]).toEqual([false, false]);
  });
});

describe('field patch target wire edge', () => {
  test('converts the shallow wire triple to a repeat block and omits its path on output', () => {
    // #when
    const target = fieldPatchTargetOf('s1', { sectionId: 'npc', instanceId: 'a' });

    // #then
    expect(target === null ? null : { target, wire: wireFieldPatchTargetOf(target) }).toEqual({
      target: { kind: 'rep', block: { sheetId: 's1', path: ['npc', 'a'] } },
      wire: { sectionId: 'npc', instanceId: 'a' },
    });
  });

  test('converts a nested wire path and keeps it on output', () => {
    // #when
    const target = fieldPatchTargetOf('s1', {
      sectionId: 'atk',
      instanceId: 'x',
      path: ['npc', 'a', 'atk', 'x'],
    });

    // #then
    expect(target === null ? null : { target, wire: wireFieldPatchTargetOf(target) }).toEqual({
      target: { kind: 'rep', block: { sheetId: 's1', path: ['npc', 'a', 'atk', 'x'] } },
      wire: { sectionId: 'atk', instanceId: 'x', path: ['npc', 'a', 'atk', 'x'] },
    });
  });

  test('refuses a wire path that does not end with its named repeat block', () => {
    // #then
    expect(
      fieldPatchTargetOf('s1', {
        sectionId: 'atk',
        instanceId: 'x',
        path: ['npc', 'a', 'spell', 'x'],
      }),
    ).toBeNull();
  });
});

describe('v4 token-cell link records', () => {
  test('accepts a link to a token cell in the sheet root', () => {
    // #given
    const candidate = {
      k: 'link:token-root',
      d: { s: 'inventory', c: 'inventory_token' },
      c: 1,
      a: 'gm-a',
    };

    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual({ ok: true, value: candidate });
  });

  test('accepts a link to a token cell in a repeat block path', () => {
    // #given
    const candidate = {
      k: 'link:token-attack',
      d: { s: 'brok', path: ['attacks', 'a1'], c: 'attack_token' },
      c: 1,
      a: 'gm-a',
    };

    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual({ ok: true, value: candidate });
  });
});
