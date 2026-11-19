import {
  expandedTabs,
  repeatSectionByPath,
  type RenderedTab,
  type TabBlock,
  type TemplateLayout,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { childAddress, sameAddress, sheetRootAddress } from '@/core/block-address';
import { repeatBlocks } from '@/core/sheet-values';
import { repeatBlockName } from '@/core/sheets';

export function renderedTabs(
  template: TemplateLayout,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
): RenderedTab[] {
  const blocks = new Map<string, TabBlock[]>();

  for (const tab of template.tabs) {
    const scopeId = tab.repeat?.id;

    if (scopeId === undefined) continue;

    const section = repeatSectionByPath(template, [scopeId]);

    if (section === null) continue;

    blocks.set(
      scopeId,
      repeatBlocks(records, sheetRootAddress(sheetId), scopeId).map((block) => ({
        block: childAddress(sheetRootAddress(sheetId), scopeId, block.instanceId),
        name: repeatBlockName(records, sheetId, section, block.instanceId, [
          scopeId,
          block.instanceId,
        ]),
      })),
    );
  }

  return expandedTabs(template, blocks);
}

export function sameRenderedTab(first: RenderedTab, second: RenderedTab): boolean {
  if (first.sourceIndex !== second.sourceIndex) {
    return false;
  }

  if (first.block === null || second.block === null) {
    return first.block === second.block;
  }

  return sameAddress(first.block.block, second.block.block);
}
