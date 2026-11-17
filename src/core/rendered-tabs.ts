import {
  expandedTabs,
  repeatSectionById,
  type RenderedTab,
  type TabBlock,
  type TemplateLayout,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
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

    const section = repeatSectionById(template, scopeId);

    if (section === null) continue;

    blocks.set(
      scopeId,
      repeatBlocks(records, sheetId, scopeId).map((block) => ({
        scopeId,
        instanceId: block.instanceId,
        name: repeatBlockName(records, sheetId, section, block.instanceId),
      })),
    );
  }

  return expandedTabs(template, blocks);
}
