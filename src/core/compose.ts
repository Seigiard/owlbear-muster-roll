import { aclKey, playerName, plinkKey } from '@/core/access';
import {
  blockKeyOf,
  childAddress,
  blockIdOf,
  hasValidSegments,
  isDescendantOf,
  isLiveBlock,
  isSelfOrDescendantOf,
  parentOf,
  parseBlockKey,
  rebaseDescendant,
  sameAddress,
  scopePathOf,
  sectionIdOf,
  type BlockAddress,
} from '@/core/block-address';
import {
  acceptedFieldValue,
  findPatchField,
  patchedRecord,
  patchedRecordFits,
  patchRecordKey,
  type PatchedRecord,
} from '@/core/field-patch';
import type { RecordIdKind } from '@/core/ids';
import { linkDataOf, linkTargetOf, liveLinkTarget, type LinkTarget } from '@/core/link-target';
import { recordFitsOneMessage } from '@/core/message-size';
import type { Version } from '@/core/merge';
import {
  decodePreset,
  encodePreset,
  repeatSectionByPath,
  templateById,
  type Preset,
  type PresetSection,
} from '@/core/preset';
import {
  presetDiff,
  stripToTemplate,
  type PlannedWrite,
  type PresetMigration,
} from '@/core/preset-migrate';
import {
  blockDataSchema,
  cellValues,
  versionCells,
  playerDataSchema,
  playerIdSchema,
  plinkPrefix,
  presetDataSchema,
  repDataSchema,
  sheetDataSchema,
  type FieldValues,
  type SheetData,
  type VersionedRecord,
} from '@/core/records';
import { duplicateBlockCells, isDuplicateCount } from '@/core/repeat-block-duplicate';
import { Result } from 'better-result';
import {
  dependentSheetId,
  isSheetDependent,
  isSheetSet,
  resolveSheet,
  sheetIdSchema,
  sheetKey,
  type SheetPolicy,
} from '@/core/sheets';
import { linkKey, tokenIdSchema } from '@/core/token-links';
import type { Command, RejectionReason } from '@/core/ui-messages';

export type FieldPatchCommand = Extract<Command, { type: 'field-patch' }>;

export type ComposeMode = 'persisted' | 'pending';

// The records a command is composed over, and how a new version is minted. The engine composes over
// its replica with its minter. The pending view composes over the replica with the queued intents
// applied, and mints nothing. `newRecordId` gives the ids a command makes itself, such as a
// duplicate's, of a kind and each named by its role in the command. The pending view composes a
// queued command many times, so one role must get one id each time, whatever records come or go in
// between. `mode` permits reconciliation clears in persisted writes; pending views and player
// proposals must omit them, or a valid proposal can fail unknown-field admission. `isGmPlayer`
// is true for a player id the party lists as a GM, and for this client's own one.
export type ComposeContext = {
  records: ReadonlyMap<string, VersionedRecord>;
  mint: (key: string, highestKnownCounter: number) => Version;
  newRecordId: (kind: RecordIdKind, role: string) => string;
  isGmPlayer: (playerId: string) => boolean;
  mode: ComposeMode;
};

// TASK-37: new ids are short, so a drawn id can collide. A command that draws its own ids draws a
// colliding one again this many times before it refuses.
const MAX_ID_REDRAWS = 5;

// A field patch of a combined pending entry, with the command id a refusal names.
export type IdentifiedPatch = { id: string; command: FieldPatchCommand };

export type PatchRefusal = { id: string; reason: RejectionReason };

// `record` is `null` when the patches change nothing together.
export type ComposedPatches = { record: VersionedRecord | null; refusals: PatchRefusal[] };

// AD-14: what one preset upload erases: the stored values and the sheets it deletes, and their
// digest.
export type PresetUploadLoss = { count: number; sheets: number; digest: string };

// AD-14: the records of one preset upload, in the groups they are written and sent in, and the
// number of stored values they erase and of sheets they delete.
export type PresetUploadBatch = { groups: VersionedRecord[][]; count: number; sheets: number };

// `changed` goes with `count-changed` only: the new counts and digest.
export type PresetUploadRefusal = {
  reason: RejectionReason;
  changed?: PresetUploadLoss;
};

type PlannedUpload = { d: string; migration: PresetMigration };

export type Composers = {
  compose: (
    context: ComposeContext,
    command: Command,
  ) => Result<VersionedRecord[], RejectionReason>;
  // Several field patches of one record key, applied in order and minted once.
  composePatches: (context: ComposeContext, patches: readonly IdentifiedPatch[]) => ComposedPatches;
  composePresetUpload: (
    context: ComposeContext,
    command: Extract<Command, { type: 'preset-upload' }>,
  ) => Result<PresetUploadBatch, PresetUploadRefusal>;
  // AD-14: how many stored values the preset in `data` would erase and how many sheets it would
  // delete, and their digest. It mints nothing.
  presetDiffResult: (
    context: ComposeContext,
    data: string,
  ) => Result<PresetUploadLoss, RejectionReason>;
};

// The preset decoded from the `d` it came from, so a run of patches decodes it once.
type DecodedPreset = { d: string; preset: Preset | null };

export function createComposers(connectionId: string): Composers {
  let decodedPreset: DecodedPreset | null = null;

  // AD-14: the new preset, validated and measured, and the migration from the stored one. A stored
  // preset that does not decode may come from a newer build, so no diff runs over it.
  function planPresetUpload(
    context: ComposeContext,
    data: string,
  ): Result<PlannedUpload, RejectionReason> {
    const preset = decodePreset(data);

    if (!preset.isOk()) {
      return Result.err('invalid-preset');
    }

    // Composed from the validated preset, so the record never holds what the window sent as is.
    const d = encodePreset(preset.value);

    // Measured at the largest counter a version can reach, so the check needs no mint.
    if (!recordFitsOneMessage({ k: 'preset', d, c: Number.MAX_SAFE_INTEGER, a: connectionId })) {
      return Result.err('too-large');
    }

    const stored = context.records.get('preset');
    const old = stored === undefined ? null : currentPreset(context);

    if (stored !== undefined && old === null) {
      return Result.err('preset-unreadable');
    }

    return Result.ok({ d, migration: presetDiff(context.records, old, preset.value) });
  }

  // AD-14: three groups in send order: rows under new keys and rows that gain values, then
  // `preset`, then tombstones of old keys, deleted sheets, stripped rows and inert links. An upload
  // that erases values or deletes sheets other than the ones the GM confirmed is refused with the
  // new counts. One that erases nothing and deletes nothing applies.
  function composePresetUpload(
    context: ComposeContext,
    command: Extract<Command, { type: 'preset-upload' }>,
  ): Result<PresetUploadBatch, PresetUploadRefusal> {
    const planned = planPresetUpload(context, command.data);

    if (!planned.isOk()) {
      return Result.err({ reason: planned.error });
    }

    const { d, migration } = planned.value;

    if (
      (migration.count > 0 || migration.sheets > 0) &&
      (migration.count !== command.expectedCount ||
        migration.sheets !== command.expectedSheets ||
        migration.digest !== command.expectedDigest)
    ) {
      return Result.err({ reason: 'count-changed', changed: lossOf(migration) });
    }

    const minted = (write: PlannedWrite): VersionedRecord => {
      const current = context.records.get(write.k);
      const version = context.mint(write.k, Math.max(current?.c ?? 0, current?.l?.[0] ?? 0));

      if (!write.k.startsWith('blk:')) return { k: write.k, d: null, ...version };

      const currentData = blockDataSchema.safeParse(current?.d).data;

      const reminted = Object.fromEntries(
        Object.entries(write.d?.cells ?? {})
          .filter(([id, [value]]) => currentData?.cells[id]?.[0] !== value)
          .map(([id, [value]]) => [id, value]),
      );

      return {
        k: write.k,
        ...version,
        l: write.relocate ? [version.c, version.a] : (current?.l ?? [version.c, version.a]),
        d:
          write.d === null
            ? null
            : {
                ...write.d,
                cells: { ...write.d.cells, ...versionCells(reminted, version.c, version.a) },
              },
      };
    };

    const groups: VersionedRecord[][] = [
      migration.first.map(minted),
      [{ k: 'preset', d, ...context.mint('preset', context.records.get('preset')?.c ?? 0) }],
      migration.last.map(minted),
    ];

    return groups.every((group) => group.every(recordFitsOneMessage))
      ? Result.ok({ groups, count: migration.count, sheets: migration.sheets })
      : Result.err({ reason: 'too-large' });
  }

  // AD-18: the policy of a sheet a template owns. A single sheet's id is its template id. Any other
  // sheet needs a live root block. `noPreset` names the rejection for a sheet whose template cannot
  // be known yet.
  function sheetPolicyOf(
    context: ComposeContext,
    sheetId: string,
    noPreset: RejectionReason,
  ): Result<SheetPolicy, RejectionReason> {
    if (!sheetIdSchema.safeParse(sheetId).success) {
      return Result.err('invalid-sheet-id');
    }

    const preset = currentPreset(context);

    if (preset === null || templateById(preset, sheetId) === null) {
      const current = liveSheetRecord(context, sheetId);

      if (!current.isOk()) {
        return current;
      }

      if (preset === null) {
        return Result.err(noPreset);
      }
    }

    const policy = resolveSheet(context.records, preset, sheetId);

    return policy === null ? Result.err('unknown-sheet') : Result.ok(policy);
  }

  // A sheet of a sheet set: never a single sheet. With no preset, `set` on a live root block says
  // so.
  function sheetOfSet(context: ComposeContext, sheetId: string): Result<null, RejectionReason> {
    if (!sheetIdSchema.safeParse(sheetId).success) {
      return Result.err('invalid-sheet-id');
    }

    const preset = currentPreset(context);

    if (preset !== null && templateById(preset, sheetId) !== null) {
      return Result.err('not-sheet-set');
    }

    const current = liveSheetRecord(context, sheetId);

    if (!current.isOk()) {
      return current;
    }

    return preset === null || resolveSheet(context.records, preset, sheetId) !== null
      ? Result.ok(null)
      : Result.err('unknown-sheet');
  }

  // The field must be in the targeted row or repeat block of the sheet's own template, and the
  // value of its type. The patch merges into `current`, so a field another window just saved stays.
  function patchOnto(
    context: ComposeContext,
    command: FieldPatchCommand,
    current: VersionedRecord | undefined,
  ): Result<PatchedRecord, RejectionReason> {
    const policy = sheetPolicyOf(context, command.sheetId, 'unknown-field');

    if (!policy.isOk()) {
      return policy;
    }

    const { template } = policy.value;
    const target = command.target;

    if (
      target.kind === 'rep' &&
      (target.block.sheetId !== command.sheetId ||
        !hasValidSegments(target.block) ||
        !isLiveBlock(context.records, target.block))
    ) {
      return Result.err('unknown-instance');
    }

    const field = findPatchField(template, target, command.fieldId);

    if (field === null) {
      return Result.err('unknown-field');
    }

    const value = acceptedFieldValue(field, command.value);

    if (!value.isOk()) {
      return value;
    }

    const patched = patchedRecord(command.sheetId, target, current, command.fieldId, value.value);

    if (!patched.isOk()) {
      return patched;
    }

    // AD-14: a new version keeps no value the template no longer has in this row or repeat block.
    const stripped = stripToTemplate(patched.value, template);

    return patchedRecordFits(stripped) ? Result.ok(stripped) : Result.err('too-large');
  }

  function composeFieldPatch(
    context: ComposeContext,
    command: FieldPatchCommand,
  ): Result<VersionedRecord, RejectionReason> {
    const target = command.target;

    const existing = context.records.get(patchRecordKey(command.sheetId, target));
    const patched = patchOnto(context, command, existing);

    if (!patched.isOk()) {
      return patched;
    }

    const { c, a } = context.mint(patched.value.k, existing?.c ?? 0);

    return Result.ok(mintedPatch(patched.value, existing, { c, a }, context.mode));
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

    const firstTarget = first.command.target;

    const existing = context.records.get(patchRecordKey(first.command.sheetId, firstTarget));

    let working: PatchedRecord | null = null;

    for (const patch of patches) {
      const base: VersionedRecord | undefined =
        working === null
          ? existing
          : { ...working, c: 1, a: connectionId, l: existing?.l ?? [1, connectionId] };

      const patched = patchOnto(context, patch.command, base);

      if (patched.isOk()) {
        working = patched.value;
      } else if (patched.error !== 'unchanged') {
        refusals.push({ id: patch.id, reason: patched.error });
      }
    }

    if (working === null || JSON.stringify(working.d) === JSON.stringify(existing?.d)) {
      return { record: null, refusals };
    }

    const { c, a } = context.mint(working.k, existing?.c ?? 0);

    return { record: mintedPatch(working, existing, { c, a }, context.mode), refusals };
  }

  // A new repeat block goes after every repeat block this sheet has in the section. The id is the
  // window's. AD-2: an instance id is unique in its sheet, across sections, and a tombstone's id
  // counts as taken, so a removed repeat block never comes back.
  function composeRepeatBlockAdd(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-block-add' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const section = repeatSectionOf(context, command);

    if (!section.isOk()) {
      return section;
    }

    const instanceId = blockIdOf(command.block);

    if (
      command.block.sheetId !== command.sheetId ||
      instanceId === null ||
      !sheetIdSchema.safeParse(instanceId).success
    ) {
      return Result.err('invalid-instance-id');
    }

    if (sheetInstanceIds(context, command.sheetId).has(instanceId)) {
      return Result.err('instance-exists');
    }

    const parent = parentOf(command.block);
    const sectionId = sectionIdOf(command.block);

    if (parent === null || sectionId === null || !isLiveBlock(context.records, parent)) {
      return Result.err('unknown-instance');
    }

    const k = blockKeyOf(command.block);
    const { c, a } = context.mint(k, 0);

    const record: VersionedRecord = {
      k,
      d: { order: nextBlockOrder(context, parent, sectionId), cells: {} },
      c,
      a,
      l: [c, a],
    };

    return recordFitsOneMessage(record) ? Result.ok(record) : Result.err('too-large');
  }

  // AD-19: the repeat block's tombstone, then the tombstones of the links to it.
  function composeRepeatBlockDelete(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-block-delete' }>,
  ): Result<VersionedRecord[], RejectionReason> {
    const section = repeatSectionOf(context, command);

    if (!section.isOk()) {
      return section;
    }

    const current = context.records.get(blockKeyOf(command.block));

    if (
      current === undefined ||
      current.d === null ||
      command.block.sheetId !== command.sheetId ||
      !isLiveBlock(context.records, command.block)
    ) {
      return Result.err('unknown-instance');
    }

    return Result.ok([tombstone(context, current), ...blockLinkTombstones(context, command.block)]);
  }

  // CAP-30: `count` new repeat blocks of the same sheet and section after its last one, at `c: 1`,
  // each with the source's values and, when its first field is a `text` field with a value, the
  // next number in it. A copy gets no link. A new instance id is short (TASK-37), so it can
  // collide: one the sheet already holds, a tombstone included, or one of this batch is drawn
  // again, and one still taken refuses the command.
  function composeRepeatBlockDuplicate(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-block-duplicate' }>,
  ): Result<VersionedRecord[], RejectionReason> {
    if (!isDuplicateCount(command.count)) {
      return Result.err('invalid-count');
    }

    const section = repeatSectionOf(context, command);

    if (!section.isOk()) {
      return section;
    }

    const { policy } = section.value;

    const source = command.block;
    const sourceKey = blockKeyOf(source);

    const sourceData = isLiveBlock(context.records, source)
      ? repDataSchema.safeParse(context.records.get(sourceKey)?.d)
      : repDataSchema.safeParse(undefined);

    if (!sourceData.success) {
      return Result.err('unknown-instance');
    }

    const parent = parentOf(source);
    const sectionId = sectionIdOf(source);

    if (parent === null || sectionId === null) {
      return Result.err('unknown-instance');
    }

    const siblings = sectionBlocks(context, parent, sectionId);

    const cells = duplicateBlockCells(
      section.value.section,
      cellValues(sourceData.data.cells),
      siblings.map((block) => block.cells),
      command.count,
    );

    if (!cells.isOk()) {
      return Result.err('invalid-value');
    }

    const firstOrder = nextBlockOrder(context, parent, sectionId);
    const taken = sheetInstanceIds(context, command.sheetId);
    const copies: VersionedRecord[] = [];

    for (const [index, values] of cells.value.entries()) {
      const instanceId = drawFreeId(context, 'instance', `block:${index}`, (id) => !taken.has(id));

      if (instanceId === null) {
        return Result.err('instance-exists');
      }

      taken.add(instanceId);

      const block = childAddress(parent, sectionId, instanceId);
      const k = blockKeyOf(block);
      const version = context.mint(k, 0);
      const d = { order: firstOrder + index, cells: versionCells(values, version.c, version.a) };
      // AD-14: a copy holds only the fields the template has in the section.
      const stripped = stripToTemplate({ k, d }, policy.template);

      copies.push({ k, d: stripped.d, ...version, l: [version.c, version.a] });

      for (const record of context.records.values()) {
        const child = parseBlockKey(record.k);

        if (
          child === null ||
          child.sheetId !== command.sheetId ||
          record.d === null ||
          !isDescendantOf(child, source)
        ) {
          continue;
        }

        const childBlock = rebaseDescendant(child, source, block);

        if (childBlock === null) continue;

        const childKey = blockKeyOf(childBlock);
        const childVersion = context.mint(childKey, 0);
        const childData = blockDataSchema.safeParse(record.d).data;

        if (childData === undefined) continue;

        const childStripped = stripToTemplate(
          {
            k: childKey,
            d: {
              ...childData,
              cells: versionCells(cellValues(childData.cells), childVersion.c, childVersion.a),
            },
          },
          policy.template,
        );

        copies.push({
          k: childKey,
          d: childStripped.d,
          ...childVersion,
          l: [childVersion.c, childVersion.a],
        });
      }
    }

    return copies.every(recordFitsOneMessage) ? Result.ok(copies) : Result.err('too-large');
  }

  // The sheet must be a sheet a template owns, and the section a repeat section of that template.
  function repeatSectionOf(
    context: ComposeContext,
    command: {
      sheetId: string;
      block: BlockAddress;
    },
  ): Result<{ policy: SheetPolicy; section: PresetSection }, RejectionReason> {
    const policy = sheetPolicyOf(context, command.sheetId, 'unknown-section');

    if (!policy.isOk()) {
      return policy;
    }

    const section = repeatSectionByPath(policy.value.template, scopePathOf(command.block));

    return section === null
      ? Result.err('unknown-section')
      : Result.ok({ policy: policy.value, section });
  }

  // AD-18: a new sheet of the sheet set `set`, after its last sheet. Its name field is empty, so it
  // shows the fallback name until someone types one.
  function composeSheetCreate(
    context: ComposeContext,
    command: Extract<Command, { type: 'sheet-create' }>,
  ): Result<VersionedRecord, RejectionReason> {
    if (!sheetIdSchema.safeParse(command.sheetId).success) {
      return Result.err('invalid-sheet-id');
    }

    const preset = currentPreset(context);
    const set = preset === null ? null : templateById(preset, command.set);

    if (preset === null || set === null || !isSheetSet(set)) {
      return Result.err('unknown-template');
    }

    const k = sheetKey(command.sheetId);

    // A template id names that template's single sheet or nothing, so no sheet set takes it. A
    // tombstone counts too: a deleted sheet's id must never come back. A live record that names the
    // id, such as an orphan row, counts too, or the new sheet would take it over.
    if (
      templateById(preset, command.sheetId) !== null ||
      context.records.has(k) ||
      liveDependentSheetIds(context).has(command.sheetId)
    ) {
      return Result.err('sheet-exists');
    }

    return mintedSheet(context, k, 0, {
      set: set.id,
      order: nextOrder(context, set.id),
      cells: {},
    });
  }

  // A sheet of a sheet set and every record that depends on it go in one batch. Storage gets the
  // whole batch before any send, and the sheet tombstone goes last, so a write that fails part way
  // leaves a live sheet the GM can delete again. A single sheet is never deleted.
  function composeSheetDelete(
    context: ComposeContext,
    command: Extract<Command, { type: 'sheet-delete' }>,
  ): Result<VersionedRecord[], RejectionReason> {
    const sheet = sheetOfSet(context, command.sheetId);

    if (!sheet.isOk()) {
      return sheet;
    }

    const current = liveSheetRecord(context, command.sheetId);

    if (!current.isOk()) {
      return current;
    }

    const doomed: VersionedRecord[] = [];

    for (const [key, record] of context.records) {
      // A tombstone already says deleted, and writing it again would only add a version.
      if (
        key !== sheetKey(command.sheetId) &&
        record.d !== null &&
        isSheetDependent(key, record, command.sheetId)
      ) {
        doomed.push(record);
      }
    }

    doomed.push(current.value);

    return Result.ok(doomed.map((record) => tombstone(context, record)));
  }

  // AD-19: a token links to one sheet or repeat block, so the new link replaces the old one. A
  // target can have many tokens, so no other link changes. A target that is not live, or whose
  // template or repeat section is not linkable, is refused.
  function composeLinkSet(
    context: ComposeContext,
    command: Extract<Command, { type: 'link-set' }>,
  ): Result<VersionedRecord, RejectionReason> {
    if (!tokenIdSchema.safeParse(command.tokenId).success) {
      return Result.err('invalid-token-id');
    }

    const policy = sheetPolicyOf(context, command.sheetId, 'not-linkable');

    if (!policy.isOk()) {
      return policy;
    }

    const block = command.block;
    const instanceId = blockIdOf(block);

    if (block.sheetId !== command.sheetId) {
      return Result.err('unknown-instance');
    }

    if (instanceId !== null && !sheetIdSchema.safeParse(instanceId).success) {
      return Result.err('invalid-instance-id');
    }

    if (!isLiveBlock(context.records, block)) {
      return Result.err('unknown-instance');
    }

    const target: LinkTarget = { block, cellId: command.cellId };

    if (liveLinkTarget(context.records, currentPreset(context), target) === null) {
      return Result.err('not-linkable');
    }

    const k = linkKey(command.tokenId);
    const { c, a } = context.mint(k, context.records.get(k)?.c ?? 0);
    const record: VersionedRecord = { k, d: linkDataOf(target), c, a };

    return recordFitsOneMessage(record) ? Result.ok(record) : Result.err('too-large');
  }

  // FR3: access on is a live `acl:` record with the player's last known name, and off is its
  // tombstone. Only a live sheet of a sheet set takes access. The name is trimmed and cut, and ""
  // when no name is known. A change that leaves the record as it is refused, so a repeated press
  // adds no version.
  function composeAclSet(
    context: ComposeContext,
    command: Extract<Command, { type: 'acl-set' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const sheet = sheetOfSet(context, command.sheetId);

    if (!sheet.isOk()) {
      return sheet;
    }

    if (!playerIdSchema.safeParse(command.playerId).success) {
      return Result.err('invalid-player-id');
    }

    const k = aclKey(command.sheetId, command.playerId);
    const existing = context.records.get(k);

    if (!command.on) {
      return existing === undefined || existing.d === null
        ? Result.err('unchanged')
        : Result.ok(tombstone(context, existing));
    }

    const name = playerName(command.name);

    if (playerDataSchema.safeParse(existing?.d).data?.name === name) {
      return Result.err('unchanged');
    }

    const { c, a } = context.mint(k, existing?.c ?? 0);
    const record: VersionedRecord = { k, d: { name }, c, a };

    return recordFitsOneMessage(record) ? Result.ok(record) : Result.err('too-large');
  }

  // FR19: one batch. Picking a player writes their `acl:` when it is not live, so editing turns on,
  // tombstones every other live `plink:` of the sheet, and writes their `plink:` when it is not
  // live. A live `plink:` keeps its name. Their `plink:` goes last, so a write that fails part way
  // never shows a new owner whose other records are missing. "Никто" (`playerId: null`) tombstones
  // every live `plink:` of the sheet. No other `acl:` changes, so a previous owner keeps editing. A
  // GM, this client's own player included, owns nothing. A batch that would change nothing is
  // refused, so a repeated pick adds no version. Only a sheet of a sheet set has an owner.
  function composeOwnerSet(
    context: ComposeContext,
    command: Extract<Command, { type: 'owner-set' }>,
  ): Result<VersionedRecord[], RejectionReason> {
    const sheet = sheetOfSet(context, command.sheetId);

    if (!sheet.isOk()) {
      return sheet;
    }

    const { playerId } = command;

    if (
      playerId !== null &&
      (!playerIdSchema.safeParse(playerId).success || context.isGmPlayer(playerId))
    ) {
      return Result.err('invalid-player-id');
    }

    const owner = playerId === null ? null : plinkKey(command.sheetId, playerId);
    const prefix = plinkPrefix(command.sheetId);
    const batch: VersionedRecord[] = [];

    if (playerId !== null) {
      const acl = context.records.get(aclKey(command.sheetId, playerId));

      if (acl === undefined || acl.d === null) {
        const k = aclKey(command.sheetId, playerId);

        batch.push({ k, d: { name: playerName(command.name) }, ...context.mint(k, acl?.c ?? 0) });
      }
    }

    for (const [key, record] of context.records) {
      if (key.startsWith(prefix) && key !== owner && record.d !== null) {
        batch.push(tombstone(context, record));
      }
    }

    if (owner !== null) {
      const existing = context.records.get(owner);

      if (existing === undefined || existing.d === null) {
        const d = { name: playerName(command.name) };

        batch.push({ k: owner, d, ...context.mint(owner, existing?.c ?? 0) });
      }
    }

    if (batch.length === 0) {
      return Result.err('unchanged');
    }

    return batch.every(recordFitsOneMessage) ? Result.ok(batch) : Result.err('too-large');
  }

  function currentPreset(context: ComposeContext): Preset | null {
    const data = presetDataSchema.safeParse(context.records.get('preset')?.d);

    if (!data.success) {
      return null;
    }

    if (decodedPreset?.d !== data.data) {
      const decoded = decodePreset(data.data);

      decodedPreset = { d: data.data, preset: decoded.isOk() ? decoded.value : null };
    }

    return decodedPreset.preset;
  }

  return {
    compose: (context, command) => {
      switch (command.type) {
        case 'sheet-create':
          return listOf(composeSheetCreate(context, command));
        case 'sheet-delete':
          return composeSheetDelete(context, command);
        case 'repeat-block-duplicate':
          return composeRepeatBlockDuplicate(context, command);
        case 'link-set':
          return listOf(composeLinkSet(context, command));
        case 'link-clear':
          return listOf(composeLinkClear(context, command));
        case 'acl-set':
          return listOf(composeAclSet(context, command));
        case 'owner-set':
          return composeOwnerSet(context, command);
        // AD-14: an upload is an ordered batch with its own confirmation, sent through
        // `composePresetUpload` only. A flat list here would lose the order.
        case 'preset-upload':
          return Result.err('not-allowed');
        // AD-9: an import and a wipe replace the generation, so the engine runs each on its own
        // path.
        case 'snapshot-import':
        case 'wipe':
          return Result.err('not-allowed');

        case 'field-patch':
          return listOf(composeFieldPatch(context, command));
        case 'repeat-block-add':
          return listOf(composeRepeatBlockAdd(context, command));
        case 'repeat-block-delete':
          return composeRepeatBlockDelete(context, command);
        default:
          return unknownCommand(command);
      }
    },
    composePatches,
    composePresetUpload,
    presetDiffResult: (context, data) => {
      const planned = planPresetUpload(context, data);

      return planned.isOk() ? Result.ok(lossOf(planned.value.migration)) : planned;
    },
  };
}

// AD-19: the tombstones of every link that names the repeat block or one of its descendants.
export function blockLinkTombstones(
  context: ComposeContext,
  block: BlockAddress,
): VersionedRecord[] {
  const doomed: VersionedRecord[] = [];

  for (const [key, record] of context.records) {
    const target = key.startsWith('link:') ? linkTargetOf(record.d) : null;
    const targetBlock = target?.block ?? null;

    if (targetBlock !== null && isSelfOrDescendantOf(targetBlock, block)) {
      doomed.push(record);
    }
  }

  return doomed
    .sort((first, second) => (first.k < second.k ? -1 : first.k > second.k ? 1 : 0))
    .map((record) => tombstone(context, record));
}

function lossOf(migration: PresetMigration): PresetUploadLoss {
  return { count: migration.count, sheets: migration.sheets, digest: migration.digest };
}

// The link goes, and the sheet and the token stay. A link to a deleted sheet is still a record, so
// it can be cleared too.
function composeLinkClear(
  context: ComposeContext,
  command: Extract<Command, { type: 'link-clear' }>,
): Result<VersionedRecord, RejectionReason> {
  if (!tokenIdSchema.safeParse(command.tokenId).success) {
    return Result.err('invalid-token-id');
  }

  const current = context.records.get(linkKey(command.tokenId));

  return current === undefined || current.d === null
    ? Result.err('unknown-link')
    : Result.ok(tombstone(context, current));
}

// The repeat blocks one sheet has in one section, live ones only, with their data.
function sectionBlocks(
  context: ComposeContext,
  parent: BlockAddress,
  sectionId: string | null,
): { order: number; cells: FieldValues }[] {
  const blocks: { order: number; cells: FieldValues }[] = [];

  if (sectionId === null) {
    return blocks;
  }

  for (const record of context.records.values()) {
    const parsed = parseBlockKey(record.k);
    const recordParent = parsed === null ? null : parentOf(parsed);

    if (
      parsed === null ||
      sectionIdOf(parsed) !== sectionId ||
      recordParent === null ||
      !sameAddress(recordParent, parent)
    ) {
      continue;
    }

    const block = repDataSchema.safeParse(record.d);

    if (block.success) {
      blocks.push({ order: block.data.order, cells: cellValues(block.data.cells) });
    }
  }

  return blocks;
}

// AD-2: every instance id one sheet holds in any section, tombstones included.
function sheetInstanceIds(context: ComposeContext, sheetId: string): Set<string> {
  const ids = new Set<string>();

  for (const key of context.records.keys()) {
    const parts = parseBlockKey(key);

    if (parts?.sheetId === sheetId) {
      const instanceId = blockIdOf(parts);

      if (instanceId !== null) ids.add(instanceId);
    }
  }

  return ids;
}

// The first free id of a role, drawn again at most `MAX_ID_REDRAWS` times, or `null`. Each redraw is
// a role of its own, so the pending view and the replay draw the same ids while the same ids
// collide.
function drawFreeId(
  context: ComposeContext,
  kind: RecordIdKind,
  role: string,
  isFree: (id: string) => boolean,
): string | null {
  for (let draw = 0; draw <= MAX_ID_REDRAWS; draw += 1) {
    const id = context.newRecordId(kind, draw === 0 ? role : `${role}:redraw:${draw}`);

    if (isFree(id)) {
      return id;
    }
  }

  return null;
}

// The sheet ids that live block, access, player-link and token-link records name. A tombstone takes
// nothing over, so it does not count here.
function liveDependentSheetIds(context: ComposeContext): Set<string> {
  const sheetIds = new Set<string>();

  for (const [key, record] of context.records) {
    const sheetId = record.d === null ? null : dependentSheetId(key, record);

    if (sheetId !== null) {
      sheetIds.add(sheetId);
    }
  }

  return sheetIds;
}

function liveSheetRecord(
  context: ComposeContext,
  sheetId: string,
): Result<VersionedRecord, RejectionReason> {
  if (!sheetIdSchema.safeParse(sheetId).success) {
    return Result.err('invalid-sheet-id');
  }

  const current = context.records.get(sheetKey(sheetId));

  if (current === undefined) {
    return Result.err('unknown-sheet');
  }

  return current.d === null ? Result.err('deleted-sheet') : Result.ok(current);
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
  const record: VersionedRecord = { k, d, c, a, l: [c, a] };

  return recordFitsOneMessage(record) ? Result.ok(record) : Result.err('too-large');
}

// A tombstone holds no order, so only live repeat blocks count.
function nextBlockOrder(
  context: ComposeContext,
  parent: BlockAddress,
  sectionId: string | null,
): number {
  let highest = -1;

  for (const block of sectionBlocks(context, parent, sectionId)) {
    highest = Math.max(highest, block.order);
  }

  return highest + 1;
}

// After the last sheet of the sheet set, by `order`.
function nextOrder(context: ComposeContext, setId: string): number {
  let highest = -1;

  for (const record of context.records.values()) {
    const block = parseBlockKey(record.k);

    if (block !== null && block.path.length === 0) {
      const sheet = sheetDataSchema.safeParse(record.d);

      if (sheet.success && sheet.data.set === setId) {
        highest = Math.max(highest, sheet.data.order);
      }
    }
  }

  return highest + 1;
}

function mintedPatch(
  patched: PatchedRecord,
  existing: VersionedRecord | undefined,
  version: Version,
  mode: ComposeMode,
): VersionedRecord {
  const before = blockDataSchema.safeParse(existing?.d).data;

  const changed = Object.fromEntries(
    Object.entries(patched.d.cells)
      .filter(([id, cell]) => cell[0] !== before?.cells[id]?.[0])
      .map(([id, [value]]) => [id, value]),
  );

  const removed =
    mode === 'persisted'
      ? Object.fromEntries(
          Object.entries(before?.cells ?? {})
            .filter(([id, [value]]) => value !== null && !Object.hasOwn(patched.d.cells, id))
            .map(([id]) => [id, null]),
        )
      : {};

  return {
    k: patched.k,
    ...version,
    l: existing?.l ?? [version.c, version.a],
    d: {
      ...patched.d,
      cells: versionCells({ ...changed, ...removed }, version.c, version.a),
    },
  };
}

function listOf<Value, Failure>(result: Result<Value, Failure>): Result<Value[], Failure> {
  return result.isOk() ? Result.ok([result.value]) : result;
}

// `tsc` fails here when a command type has no composer above.
function unknownCommand(command: never): never {
  throw new Error(`Muster Roll has no composer for the command ${JSON.stringify(command)}`);
}
