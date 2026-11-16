import { describe, expect, test } from 'bun:test';
import { fromPreset, templateToPreset } from './document';
import {
  previewNavigationReducer,
  type PreviewNavigationState,
  type PreviewNavigationTemplate,
} from './preview-navigation';

function previewTemplate(uid: string, tabCount = 3): PreviewNavigationTemplate {
  const template = fromPreset({
    templates: [
      {
        id: 'preview',
        title: 'Preview',
        tabs: Array.from({ length: tabCount }, () => ({ sections: [] })),
      },
    ],
  }).templates[0];

  if (template === undefined) {
    throw new Error('Expected the preview document to include its template');
  }

  return { ...templateToPreset(template), uid };
}

describe('previewNavigationReducer', () => {
  test('keeps the shown tab when the selected item is on it', () => {
    // #given
    const template = previewTemplate('characters');
    const state: PreviewNavigationState = { template: 'characters', tab: 1 };

    // #when
    const shownTab = previewNavigationReducer(state, {
      type: 'selection-changed',
      template,
      selectedTab: { template: 'characters', tab: 1 },
    });

    // #then
    expect(shownTab).toEqual({ template: 'characters', tab: 1 });
  });
  test('switches to the tab of the selected item', () => {
    // #given
    const template = previewTemplate('characters');
    const state: PreviewNavigationState = { template: 'characters', tab: 1 };

    // #when
    const shownTab = previewNavigationReducer(state, {
      type: 'selection-changed',
      template,
      selectedTab: { template: 'characters', tab: 2 },
    });

    // #then
    expect(shownTab).toEqual({ template: 'characters', tab: 2 });
  });
  test('keeps the shown tab when the selection is outside all tabs', () => {
    // #given
    const template = previewTemplate('characters');
    const state: PreviewNavigationState = { template: 'characters', tab: 1 };

    // #when
    const shownTab = previewNavigationReducer(state, {
      type: 'selection-changed',
      template,
      selectedTab: null,
    });

    // #then
    expect(shownTab).toEqual({ template: 'characters', tab: 1 });
  });
  test('uses tab zero when the shown template has no tabs', () => {
    // #given
    const template = previewTemplate('empty', 0);
    const state: PreviewNavigationState = { template: 'characters', tab: 1 };

    // #when
    const shownTab = previewNavigationReducer(state, {
      type: 'selection-changed',
      template,
      selectedTab: null,
    });

    // #then
    expect(shownTab).toEqual({ template: 'empty', tab: 0 });
  });
  test('keeps the previous shown tab when no template is available', () => {
    // #given
    const state: PreviewNavigationState = { template: 'characters', tab: 1 };

    // #when
    const shownTab = previewNavigationReducer(state, {
      type: 'selection-changed',
      template: null,
      selectedTab: null,
    });

    // #then
    expect(shownTab).toEqual({ template: 'characters', tab: 1 });
  });
  test('keeps a null tab when the selected role can see no tabs', () => {
    // #given
    const template = previewTemplate('private');

    // #when
    const shownTab = previewNavigationReducer(null, {
      type: 'selection-changed',
      template,
      selectedTab: null,
      tabShown: () => false,
    });

    // #then
    expect(shownTab).toBeNull();
  });
});
