import { z } from 'zod';

import { linkDataSchema, sheetDataSchema, type VersionedRecord } from '@/core/records';
import { sheetKey, type SheetSummary } from '@/core/sheets';
import type { PlayerRole, VisibleSheets } from '@/core/visibility';

// The layer Owlbear puts tokens on.
const TOKEN_LAYER = 'CHARACTER';

// The link picker is a page of its own in an Owlbear popover. It reads its token from this param.
export const LINK_PICKER_PATH = '/picker.html';

export const LINK_PICKER_TOKEN_PARAM = 'token';

// One picker at a time: a second one opens under the same id.
export const LINK_PICKER_POPOVER_ID = 'app.muster-roll/link-picker';

// Owlbear names an item by an id with no ":", so it fits the `link:{tokenId}` key form. The bound
// keeps a forged id from making a key no message could carry.
export const tokenIdSchema = z.string().regex(/^[^:\s]{1,128}$/);

// One key filter of an Owlbear context menu icon. `coordinator` joins it to the next filter.
export type TokenMenuKeyFilter = {
  key: string;
  value: string;
  operator?: '==' | '!=';
  coordinator?: '&&' | '||';
};

export type TokenMenuFilter = {
  max: number;
  roles: PlayerRole[];
  every: TokenMenuKeyFilter[];
  some?: TokenMenuKeyFilter[];
};

export type TokenMenuAction = 'link' | 'unlink';

export type TokenMenuEntry = { action: TokenMenuAction; filter: TokenMenuFilter };

export function linkKey(tokenId: string): string {
  return `link:${tokenId}`;
}

// The picker's URL for one token, relative to the extension's origin.
export function linkPickerUrl(tokenId: string): string {
  return `${LINK_PICKER_PATH}?${new URLSearchParams({ [LINK_PICKER_TOKEN_PARAM]: tokenId }).toString()}`;
}

// Token id to sheet id, for every link whose sheet is live. A link to a deleted or unknown sheet
// counts as no link everywhere (FR18). Only `link:` records count, never the scene, so a token
// that left the room still counts as linked in v1.
export function liveLinks(records: ReadonlyMap<string, VersionedRecord>): Map<string, string> {
  const links = new Map<string, string>();

  for (const [key, record] of records) {
    if (!key.startsWith('link:')) {
      continue;
    }

    const tokenId = tokenIdSchema.safeParse(key.slice('link:'.length));
    const sheetId = linkDataSchema.safeParse(record.d);

    // A token id no command could write never reaches a menu filter.
    if (tokenId.success && sheetId.success && isLiveSheet(records, sheetId.data)) {
      links.set(tokenId.data, sheetId.data);
    }
  }

  return links;
}

// The sheets at least one live link points to.
export function linkedSheetIds(records: ReadonlyMap<string, VersionedRecord>): Set<string> {
  return new Set(liveLinks(records).values());
}

// UX-DR22: characters, then NPCs. In each group the sheets with no token come first, and both
// parts keep the sheet order they came in.
export function pickerOrder(
  sheets: VisibleSheets,
  records: ReadonlyMap<string, VersionedRecord>,
): VisibleSheets {
  const linked = linkedSheetIds(records);

  return {
    characters: noTokenFirst(sheets.characters, linked),
    npcs: noTokenFirst(sheets.npcs, linked),
  };
}

// AD-2 and UX-DR21: Owlbear filters match item keys only and do not change, so the menu is built
// from the live links of the moment. Both items apply to one token of the character layer and to a
// GM only. "Привязать лист…" shows on a token no live link names. "Отвязать лист" shows only on a
// token a live link names, so with no link it has no entry: a filter cannot match an empty set.
// Token ids are sorted, so the same links always give the same filters.
export function tokenMenuEntries(
  links: ReadonlyMap<string, string>,
  role: PlayerRole,
): TokenMenuEntry[] {
  if (role !== 'GM') {
    return [];
  }

  const tokenIds = [...links.keys()].sort();

  const link: TokenMenuEntry = {
    action: 'link',
    filter: {
      max: 1,
      roles: ['GM'],
      every: [
        { key: 'layer', value: TOKEN_LAYER },
        ...tokenIds.map((id): TokenMenuKeyFilter => ({ key: 'id', value: id, operator: '!=' })),
      ],
    },
  };

  if (tokenIds.length === 0) {
    return [link];
  }

  // The layer check sits in `every` and the ids in `some`, each list joined by one coordinator
  // only, so no precedence between "&&" and "||" decides the match. With `max: 1` both lists judge
  // the same one token.
  const unlink: TokenMenuEntry = {
    action: 'unlink',
    filter: {
      max: 1,
      roles: ['GM'],
      every: [{ key: 'layer', value: TOKEN_LAYER }],
      some: tokenIds.map((id, index): TokenMenuKeyFilter =>
        index === tokenIds.length - 1
          ? { key: 'id', value: id }
          : { key: 'id', value: id, coordinator: '||' },
      ),
    },
  };

  return [link, unlink];
}

function isLiveSheet(records: ReadonlyMap<string, VersionedRecord>, sheetId: string): boolean {
  return sheetDataSchema.safeParse(records.get(sheetKey(sheetId))?.d).success;
}

function noTokenFirst(
  sheets: readonly SheetSummary[],
  linked: ReadonlySet<string>,
): SheetSummary[] {
  return [
    ...sheets.filter((sheet) => !linked.has(sheet.sheetId)),
    ...sheets.filter((sheet) => linked.has(sheet.sheetId)),
  ];
}
