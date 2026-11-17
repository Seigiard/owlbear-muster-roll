import { aclKey, playerName, plinkKey } from '@/core/access';
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
  repeatSectionById,
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
  blockPathKey,
  cellValues,
  versionCells,
  parseBlockPathKey,
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
import { err, ok, type Result } from '@/core/result';
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

// The records a command is composed over, and how a new version is minted. The engine composes over
// its replica with its minter. The pending view composes over the replica with the queued intents
// applied, and mints nothing. `newRecordId` gives the ids a command makes itself, such as a
// duplicate's, of a kind and each named by its role in the command. The pending view composes a
// queued command many times, so one role must get one id each time, whatever records come or go in
// between. `isGmPlayer` is true for a player id the party lists as a GM, and for this client's own
// one.
export type ComposeContext = {
  records: ReadonlyMap<string, VersionedRecord>;
  mint: (key: string, highestKnownCounter: number) => Version;
  newRecordId: (kind: RecordIdKind, role: string) => string;
  isGmPlayer: (playerId: string) => boolean;
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

    if (!preset.ok) {
      return err('invalid-preset');
    }

    // Composed from the validated preset, so the record never holds what the window sent as is.
    const d = encodePreset(preset.value);

    // Measured at the largest counter a version can reach, so the check needs no mint.
    if (!recordFitsOneMessage({ k: 'preset', d, c: Number.MAX_SAFE_INTEGER, a: connectionId })) {
      return err('too-large');
    }

    const stored = context.records.get('preset');
    const old = stored === undefined ? null : currentPreset(context);

    if (stored !== undefined && old === null) {
      return err('preset-unreadable');
    }

    return ok({ d, migration: presetDiff(context.records, old, preset.value) });
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

    if (!planned.ok) {
      return err({ reason: planned.error });
    }

    const { d, migration } = planned.value;

    if (
      (migration.count > 0 || migration.sheets > 0) &&
      (migration.count !== command.expectedCount ||
        migration.sheets !== command.expectedSheets ||
        migration.digest !== command.expectedDigest)
    ) {
      return err({ reason: 'count-changed', changed: lossOf(migration) });
    }

    const minted = (write: PlannedWrite): VersionedRecord => {
      const current = context.records.get(write.k);
      const version = context.mint(write.k, Math.max(current?.c ?? 0, current?.l?.[0] ?? 0));

      if (!write.k.startsWith('blk:')) return { k: write.k, d: null, ...version };

      return {
        k: write.k,
        ...version,
        l: write.relocate ? [version.c, version.a] : (current?.l ?? [version.c, version.a]),
        d:
          write.d === null
            ? null
            : {
                ...write.d,
                cells: versionCells(
                  Object.fromEntries(
                    Object.entries(write.d.cells).map(([id, [value]]) => [id, value]),
                  ),
                  version.c,
                  version.a,
                ),
              },
      };
    };

    const groups: VersionedRecord[][] = [
      migration.first.map(minted),
      [{ k: 'preset', d, ...context.mint('preset', context.records.get('preset')?.c ?? 0) }],
      migration.last.map(minted),
    ];

    return groups.every((group) => group.every(recordFitsOneMessage))
      ? ok({ groups, count: migration.count, sheets: migration.sheets })
      : err({ reason: 'too-large' });
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
      return err('invalid-sheet-id');
    }

    const preset = currentPreset(context);

    if (preset === null || templateById(preset, sheetId) === null) {
      const current = liveSheetRecord(context, sheetId);

      if (!current.ok) {
        return current;
      }

      if (preset === null) {
        return err(noPreset);
      }
    }

    const policy = resolveSheet(context.records, preset, sheetId);

    return policy === null ? err('unknown-sheet') : ok(policy);
  }

  // A sheet of a sheet set: never a single sheet. With no preset, `set` on a live root block says
  // so.
  function sheetOfSet(context: ComposeContext, sheetId: string): Result<null, RejectionReason> {
    if (!sheetIdSchema.safeParse(sheetId).success) {
      return err('invalid-sheet-id');
    }

    const preset = currentPreset(context);

    if (preset !== null && templateById(preset, sheetId) !== null) {
      return err('not-sheet-set');
    }

    const current = liveSheetRecord(context, sheetId);

    if (!current.ok) {
      return current;
    }

    return preset === null || resolveSheet(context.records, preset, sheetId) !== null
      ? ok(null)
      : err('unknown-sheet');
  }

  // The field must be in the targeted row or repeat block of the sheet's own template, and the
  // value of its type. The patch merges into `current`, so a field another window just saved stays.
  function patchOnto(
    context: ComposeContext,
    command: FieldPatchCommand,
    current: VersionedRecord | undefined,
  ): Result<PatchedRecord, RejectionReason> {
    const policy = sheetPolicyOf(context, command.sheetId, 'unknown-field');

    if (!policy.ok) {
      return policy;
    }

    const { template } = policy.value;

    if (
      command.target.kind === 'rep' &&
      !matchesBlockTarget(command.target.path, command.target.sectionId, command.target.instanceId)
    ) {
      return err('unknown-instance');
    }

    if (
      command.target.kind === 'rep' &&
      !validBlockPath(
        context.records,
        command.sheetId,
        command.target.path ?? [command.target.sectionId, command.target.instanceId],
      )
    ) {
      return err('unknown-instance');
    }

    const field = findPatchField(template, command.target, command.fieldId);

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

    // AD-14: a new version keeps no value the template no longer has in this row or repeat block.
    const stripped = stripToTemplate(patched.value, template);

    return patchedRecordFits(stripped) ? ok(stripped) : err('too-large');
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

    return ok(mintedPatch(patched.value, existing, { c, a }));
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
        working === null
          ? existing
          : { ...working, c: 1, a: connectionId, l: existing?.l ?? [1, connectionId] };

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

    return { record: mintedPatch(working, existing, { c, a }), refusals };
  }

  // A new repeat block goes after every repeat block this sheet has in the section. The id is the
  // window's. AD-2: an instance id is unique in its sheet, across sections, and a tombstone's id
  // counts as taken, so a removed repeat block never comes back.
  function composeRepeatBlockAdd(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-block-add' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const section = repeatSectionOf(context, command);

    if (!section.ok) {
      return section;
    }

    if (!sheetIdSchema.safeParse(command.instanceId).success) {
      return err('invalid-instance-id');
    }

    if (sheetInstanceIds(context, command.sheetId).has(command.instanceId)) {
      return err('instance-exists');
    }

    const path = command.path ?? [command.sectionId, command.instanceId];

    if (!validBlockPath(context.records, command.sheetId, path.slice(0, -2))) {
      return err('unknown-instance');
    }

    const k = blockPathKey(command.sheetId, path);
    const { c, a } = context.mint(k, 0);

    const record: VersionedRecord = {
      k,
      d: { order: nextBlockOrder(context, command), cells: {} },
      c,
      a,
      l: [c, a],
    };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
  }

  // AD-19: the repeat block's tombstone, then the tombstones of the links to it.
  function composeRepeatBlockDelete(
    context: ComposeContext,
    command: Extract<Command, { type: 'repeat-block-delete' }>,
  ): Result<VersionedRecord[], RejectionReason> {
    const section = repeatSectionOf(context, command);

    if (!section.ok) {
      return section;
    }

    const path = command.path ?? [command.sectionId, command.instanceId];
    const current = context.records.get(blockPathKey(command.sheetId, path));

    if (
      current === undefined ||
      current.d === null ||
      !validBlockPath(context.records, command.sheetId, path)
    ) {
      return err('unknown-instance');
    }

    return ok([
      tombstone(context, current),
      ...blockLinkTombstones(context, command.sheetId, command.instanceId, path),
    ]);
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
      return err('invalid-count');
    }

    const section = repeatSectionOf(context, command);

    if (!section.ok) {
      return section;
    }

    const { policy } = section.value;

    const sourcePath = command.path ?? [command.sectionId, command.instanceId];
    const sourceKey = blockPathKey(command.sheetId, sourcePath);

    const source = validBlockPath(context.records, command.sheetId, sourcePath)
      ? repDataSchema.safeParse(context.records.get(sourceKey)?.d)
      : repDataSchema.safeParse(undefined);

    if (!source.success) {
      return err('unknown-instance');
    }

    const siblings = sectionBlocks(context, command);

    const cells = duplicateBlockCells(
      section.value.section,
      cellValues(source.data.cells),
      siblings.map((block) => block.cells),
      command.count,
    );

    if (!cells.ok) {
      return err('invalid-value');
    }

    const firstOrder = nextBlockOrder(context, command);
    const taken = sheetInstanceIds(context, command.sheetId);
    const copies: VersionedRecord[] = [];

    for (const [index, values] of cells.value.entries()) {
      const instanceId = drawFreeId(context, 'instance', `block:${index}`, (id) => !taken.has(id));

      if (instanceId === null) {
        return err('instance-exists');
      }

      taken.add(instanceId);

      const path = [...sourcePath.slice(0, -2), command.sectionId, instanceId];
      const k = blockPathKey(command.sheetId, path);
      const version = context.mint(k, 0);
      const d = { order: firstOrder + index, cells: versionCells(values, version.c, version.a) };
      // AD-14: a copy holds only the fields the template has in the section.
      const stripped = stripToTemplate({ k, d }, policy.template);

      copies.push({ k, d: stripped.d, ...version, l: [version.c, version.a] });

      for (const record of context.records.values()) {
        const child = parseBlockPathKey(record.k);

        if (
          child === null ||
          child.sheetId !== command.sheetId ||
          record.d === null ||
          child.path.length <= sourcePath.length ||
          child.path
            .slice(0, sourcePath.length)
            .some((part, childIndex) => part !== sourcePath[childIndex])
        ) {
          continue;
        }

        const childPath = [...path, ...child.path.slice(sourcePath.length)];
        const childKey = blockPathKey(command.sheetId, childPath);
        const childVersion = context.mint(childKey, 0);
        const childData = blockDataSchema.safeParse(record.d).data;

        if (childData === undefined) continue;

        const childStripped = stripToTemplate(
          { k: childKey, d: { ...childData, cells: { ...childData.cells } } },
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

    return copies.every(recordFitsOneMessage) ? ok(copies) : err('too-large');
  }

  // The sheet must be a sheet a template owns, and the section a repeat section of that template.
  function repeatSectionOf(
    context: ComposeContext,
    command: { sheetId: string; sectionId: string },
  ): Result<{ policy: SheetPolicy; section: PresetSection }, RejectionReason> {
    const policy = sheetPolicyOf(context, command.sheetId, 'unknown-section');

    if (!policy.ok) {
      return policy;
    }

    const section =
      command.path === undefined
        ? repeatSectionById(policy.value.template, command.sectionId)
        : (() => {
            const scopePath = commandScopePath(command);

            return scopePath === null
              ? null
              : repeatSectionByPath(policy.value.template, scopePath);
          })();

    return section === null ? err('unknown-section') : ok({ policy: policy.value, section });
  }

  // AD-18: a new sheet of the sheet set `set`, after its last sheet. Its name field is empty, so it
  // shows the fallback name until someone types one.
  function composeSheetCreate(
    context: ComposeContext,
    command: Extract<Command, { type: 'sheet-create' }>,
  ): Result<VersionedRecord, RejectionReason> {
    if (!sheetIdSchema.safeParse(command.sheetId).success) {
      return err('invalid-sheet-id');
    }

    const preset = currentPreset(context);
    const set = preset === null ? null : templateById(preset, command.set);

    if (preset === null || set === null || !isSheetSet(set)) {
      return err('unknown-template');
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
      return err('sheet-exists');
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

    if (!sheet.ok) {
      return sheet;
    }

    const current = liveSheetRecord(context, command.sheetId);

    if (!current.ok) {
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

    return ok(doomed.map((record) => tombstone(context, record)));
  }

  // AD-19: a token links to one sheet or repeat block, so the new link replaces the old one. A
  // target can have many tokens, so no other link changes. A target that is not live, or whose
  // template or repeat section is not linkable, is refused.
  function composeLinkSet(
    context: ComposeContext,
    command: Extract<Command, { type: 'link-set' }>,
  ): Result<VersionedRecord, RejectionReason> {
    if (!tokenIdSchema.safeParse(command.tokenId).success) {
      return err('invalid-token-id');
    }

    const policy = sheetPolicyOf(context, command.sheetId, 'not-linkable');

    if (!policy.ok) {
      return policy;
    }

    const path = command.path ?? null;

    const target: LinkTarget = {
      sheetId: command.sheetId,
      instanceId: path === null ? null : (path.at(-1) ?? null),
      path,
      cellId: command.cellId,
    };

    if (path !== null) {
      const instanceId = path.at(-1);

      if (instanceId === undefined || !sheetIdSchema.safeParse(instanceId).success) {
        return err('invalid-instance-id');
      }

      if (
        path.length % 2 !== 0 ||
        path.at(-1) !== instanceId ||
        !validBlockPath(context.records, command.sheetId, path)
      ) {
        return err('unknown-instance');
      }
    }

    if (liveLinkTarget(context.records, currentPreset(context), target) === null) {
      return err('not-linkable');
    }

    const k = linkKey(command.tokenId);
    const { c, a } = context.mint(k, context.records.get(k)?.c ?? 0);
    const record: VersionedRecord = { k, d: linkDataOf(target), c, a };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
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

    if (!sheet.ok) {
      return sheet;
    }

    if (!playerIdSchema.safeParse(command.playerId).success) {
      return err('invalid-player-id');
    }

    const k = aclKey(command.sheetId, command.playerId);
    const existing = context.records.get(k);

    if (!command.on) {
      return existing === undefined || existing.d === null
        ? err('unchanged')
        : ok(tombstone(context, existing));
    }

    const name = playerName(command.name);

    if (playerDataSchema.safeParse(existing?.d).data?.name === name) {
      return err('unchanged');
    }

    const { c, a } = context.mint(k, existing?.c ?? 0);
    const record: VersionedRecord = { k, d: { name }, c, a };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
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

    if (!sheet.ok) {
      return sheet;
    }

    const { playerId } = command;

    if (
      playerId !== null &&
      (!playerIdSchema.safeParse(playerId).success || context.isGmPlayer(playerId))
    ) {
      return err('invalid-player-id');
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
      return err('unchanged');
    }

    return batch.every(recordFitsOneMessage) ? ok(batch) : err('too-large');
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
          return err('not-allowed');
        // AD-9: an import and a wipe replace the generation, so the engine runs each on its own
        // path.
        case 'snapshot-import':
        case 'wipe':
          return err('not-allowed');

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

      return planned.ok ? ok(lossOf(planned.value.migration)) : planned;
    },
  };
}

// AD-19: the tombstones of every link that names the repeat block `instanceId` of the sheet. The GM
// client that removes a repeat block, or commits a player's removal of one, writes them.
export function blockLinkTombstones(
  context: ComposeContext,
  sheetId: string,
  instanceId: string,
  path?: readonly string[],
): VersionedRecord[] {
  const doomed: VersionedRecord[] = [];

  for (const [key, record] of context.records) {
    const target = key.startsWith('link:') ? linkTargetOf(record.d) : null;

    const targetPath = target?.path ?? null;

    const isDescendant =
      path !== undefined &&
      targetPath !== null &&
      targetPath.length >= path.length &&
      path.every((part, index) => targetPath[index] === part);

    if (
      target?.sheetId === sheetId &&
      (isDescendant || (path === undefined && target?.instanceId === instanceId))
    ) {
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
    return err('invalid-token-id');
  }

  const current = context.records.get(linkKey(command.tokenId));

  return current === undefined || current.d === null
    ? err('unknown-link')
    : ok(tombstone(context, current));
}

// The repeat blocks one sheet has in one section, live ones only, with their data.
function sectionBlocks(
  context: ComposeContext,
  command: { sheetId: string; sectionId: string; path?: string[] },
): { order: number; cells: FieldValues }[] {
  const path =
    'path' in command && command.path !== undefined
      ? [...command.path.slice(0, -2), command.sectionId]
      : [command.sectionId];

  const blocks: { order: number; cells: FieldValues }[] = [];

  for (const record of context.records.values()) {
    const parsed = parseBlockPathKey(record.k);

    if (
      parsed === null ||
      parsed.sheetId !== command.sheetId ||
      parsed.path.length !== path.length + 1 ||
      parsed.path.slice(0, path.length).some((part, index) => part !== path[index])
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

function commandScopePath(command: {
  sectionId: string;
  instanceId: string;
  path?: readonly string[];
}): string[] | null {
  const path = command.path;

  if (!matchesBlockTarget(path, command.sectionId, command.instanceId)) {
    return null;
  }

  return path === undefined
    ? [command.sectionId]
    : [...path.slice(0, -2).filter((_part, index) => index % 2 === 0), command.sectionId];
}

// AD-2: every instance id one sheet holds in any section, tombstones included.
function sheetInstanceIds(context: ComposeContext, sheetId: string): Set<string> {
  const ids = new Set<string>();

  for (const key of context.records.keys()) {
    const parts = parseBlockPathKey(key);

    if (parts?.sheetId === sheetId) {
      const instanceId = parts.path.at(-1);

      if (instanceId !== undefined) ids.add(instanceId);
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
  const record: VersionedRecord = { k, d, c, a, l: [c, a] };

  return recordFitsOneMessage(record) ? ok(record) : err('too-large');
}

// A tombstone holds no order, so only live repeat blocks count.
function nextBlockOrder(
  context: ComposeContext,
  command: { sheetId: string; sectionId: string; path?: string[] },
): number {
  let highest = -1;

  for (const block of sectionBlocks(context, command)) {
    highest = Math.max(highest, block.order);
  }

  return highest + 1;
}

function validBlockPath(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  path: readonly string[],
): boolean {
  if (path.length === 0) {
    return true;
  }

  if (path.length % 2 !== 0) {
    return false;
  }

  for (let length = 2; length <= path.length; length += 2) {
    if (
      !repDataSchema.safeParse(records.get(blockPathKey(sheetId, path.slice(0, length)))?.d).success
    ) {
      return false;
    }
  }

  return true;
}

function matchesBlockTarget(
  path: readonly string[] | undefined,
  sectionId: string,
  instanceId: string,
): boolean {
  return (
    path === undefined ||
    (path.length >= 2 &&
      path.length % 2 === 0 &&
      path.at(-2) === sectionId &&
      path.at(-1) === instanceId)
  );
}

// After the last sheet of the sheet set, by `order`.
function nextOrder(context: ComposeContext, setId: string): number {
  let highest = -1;

  for (const record of context.records.values()) {
    if (record.k.startsWith('blk:') && record.k.split(':').length === 2) {
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
): VersionedRecord {
  const before = blockDataSchema.safeParse(existing?.d).data;

  const changed = Object.fromEntries(
    Object.entries(patched.d.cells)
      .filter(([id, cell]) => cell[0] !== before?.cells[id]?.[0])
      .map(([id, [value]]) => [id, value]),
  );

  return {
    k: patched.k,
    ...version,
    l: existing?.l ?? [version.c, version.a],
    d: { ...patched.d, cells: versionCells(changed, version.c, version.a) },
  };
}

function listOf<Value, Failure>(result: Result<Value, Failure>): Result<Value[], Failure> {
  return result.ok ? ok([result.value]) : result;
}

// `tsc` fails here when a command type has no composer above.
function unknownCommand(command: never): never {
  throw new Error(`Muster Roll has no composer for the command ${JSON.stringify(command)}`);
}
