import { acceptedFieldValue } from '@/core/field-patch';
import { sameJson } from '@/core/json';
import { blockIndex, linkTargetOf, liveLinkTarget } from '@/core/link-target';
import { compareVersions } from '@/core/merge';
import {
  firstFieldId,
  layoutSections,
  repeatSectionId,
  sectionFields,
  type Preset,
  type PresetFieldCell,
  type TemplateLayout,
} from '@/core/preset';
import {
  blockDataSchema,
  blockKey,
  cellValues,
  parseRepKey,
  repKey,
  type BlockData,
  type Cells,
  type FieldValue,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { isSheetDependent, templateSheetIds } from '@/core/sheets';

export type PlannedWrite = { k: string; d: BlockData | null; relocate?: boolean };

export type PresetMigration = {
  count: number;
  sheets: number;
  digest: string;
  removed: Readonly<Record<string, readonly string[]>>;
  first: PlannedWrite[];
  last: PlannedWrite[];
};

export type TemplateScopes = {
  rows: Map<string, PresetFieldCell[]>;
  rowFields: Map<string, { rowId: string; field: PresetFieldCell }>;
  sections: Map<string, PresetFieldCell[]>;
};

export type PresetMoves = {
  rowOf: (fieldId: string) => string | null;
  sectionOf: (sectionId: string) => string | null;
};

export const NOTHING_ERASED = erasedDigest([]);

export function presetDiff(
  records: ReadonlyMap<string, VersionedRecord>,
  oldPreset: Preset | null,
  newPreset: Preset,
): PresetMigration {
  const first: PlannedWrite[] = [];
  const last: PlannedWrite[] = [];
  const erased: string[] = [];
  const removed = new Map<string, Set<string>>();
  let sheets = 0;

  const lose = (templateId: string, key: string, cells: Cells): void => {
    for (const id of Object.keys(cellValues(cells))) {
      erased.push(`${key}\u0000${id}`);
      const ids = removed.get(templateId) ?? new Set<string>();
      ids.add(id);
      removed.set(templateId, ids);
    }
  };

  for (const template of oldPreset?.templates ?? []) {
    const next = newPreset.templates.find(
      (item) =>
        item.id === template.id && (item.repeat !== undefined) === (template.repeat !== undefined),
    );

    const before = templateScopes(template);
    const after = next === undefined ? null : templateScopes(next);

    for (const sheetId of templateSheetIds(records.values(), oldPreset!, template).sort()) {
      const blocks = [...records.values()]
        .filter(
          (record) => record.k.startsWith(`blk:${sheetId}:`) || record.k === blockKey(sheetId),
        )
        .sort((a, b) => (a.k < b.k ? -1 : 1));

      const lostBefore = erased.length;
      const claimed = new Set<string>();
      const highest = new Map<string, number>();
      const offsets = new Map<string, number>();
      const sectionIds = [...before.sections.keys()];

      const moving = blocks
        .filter((record) => record.d !== null)
        .sort((a, b) => {
          const firstPart = parseRepKey(a.k);
          const secondPart = parseRepKey(b.k);

          const rank = (part: typeof firstPart): number =>
            part === null || after === null
              ? -1
              : sectionTarget(part.sectionId, before.sections.get(part.sectionId) ?? [], after) ===
                  part.sectionId
                ? 0
                : sectionIds.indexOf(part.sectionId) + 1;

          const target = (part: typeof firstPart): string =>
            part === null || after === null
              ? ''
              : (sectionTarget(part.sectionId, before.sections.get(part.sectionId) ?? [], after) ??
                '');

          return (
            target(firstPart).localeCompare(target(secondPart)) ||
            rank(firstPart) - rank(secondPart) ||
            (a.k < b.k ? -1 : 1)
          );
        });

      const relocatedSources = new Set<string>();
      const relocatedTargets = new Set<string>();

      if (after !== null) {
        for (const source of moving) {
          const parts = parseRepKey(source.k);

          if (parts === null) continue;
          const oldFields = before.sections.get(parts.sectionId) ?? [];
          const scope = sectionTarget(parts.sectionId, oldFields, after);

          if (scope === null) continue;
          const target = repKey(sheetId, scope, parts.instanceId);

          if (target === source.k) continue;
          const written = records.get(target);

          if (
            written?.d !== null &&
            written !== undefined &&
            compareVersions(
              {
                c: written.l?.[0] ?? written.c,
                a: written.l?.[1] ?? written.a,
              },
              {
                c: source.l?.[0] ?? source.c,
                a: source.l?.[1] ?? source.a,
              },
            ) > 0
          ) {
            relocatedSources.add(source.k);
            relocatedTargets.add(target);
          }
        }
      }

      for (const record of moving) {
        if (relocatedTargets.has(record.k)) continue;

        if (relocatedSources.has(record.k)) {
          last.push({ k: record.k, d: null });
          continue;
        }

        const data = blockDataSchema.safeParse(record.d).data;

        if (data === undefined) continue;
        const parts = parseRepKey(record.k);

        const oldFields =
          parts === null
            ? [...before.rowFields.values()].map((entry) => entry.field)
            : (before.sections.get(parts.sectionId) ?? []);

        const shown = keptCells(data.cells, oldFields);

        if (after === null) {
          lose(template.id, record.k, shown);
          last.push({ k: record.k, d: null });
          continue;
        }

        const scope = parts === null ? null : sectionTarget(parts.sectionId, oldFields, after);

        if (parts !== null && scope === null) {
          lose(template.id, record.k, shown);
          last.push({ k: record.k, d: null });
          continue;
        }

        const newFields =
          parts === null
            ? [...after.rowFields.values()].map((entry) => entry.field)
            : (after.sections.get(scope ?? '') ?? []);

        const compatible = newFields.filter((field) =>
          oldFields.some((old) => old.id === field.id && old.type === field.type),
        );

        const cells = keptCells(shown, compatible);

        const lost = Object.fromEntries(
          Object.entries(shown).filter(([id]) => !Object.hasOwn(cells, id)),
        );

        lose(template.id, record.k, lost);
        const target = parts === null ? record.k : repKey(sheetId, scope ?? '', parts.instanceId);

        if (target !== record.k) {
          if (claimed.has(target)) {
            lose(template.id, record.k, cells);
          } else {
            claimed.add(target);
            const group = `${scope ?? ''}:${parts?.sectionId ?? ''}`;

            if (!offsets.has(group)) {
              const lowest = Math.min(
                ...moving.flatMap((candidate) => {
                  const part = parseRepKey(candidate.k);
                  const held = blockDataSchema.safeParse(candidate.d).data;

                  return part?.sectionId === parts?.sectionId && held !== undefined
                    ? [held.order]
                    : [];
                }),
              );

              const held = highest.get(scope ?? '');

              offsets.set(group, held !== undefined && held >= lowest ? held + 1 - lowest : 0);
            }

            const order = data.order + (offsets.get(group) ?? 0);
            highest.set(scope ?? '', Math.max(highest.get(scope ?? '') ?? -Infinity, order));
            first.push({ k: target, d: { ...data, order, cells }, relocate: true });
          }

          last.push({ k: record.k, d: null });
        } else {
          if (parts !== null)
            highest.set(
              parts.sectionId,
              Math.max(highest.get(parts.sectionId) ?? -Infinity, data.order),
            );
          const cleared: Cells = { ...cells };

          for (const [id, cell] of Object.entries(data.cells)) {
            if (!Object.hasOwn(cells, id)) cleared[id] = [null, cell[1], cell[2]];
          }

          if (!sameJson(data.cells, cleared))
            last.push({ k: record.k, d: { ...data, cells: cleared } });
        }
      }

      if (next === undefined) {
        if (template.repeat !== undefined || erased.length > lostBefore) {
          sheets += 1;
          erased.push(`${blockKey(sheetId)}\u0000`);
        }

        for (const record of records.values()) {
          if (
            record.d !== null &&
            !record.k.startsWith('blk:') &&
            isSheetDependent(record.k, record, sheetId)
          ) {
            last.push({ k: record.k, d: null });
          }
        }
      }
    }
  }

  for (const template of newPreset.templates) {
    if (template.repeat === undefined && records.get(blockKey(template.id))?.d == null) {
      first.push({ k: blockKey(template.id), d: { order: 0, cells: {} }, relocate: true });
    }
  }

  const effectiveLast = last.filter(
    (write) => write.d !== null || !first.some((created) => created.k === write.k),
  );

  const after = new Map(records);

  for (const write of [...first, ...effectiveLast]) {
    const old = records.get(write.k);
    after.set(write.k, {
      k: write.k,
      d: write.d,
      c: old?.c ?? 1,
      a: old?.a ?? 'migration',
      l: old?.l ?? [1, 'migration'],
    });
  }

  const beforeBlocks = blockIndex(records.values());
  const afterBlocks = blockIndex(after.values());

  for (const record of records.values()) {
    const target = record.k.startsWith('link:') ? linkTargetOf(record.d) : null;

    if (
      target !== null &&
      oldPreset !== null &&
      liveLinkTarget(records, oldPreset, target, beforeBlocks) !== null &&
      liveLinkTarget(after, newPreset, target, afterBlocks) === null &&
      !effectiveLast.some((write) => write.k === record.k)
    )
      effectiveLast.push({ k: record.k, d: null });
  }

  return {
    count: erased.length - sheets,
    sheets,
    digest: erasedDigest(erased),
    removed: Object.fromEntries([...removed].map(([id, ids]) => [id, [...ids].sort()])),
    first,
    last: effectiveLast,
  };
}

export function stripToTemplate<Stripped extends Pick<VersionedRecord, 'k' | 'd'>>(
  record: Stripped,
  layout: TemplateLayout,
): Stripped {
  if (!record.k.startsWith('blk:') || record.d === null) return record;
  const data = blockDataSchema.safeParse(record.d).data;

  if (data === undefined) return record;
  const scopes = templateScopes(layout);
  const parts = parseRepKey(record.k);

  const fields =
    parts === null
      ? [...scopes.rowFields.values()].map((item) => item.field)
      : (scopes.sections.get(parts.sectionId) ?? []);

  const cells = keptCells(data.cells, fields);

  return sameJson(cells, data.cells) ? record : { ...record, d: { ...data, cells } };
}

export function keptCells(cells: Cells, fields: readonly PresetFieldCell[]): Cells {
  return Object.fromEntries(
    Object.entries(cells).filter(([id, [value]]) => {
      const field = fields.find((item) => item.id === id);

      return field !== undefined && (value === null || holdsValue(field, value));
    }),
  );
}

export function keptValues(values: FieldValues, fields: readonly PresetFieldCell[]): FieldValues {
  return Object.fromEntries(
    Object.entries(values).filter(([id, value]) =>
      holdsValue(
        fields.find((field) => field.id === id),
        value,
      ),
    ),
  );
}

export function presetMoves(before: TemplateLayout, after: TemplateLayout): PresetMoves {
  const old = templateScopes(before);
  const next = templateScopes(after);

  return {
    rowOf: (id) => next.rowFields.get(id)?.rowId ?? null,
    sectionOf: (id) => sectionTarget(id, old.sections.get(id) ?? [], next),
  };
}

export function sectionTarget(
  sectionId: string,
  fields: readonly PresetFieldCell[],
  after: TemplateScopes,
  allowTextForSelect = false,
): string | null {
  void fields;
  void allowTextForSelect;

  // v4 repeat ids are stable scope identities. Matching fields is not a relocation
  // rule: changing the scope id erases its blocks.
  return after.sections.has(sectionId) ? sectionId : null;
}

export function templateScopes(layout: TemplateLayout): TemplateScopes {
  const scopes: TemplateScopes = { rows: new Map(), rowFields: new Map(), sections: new Map() };

  for (const section of layoutSections(layout)) {
    const sectionId = repeatSectionId(section);

    if (sectionId !== null) {
      scopes.sections.set(sectionId, sectionFields(section));
    } else if (section.repeat === undefined) {
      for (const row of section.rows) {
        const id = firstFieldId(row);

        if (id === null) continue;
        const fields = row.cells.filter((cell) => cell.kind === 'field');
        scopes.rows.set(id, fields);

        for (const field of fields) scopes.rowFields.set(field.id, { rowId: id, field });
      }
    }
  }

  return scopes;
}

export function holdsValue(field: PresetFieldCell | undefined, value: FieldValue): boolean {
  return field !== undefined && acceptedFieldValue(field, value).ok;
}

export function erasedDigest(erased: readonly string[]): string {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode([...erased].sort().join('\u0001'))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
