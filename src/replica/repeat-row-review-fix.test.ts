import { expect, test } from 'bun:test';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { createRoomRig, shown } from '../../tests/support/room-rig';

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'journal',
      title: 'Журнал',
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  repeat: { id: 'conditions', nameField: 'name' },
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'dice', formula: '1d20', name: 'Проверка' },
                    { kind: 'token', id: 'badge' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const ROOT: VersionedRecord = {
  k: 'blk:journal',
  d: { order: 0, cells: {} },
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
};

const rig = createRoomRig({
  seeded: [{ k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' }, ROOT],
  until: 'live',
});

test('real engine commands add, edit and remove a repeat-row block in its row scope', async () => {
  // #given
  const room = rig.openRoom(['token']);
  const gm = await rig.startClient(room, 'gm-a');

  // #when
  const added = await gm.window.sendCommand({
    type: 'repeat-block-add',
    sheetId: 'journal',
    sectionId: 'conditions',
    instanceId: 'c1',
  });

  const edited = await gm.window.sendCommand({
    type: 'field-patch',
    sheetId: 'journal',
    target: { kind: 'rep', sectionId: 'conditions', instanceId: 'c1' },
    fieldId: 'name',
    value: 'Отравлен',
  });

  const linked = await gm.window.sendCommand({
    type: 'link-set',
    tokenId: 'token',
    sheetId: 'journal',
    path: ['conditions', 'c1'],
    cellId: 'badge',
  });

  const beforeRemove = shown(gm, 'blk:journal:conditions:c1');
  const linkBeforeRemove = shown(gm, 'link:token');

  const removed = await gm.window.sendCommand({
    type: 'repeat-block-delete',
    sheetId: 'journal',
    sectionId: 'conditions',
    instanceId: 'c1',
  });

  // #then
  expect({
    outcomes: [added.kind, edited.kind, linked.kind, removed.kind],
    beforeRemove: beforeRemove?.d,
    linkBeforeRemove: linkBeforeRemove?.d,
    afterRemove: shown(gm, 'blk:journal:conditions:c1')?.d,
    linkAfterRemove: shown(gm, 'link:token')?.d,
  }).toEqual({
    outcomes: ['answered', 'answered', 'answered', 'answered'],
    beforeRemove: { order: 0, cells: { name: ['Отравлен', expect.any(Number), 'gm-a'] } },
    linkBeforeRemove: { s: 'journal', path: ['conditions', 'c1'], c: 'badge' },
    afterRemove: null,
    linkAfterRemove: null,
  });
});
