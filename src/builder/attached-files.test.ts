import { afterEach, describe, expect, test } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { importSnapshot, parseSnapshotFile } from '@/core/snapshot-import';
import {
  TestFileAccessFake,
  type TestFileAccessPort,
  type TestFileReference,
} from '../../tests/support/file-access';

import { BuilderPage } from './builder-page';
import { createBuilderStore, type BuilderStore } from './builder-store';
import { toPreset, uidAt, updateTemplate } from './document';
import { builderProblems } from './problems';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CREW_PRESET = createCrewPreset();
const DISK_PRESET = createCrewPreset('С диска');
const LATER_DISK_PRESET = createCrewPreset('Поздняя версия с диска');
const LOCAL_PRESET = createCrewPreset('Моя версия');
const NEWER_LOCAL_PRESET = createCrewPreset('Новая версия');

const SNAPSHOT_TEXT = JSON.stringify({
  v: 3,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'crew',
      rows: { strength: { strength: 12 } },
      repeats: {},
    },
  ],
  links: [],
});

const EXTERNAL_SNAPSHOT_TEXT = JSON.stringify({
  v: 3,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'crew',
      rows: { strength: { strength: 21 } },
      repeats: {},
    },
  ],
  links: [],
});

const NEWER_SNAPSHOT_TEXT = JSON.stringify({
  v: 3,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'crew',
      rows: { strength: { strength: 34 } },
      repeats: {},
    },
  ],
  links: [],
});

const EMPTY_PRESET: Preset = { v: 3, templates: [] };

const EMPTY_SNAPSHOT = {
  v: 3,
  type: 'muster-roll/snapshot',
  sheets: [{ id: 'crew', rows: {}, repeats: {} }],
  links: [],
};

const CREW_PRESET_TEXT = `{
  "v": 3,
  "templates": [
    {
      "id": "crew",
      "kind": "single",
      "title": "Экипаж",
      "tabs": [
        {
          "sections": [
            {
              "rows": [
                [
                  {
                    "kind": "text",
                    "text": "Сила"
                  },
                  {
                    "kind": "field",
                    "type": "number",
                    "id": "strength"
                  }
                ]
              ]
            }
          ]
        }
      ]
    }
  ]
}`;

const SNAPSHOT_DOCUMENT_TEXT = `{
  "v": 3,
  "type": "muster-roll/snapshot",
  "sheets": [
    {
      "id": "crew",
      "rows": {
        "strength": {
          "strength": 12
        }
      },
      "repeats": {}
    }
  ],
  "links": []
}`;

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

describe('attached Builder files', () => {
  test('writes a valid page edit through the port and shows the save time', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);

    // #when
    editTemplateTitle(store, 'Моя версия');
    await settle();

    // #then
    expect({
      writes: access.writeRequests.map((request) => ({
        file: request.file,
        document: JSON.parse(request.text),
      })),
      block: fileBlock('Пресет').textContent,
    }).toEqual({
      writes: [
        {
          file: { id: 'preset', name: 'crew.json' },
          document: LOCAL_PRESET,
        },
      ],
      block: 'Пресетcrew.jsonсохранено в файл в 18:06',
    });
  });

  test('serializes attached writes and leaves the newest page text on disk', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);
    access.pauseWrites();

    // #when
    editTemplateTitle(store, 'Первая версия');
    await settle();
    editTemplateTitle(store, 'Вторая версия');
    await settle();

    const requestsBeforeFirstCompletion = access.writeRequests.length;

    access.releaseNextWrite();
    await settle();

    const requestsAfterFirstCompletion = access.writeRequests.length;

    access.releaseWrites();
    await settle();

    const disk = await access.read(file);

    // #then
    expect({
      requestsBeforeFirstCompletion,
      requestsAfterFirstCompletion,
      writes: access.writeRequests.map((request) => JSON.parse(request.text)),
      disk: disk.ok ? JSON.parse(disk.value.text) : null,
    }).toEqual({
      requestsBeforeFirstCompletion: 1,
      requestsAfterFirstCompletion: 2,
      writes: [createCrewPreset('Первая версия'), createCrewPreset('Вторая версия')],
      disk: createCrewPreset('Вторая версия'),
    });
  });

  test('Save File writes the current preset and attaches the selected handle for later edits', async () => {
    // #given
    const access = new TestFileAccessFake();
    const selected = access.addFile('saved-preset', 'saved-crew.json', '');
    const unrelated = access.addFile('unrelated', 'unrelated.json', '');
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    access.queueOpen(selected);

    // #when
    await click(fileBlock('Пресет'));
    await click(menuItem('Сохранить в файл…'));
    await settle();
    editTemplateTitle(store, 'Моя версия');
    await settle();

    // #then
    expect({
      modes: access.openRequests.map((request) => request.mode),
      initialWrite: access.writeRequests[0],
      laterWrite: parsedWrite(access, 1),
      selectedIsFollowed: access.isFollowing(selected),
      unrelatedIsFollowed: access.isFollowing(unrelated),
    }).toEqual({
      modes: ['save'],
      initialWrite: {
        file: { id: 'saved-preset', name: 'saved-crew.json' },
        text: CREW_PRESET_TEXT,
      },
      laterWrite: {
        file: { id: 'saved-preset', name: 'saved-crew.json' },
        document: LOCAL_PRESET,
      },
      selectedIsFollowed: true,
      unrelatedIsFollowed: false,
    });
  });

  test('Save As replaces the snapshot handle and keeps later snapshot edits attached', async () => {
    // #given
    const access = new TestFileAccessFake();
    const original = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const selected = access.addFile('saved-snapshot', 'saved-snapshot.json', '');
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    store.setSnapshot(snapshotRecords(SNAPSHOT_TEXT));
    await mount(store, access);
    await openAttachedFile(access, original, 'Снимок');
    access.openRequests.splice(0);
    access.writeRequests.splice(0);
    access.queueOpen(selected);

    // #when
    await click(fileBlock('Снимок'));
    await click(menuItem('Сохранить как…'));
    await settle();
    act(() => store.setSnapshot(snapshotRecords(EXTERNAL_SNAPSHOT_TEXT)));
    await settle();

    // #then
    expect({
      modes: access.openRequests.map((request) => request.mode),
      initialWrite: access.writeRequests[0],
      laterWrite: parsedWrite(access, 1),
      selectedIsFollowed: access.isFollowing(selected),
      originalIsFollowed: access.isFollowing(original),
    }).toEqual({
      modes: ['save'],
      initialWrite: {
        file: { id: 'saved-snapshot', name: 'saved-snapshot.json' },
        text: SNAPSHOT_DOCUMENT_TEXT,
      },
      laterWrite: {
        file: { id: 'saved-snapshot', name: 'saved-snapshot.json' },
        document: JSON.parse(EXTERNAL_SNAPSHOT_TEXT),
      },
      selectedIsFollowed: true,
      originalIsFollowed: false,
    });
  });

  test('confirmed preset clear empties the linked file and undo restores both', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);

    // #when
    await click(fileBlock('Пресет'));
    await click(menuItem('Очистить пресет…'));
    await click(button('Очистить'));
    await settle();

    const cleared = toPreset(store.$state.get().step.document);

    await click(button('Отменить правку'));
    await settle();

    // #then
    expect({
      cleared,
      restored: toPreset(store.$state.get().step.document),
      fileWrites: access.writeRequests.map((request) => JSON.parse(request.text)),
    }).toEqual({
      cleared: EMPTY_PRESET,
      restored: CREW_PRESET,
      fileWrites: [EMPTY_PRESET, CREW_PRESET],
    });
  });

  test('confirmed snapshot clear empties the linked file and undo restores both', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    store.setSnapshot(snapshotRecords(SNAPSHOT_TEXT));
    await mount(store, access);
    await openAttachedFile(access, file, 'Снимок');
    access.writeRequests.splice(0);

    // #when
    await click(fileBlock('Снимок'));
    await click(menuItem('Очистить снимок…'));
    await click(button('Очистить'));
    await settle();

    const cleared = store.$state.get().step.records;

    await click(button('Отменить правку'));
    await settle();

    // #then
    expect({
      cleared,
      restoredValue: previewValue('Сила'),
      fileWrites: access.writeRequests.map((request) => JSON.parse(request.text)),
    }).toEqual({
      cleared: [],
      restoredValue: '12',
      fileWrites: [EMPTY_SNAPSHOT, JSON.parse(SNAPSHOT_TEXT)],
    });
  });

  test('applies a valid external snapshot result to the visible preview without reload', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    store.setSnapshot(snapshotRecords(SNAPSHOT_TEXT));
    await mount(store, access);
    await openAttachedFile(access, file, 'Снимок');
    const before = previewValue('Сила');

    // #when
    access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
    await act(async () => {
      access.externalWrite(file, EXTERNAL_SNAPSHOT_TEXT);
    });

    // #then
    expect({
      before,
      value: previewValue('Сила'),
    }).toEqual({
      before: '12',
      value: '21',
    });
  });

  test('detects a disk change before a page write can overwrite it', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);
    access.externalWriteSilently(file, JSON.stringify(DISK_PRESET));

    // #when
    editTemplateTitle(store, 'Моя версия');
    await settle();

    const disk = await access.read(file);

    // #then
    expect({
      writes: access.writeRequests,
      disk: disk.ok ? JSON.parse(disk.value.text) : null,
      actions: conflictActions(),
    }).toEqual({
      writes: [],
      disk: DISK_PRESET,
      actions: { takeFile: true, keepMine: true },
    });
  });

  test.each([
    ['Взять из файла', DISK_PRESET],
    ['Оставить мои', LOCAL_PRESET],
  ] as const)('resolves a simultaneous edit with “%s”', async (choice, expected) => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);
    access.pauseWrites();
    editTemplateTitle(store, 'Моя версия');
    await settle();

    // #when
    access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
    await act(async () => {
      access.externalWrite(file, JSON.stringify(DISK_PRESET));
    });

    const takeFile = button('Взять из файла');
    const keepMine = button('Оставить мои');

    expect({ takeFile: takeFile !== null, keepMine: keepMine !== null }).toEqual({
      takeFile: true,
      keepMine: true,
    });

    await click(choice === 'Взять из файла' ? takeFile : keepMine);
    access.releaseWrites();
    await settle();

    const disk = await access.read(file);

    // #then
    expect({
      page: toPreset(store.$state.get().step.document),
      disk: disk.ok ? JSON.parse(disk.value.text) : null,
    }).toEqual({ page: expected, disk: expected });
  });

  test.each([
    ['Взять из файла', DISK_PRESET],
    ['Оставить мои', LOCAL_PRESET],
  ] as const)(
    'resolves a conflict after a newer local preset was queued with “%s”',
    async (choice, expected) => {
      // #given
      const access = new TestFileAccessFake();
      const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
      const store = createBuilderStore(memoryStorage());

      store.open(CREW_PRESET, CREW_PRESET, 'crew');
      await mount(store, access);
      await openAttachedFile(access, file, 'Пресет');
      access.readRequests.splice(0);
      access.writeRequests.splice(0);
      access.pauseReads();

      editTemplateTitle(store, 'Промежуточная версия');
      await settle();
      editTemplateTitle(store, 'Моя версия');
      await settle();

      access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
      access.externalWriteSilently(file, JSON.stringify(DISK_PRESET));

      // #when
      await act(async () => {
        access.releaseReads();
      });
      await settle();

      const actionsBeforeChoice = conflictActions();
      const pageBeforeChoice = toPreset(store.$state.get().step.document);

      await click(button(choice));
      await settle();

      const disk = await access.read(file);

      // #then
      expect({
        pageBeforeChoice,
        actionsBeforeChoice,
        page: toPreset(store.$state.get().step.document),
        disk: disk.ok ? JSON.parse(disk.value.text) : null,
      }).toEqual({
        pageBeforeChoice: LOCAL_PRESET,
        actionsBeforeChoice: { takeFile: true, keepMine: true },
        page: expected,
        disk: expected,
      });
    },
  );

  test('keeps a pending-write conflict until the user chooses', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);
    access.pauseWrites();
    editTemplateTitle(store, 'Моя версия');
    await settle();

    // #when
    access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
    await act(async () => {
      access.externalWrite(file, JSON.stringify(DISK_PRESET));
    });

    const diskBeforeRelease = await access.read(file);

    const beforeRelease = {
      writes: access.writeRequests.length,
      actions: conflictActions(),
    };

    access.releaseWrites();
    await settle();
    await act(async () => {
      access.externalWrite(file, JSON.stringify(LOCAL_PRESET));
    });

    const diskAfterOwnEcho = await access.read(file);

    // #then
    expect({
      diskBeforeRelease: diskBeforeRelease.ok ? JSON.parse(diskBeforeRelease.value.text) : null,
      beforeRelease,
      afterRelease: {
        writes: access.writeRequests.length,
        actions: conflictActions(),
      },
      diskAfterOwnEcho: diskAfterOwnEcho.ok ? JSON.parse(diskAfterOwnEcho.value.text) : null,
    }).toEqual({
      diskBeforeRelease: DISK_PRESET,
      beforeRelease: {
        writes: 1,
        actions: { takeFile: true, keepMine: true },
      },
      afterRelease: {
        writes: 1,
        actions: { takeFile: true, keepMine: true },
      },
      diskAfterOwnEcho: LOCAL_PRESET,
    });
  });

  test.each([
    ['Взять из файла', LATER_DISK_PRESET],
    ['Оставить мои', LOCAL_PRESET],
  ] as const)(
    'keeps a pending conflict through a later external preset and resolves “%s”',
    async (choice, expected) => {
      // #given
      const access = new TestFileAccessFake();
      const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
      const store = createBuilderStore(memoryStorage());

      store.open(CREW_PRESET, CREW_PRESET, 'crew');
      await mount(store, access);
      await openAttachedFile(access, file, 'Пресет');
      access.writeRequests.splice(0);
      access.pauseWrites();
      editTemplateTitle(store, 'Моя версия');
      await settle();

      access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
      await act(async () => {
        access.externalWrite(file, JSON.stringify(DISK_PRESET));
      });

      expect(conflictActions()).toEqual({ takeFile: true, keepMine: true });

      access.releaseWrites();
      await settle();

      // #when
      access.setModifiedAt(new Date('2026-11-16T18:08:00.000Z'));
      await act(async () => {
        access.externalWrite(file, JSON.stringify(LATER_DISK_PRESET));
      });

      const actionsAfterLaterFile = conflictActions();

      // #then
      expect(actionsAfterLaterFile).toEqual({ takeFile: true, keepMine: true });

      await click(button(choice));
      await settle();

      const disk = await access.read(file);

      expect({
        page: toPreset(store.$state.get().step.document),
        disk: disk.ok ? JSON.parse(disk.value.text) : null,
      }).toEqual({ page: expected, disk: expected });
    },
  );

  test('stops after a failed write and resumes only for a new edit', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);
    access.queueWriteFailure('native write denied');

    // #when
    editTemplateTitle(store, 'Первая версия');
    await settle();

    const requestsAfterFailure = access.writeRequests.length;

    editTemplateTitle(store, 'Вторая версия');
    await settle();

    // #then
    expect({
      requestsAfterFailure,
      writes: access.writeRequests.map((request) => JSON.parse(request.text)),
    }).toEqual({
      requestsAfterFailure: 1,
      writes: [createCrewPreset('Первая версия'), createCrewPreset('Вторая версия')],
    });
  });

  test('does not expose native file-operation details in the attached-file status', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');

    // #when
    await act(async () => {
      access.externalFailure(file, 'native permission denied');
    });

    // #then
    expect(fileBlock('Пресет').textContent?.includes('native permission denied')).toBe(false);
  });

  test('pauses writes for a preset problem and resumes after the repair', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.writeRequests.splice(0);

    // #when
    editTemplateId(store, 'bad id');
    await settle();

    const invalidProblems = builderProblems(store.$state.get().step.document).map(
      (problem) => problem.failure.code,
    );

    const invalidState = {
      problems: invalidProblems,
      writes: access.writeRequests.length,
      block: fileBlock('Пресет').textContent,
    };

    editTemplateId(store, 'crew');
    await settle();

    // #then
    expect({
      invalidState,
      repairedWrites: access.writeRequests.map((request) => JSON.parse(request.text)),
      repairedBlock: fileBlock('Пресет').textContent,
    }).toEqual({
      invalidState: {
        problems: ['invalid-template-id'],
        writes: 0,
        block: 'Пресетcrew.jsonне сохранено: исправьте проблемы',
      },
      repairedWrites: [CREW_PRESET],
      repairedBlock: 'Пресетcrew.jsonсохранено в файл в 18:06',
    });
  });

  test('keeps the last good preset when an external result is refused', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');

    // #when
    await act(async () => {
      access.externalWrite(file, '{');
    });

    // #then
    expect({
      document: toPreset(store.$state.get().step.document),
      block: fileBlock('Пресет').textContent,
    }).toEqual({
      document: CREW_PRESET,
      block: 'Пресетcrew.jsonФайл не подошёл: это не JSON. Ничего не изменено.',
    });
  });

  test('suppresses malformed preset preflight retries until repaired file and new page work', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    access.readRequests.splice(0);
    access.writeRequests.splice(0);
    access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
    access.externalWriteSilently(file, '{');
    access.pauseReadsAfter(1);

    // #when
    editTemplateTitle(store, 'Моя версия');
    await settle();
    await settle();

    const refused = {
      reads: access.readRequests.length,
      page: toPreset(store.$state.get().step.document),
      block: fileBlock('Пресет').textContent,
    };

    access.setModifiedAt(new Date('2026-11-16T18:08:00.000Z'));
    await act(async () => {
      access.externalWrite(file, JSON.stringify(LOCAL_PRESET));
      access.releaseReads();
    });
    await settle();

    const repaired = {
      page: toPreset(store.$state.get().step.document),
      block: fileBlock('Пресет').textContent,
    };

    editTemplateTitle(store, 'Новая версия');
    await settle();

    const readsAfterNewEdit = access.readRequests.length;
    const disk = await access.read(file);

    // #then
    expect({
      refused,
      repaired,
      readsAfterNewEdit,
      disk: disk.ok ? JSON.parse(disk.value.text) : null,
    }).toEqual({
      refused: {
        reads: 1,
        page: LOCAL_PRESET,
        block: 'Пресетcrew.jsonФайл не подошёл: это не JSON. Ничего не изменено.',
      },
      repaired: {
        page: LOCAL_PRESET,
        block: 'Пресетcrew.jsonсохранено в файл в 18:08',
      },
      readsAfterNewEdit: 2,
      disk: NEWER_LOCAL_PRESET,
    });
  });

  test('suppresses malformed snapshot preflight retries until repaired file and new page work', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    store.setSnapshot(snapshotRecords(SNAPSHOT_TEXT));
    await mount(store, access);
    await openAttachedFile(access, file, 'Снимок');
    access.readRequests.splice(0);
    access.writeRequests.splice(0);
    access.setModifiedAt(new Date('2026-11-16T18:07:00.000Z'));
    access.externalWriteSilently(file, '{');
    access.pauseReadsAfter(1);

    // #when
    act(() => store.setSnapshot(snapshotRecords(EXTERNAL_SNAPSHOT_TEXT)));
    await settle();
    await settle();

    const refused = {
      reads: access.readRequests.length,
      pageValue: previewValue('Сила'),
      block: fileBlock('Снимок').textContent,
    };

    access.setModifiedAt(new Date('2026-11-16T18:08:00.000Z'));
    await act(async () => {
      access.externalWrite(file, EXTERNAL_SNAPSHOT_TEXT);
      access.releaseReads();
    });
    await settle();

    const repaired = {
      pageValue: previewValue('Сила'),
      block: fileBlock('Снимок').textContent,
    };

    act(() => store.setSnapshot(snapshotRecords(NEWER_SNAPSHOT_TEXT)));
    await settle();

    const readsAfterNewEdit = access.readRequests.length;
    const disk = await access.read(file);

    // #then
    expect({
      refused,
      repaired,
      readsAfterNewEdit,
      disk: disk.ok ? JSON.parse(disk.value.text) : null,
    }).toEqual({
      refused: {
        reads: 1,
        pageValue: '21',
        block: 'Снимокcrew-snapshot.jsonФайл не подошёл: это не JSON. Ничего не изменено.',
      },
      repaired: {
        pageValue: '21',
        block: 'Снимокcrew-snapshot.jsonсохранено в файл в 18:08',
      },
      readsAfterNewEdit: 2,
      disk: JSON.parse(NEWER_SNAPSHOT_TEXT),
    });
  });

  test('keeps an attached compatible snapshot through preset own-write echo and external follow', async () => {
    // #given
    const access = new TestFileAccessFake();
    const presetFile = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const snapshotFile = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, presetFile, 'Пресет');
    await openAttachedFile(access, snapshotFile, 'Снимок');
    access.writeRequests.splice(0);

    const before = visiblePresetAndSnapshot(access, snapshotFile);
    editTemplateTitle(store, 'Моя версия');
    await settle();
    const ownWrite = access.writeRequests.find((request) => request.file.id === presetFile.id);

    if (ownWrite === undefined) {
      throw new Error('The preset edit did not reach its attached file');
    }

    // #when
    await act(async () => {
      access.externalWrite(presetFile, ownWrite.text);
    });
    const afterOwnWriteEcho = visiblePresetAndSnapshot(access, snapshotFile);

    access.setModifiedAt(new Date('2026-11-16T18:08:00.000Z'));
    await act(async () => {
      access.externalWrite(presetFile, JSON.stringify(DISK_PRESET));
    });
    const afterExternalTitleUpdate = visiblePresetAndSnapshot(access, snapshotFile);

    // #then
    expect({
      before,
      afterOwnWriteEcho,
      afterExternalTitleUpdate,
    }).toEqual({
      before: {
        presetTitle: 'Экипаж',
        snapshotValue: '12',
        snapshotFileName: 'crew-snapshot.json',
        snapshotIsFollowed: true,
      },
      afterOwnWriteEcho: {
        presetTitle: 'Моя версия',
        snapshotValue: '12',
        snapshotFileName: 'crew-snapshot.json',
        snapshotIsFollowed: true,
      },
      afterExternalTitleUpdate: {
        presetTitle: 'С диска',
        snapshotValue: '12',
        snapshotFileName: 'crew-snapshot.json',
        snapshotIsFollowed: true,
      },
    });
  });

  test('keeps preset selection and undo/redo identity through its own canonical echo', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('preset', 'crew.json', JSON.stringify(CREW_PRESET));
    const store = createBuilderStore(memoryStorage());

    await mount(store, access);
    await openAttachedFile(access, file, 'Пресет');
    editTemplateTitle(store, 'Моя версия');
    await settle();
    act(() => store.undo());
    await settle();

    const selected = uidAt(store.$state.get().step.document, [0, 0, 0, 0, 1]);

    if (selected === null) {
      throw new Error('The preset fixture has no field selection');
    }

    act(() => store.select(selected));

    const documentBefore = store.$state.get().step.document;

    // #when
    await act(async () => {
      access.externalWrite(file, CREW_PRESET_TEXT);
    });

    const state = store.$state.get();

    // #then
    expect({
      documentIdentityPreserved: state.step.document === documentBefore,
      selectionPreserved: state.selection === selected,
      undoSteps: state.undo.length,
      redoSteps: state.redo.length,
    }).toEqual({
      documentIdentityPreserved: true,
      selectionPreserved: true,
      undoSteps: 1,
      redoSteps: 1,
    });
  });

  test('keeps snapshot records and undo/redo identity through its own canonical echo', async () => {
    // #given
    const access = new TestFileAccessFake();
    const file = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    await mount(store, access);
    await openAttachedFile(access, file, 'Снимок');
    act(() => store.setSnapshot(snapshotRecords(EXTERNAL_SNAPSHOT_TEXT)));
    await settle();
    act(() => store.undo());
    await settle();

    const recordsBefore = store.$state.get().step.records;

    // #when
    await act(async () => {
      access.externalWrite(file, SNAPSHOT_TEXT);
    });

    const state = store.$state.get();

    // #then
    expect({
      recordsIdentityPreserved: state.step.records === recordsBefore,
      undoSteps: state.undo.length,
      redoSteps: state.redo.length,
    }).toEqual({
      recordsIdentityPreserved: true,
      undoSteps: 2,
      redoSteps: 1,
    });
  });

  test('opening an identical preset attaches it without clearing the companion snapshot', async () => {
    // #given
    const access = new TestFileAccessFake();
    const firstPreset = access.addFile('preset-1', 'crew.json', JSON.stringify(CREW_PRESET));
    const secondPreset = access.addFile('preset-2', 'crew-copy.json', JSON.stringify(CREW_PRESET));
    const snapshotFile = access.addFile('snapshot', 'crew-snapshot.json', SNAPSHOT_TEXT);
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, CREW_PRESET, 'crew');
    store.setSnapshot(snapshotRecords(SNAPSHOT_TEXT));
    await mount(store, access);
    await openAttachedFile(access, firstPreset, 'Пресет');
    await openAttachedFile(access, snapshotFile, 'Снимок');

    // #when
    await openAttachedFile(access, secondPreset, 'Пресет');

    // #then
    expect({
      snapshotValue: previewValue('Сила'),
      snapshotFileName: attachedFileName('Снимок'),
      snapshotIsFollowed: access.isFollowing(snapshotFile),
      secondPresetIsFollowed: access.isFollowing(secondPreset),
    }).toEqual({
      snapshotValue: '12',
      snapshotFileName: 'crew-snapshot.json',
      snapshotIsFollowed: true,
      secondPresetIsFollowed: true,
    });
  });

  test('keeps open and download without write or follow claims in an unsupported browser', async () => {
    // #given
    const access = new TestFileAccessFake('open-only');
    const store = createBuilderStore(memoryStorage());

    store.open(CREW_PRESET, null, 'crew');
    await mount(store, access);

    // #when
    await click(fileBlock('Пресет'));
    const items = menuItems();

    editTemplateTitle(store, 'Моя версия');
    await settle();

    // #then
    expect({
      items,
      opens: access.openRequests,
      writes: access.writeRequests,
      follows: access.followRequests,
    }).toEqual({
      items: [
        'не подключён',
        'Открыть файл…',
        'Пример: персонажи, NPC, инвентарь',
        'Пример: d20',
        'Пример: пул d6',
        'Скачать копию',
        'Очистить пресет…',
      ],
      opens: [],
      writes: [],
      follows: [],
    });
  });

  test('keeps a valid open-only preset edit free of validation-problem status', async () => {
    // #given
    const access = new TestFileAccessFake('open-only');
    const store = createBuilderStore(memoryStorage());

    await mount(store, access);
    await openInputFile('preset', 'crew.json', CREW_PRESET_TEXT);

    // #when
    editTemplateTitle(store, 'Моя версия');
    await settle();

    // #then
    expect({
      blocked: fileBlock('Пресет').textContent?.includes('не сохранено: исправьте проблемы'),
      writes: access.writeRequests,
      follows: access.followRequests,
    }).toEqual({
      blocked: false,
      writes: [],
      follows: [],
    });
  });
});

function createCrewPreset(title = 'Экипаж'): Preset {
  return {
    v: 3,
    templates: [
      {
        id: 'crew',
        kind: 'single',
        title,
        tabs: [
          {
            sections: [
              {
                rows: [
                  [
                    { kind: 'text', text: 'Сила' },
                    { kind: 'field', type: 'number', id: 'strength' },
                  ],
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function snapshotRecords(text: string): readonly VersionedRecord[] {
  const parsed = parseSnapshotFile(text);

  if (!parsed.ok) {
    throw new Error('The snapshot fixture does not parse');
  }

  const imported = importSnapshot(
    parsed.value,
    { preset: CREW_PRESET, data: encodePreset(CREW_PRESET) },
    'builder',
  );

  if (!imported.ok) {
    throw new Error('The snapshot fixture does not import');
  }

  return imported.value.records;
}

async function mount(store: BuilderStore, fileAccess: TestFileAccessPort): Promise<void> {
  const container = document.createElement('div');
  const root = createRoot(container);

  document.body.append(container);
  mounted.push(root);

  await act(async () => {
    const props = { store, fileAccess };

    root.render(createElement(BuilderPage, props));
  });
}

async function openAttachedFile(
  access: TestFileAccessFake,
  file: TestFileReference,
  kind: 'Пресет' | 'Снимок',
): Promise<void> {
  access.queueOpen(file);
  await click(fileBlock(kind));
  await click(menuItem('Открыть другой файл…') ?? menuItem('Открыть файл…'));
  await settle();
}

async function openInputFile(
  kind: 'preset' | 'snapshot',
  name: string,
  text: string,
): Promise<void> {
  const selector =
    kind === 'preset' ? '[data-builder-file-input]' : '[data-builder-snapshot-file-input]';

  const input = document.querySelector<HTMLInputElement>(selector);

  if (input === null) {
    throw new Error(`No ${kind} file input`);
  }

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([text], name, { type: 'application/json' })],
  });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

function fileBlock(kind: 'Пресет' | 'Снимок'): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('header button')].find((element) =>
    element.textContent?.startsWith(kind),
  );

  if (found === undefined) {
    throw new Error(`No ${kind} file block`);
  }

  return found;
}

function menuItem(name: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function menuItems(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
    (element) => element.textContent?.trim() ?? '',
  );
}

function button(name: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function conflictActions() {
  return {
    takeFile: button('Взять из файла') !== null,
    keepMine: button('Оставить мои') !== null,
  };
}

function previewValue(name: string): string | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[role="group"]')].find(
      (element) => element.getAttribute('aria-label') === name,
    )?.textContent ?? null
  );
}

function formValue(labelText: string): string | null {
  const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (element) => element.textContent?.trim() === labelText,
  );

  const input = label === undefined ? null : document.getElementById(label.htmlFor);

  return input instanceof HTMLInputElement ? input.value : null;
}

function attachedFileName(kind: 'Пресет' | 'Снимок'): string | null {
  return fileBlock(kind).querySelector<HTMLElement>('[title]')?.textContent ?? null;
}

function visiblePresetAndSnapshot(access: TestFileAccessFake, snapshotFile: TestFileReference) {
  return {
    presetTitle: formValue('Заголовок'),
    snapshotValue: previewValue('Сила'),
    snapshotFileName: attachedFileName('Снимок'),
    snapshotIsFollowed: access.isFollowing(snapshotFile),
  };
}

function parsedWrite(
  access: TestFileAccessFake,
  index: number,
): { file: TestFileReference; document: unknown } | null {
  const request = access.writeRequests[index];

  return request === undefined ? null : { file: request.file, document: JSON.parse(request.text) };
}

async function click(element: HTMLElement | null): Promise<void> {
  expect(element).not.toBeNull();

  if (element === null) {
    return;
  }

  await act(async () => {
    element.click();
  });
}

function editTemplateTitle(store: BuilderStore, title: string): void {
  const templateUid = uidAt(store.$state.get().step.document, [0]);

  if (templateUid === null) {
    throw new Error('The preset fixture has no template');
  }

  act(() => {
    store.edit((document) =>
      updateTemplate(document, templateUid, (template) => ({ ...template, title })),
    );
  });
}

function editTemplateId(store: BuilderStore, id: string): void {
  const templateUid = uidAt(store.$state.get().step.document, [0]);

  if (templateUid === null) {
    throw new Error('The preset fixture has no template');
  }

  act(() => {
    store.edit((document) =>
      updateTemplate(document, templateUid, (template) => ({ ...template, id })),
    );
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
