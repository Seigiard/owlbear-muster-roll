import {
  acceptedFieldValue,
  findPatchField,
  isRepeatSectionId,
  patchedRecord,
  patchedRecordFits,
  patchRecordKey,
  type PatchedRecord,
} from '@/core/field-patch';
import { recordFitsOneMessage } from '@/core/message-size';
import type { Version } from '@/core/merge';
import { duplicateNames, isDuplicateCount } from '@/core/npc-duplicate';
import { decodePreset, encodePreset, type Preset, type PresetTemplate } from '@/core/preset';
import {
  fieldValuesSchema,
  hasLiveSheet,
  presetDataSchema,
  repDataSchema,
  repKeyPrefix,
  rowKey,
  sheetDataSchema,
  type FieldValues,
  type RepData,
  type SheetData,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import {
  isSheetDependent,
  liveSheets,
  parseSheetName,
  sheetIdSchema,
  sheetKey,
} from '@/core/sheets';
import type { Command, RejectionReason } from '@/core/ui-messages';

// One live value record of a duplicated sheet, with the key parts a copy keeps.
type CopiedValue =
  | { kind: 'row'; rowId: string; d: FieldValues }
  | { kind: 'rep'; sectionId: string; instanceId: string; d: RepData };

export type FieldPatchCommand = Extract<Command, { type: 'field-patch' }>;

// The records a command is composed over, and how a new version is minted. The engine composes over
// its replica with its minter. The pending view composes over the replica with the queued intents
// applied, and mints nothing. `newId` gives the ids a command makes itself, such as an NPC copy's,
// each named by its role in the command. The pending view composes a queued command many times, so
// one role must get one id each time, whatever records come or go in between.
export type ComposeContext = {
  records: ReadonlyMap<string, VersionedRecord>;
  mint: (key: string, highestKnownCounter: number) => Version;
  newId: (role: string) => string;
};

// A field patch of a combined pending entry, with the command id a refusal names.
export type IdentifiedPatch = { id: string; command: FieldPatchCommand };

export type PatchRefusal = { id: string; reason: RejectionReason };

// `record` is `null` when the patches change nothing together.
export type ComposedPatches = { record: VersionedRecord | null; refusals: PatchRefusal[] };

export type Composers = {
  compose: (
    context: ComposeContext,
    command: Command,
  ) => Result<VersionedRecord[], RejectionReason>;
  // Several field patches of one record key, applied in order and minted once.
  composePatches: (context: ComposeContext, patches: readonly IdentifiedPatch[]) => ComposedPatches;
};

// The preset decoded from the `d` it came from, so a run of patches decodes it once.
type DecodedPreset = { d: string; preset: Preset | null };

export function createComposers(connectionId: string): Composers {
  let decodedPreset: DecodedPreset | null = null;

  function composePresetUpload(
    context: ComposeContext,
    command: Extract<Command, { type: 'preset-upload' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const preset = decodePreset(command.data);

    if (!preset.ok) {
      return err('invalid-preset');
    }

    // Composed from the validated preset, so the record never holds what the window sent as is.
    const d = encodePreset(preset.value);

    // Measured at the largest counter a version can reach, so the check needs no mint.
    if (!recordFitsOneMessage({ k: 'preset', d, c: Number.MAX_SAFE_INTEGER, a: connectionId })) {
      return err('too-large');
    }

    // Temporary until Story 5.1 brings the AD-14 diff: a preset change must not orphan values.
    if (hasLiveSheet(context.records.values())) {
      return err('sheets-exist');
    }

    const { c, a } = context.mint('preset', context.records.get('preset')?.c ?? 0);

    return ok({ k: 'preset', d, c, a });
  }

  // The field must be in the targeted row of the sheet's own template, and the value of its type.
  // The patch merges into `current`, so a field another window just saved stays.
  function patchOnto(
    context: ComposeContext,
    command: FieldPatchCommand,
    current: VersionedRecord | undefined,
  ): Result<PatchedRecord, RejectionReason> {
    const template = sheetTemplate(context, command.sheetId, 'unknown-field');

    if (!template.ok) {
      return template;
    }

    const field = findPatchField(template.value, command.target, command.fieldId);

    if (field === null) {
      return err('unknown-field');
    }

    const value = acceptedFieldValue(field, command.value);

    if (!value.ok) {
      return value;
    }

    const patched = patchedRecord(
      command.sheetId,
      command.target,
      current,
      command.fieldId,
      value.value,
    );

    if (!patched.ok) {
      return patched;
    }

    return patchedRecordFits(patched.value) ? patched : err('too-large');
  }

  function composeFieldPatch(
    context: ComposeContext,
    command: FieldPatchCommand,
  ): Result<VersionedRecord, RejectionReason> {
    const existing = context.records.get(patchRecordKey(command.sheetId, command.target));
    const patched = patchOnto(context, command, existing);

    if (!patched.ok) {
      return patched;
    }

    const { c, a } = context.mint(patched.value.k, existing?.c ?? 0);

    return ok({ ...patched.value, c, a });
  }

  // A patch that changes nothing on the record built so far is skipped in silence: the window
  // already shows that value.
  function composePatches(
    context: ComposeContext,
    patches: readonly IdentifiedPatch[],
  ): ComposedPatches {
    const [first] = patches;
    const refusals: PatchRefusal[] = [];

    if (first === undefined) {
      return { record: null, refusals };
    }

    const existing = context.records.get(
      patchRecordKey(first.command.sheetId, first.command.target),
    );

    let working: PatchedRecord | null = null;

    for (const patch of patches) {
      const base: VersionedRecord | undefined =
        working === null ? existing : { ...working, c: 1, a: connectionId };

      const patched = patchOnto(context, patch.command, base);

      if (patched.ok) {
        working = patched.value;
      } else if (patched.error !== 'unchanged') {
        refusals.push({ id: patch.id, reason: patched.error });
      }
    }

    if (working === null || JSON.stringify(working.d) === JSON.stringify(existing?.d)) {
      return { record: null, refusals };
    }

    const { c, a } = context.mint(working.k, existing?.c ?? 0);

    return { record: { ...working, c, a }, refusals };
  }

  // A new row goes after every row this sheet has in the section. The id is the window's, so a
  // tombstone's id counts as taken: a deleted row must never come back.
  function composeRepeatRowAdd(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-row-add' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const section = repeatSection(context, command);

    if (!section.ok) {
      return section;
    }

    if (!sheetIdSchema.safeParse(command.instanceId).success) {
      return err('invalid-instance-id');
    }

    const k = repKey(command);

    if (context.records.has(k)) {
      return err('instance-exists');
    }

    const { c, a } = context.mint(k, 0);

    const record: VersionedRecord = {
      k,
      d: { order: nextRowOrder(context, command), cells: {} },
      c,
      a,
    };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
  }

  function composeRepeatRowDelete(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-row-delete' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const section = repeatSection(context, command);

    if (!section.ok) {
      return section;
    }

    const current = context.records.get(repKey(command));

    return current === undefined || current.d === null
      ? err('unknown-instance')
      : ok(tombstone(context, current));
  }

  // The sheet must be live and the section a repeat section of the sheet's own template.
  function repeatSection(
    context: ComposeContext,
    command: { sheetId: string; sectionId: string },
  ): Result<null, RejectionReason> {
    const template = sheetTemplate(context, command.sheetId, 'unknown-section');

    if (!template.ok) {
      return template;
    }

    return isRepeatSectionId(template.value, command.sectionId) ? ok(null) : err('unknown-section');
  }

  // `noPreset` names the rejection for a sheet whose template cannot be known yet.
  function sheetTemplate(
    context: ComposeContext,
    sheetId: string,
    noPreset: RejectionReason,
  ): Result<PresetTemplate, RejectionReason> {
    const current = liveSheetRecord(context, sheetId);

    if (!current.ok) {
      return current;
    }

    const sheet = sheetDataSchema.safeParse(current.value.d);
    const preset = currentPreset(context);

    if (!sheet.success) {
      return err('unknown-sheet');
    }

    if (preset === null) {
      return err(noPreset);
    }

    return ok(sheet.data.kind === 'pc' ? preset.character : preset.npc);
  }

  function currentPreset(context: ComposeContext): Preset | null {
    const data = presetDataSchema.safeParse(context.records.get('preset')?.d);

    if (!data.success) {
      return null;
    }

    if (decodedPreset?.d !== data.data) {
      const decoded = decodePreset(data.data);

      decodedPreset = { d: data.data, preset: decoded.ok ? decoded.value : null };
    }

    return decodedPreset.preset;
  }

  return {
    compose: (context, command) => {
      switch (command.type) {
        case 'sheet-create':
          return listOf(composeSheetCreate(context, command));
        case 'sheet-rename':
          return listOf(composeSheetRename(context, command));
        case 'sheet-delete':
          return composeSheetDelete(context, command);
        case 'sheet-duplicate':
          return composeSheetDuplicate(context, command);
        case 'preset-upload':
          return listOf(composePresetUpload(context, command));
        case 'field-patch':
          return listOf(composeFieldPatch(context, command));
        case 'repeat-row-add':
          return listOf(composeRepeatRowAdd(context, command));
        case 'repeat-row-delete':
          return listOf(composeRepeatRowDelete(context, command));
        default:
          return unknownCommand(command);
      }
    },
    composePatches,
  };
}

function composeSheetCreate(
  context: ComposeContext,
  command: Extract<Command, { type: 'sheet-create' }>,
): Result<VersionedRecord, RejectionReason> {
  if (!sheetIdSchema.safeParse(command.sheetId).success) {
    return err('invalid-sheet-id');
  }

  const k = sheetKey(command.sheetId);

  // A tombstone counts too: a deleted sheet's id must never come back.
  if (context.records.has(k)) {
    return err('sheet-exists');
  }

  const name = parseSheetName(command.name);

  if (!name.ok) {
    return err('invalid-name');
  }

  return mintedSheet(context, k, 0, {
    kind: command.kind,
    name: name.value,
    order: nextOrder(context, command.kind),
  });
}

function composeSheetRename(
  context: ComposeContext,
  command: Extract<Command, { type: 'sheet-rename' }>,
): Result<VersionedRecord, RejectionReason> {
  const current = liveSheetRecord(context, command.sheetId);

  if (!current.ok) {
    return current;
  }

  const sheet = sheetDataSchema.safeParse(current.value.d);

  if (!sheet.success) {
    return err('unknown-sheet');
  }

  const name = parseSheetName(command.name);

  if (!name.ok) {
    return err('invalid-name');
  }

  return mintedSheet(context, current.value.k, current.value.c, {
    ...sheet.data,
    name: name.value,
  });
}

// The sheet and every record that depends on it go in one batch. Storage gets the whole batch
// before any send, and the sheet tombstone goes last, so a write that fails part way leaves a live
// sheet the GM can delete again. The kind is not checked: an NPC goes the same way.
function composeSheetDelete(
  context: ComposeContext,
  command: Extract<Command, { type: 'sheet-delete' }>,
): Result<VersionedRecord[], RejectionReason> {
  const current = liveSheetRecord(context, command.sheetId);

  if (!current.ok) {
    return current;
  }

  const doomed: VersionedRecord[] = [];

  for (const [key, record] of context.records) {
    // A tombstone already says deleted, and writing it again would only add a version.
    if (record.d !== null && isSheetDependent(key, record, command.sheetId)) {
      doomed.push(record);
    }
  }

  doomed.push(current.value);

  return ok(doomed.map((record) => tombstone(context, record)));
}

// AD-2: each copy is new `row:`, `rep:` and `sheet:` records at `c: 1` under new ids, with no
// `link:`, `acl:` or `plink:`. Only live records are copied. Each copy's sheet goes after its rows,
// so a write that fails part way leaves no half-visible copy: rows with no sheet show nowhere.
function composeSheetDuplicate(
  context: ComposeContext,
  command: Extract<Command, { type: 'sheet-duplicate' }>,
): Result<VersionedRecord[], RejectionReason> {
  if (!isDuplicateCount(command.count)) {
    return err('invalid-count');
  }

  const current = liveSheetRecord(context, command.sheetId);

  if (!current.ok) {
    return current;
  }

  const source = sheetDataSchema.safeParse(current.value.d);

  if (!source.success) {
    return err('unknown-sheet');
  }

  if (source.data.kind !== 'npc') {
    return err('not-npc');
  }

  const npcNames = liveSheets(context.records.values(), 'npc').map((npc) => npc.name);
  const names = duplicateNames(source.data.name, npcNames, command.count);

  if (!names.ok) {
    return err('invalid-name');
  }

  const firstOrder = nextOrder(context, 'npc');
  const values = copiedValues(context, command.sheetId);
  const copies: VersionedRecord[] = [];

  for (const [index, name] of names.value.entries()) {
    const sheetId = context.newId(`sheet:${index}`);

    if (context.records.has(sheetKey(sheetId))) {
      return err('sheet-exists');
    }

    for (const value of values) {
      if (value.kind === 'row') {
        const k = rowKey(sheetId, value.rowId);

        copies.push({ k, d: value.d, ...context.mint(k, 0) });
      } else {
        const role = `rep:${index}:${value.sectionId}:${value.instanceId}`;
        const k = `${repKeyPrefix(sheetId, value.sectionId)}${context.newId(role)}`;

        copies.push({ k, d: value.d, ...context.mint(k, 0) });
      }
    }

    const k = sheetKey(sheetId);
    const d: SheetData = { kind: 'npc', name, order: firstOrder + index };

    copies.push({ k, d, ...context.mint(k, 0) });
  }

  return copies.every(recordFitsOneMessage) ? ok(copies) : err('too-large');
}

// The live `row:` and `rep:` records of one sheet, by key, so copies list them in one order.
function copiedValues(context: ComposeContext, sheetId: string): CopiedValue[] {
  const rowPrefix = `row:${sheetId}:`;
  const repPrefix = `rep:${sheetId}:`;
  const values: CopiedValue[] = [];

  const keys = [...context.records.keys()]
    .filter((key) => key.startsWith(rowPrefix) || key.startsWith(repPrefix))
    .sort();

  for (const key of keys) {
    const d = context.records.get(key)?.d;

    if (key.startsWith(rowPrefix)) {
      const row = fieldValuesSchema.safeParse(d);

      if (row.success) {
        values.push({ kind: 'row', rowId: key.slice(rowPrefix.length), d: row.data });
      }
    } else if (key.startsWith(repPrefix)) {
      const rep = repDataSchema.safeParse(d);
      const [sectionId, instanceId] = key.slice(repPrefix.length).split(':');

      if (rep.success && sectionId !== undefined && instanceId !== undefined) {
        values.push({ kind: 'rep', sectionId, instanceId, d: rep.data });
      }
    }
  }

  return values;
}

function liveSheetRecord(
  context: ComposeContext,
  sheetId: string,
): Result<VersionedRecord, RejectionReason> {
  if (!sheetIdSchema.safeParse(sheetId).success) {
    return err('invalid-sheet-id');
  }

  const current = context.records.get(sheetKey(sheetId));

  if (current === undefined) {
    return err('unknown-sheet');
  }

  return current.d === null ? err('deleted-sheet') : ok(current);
}

function tombstone(context: ComposeContext, record: VersionedRecord): VersionedRecord {
  const { c, a } = context.mint(record.k, record.c);

  return { ...record, d: null, c, a };
}

function mintedSheet(
  context: ComposeContext,
  k: string,
  highestKnownCounter: number,
  d: SheetData,
): Result<VersionedRecord, RejectionReason> {
  const { c, a } = context.mint(k, highestKnownCounter);
  const record: VersionedRecord = { k, d, c, a };

  return recordFitsOneMessage(record) ? ok(record) : err('too-large');
}

// A tombstone holds no order, so only live rows count.
function nextRowOrder(
  context: ComposeContext,
  command: { sheetId: string; sectionId: string },
): number {
  const prefix = repKeyPrefix(command.sheetId, command.sectionId);
  let highest = -1;

  for (const record of context.records.values()) {
    if (record.k.startsWith(prefix)) {
      const row = repDataSchema.safeParse(record.d);

      if (row.success) {
        highest = Math.max(highest, row.data.order);
      }
    }
  }

  return highest + 1;
}

function nextOrder(context: ComposeContext, kind: 'pc' | 'npc'): number {
  let highest = -1;

  for (const record of context.records.values()) {
    if (record.k.startsWith('sheet:')) {
      const sheet = sheetDataSchema.safeParse(record.d);

      if (sheet.success && sheet.data.kind === kind) {
        highest = Math.max(highest, sheet.data.order);
      }
    }
  }

  return highest + 1;
}

function repKey(command: { sheetId: string; sectionId: string; instanceId: string }): string {
  const { sheetId, sectionId, instanceId } = command;

  return patchRecordKey(sheetId, { kind: 'rep', sectionId, instanceId });
}

function listOf<Value, Failure>(result: Result<Value, Failure>): Result<Value[], Failure> {
  return result.ok ? ok([result.value]) : result;
}

// `tsc` fails here when a command type has no composer above.
function unknownCommand(command: never): never {
  throw new Error(`Muster Roll has no composer for the command ${JSON.stringify(command)}`);
}
