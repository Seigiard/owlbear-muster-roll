import { describe, expect, test } from 'bun:test';

import type { Image, Item, TextContent } from '@owlbear-rodeo/sdk';

import { itemLabel, writeItemLabel } from './item-label';

describe('itemLabel', () => {
  test.each<[string, Item[], string | null]>([
    ['an image with a label', [imageItem('Гоблин 2')], 'Гоблин 2'],
    ['an image with an empty label', [imageItem('')], ''],
    ['a missing item', [], null],
    ['a drawing, which has no text', [drawingItem()], null],
    ['a text item, not an image', [{ ...imageItem('Note'), type: 'TEXT' }], null],
    [
      'a rich label, from its rich text',
      [richImageItem('Гоблин', ['Гоблин', 'вожак'])],
      'Гоблин\nвожак',
    ],
    ['an image with no text', [{ ...baseItem('t1', 'CHARACTER'), type: 'IMAGE' }], null],
    [
      'an image whose text type is unknown',
      [imageWithText({ ...textContent('Гоблин', 'PLAIN'), type: 'HTML' })],
      null,
    ],
    [
      'an image whose plain text is no string',
      [imageWithText({ ...textContent('', 'PLAIN'), plainText: 7 })],
      null,
    ],
    ['only another item', [{ ...imageItem('Гоблин'), id: 't2' }], null],
    [
      'the item next to another one',
      [{ ...imageItem('Гоблин'), id: 't2' }, imageItem('Арагорн')],
      'Арагорн',
    ],
    ['the item twice', [imageItem('Гоблин'), imageItem('Арагорн')], null],
  ])('reads %s', (_name, items, expected) => {
    // #when
    const label = itemLabel(items, 't1');

    // #then
    expect(label).toBe(expected);
  });
});

describe('writeItemLabel', () => {
  test('sets the plain text, one paragraph of rich text and the plain type, and keeps every other field', () => {
    // #given
    const draft = richImageItem('Гоблин 2', ['Гоблин', 'вожак']);

    const expected: Image = {
      ...richImageItem('Гоблин 2', ['Гоблин', 'вожак']),
      text: {
        ...textContent('Гоблин 2', 'RICH'),
        plainText: 'Арагорн',
        richText: [{ type: 'paragraph', children: [{ text: 'Арагорн' }] }],
        type: 'PLAIN',
      },
    };

    // #when
    const written = writeItemLabel(draft, 'Арагорн');

    // #then
    expect({ written, draft }).toEqual({ written: true, draft: expected });
  });

  test('leaves a non-image item as it is', () => {
    // #given
    const draft = drawingItem();

    // #when
    const written = writeItemLabel(draft, 'Арагорн');

    // #then
    expect({ written, draft }).toEqual({ written: false, draft: drawingItem() });
  });

  test('leaves a text item as it is, though it has text', () => {
    // #given
    const draft: Item = { ...imageItem('Note'), type: 'TEXT' };

    // #when
    const written = writeItemLabel(draft, 'Арагорн');

    // #then
    expect({ written, draft }).toEqual({
      written: false,
      draft: { ...imageItem('Note'), type: 'TEXT' },
    });
  });
});

// An Owlbear image token as `getItems` returns it, with every field the SDK types.
function imageItem(plainText: string, type: TextContent['type'] = 'PLAIN'): Image {
  return {
    ...baseItem('t1', 'CHARACTER'),
    type: 'IMAGE',
    image: { width: 256, height: 256, mime: 'image/png', url: 'https://example.test/goblin.png' },
    grid: { offset: { x: 128, y: 128 }, dpi: 256 },
    text: textContent(plainText, type),
    textItemType: 'LABEL',
  };
}

// A rich label: one paragraph per line, and a plain text that may lag behind it.
function richImageItem(plainText: string, lines: readonly string[]): Image {
  return {
    ...imageItem(plainText, 'RICH'),
    text: {
      ...textContent(plainText, 'RICH'),
      richText: lines.map((line) => ({ type: 'paragraph', children: [{ text: line }] })),
    },
  };
}

// An image whose `text` breaks the SDK shape, as data from Owlbear could.
type BrokenText = { plainText: string | number; richText: TextContent['richText']; type: string };

function imageWithText(text: BrokenText): Item {
  const item = { ...baseItem('t1', 'CHARACTER'), type: 'IMAGE', text };

  return item;
}

function textContent(plainText: string, type: TextContent['type']): TextContent {
  return {
    richText: [{ type: 'paragraph', children: [{ text: plainText }] }],
    plainText,
    style: {
      fillColor: 'white',
      fillOpacity: 1,
      strokeColor: 'black',
      strokeOpacity: 1,
      strokeWidth: 0,
      textAlign: 'CENTER',
      textAlignVertical: 'BOTTOM',
      fontFamily: 'Roboto',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.5,
      padding: 8,
    },
    type,
    width: 'AUTO',
    height: 'AUTO',
  };
}

// An item with no text, as a drawn circle is.
function drawingItem(): Item {
  return { ...baseItem('d1', 'DRAWING'), type: 'SHAPE' };
}

function baseItem(id: string, layer: Item['layer']): Item {
  return {
    id,
    type: 'IMAGE',
    name: 'Goblin',
    visible: true,
    locked: false,
    createdUserId: 'gm',
    zIndex: 1,
    lastModified: '2026-11-11T00:00:00.000Z',
    lastModifiedUserId: 'gm',
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    metadata: { 'other.extension/data': 1 },
    layer,
  };
}
