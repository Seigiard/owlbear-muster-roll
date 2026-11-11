import { z } from 'zod';

import { sheetDataSchema, type VersionedRecord } from '@/core/records';
import { sheetIdSchema, sheetKey, type SheetSummary } from '@/core/sheets';
import { sheetKindShownTo, type PlayerRole, type VisibleSheets } from '@/core/visibility';

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

export type TokenMenuAction = 'link' | 'unlink' | 'open';

// One filter per icon of the item, in the order Owlbear tries them.
export type TokenMenuEntry = { action: TokenMenuAction; filters: TokenMenuFilter[] };

// The icons of "Открыть лист", GM first. Owlbear shows the first icon whose filter matches.
const OPEN_ROLES: readonly PlayerRole[] = ['GM', 'PLAYER'];

export function linkKey(tokenId: string): string {
  return `link:${tokenId}`;
}

// The picker's URL for one token, relative to the extension's origin.
export function linkPickerUrl(tokenId: string): string {
  return `${LINK_PICKER_PATH}?${new URLSearchParams({ [LINK_PICKER_TOKEN_PARAM]: tokenId }).toString()}`;
}

// Token id to sheet id, for every link whose sheet is live. A link to a deleted or unknown sheet
// counts as no link everywhere (FR18). Only `link:` records count, never the scene: a GM client
// tombstones the link of a token deleted from the scene (`tokensToUnlink`), and a link to a token
// on another scene stays.
export function liveLinks(records: ReadonlyMap<string, VersionedRecord>): Map<string, string> {
  const links = new Map<string, string>();

  for (const [key, record] of records) {
    if (!key.startsWith('link:')) {
      continue;
    }

    const tokenId = tokenIdSchema.safeParse(key.slice('link:'.length));
    // Stricter than the `link:` data schema: a sheet id no command could write would make an open
    // request no window takes.
    const sheetId = sheetIdSchema.safeParse(record.d);

    // A token id no command could write never reaches a menu filter.
    if (tokenId.success && sheetId.success && isLiveSheet(records, sheetId.data)) {
      links.set(tokenId.data, sheetId.data);
    }
  }

  return links;
}

// The item ids in `previous` that `next` no longer holds, in the order `previous` lists them. Both
// lists must come from one ready period of one scene: a scene that changes or closes takes its
// items away too, and those tokens were not deleted.
export function removedItemIds(previous: Iterable<string>, next: ReadonlySet<string>): string[] {
  return [...new Set(previous)].filter((id) => !next.has(id));
}

// The removed token ids whose `link:` record is not a tombstone, sorted. A link to a sheet that is
// gone is cleared too. The tombstone stays a record, but the menu filters stop growing with tokens
// that no longer exist. A token id no command could write is skipped, as `link-clear` would refuse
// it.
export function tokensToUnlink(
  removed: Iterable<string>,
  records: ReadonlyMap<string, VersionedRecord>,
): string[] {
  return [...new Set(removed)]
    .filter(
      (tokenId) =>
        tokenIdSchema.safeParse(tokenId).success &&
        (records.get(linkKey(tokenId))?.d ?? null) !== null,
    )
    .sort();
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
// from the records of the moment. Every item applies to one token of the character layer. A GM gets
// "Привязать лист…" on a token no live link names, and "Отвязать лист" only on a token a live link
// names, so with no link that item has no entry: a filter cannot match an empty set. "Открыть
// лист" shows on the tokens whose sheet the viewer's role may see. Token ids are sorted, so the same
// records always give the same filters.
export function tokenMenuEntries(
  records: ReadonlyMap<string, VersionedRecord>,
  role: PlayerRole,
): TokenMenuEntry[] {
  const links = liveLinks(records);
  const [link, unlink] = role === 'GM' ? linkEntries(links) : [];
  const open = openEntry(records, links);

  // The harmless "Открыть лист" comes before the destructive "Отвязать лист".
  return [link, open, unlink].filter((entry) => entry !== undefined && entry !== null);
}

// The sheet a token's live link names, when this role may see it, or `null`. A player opens only a
// character (FR14).
export function openTarget(
  records: ReadonlyMap<string, VersionedRecord>,
  tokenId: string,
  role: PlayerRole,
): string | null {
  if (!tokenIdSchema.safeParse(tokenId).success) {
    return null;
  }

  const sheetId = sheetIdSchema.safeParse(records.get(linkKey(tokenId))?.d);

  return sheetId.success && liveSheetShownTo(records, sheetId.data, role) ? sheetId.data : null;
}

// True while `sheetId` names a live sheet this role may see, as `core/visibility` judges it.
export function liveSheetShownTo(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  role: PlayerRole,
): boolean {
  const sheet = sheetDataSchema.safeParse(records.get(sheetKey(sheetId))?.d);

  return sheet.success && sheetKindShownTo(role, sheet.data.kind);
}

function linkEntries(links: ReadonlyMap<string, string>): TokenMenuEntry[] {
  const tokenIds = [...links.keys()].sort();

  const link: TokenMenuEntry = {
    action: 'link',
    filters: [
      {
        max: 1,
        roles: ['GM'],
        every: [
          onTokenLayer(),
          ...tokenIds.map((id): TokenMenuKeyFilter => ({ key: 'id', value: id, operator: '!=' })),
        ],
      },
    ],
  };

  if (tokenIds.length === 0) {
    return [link];
  }

  const unlink: TokenMenuEntry = {
    action: 'unlink',
    filters: [{ max: 1, roles: ['GM'], every: [onTokenLayer()], some: anyOf(tokenIds) }],
  };

  return [link, unlink];
}

// One item with an icon per role. The GM icon names every token with a live link, the player icon
// only the tokens whose live link names a character. An icon with no token is left out, and an
// item with no icon has no entry.
function openEntry(
  records: ReadonlyMap<string, VersionedRecord>,
  links: ReadonlyMap<string, string>,
): TokenMenuEntry | null {
  const filters = OPEN_ROLES.flatMap((role): TokenMenuFilter[] => {
    const tokenIds = [...links]
      .flatMap(([tokenId, sheetId]) => (liveSheetShownTo(records, sheetId, role) ? [tokenId] : []))
      .sort();

    return tokenIds.length === 0
      ? []
      : [{ max: 1, roles: [role], every: [onTokenLayer()], some: anyOf(tokenIds) }];
  });

  return filters.length === 0 ? null : { action: 'open', filters };
}

function onTokenLayer(): TokenMenuKeyFilter {
  return { key: 'layer', value: TOKEN_LAYER };
}

// The layer check sits in `every` and the ids in `some`, each list joined by one coordinator only,
// so no precedence between "&&" and "||" decides the match. With `max: 1` both lists judge the
// same one token.
function anyOf(tokenIds: readonly string[]): TokenMenuKeyFilter[] {
  return tokenIds.map((id, index): TokenMenuKeyFilter =>
    index === tokenIds.length - 1
      ? { key: 'id', value: id }
      : { key: 'id', value: id, coordinator: '||' },
  );
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
