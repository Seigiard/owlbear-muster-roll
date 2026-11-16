import type { JsonValue } from '@/core/json';
import {
  repeatSectionById,
  repeatSectionPlace,
  type Preset,
  type PresetSection,
  type TemplateLayout,
} from '@/core/preset';
import {
  linkDataSchema,
  parseRepKey,
  repDataSchema,
  type LinkData,
  type VersionedRecord,
} from '@/core/records';
import { resolveSheet, sheetIdSchema, type SheetPolicy } from '@/core/sheets';

// AD-19: what a token link names: a sheet, or with `instanceId` one repeat block of it.
export type LinkTarget = { sheetId: string; instanceId: string | null };

// A target a live link may name: its sheet's policy, and for a repeat block its section.
export type LiveLinkTarget = {
  target: LinkTarget;
  policy: SheetPolicy;
  section: PresetSection | null;
};

// Where each live repeat block of the replica is, by `blockIndexKey`.
export type BlockIndex = ReadonlyMap<string, string>;

// The target a `link:` record's data names, or `null` for a tombstone or an id no command could
// write, which would make an open request no window takes.
export function linkTargetOf(d: JsonValue): LinkTarget | null {
  const data = linkDataSchema.safeParse(d);

  if (!data.success || !sheetIdSchema.safeParse(data.data.s).success) {
    return null;
  }

  return { sheetId: data.data.s, instanceId: data.data.i ?? null };
}

// The `link:` record data for a target.
export function linkDataOf(target: LinkTarget): LinkData {
  return target.instanceId === null
    ? { s: target.sheetId }
    : { s: target.sheetId, i: target.instanceId };
}

// One string per target, so targets can be kept in a set.
export function linkTargetKey(target: LinkTarget): string {
  return target.instanceId === null ? target.sheetId : `${target.sheetId}:${target.instanceId}`;
}

export function sameLinkTarget(first: LinkTarget, second: LinkTarget): boolean {
  return first.sheetId === second.sheetId && first.instanceId === second.instanceId;
}

// The section id of every live repeat block, by sheet id and instance id. An instance id is unique
// in its sheet, so a link needs no section. When two live records share one, the first key in code
// unit order wins on every client.
export function blockIndex(records: Iterable<VersionedRecord>): BlockIndex {
  const index = new Map<string, string>();
  const keys = new Map<string, string>();

  for (const record of records) {
    const parts = parseRepKey(record.k);

    if (parts === null || !repDataSchema.safeParse(record.d).success) {
      continue;
    }

    const key = blockIndexKey(parts.sheetId, parts.instanceId);
    const held = keys.get(key);

    if (held === undefined || record.k < held) {
      keys.set(key, record.k);
      index.set(key, parts.sectionId);
    }
  }

  return index;
}

// The tab that holds a live repeat block of a sheet: the tab of the repeat section its block path
// names. `null` when the block is gone or its section is not in the template.
export function repeatBlockTabIndex(
  records: Iterable<VersionedRecord>,
  layout: TemplateLayout,
  sheetId: string,
  instanceId: string,
): number | null {
  const sectionId = blockIndex(records).get(blockIndexKey(sheetId, instanceId));

  return sectionId === undefined
    ? null
    : (repeatSectionPlace(layout, sectionId)?.place.tabIndex ?? null);
}

// AD-19: a link is live only while its sheet is live, its repeat block is live when it names one,
// and the template, for a sheet link, or the repeat section, for a repeat block link, is linkable.
// `null`: the link is inert, and every view and the token menu treat it as no link.
export function liveLinkTarget(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  target: LinkTarget,
  blocks: BlockIndex = blockIndex(records.values()),
): LiveLinkTarget | null {
  const policy = resolveSheet(records, preset, target.sheetId);

  if (policy === null) {
    return null;
  }

  if (target.instanceId === null) {
    return policy.linkable ? { target, policy, section: null } : null;
  }

  const sectionId = blocks.get(blockIndexKey(target.sheetId, target.instanceId));
  const section = sectionId === undefined ? null : repeatSectionById(policy.template, sectionId);

  return section?.tokens === true ? { target, policy, section } : null;
}

function blockIndexKey(sheetId: string, instanceId: string): string {
  return `${sheetId}:${instanceId}`;
}
