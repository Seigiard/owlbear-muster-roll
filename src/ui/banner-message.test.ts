import { describe, expect, test } from 'bun:test';

import type { Notice, SyncState } from '@/core/ui-messages';

import type { BannerMessage } from '@/ui/primitives/banner';

import { bannerFor } from './banner-message';

type BannerSync = Pick<SyncState, 'role' | 'firstCatchUpDone' | 'gmLink'>;

// The texts the 2.4 spec and the copy catalog name, written out by hand.
const NO_GM = 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.';
const LOCAL_SAVE_FAILED = 'Не удалось сохранить в браузере. Скачайте снимок.';
const NEW_VERSION = 'Вышла новая версия. Перезагрузите страницу.';

const PLAYER_OFFLINE: BannerSync = { role: 'PLAYER', firstCatchUpDone: true, gmLink: 'offline' };

describe('bannerFor', () => {
  test('shows the no-GM warning to a player with no GM link after the first catch-up', () => {
    // #when
    const banner = bannerFor([], PLAYER_OFFLINE);

    // #then
    expect(banner).toEqual({ variant: 'warning', text: NO_GM });
  });

  test.each<[string, BannerSync]>([
    ['a player whose GM link is online', { ...PLAYER_OFFLINE, gmLink: 'online' }],
    ['a player before the first catch-up ends', { ...PLAYER_OFFLINE, firstCatchUpDone: false }],
    ['a GM with no GM link, also one alone in the room', { ...PLAYER_OFFLINE, role: 'GM' }],
  ])('shows nothing to %s', (_name, sync) => {
    // #when
    const banner = bannerFor([], sync);

    // #then
    expect(banner).toBeUndefined();
  });

  test.each<[string, Notice[], BannerMessage]>([
    [
      'a failed local save over a new version and no GM',
      ['new-version', 'local-save-failed'],
      { variant: 'danger', text: LOCAL_SAVE_FAILED },
    ],
    ['a new version over no GM', ['new-version'], { variant: 'warning', text: NEW_VERSION }],
  ])('shows %s', (_name, notices, expected) => {
    // #when
    const banner = bannerFor(notices, PLAYER_OFFLINE);

    // #then
    expect(banner).toEqual(expected);
  });
});
