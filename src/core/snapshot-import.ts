import { z } from 'zod';

import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';
import { FORMAT_VERSION } from '@/core/format-version';
import {
  blockAddress,
  blockIdOf,
  blockKeyOf,
  parentOf,
  scopePathOf,
  sectionIdOf,
} from '@/core/block-address';
import { linkDataOf, liveLinkTarget } from '@/core/link-target';
import { recordFitsOneMessage } from '@/core/message-size';
import {
  PRESET_FILE_BYTE_LIMIT,
  templateById,
  type Preset,
  type PresetFieldCell,
} from '@/core/preset';
import { erasedDigest, keptValues, templateScopes } from '@/core/preset-migrate';
import {
  blockKey,
  recordSchema,
  versionCells,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { Result } from 'better-result';
import { snapshotFileSchema, SNAPSHOT_FILE_TYPE, type SnapshotFile } from '@/core/snapshot-file';
import { isSheetSet } from '@/core/sheets';

export const SNAPSHOT_FILE_BYTE_LIMIT = PRESET_FILE_BYTE_LIMIT;

export type SnapshotFileFailure =
  | 'too-large'
  | 'not-json'
  | 'newer-version'
  | 'older-version'
  | 'unsupported-version'
  | 'not-snapshot'
  | 'invalid-structure';

export type SnapshotImportFailure = 'too-large' | 'invalid-structure';

export type CurrentPreset = { preset: Preset; data: string };

export type SnapshotImport = {
  records: VersionedRecord[];
  count: number;
  sheets: number;
  digest: string;
};

export function parseSnapshotFile(text: string): Result<SnapshotFile, SnapshotFileFailure> {
  if (new TextEncoder().encode(text).length > SNAPSHOT_FILE_BYTE_LIMIT)
    return Result.err('too-large');
  let candidate: unknown;

  try {
    candidate = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text);
  } catch {
    return Result.err('not-json');
  }

  const envelope = z
    .object({
      v: z.unknown().optional(),
      type: z.unknown().optional(),
      templates: z.unknown().optional(),
    })
    .safeParse(candidate);

  if (!envelope.success) return Result.err('invalid-structure');

  if (envelope.data.type !== undefined && envelope.data.type !== SNAPSHOT_FILE_TYPE)
    return Result.err('not-snapshot');

  if (envelope.data.type === undefined && envelope.data.templates !== undefined)
    return Result.err('not-snapshot');
  const parsedVersion = z.number().int().positive().safeParse(envelope.data.v);

  if (!parsedVersion.success) return Result.err('unsupported-version');
  const version = parsedVersion.data;

  if (version > FORMAT_VERSION) return Result.err('newer-version');

  if (version < FORMAT_VERSION) return Result.err('older-version');

  if (envelope.data.type !== SNAPSHOT_FILE_TYPE) return Result.err('not-snapshot');
  const parsed = snapshotFileSchema.safeParse(candidate);

  return parsed.success ? Result.ok(parsed.data) : Result.err('invalid-structure');
}

export function encodeSnapshotFileData(file: SnapshotFile): string {
  return deflateToBase64(JSON.stringify(file));
}

export function decodeSnapshotFileData(data: string): Result<SnapshotFile, SnapshotFileFailure> {
  const text = inflateFromBase64(data, SNAPSHOT_FILE_BYTE_LIMIT);

  return text.isOk()
    ? parseSnapshotFile(text.value)
    : Result.err(text.error === 'too-large' ? 'too-large' : 'invalid-structure');
}

export function importSnapshot(
  file: SnapshotFile,
  current: CurrentPreset,
  author: string,
): Result<SnapshotImport, SnapshotImportFailure> {
  const records: VersionedRecord[] = [{ k: 'preset', d: current.data, c: 1, a: author }];
  const dropped: string[] = [];
  let sheets = 0;

  const filter = (
    key: string,
    values: FieldValues,
    fields: readonly PresetFieldCell[],
  ): FieldValues => {
    const kept = keptValues(values, fields);

    for (const id of Object.keys(values))
      if (!Object.hasOwn(kept, id)) dropped.push(`${key}\u0000${id}`);

    return kept;
  };

  for (const sheet of file.sheets) {
    const template = templateById(current.preset, sheet.set ?? sheet.id);

    const owns =
      template !== null &&
      (sheet.set === undefined
        ? !isSheetSet(template)
        : isSheetSet(template) && templateById(current.preset, sheet.id) === null);

    const scopes = template === null ? null : templateScopes(template);

    if (!owns) {
      sheets += 1;
      dropped.push(`${blockKey(sheet.id)}\u0000`);
      filter(blockKey(sheet.id), sheet.cells, []);

      for (const block of sheet.blocks) {
        const address = blockAddress(sheet.id, block.path);
        filter(address === null ? blockKey(sheet.id) : blockKeyOf(address), block.cells, []);
      }

      continue;
    }

    const rootValues = filter(
      blockKey(sheet.id),
      sheet.cells,
      [...(scopes?.rowFields.values() ?? [])].map((item) => item.field),
    );

    const rootData = { order: sheet.order ?? 0, cells: versionCells(rootValues, 1, author) };
    const d = sheet.set === undefined ? rootData : { ...rootData, set: sheet.set };

    records.push({
      k: blockKey(sheet.id),
      c: 1,
      a: author,
      l: [1, author],
      d,
    });
    const claimed = new Set<string>();
    const acceptedPaths = new Set<string>();

    const blocks = [...sheet.blocks].sort(
      (first, second) =>
        first.path.length - second.path.length ||
        first.path.join(':').localeCompare(second.path.join(':')),
    );

    for (const block of blocks) {
      const address = blockAddress(sheet.id, block.path);

      if (address === null) {
        filter(blockKey(sheet.id), block.cells, []);
        continue;
      }

      const parent = parentOf(address);
      const scope = sectionIdOf(address);
      const parentScopePath = parent === null ? [] : scopePathOf(parent);
      const fullPathKey = blockKeyOf(address);
      const pathKey = parent?.path.length === 0 ? (blockIdOf(address) ?? '') : fullPathKey;
      const key = blockKeyOf(address);

      const fields =
        scope === null || scopes === null
          ? undefined
          : scopes.sectionsByPath.get([...parentScopePath, scope].join(':'));

      const parentExists =
        parent === null || parent.path.length === 0 || acceptedPaths.has(blockKeyOf(parent));

      if (fields === undefined || !parentExists || claimed.has(pathKey)) {
        filter(key, block.cells, []);
        continue;
      }

      claimed.add(pathKey);
      acceptedPaths.add(fullPathKey);
      records.push({
        k: key,
        c: 1,
        a: author,
        l: [1, author],
        d: { order: block.order, cells: versionCells(filter(key, block.cells, fields), 1, author) },
      });
    }
  }

  // Single sheets exist even when a file omitted them.
  for (const template of current.preset.templates) {
    if (!isSheetSet(template) && !records.some((record) => record.k === blockKey(template.id))) {
      records.push({
        k: blockKey(template.id),
        c: 1,
        a: author,
        l: [1, author],
        d: { order: 0, cells: {} },
      });
    }
  }

  const placed = new Map(records.map((record) => [record.k, record]));

  for (const link of file.links) {
    const block = blockAddress(link.sheetId, link.path ?? []);

    if (block === null) continue;

    const target = { block, cellId: link.cellId };

    if (liveLinkTarget(placed, current.preset, target) !== null) {
      records.push({ k: `link:${link.tokenId}`, d: linkDataOf(target), c: 1, a: author });
    }
  }

  for (const record of records) {
    if (!recordSchema.safeParse(record).success) return Result.err('invalid-structure');

    if (!recordFitsOneMessage(record)) return Result.err('too-large');
  }

  records.sort((a, b) => (a.k < b.k ? -1 : 1));

  return Result.ok({
    records,
    count: dropped.length - sheets,
    sheets,
    digest: erasedDigest(dropped),
  });
}
