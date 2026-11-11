import type { Descendant, Image, Item } from '@owlbear-rodeo/sdk';
import { z } from 'zod';

// One Slate node of `richText`: formatted text, or an element whose children are nodes.
const richTextNodeSchema = z.union([
  z.object({ text: z.string() }),
  z.object({
    type: z.string(),
    get children() {
      return z.array(richTextNodeSchema);
    },
  }),
]);

// The part of an Owlbear image item that holds the label shown under it: `text` of the SDK
// `TextContent` shape. Only an IMAGE item counts, as another item type may use its text otherwise.
const labelledItemSchema = z.object({
  type: z.literal('IMAGE'),
  text: z.object({
    plainText: z.string(),
    richText: z.array(richTextNodeSchema),
    type: z.enum(['PLAIN', 'RICH']),
  }),
});

// The label of the item `getItems([itemId])` returned, as Owlbear shows it: `plainText`, or the text
// of `richText` when the label is rich. `null` when that item is missing, comes more than once, or
// has no label text.
export function itemLabel(items: readonly Item[], itemId: string): string | null {
  const matching = items.filter((item) => item.id === itemId);
  const [item] = matching;

  if (matching.length !== 1 || item === undefined || !isLabelledItem(item)) {
    return null;
  }

  return item.text.type === 'RICH' ? richTextOf(item.text.richText) : item.text.plainText;
}

// Writes the label into an item draft as plain text, and as one paragraph of rich text, so a later
// switch to rich text does not bring the old label back. Keeps every other field. Leaves an item
// with no label text as it is and answers false.
export function writeItemLabel(draft: Item, label: string): boolean {
  if (!isLabelledItem(draft)) {
    return false;
  }

  draft.text.plainText = label;
  draft.text.richText = [{ type: 'paragraph', children: [{ text: label }] }];
  draft.text.type = 'PLAIN';

  return true;
}

// The SDK types every IMAGE item with text, but the data comes from Owlbear, so it is checked.
function isLabelledItem(item: Item): item is Image {
  return labelledItemSchema.safeParse(item).success;
}

// Blocks, such as paragraphs, go on lines of their own. Text runs within one block join as they are.
function richTextOf(nodes: readonly Descendant[]): string {
  const separator = nodes.some((node) => 'text' in node) ? '' : '\n';

  return nodes
    .map((node) => ('text' in node ? node.text : richTextOf(node.children)))
    .join(separator);
}
