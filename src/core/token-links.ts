import { z } from 'zod';

import {
  blockIndex,
  linkTargetKey,
  linkTargetOf,
  liveLinkTarget,
  type LinkTarget,
  type LiveLinkTarget,
} from '@/core/link-target';
import {
  layoutSections,
  repeatSectionId,
  type Preset,
  type PresetSection,
  type Template,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { repeatBlocks } from '@/core/sheet-values';
import { repeatBlockName, sheetName, templateSheetIds } from '@/core/sheets';
import { linkTargetShownTo, type PlayerRole } from '@/core/visibility';

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

// One target of the link picker. `sheetName` is the sheet's name and `blockName` the repeat block's
// first field value, "" when empty; `blockName` is `null` for a sheet target. `linked`: a live link
// names the target already.
export type PickerTarget = {
  target: LinkTarget;
  sheetName: string;
  blockName: string | null;
  linked: boolean;
};

// One group of the link picker: a linkable template's sheets, with `section` `null`, or the repeat
// blocks of one linkable repeat section of a template across its sheets.
export type PickerGroup = {
  template: Template;
  section: PresetSection | null;
  targets: PickerTarget[];
};

// The icons of "Открыть лист", GM first. Owlbear shows the first icon whose filter matches.
const OPEN_ROLES: readonly PlayerRole[] = ['GM', 'PLAYER'];

export function linkKey(tokenId: string): string {
  return `link:${tokenId}`;
}

// The picker's URL for one token, relative to the extension's origin.
export function linkPickerUrl(tokenId: string): string {
  return `${LINK_PICKER_PATH}?${new URLSearchParams({ [LINK_PICKER_TOKEN_PARAM]: tokenId }).toString()}`;
}

// AD-19: token id to target, for every live link. An inert link counts as no link everywhere. Only
// `link:` records count, never the scene: a GM client tombstones the link of a token deleted from
// the scene (`tokensToUnlink`), and a link to a token on another scene stays.
export function liveLinks(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
): Map<string, LiveLinkTarget> {
  const links = new Map<string, LiveLinkTarget>();
  const blocks = blockIndex(records.values());

  for (const [key, record] of records) {
    if (!key.startsWith('link:')) {
      continue;
    }

    const tokenId = tokenIdSchema.safeParse(key.slice('link:'.length));
    const target = linkTargetOf(record.d);
    const live = target === null ? null : liveLinkTarget(records, preset, target, blocks);

    // A token id no command could write never reaches a menu filter.
    if (tokenId.success && live !== null) {
      links.set(tokenId.data, live);
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

// The removed token ids whose `link:` record is not a tombstone, sorted. An inert link is cleared
// too. The tombstone stays a record, but the menu filters stop growing with tokens that no longer
// exist. A token id no command could write is skipped, as `link-clear` would refuse it.
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

// The `linkTargetKey` of every target at least one live link names, for the token status of a sheet
// or a repeat block.
export function linkedTargetKeys(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
): Set<string> {
  return new Set(
    [...liveLinks(records, preset).values()].map((live) => linkTargetKey(live.target)),
  );
}

// UX: one group per linkable template and per linkable repeat section, in preset order, a
// template's own group before its sections'. A sheet set lists its live sheets, a single sheet
// itself, and a section its repeat blocks, sheet by sheet. In each group the targets with no token
// come first, and both parts keep their order. A group with no target is left out.
export function pickerGroups(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
): PickerGroup[] {
  if (preset === null) {
    return [];
  }

  const linked = linkedTargetKeys(records, preset);
  const groups: PickerGroup[] = [];

  const targetOf = (
    sheetId: string,
    instanceId: string | null,
    blockName: string | null,
  ): PickerTarget => {
    const target = { sheetId, instanceId };

    return {
      target,
      sheetName: sheetName(records, preset, sheetId) ?? '',
      blockName,
      linked: linked.has(linkTargetKey(target)),
    };
  };

  for (const template of preset.templates) {
    const sheetIds = templateSheetIds(records.values(), preset, template);

    if (template.tokens === true) {
      groups.push({
        template,
        section: null,
        targets: sheetIds.map((sheetId) => targetOf(sheetId, null, null)),
      });
    }

    for (const section of layoutSections(template)) {
      const sectionId = repeatSectionId(section);

      if (sectionId === null || section.tokens !== true) {
        continue;
      }

      groups.push({
        template,
        section,
        targets: sheetIds.flatMap((sheetId) =>
          repeatBlocks(records, sheetId, sectionId).map((block) =>
            targetOf(
              sheetId,
              block.instanceId,
              repeatBlockName(records, sheetId, section, block.instanceId),
            ),
          ),
        ),
      });
    }
  }

  return groups.flatMap((group) =>
    group.targets.length === 0 ? [] : [{ ...group, targets: noTokenFirst(group.targets) }],
  );
}

// AD-2 and UX-DR21: Owlbear filters match item keys only and do not change, so the menu is built
// from the records of the moment. Every item applies to one token of the character layer. A GM gets
// "Привязать лист…" on a token no live link names, and "Отвязать лист" only on a token a live link
// names, so with no link that item has no entry: a filter cannot match an empty set. "Открыть лист"
// shows on tokens whose target's template the viewer's role may see, and whose repeat block is on a
// tab that role may see. Token ids are sorted, so the same records always give the same filters.
export function tokenMenuEntries(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  role: PlayerRole,
): TokenMenuEntry[] {
  const links = liveLinks(records, preset);
  const [link, unlink] = role === 'GM' ? linkEntries(links) : [];
  const open = openEntry(links);

  // The harmless "Открыть лист" comes before the destructive "Отвязать лист".
  return [link, open, unlink].filter((entry) => entry !== undefined && entry !== null);
}

// The target a token's live link names, when this role may see its template and, for a repeat block,
// its tab, or `null`. A player opens only a visible sheet or a repeat block of one (CAP-14).
export function openTarget(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  tokenId: string,
  role: PlayerRole,
): LinkTarget | null {
  if (!tokenIdSchema.safeParse(tokenId).success) {
    return null;
  }

  const target = linkTargetOf(records.get(linkKey(tokenId))?.d ?? null);
  const live = target === null ? null : liveLinkTarget(records, preset, target);

  return live !== null && linkTargetShownTo(role, live) ? live.target : null;
}

function linkEntries(links: ReadonlyMap<string, LiveLinkTarget>): TokenMenuEntry[] {
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
// only the tokens whose live link names a target of a visible template, with repeat blocks also on a
// visible tab. An icon with no token is left out, and an item with no icon has no entry.
function openEntry(links: ReadonlyMap<string, LiveLinkTarget>): TokenMenuEntry | null {
  const filters = OPEN_ROLES.flatMap((role): TokenMenuFilter[] => {
    const tokenIds = [...links]
      .flatMap(([tokenId, live]) => (linkTargetShownTo(role, live) ? [tokenId] : []))
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

function noTokenFirst(targets: readonly PickerTarget[]): PickerTarget[] {
  return [
    ...targets.filter((target) => !target.linked),
    ...targets.filter((target) => target.linked),
  ];
}
