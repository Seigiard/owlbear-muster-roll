import { z } from 'zod';

const NOT_PROTO = '(?!__proto__(?::|$))';
const KEY_SEGMENT = `${NOT_PROTO}[^:]+`;

export const keySegmentSchema = z.string().regex(new RegExp(`^${KEY_SEGMENT}$`));

export const blockPathSchema = z
  .array(keySegmentSchema)
  .min(2)
  .refine((parts) => parts.length % 2 === 0);

export type BlockAddress = Readonly<{
  sheetId: string;
  path: readonly string[];
}>;

export type WireFieldPatchTarget = Readonly<{
  sectionId: string;
  instanceId: string;
  path?: readonly string[];
}>;

export type WireBlockTarget = {
  sectionId: string;
  instanceId: string;
  path?: string[];
};

export type AddressFieldPatchTarget = Readonly<{
  kind: 'rep';
  block: BlockAddress;
}>;

export const wireBlockPathSchema = z.custom<readonly string[]>((value) => {
  return z
    .array(z.string())
    .min(2)
    .refine((parts) => parts.length % 2 === 0)
    .safeParse(value).success;
});

export const wireOpenSheetPathSchema = z
  .array(z.string())
  .min(2)
  .refine((parts) => parts.length % 2 === 0);

export function blockAddress(sheetId: string, path: readonly string[]): BlockAddress | null {
  return path.length % 2 === 0 ? { sheetId, path: [...path] } : null;
}

export function blockAddressOfWireTarget(
  sheetId: string,
  target: Pick<WireFieldPatchTarget, 'sectionId' | 'instanceId' | 'path'>,
): BlockAddress | null {
  const path = target.path ?? [target.sectionId, target.instanceId];

  if (path.length < 2 || path.at(-2) !== target.sectionId || path.at(-1) !== target.instanceId) {
    return null;
  }

  return blockAddress(sheetId, path);
}

export function sheetRootAddress(sheetId: string): BlockAddress {
  return { sheetId, path: [] };
}

export function childAddress(parent: BlockAddress, scopeId: string, blockId: string): BlockAddress {
  return { sheetId: parent.sheetId, path: [...parent.path, scopeId, blockId] };
}

export function parseBlockKey(key: string): BlockAddress | null {
  const [prefix, sheetId, ...path] = key.split(':');

  if (
    prefix !== 'blk' ||
    sheetId === undefined ||
    !keySegmentSchema.safeParse(sheetId).success ||
    (path.length > 0 && !blockPathSchema.safeParse(path).success)
  ) {
    return null;
  }

  return blockAddress(sheetId, path);
}

export function blockKeyOf(address: BlockAddress): string {
  return `blk:${[address.sheetId, ...address.path].join(':')}`;
}

export function parentOf(address: BlockAddress): BlockAddress | null {
  return address.path.length === 0
    ? null
    : blockAddress(address.sheetId, address.path.slice(0, -2));
}

export function scopePathOf(address: BlockAddress): string[] {
  const scopePath: string[] = [];

  for (let index = 0; index < address.path.length; index += 2) {
    const scopeId = address.path[index];

    if (scopeId !== undefined) scopePath.push(scopeId);
  }

  return scopePath;
}

export function sectionIdOf(address: BlockAddress): string | null {
  return address.path.at(-2) ?? null;
}

export function blockIdOf(address: BlockAddress): string | null {
  return address.path.at(-1) ?? null;
}

export function isDescendantOf(address: BlockAddress, ancestor: BlockAddress): boolean {
  if (address.sheetId !== ancestor.sheetId || address.path.length <= ancestor.path.length) {
    return false;
  }

  return ancestor.path.every((segment, index) => address.path[index] === segment);
}

export function isSelfOrDescendantOf(address: BlockAddress, ancestor: BlockAddress): boolean {
  return sameAddress(address, ancestor) || isDescendantOf(address, ancestor);
}

export function rebaseDescendant(
  address: BlockAddress,
  ancestor: BlockAddress,
  replacement: BlockAddress,
): BlockAddress | null {
  if (!isDescendantOf(address, ancestor)) {
    return null;
  }

  return blockAddress(replacement.sheetId, [
    ...replacement.path,
    ...address.path.slice(ancestor.path.length),
  ]);
}

export function sameAddress(first: BlockAddress, second: BlockAddress): boolean {
  return (
    first.sheetId === second.sheetId &&
    first.path.length === second.path.length &&
    first.path.every((segment, index) => second.path[index] === segment)
  );
}

export function hasValidSegments(address: BlockAddress): boolean {
  return (
    keySegmentSchema.safeParse(address.sheetId).success &&
    (address.path.length === 0 && blockAddress(address.sheetId, address.path) !== null
      ? true
      : blockPathSchema.safeParse(address.path).success)
  );
}

export function isLiveBlock(
  records: ReadonlyMap<string, Readonly<{ d: unknown }>>,
  address: BlockAddress,
): boolean {
  for (let length = 2; length <= address.path.length; length += 2) {
    const ancestor = blockAddress(address.sheetId, address.path.slice(0, length));

    if (ancestor === null || records.get(blockKeyOf(ancestor))?.d == null) return false;
  }

  return true;
}

export function fieldPatchTargetOf(
  sheetId: string,
  target: WireFieldPatchTarget,
): AddressFieldPatchTarget | null {
  const block = blockAddressOfWireTarget(sheetId, target);

  if (block === null) {
    return null;
  }

  return { kind: 'rep', block };
}

export function wireFieldPatchTargetOf(target: AddressFieldPatchTarget): WireBlockTarget {
  const wireTarget = wireBlockTargetOf(target.block);

  return wireTarget;
}

export function wireBlockTargetOf(address: BlockAddress): WireBlockTarget {
  const sectionId = sectionIdOf(address);
  const instanceId = blockIdOf(address);

  if (sectionId === null || instanceId === null) {
    throw new Error('A repeat target must name a block');
  }

  return address.path.length > 2
    ? { sectionId, instanceId, path: [...address.path] }
    : { sectionId, instanceId };
}

export function wirePathOf(address: BlockAddress): string[] | undefined {
  return address.path.length === 0 ? undefined : [...address.path];
}
