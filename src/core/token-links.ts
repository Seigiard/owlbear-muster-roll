import { z } from 'zod';

import { blockIdOf, childAddress, sheetRootAddress, type BlockAddress } from '@/core/block-address';
import {
  linkDataOf,
  linkTargetKey,
  linkTargetOf,
  liveLinkTarget,
  type LinkTarget,
  type LiveLinkTarget,
} from '@/core/link-target';
import {
  repeatSectionByPath,
  rowCells,
  type Preset,
  type PresetSection,
  type Template,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { repeatBlocks, sectionTitle } from '@/core/sheet-values';
import { repeatBlockName, sheetName, templateSheetIds } from '@/core/sheets';
import { linkTargetShownTo, type PlayerRole } from '@/core/visibility';

// The layer Owlbear puts tokens on.
const TOKEN_LAYER = 'CHARACTER';

// The link picker is a page of its own in an Owlbear popover. It reads its token from this param.
export const LINK_PICKER_PATH = '/picker.html';

export const LINK_PICKER_TOKEN_PARAM = 'token';
export const LINK_PICKER_TARGET_PARAM = 'target';

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

// One target of the link picker. `sheetName` is the sheet's name and `blockName` the repeat scope's
// explicit nameField value, "" when empty; `blockName` is `null` for a sheet target. `linked`: a
// live link names the target already.
export type PickerTarget = {
  target: LinkTarget;
  cellId: string;
  sheetName: string;
  blockName: string | null;
  label: string;
  linked: boolean;
};

// One group of the link picker: the token-cell targets of a template, with `section` `null`, or the
// repeat blocks of one repeat scope with a token cell across the template's sheets.
export type PickerGroup = {
  template: Template;
  section: PresetSection | null;
  targets: PickerTarget[];
};

const groupMeta = new WeakMap<
  PickerGroup,
  { heading: string; collisionHeading: string; cellId: string }
>();

const distinctTargetCells = new WeakSet<PickerTarget>();

export function pickerGroupHeading(group: PickerGroup): string {
  return (
    groupMeta.get(group)?.heading ??
    (group.section === null
      ? group.template.title
      : (sectionTitle(group.section) ?? group.template.title))
  );
}

export function pickerTargetNeedsCellIdentity(choice: PickerTarget): boolean {
  return distinctTargetCells.has(choice);
}

// The icons of "Открыть лист", GM first. Owlbear shows the first icon whose filter matches.
const OPEN_ROLES: readonly PlayerRole[] = ['GM', 'PLAYER'];

export function linkKey(tokenId: string): string {
  return `link:${tokenId}`;
}

// The picker's URL for one token, relative to the extension's origin.
export function linkPickerUrl(tokenId: string): string {
  return `${LINK_PICKER_PATH}?${new URLSearchParams({ [LINK_PICKER_TOKEN_PARAM]: tokenId }).toString()}`;
}

export function tokenCellPickerUrl(target: LinkTarget): string {
  return `${LINK_PICKER_PATH}?${new URLSearchParams({
    [LINK_PICKER_TARGET_PARAM]: JSON.stringify(linkDataOf(target)),
  }).toString()}`;
}

// AD-19: token id to target, for every live link. An inert link counts as no link everywhere. Only
// `link:` records count, never the scene: a GM client tombstones the link of a token deleted from
// the scene (`tokensToUnlink`), and a link to a token on another scene stays.
export function liveLinks(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
): Map<string, LiveLinkTarget> {
  const links = new Map<string, LiveLinkTarget>();

  for (const [key, record] of records) {
    if (!key.startsWith('link:')) {
      continue;
    }

    const tokenId = tokenIdSchema.safeParse(key.slice('link:'.length));
    const target = linkTargetOf(record.d);
    const live = target === null ? null : liveLinkTarget(records, preset, target);

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

// UX: one group per token cell and scope, in preset order. A root group lists sheets and a repeat
// group lists blocks, sheet by sheet. In each group the targets with no token come first.
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
    template: Template,
    target: LinkTarget,
    cellId: string,
    blockName: string | null,
    section: PresetSection | null,
  ): PickerTarget => {
    const targetSheetName = sheetName(records, preset, target.block.sheetId) ?? '';

    return {
      target,
      cellId,
      sheetName: targetSheetName,
      blockName,
      label:
        blockName !== null && blockName !== ''
          ? blockName
          : ((section === null ? null : sectionTitle(section)) ??
            (targetSheetName || template.title)),
      linked: linked.has(linkTargetKey(target)),
    };
  };

  for (const template of preset.templates) {
    const sheetIds = templateSheetIds(records.values(), preset, template);

    for (const { cellId, section } of tokenCells(template, null)) {
      const group: PickerGroup = {
        template,
        section: null,
        targets: sheetIds.map((sheetId) =>
          targetOf(template, { block: sheetRootAddress(sheetId), cellId }, cellId, null, section),
        ),
      };

      groups.push(group);
      groupMeta.set(group, {
        heading: template.title,
        collisionHeading: sectionTitle(section) ?? template.title,
        cellId,
      });
    }

    for (const scopePath of repeatScopePaths(template)) {
      const repeatedSection = repeatSectionByPath(template, scopePath);

      if (repeatedSection === null) continue;

      for (const { cellId } of tokenCells(template, scopePath)) {
        const group: PickerGroup = {
          template,
          section: repeatedSection,
          targets: sheetIds.flatMap((sheetId) =>
            repeatBlockPaths(records, sheetId, scopePath).flatMap((block) => {
              const instanceId = blockIdOf(block);

              return instanceId === null
                ? []
                : [
                    targetOf(
                      template,
                      { block, cellId },
                      cellId,
                      repeatBlockName(records, sheetId, repeatedSection, instanceId, block.path),
                      repeatedSection,
                    ),
                  ];
            }),
          ),
        };

        groups.push(group);
        const heading = sectionTitle(repeatedSection) ?? template.title;

        groupMeta.set(group, { heading, collisionHeading: heading, cellId });
      }
    }
  }

  const headingCounts = new Map<string, number>();

  for (const group of groups) {
    const heading = pickerGroupHeading(group);
    headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
  }

  return groups.flatMap((group) => {
    if (group.targets.length === 0) return [];

    const heading = pickerGroupHeading(group);
    const meta = groupMeta.get(group);
    const cellId = meta?.cellId ?? group.targets[0]?.cellId ?? '';
    const distinct = (headingCounts.get(heading) ?? 0) > 1;

    if (distinct) for (const target of group.targets) distinctTargetCells.add(target);

    const result = { ...group, targets: noTokenFirst(group.targets) };
    groupMeta.set(result, {
      heading: distinct ? `${meta?.collisionHeading ?? heading} — ${cellId}` : heading,
      collisionHeading: meta?.collisionHeading ?? heading,
      cellId,
    });

    return [result];
  });
}

function tokenCells(
  template: Template,
  scopePath: readonly string[] | null,
): { cellId: string; section: PresetSection }[] {
  if (scopePath === null) {
    return template.tabs.flatMap((tab) =>
      tab.repeat === undefined
        ? tab.sections.flatMap((section) =>
            section.repeat === undefined
              ? section.rows
                  .filter((row) => row.repeat === undefined)
                  .flatMap((row) =>
                    rowCells(row).flatMap((cell) =>
                      cell.kind === 'token' ? [{ cellId: cell.id, section }] : [],
                    ),
                  )
              : [],
          )
        : [],
    );
  }

  const section = repeatSectionByPath(template, scopePath);
  const scopeId = scopePath.at(-1);

  if (section === null || scopeId === undefined) return [];

  return section.rows
    .filter((row) => row.repeat === undefined || row.repeat.id === scopeId)
    .flatMap((row) =>
      rowCells(row).flatMap((cell) =>
        cell.kind === 'token' ? [{ cellId: cell.id, section }] : [],
      ),
    );
}

function repeatScopePaths(template: Template): string[][] {
  const paths: string[][] = [];

  for (const tab of template.tabs) {
    if (tab.repeat !== undefined) {
      paths.push([tab.repeat.id]);
    }
  }

  for (const tab of template.tabs) {
    const tabPath = tab.repeat === undefined ? [] : [tab.repeat.id];

    for (const section of tab.sections) {
      const sectionPath = section.repeat === undefined ? tabPath : [...tabPath, section.repeat.id];

      if (section.repeat !== undefined) {
        paths.push(sectionPath);
      }

      for (const row of section.rows) {
        if (row.repeat !== undefined) {
          paths.push([...sectionPath, row.repeat.id]);
        }
      }
    }
  }

  return paths;
}

function repeatBlockPaths(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  scopePath: readonly string[],
): BlockAddress[] {
  const paths: BlockAddress[] = [];

  function visit(parent: BlockAddress, scopeIndex: number): void {
    const scopeId = scopePath[scopeIndex];

    if (scopeId === undefined) return;

    for (const item of repeatBlocks(records, parent, scopeId)) {
      const block = childAddress(parent, scopeId, item.instanceId);

      if (scopeIndex === scopePath.length - 1) {
        paths.push(block);
      } else {
        visit(block, scopeIndex + 1);
      }
    }
  }

  visit(sheetRootAddress(sheetId), 0);

  return paths;
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
