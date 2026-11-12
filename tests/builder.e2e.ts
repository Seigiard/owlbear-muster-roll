import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { parsePresetFile } from '@/core/preset';
import { copy } from '@/ui/copy';

import { openBackground } from './support/room';

// TASK-38: the preset builder page (CAP-20 to CAP-28). It runs with no Owlbear and no background
// page; the window and its background take part only where a file goes into a room.

const PAGE = '/builder.html';

const D6_POOL_TEXT = readFileSync('tests/fixtures/presets/d6-pool.json', 'utf8');

const DOWNLOAD_NAME = /^preset-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

const builder = copy.builder;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
});

function tree(page: Page): Locator {
  return page.getByRole('treegrid', { name: builder.structure });
}

function item(page: Page, name: string): Locator {
  return tree(page).getByRole('row', { name, exact: true });
}

function form(page: Page): Locator {
  return page.locator('[data-builder-form]');
}

function preview(page: Page): Locator {
  return page.locator('[data-preview-frame]');
}

function problemCounter(page: Page, count: number): Locator {
  return page.getByRole('button', { name: builder.problemsName(count) });
}

function downloadButton(page: Page): Locator {
  return page.getByRole('button', { name: copy.command.downloadPreset });
}

// React Aria restores the tree's scroll on focus from its last scroll event, which comes a frame
// after Playwright scrolls an item into view. The item is clicked once that event has come.
async function pick(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await target.page().evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await target.click();
}

// The tree rows by their accessible names, so the add items' "+" marks stay out.
async function rowNames(page: Page): Promise<(string | null)[]> {
  return tree(page)
    .getByRole('row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));
}

// A drag by the mouse in small steps, so React Aria sees each row it passes.
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );

  const from = await source.boundingBox();
  const to = await target.boundingBox();

  if (from === null || to === null) {
    throw new Error('The drag needs both rows on the screen.');
  }

  await page.mouse.move(from.x + from.width / 3, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 3 + 10, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 3, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

async function openFromMenu(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: builder.open }).click();
  await page.getByRole('menuitem', { name: label }).click();
}

async function openFile(page: Page, name: string, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');

  await openFromMenu(page, builder.openFile);

  const chooser = await choosing;

  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

// The builder's dev server serves the window too, so a test can load a file into a mock room.
async function openWindowAndBackground(page: Page, context: BrowserContext): Promise<void> {
  await page.goto('/index.html');
  await openBackground(context);
  await expect(page.getByRole('button', { name: copy.command.loadPreset })).toBeVisible();
}

test('opens on the empty preset: one problem, download off, and the empty preview', async ({
  page,
}) => {
  // #when
  await page.goto(PAGE);

  // #then
  expect(await rowNames(page)).toEqual([
    builder.windowItem(600, 600),
    builder.addSet,
    builder.addSingle,
  ]);
  await expect(problemCounter(page, 1)).toBeVisible();
  await expect(downloadButton(page)).toBeDisabled();
  await expect(page.getByText(builder.downloadDisabled)).toBeVisible();
  await expect(page.getByText(builder.emptyPreset)).toBeVisible();
  await expect(page.getByRole('heading', { name: builder.preview(600, 600) })).toBeVisible();
});

test('builds a preset with the tree and the forms, and the window loads the downloaded file', async ({
  page,
  context,
}) => {
  // #given
  await page.goto(PAGE);

  // #when: a sheet set "Экипаж" with a section of three columns.
  await pick(item(page, builder.addSet));
  await form(page).getByRole('textbox', { name: builder.form.title }).fill('Экипаж');
  await pick(item(page, builder.addSection));
  await form(page).getByRole('textbox', { name: builder.form.title }).fill('Характеристики');
  await form(page).getByRole('textbox', { name: builder.form.columns }).fill('3');

  // #then: the preview redraws at once.
  await expect(preview(page).getByRole('heading', { name: 'Характеристики' })).toBeVisible();

  // #when: a row with the label "Сила", a field and a dice cell.
  await pick(item(page, builder.addRow).last());
  await pick(item(page, builder.addLabel).last());
  await form(page).getByRole('textbox', { name: builder.form.text }).fill('Сила');
  await pick(item(page, builder.addField).last());

  // #then: the field takes its id from the label.
  await expect(form(page).getByRole('textbox', { name: builder.form.fieldId })).toHaveValue('sila');

  // #when
  await pick(item(page, builder.addDice).last());
  await form(page).getByRole('combobox', { name: builder.form.formula }).fill('1d20 <= sila');

  // #then
  await expect(preview(page).getByRole('button', { name: 'Сила' })).toBeVisible();
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('sila');

  // #when: the id is renamed, and the formula follows.
  await pick(item(page, `sila · ${builder.form.typeNumber}`));
  await expect(form(page).getByText(builder.form.fieldUses(1))).toBeVisible();
  await form(page).getByRole('textbox', { name: builder.form.fieldId }).fill('str');
  await form(page).getByRole('textbox', { name: builder.form.fieldId }).press('Enter');

  // #then
  await expect(form(page).getByText(builder.formulasChanged(1))).toBeVisible();
  await expect(item(page, '1d20 <= str')).toBeVisible();

  // #when: the label changes, and the id stays.
  await pick(item(page, 'Сила'));
  await form(page).getByRole('textbox', { name: builder.form.text }).fill('Мощь');

  // #then
  await expect(item(page, `str · ${builder.form.typeNumber}`)).toBeVisible();

  // #when: a window size of its own.
  await pick(item(page, builder.windowItem(600, 600)));
  await form(page).getByRole('checkbox', { name: builder.form.ownWindowSize }).check();
  await form(page).getByRole('textbox', { name: builder.form.width }).fill('800');

  // #then
  await expect(page.getByRole('heading', { name: builder.preview(800, 600) })).toBeVisible();
  await expect(page.getByText(builder.noProblems)).toBeVisible();

  // #when
  const downloading = page.waitForEvent('download');

  await downloadButton(page).click();

  const download = await downloading;
  const path = await download.path();
  const text = readFileSync(path, 'utf8');

  // #then
  expect(download.suggestedFilename()).toMatch(DOWNLOAD_NAME);
  expect(parsePresetFile(text)).toEqual({
    ok: true,
    value: {
      v: 2,
      window: { width: 800, height: 600 },
      templates: [
        {
          id: 'nabor',
          kind: 'set',
          title: 'Экипаж',
          nameField: 'imya',
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Имя' },
                  { kind: 'field', type: 'text', id: 'imya' },
                ],
              ],
            },
            {
              title: 'Характеристики',
              columns: 3,
              rows: [
                [
                  { kind: 'text', text: 'Мощь' },
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'dice', formula: '1d20 <= str' },
                ],
              ],
            },
          ],
        },
      ],
    },
  });

  // #when: the file goes through "Загрузить пресет" in an empty room.
  const window = await context.newPage();

  await openWindowAndBackground(window, context);

  const choosing = window.waitForEvent('filechooser');

  await window.getByRole('button', { name: copy.command.loadPreset }).click();
  await (await choosing).setFiles(path);

  // #then
  await expect(window.getByRole('button', { name: copy.label.addToSet('Экипаж') })).toBeVisible();
});

test('opens the draft again after a reload, with no prompt', async ({ page }) => {
  // #given
  await page.goto(PAGE);
  await pick(item(page, builder.addSingle));
  await form(page).getByRole('textbox', { name: builder.form.title }).fill('Инвентарь');
  await expect(page.getByText(builder.draftSaved)).toBeVisible();

  // #when
  await page.reload();

  // #then
  await expect(item(page, `Инвентарь · ${builder.form.kindSingle}`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(form(page).getByRole('textbox', { name: builder.form.title })).toHaveValue(
    'Инвентарь',
  );
  await expect(page.getByRole('group', { name: /Черновик будет заменён/ })).toHaveCount(0);
});

test('a file replaces the draft after one confirmation, and a refused file changes nothing', async ({
  page,
}) => {
  // #given
  await page.goto(PAGE);
  await pick(item(page, builder.addSingle));

  // #when
  await openFile(page, 'd6-pool-2026-11-01-1200.json', D6_POOL_TEXT);

  // #then
  await expect(page.getByText(builder.replaceDraft('d6-pool-2026-11-01-1200.json'))).toBeVisible();
  await expect(item(page, `${builder.newSingleTitle} · ${builder.form.kindSingle}`)).toBeVisible();

  // #when
  await page.getByRole('button', { name: builder.confirmOpen, exact: true }).click();

  // #then
  await expect(item(page, `Экипаж · ${builder.form.kindSet}`)).toBeVisible();
  await expect(item(page, `Список заклинаний · ${builder.form.kindSingle}`)).toBeVisible();
  await expect(item(page, `${builder.newSingleTitle} · ${builder.form.kindSingle}`)).toHaveCount(0);
  await expect(preview(page).getByRole('tab')).toHaveText([
    'name',
    'NPC',
    'Инвентарь',
    'Список заклинаний',
  ]);

  // #when: a refused file.
  await openFile(page, 'broken.json', '{');

  // #then
  await expect(page.getByText('Файл не подошёл: это не JSON. Ничего не изменено.')).toBeVisible();
  await expect(item(page, `Экипаж · ${builder.form.kindSet}`)).toBeVisible();

  // #when: an id the file had is renamed.
  await pick(item(page, `str · ${builder.form.typeNumber}`));
  await form(page).getByRole('textbox', { name: builder.form.fieldId }).fill('sila');
  await form(page).getByRole('textbox', { name: builder.form.fieldId }).blur();

  // #then
  await expect(form(page).getByText(builder.fieldValuesErased('str'))).toBeVisible();

  // #when: the id of a template the file had changes.
  await pick(item(page, `Экипаж · ${builder.form.kindSet}`));
  await form(page).getByRole('textbox', { name: builder.form.id, exact: true }).fill('crew');
  await form(page).getByRole('textbox', { name: builder.form.id, exact: true }).blur();

  // #then
  await expect(form(page).getByText(builder.templateSheetsDeleted('pc'))).toBeVisible();

  // #when: the download takes the file's name with no earlier time.
  const downloading = page.waitForEvent('download');

  await downloadButton(page).click();

  // #then
  expect((await downloading).suggestedFilename()).toMatch(
    /^d6-pool-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  );
});

test('an example opens with no confirmation while the draft is empty', async ({ page }) => {
  // #given
  await page.goto(PAGE);

  // #when
  await openFromMenu(page, builder.openD20);

  // #then
  await expect(item(page, `Персонажи · ${builder.form.kindSet}`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('group', { name: /Черновик будет заменён/ })).toHaveCount(0);
});

test('each problem marks its tree item and preview cell, and the counter goes to the first', async ({
  page,
}) => {
  // #given
  await page.goto(PAGE);
  await openFromMenu(page, builder.openD20);
  await expect(page.getByText(builder.noProblems)).toBeVisible();

  // #when
  await pick(item(page, '1d20+str').first());
  await form(page).getByRole('combobox', { name: builder.form.formula }).fill('1d20+');

  // #then
  await expect(problemCounter(page, 1)).toBeVisible();
  await expect(downloadButton(page)).toBeDisabled();
  await expect(item(page, '1d20+')).toHaveAttribute('data-problem', 'true');
  await expect(form(page).getByText('ошибка в формуле «1d20+»')).toBeVisible();

  const cell = preview(page).locator('[data-cell="1.0.3"] > *');

  await expect(cell).toHaveCSS('box-shadow', /.+px/);

  // #when: the selection moves away, and the counter takes it back.
  await pick(item(page, builder.windowItem(600, 600)));
  await problemCounter(page, 1).click();

  // #then
  await expect(item(page, '1d20+')).toBeFocused();
  await expect(item(page, '1d20+')).toHaveAttribute('aria-selected', 'true');
});

test('a too-wide row is marked in the preview, and a click on a section heading selects it', async ({
  page,
}) => {
  // #given
  await page.goto(PAGE);
  await openFromMenu(page, builder.openD20);

  // #when: "Характеристики" gets fewer columns than its rows have cells.
  await pick(item(page, 'Характеристики'));
  await form(page).getByRole('textbox', { name: builder.form.columns }).fill('3');

  // #then
  await expect(problemCounter(page, 2)).toBeVisible();
  await expect(
    preview(page).locator('[data-section-index="1"] [data-row-index="0"]').first(),
  ).toHaveCSS('box-shadow', /2px/);

  // #when
  await preview(page).getByRole('heading', { name: 'Хиты' }).click();

  // #then: the section, not its label of the same text.
  await expect(item(page, 'Хиты').and(page.locator('[aria-level="2"]'))).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('the formula input completes a field id', async ({ page }) => {
  // #given
  await page.goto(PAGE);
  await openFromMenu(page, builder.openD20);
  await pick(item(page, '1d20+str').first());

  const formula = form(page).getByRole('combobox', { name: builder.form.formula });

  // #when
  await formula.fill('');
  await formula.pressSequentially('1d20+dex_');

  // #then
  await expect(
    page.getByRole('listbox', { name: builder.form.completions }).getByRole('option'),
  ).toHaveText(['dex_save']);

  // #when
  await formula.press('Enter');

  // #then
  await expect(formula).toHaveValue('1d20+dex_save');
});

test('a click on a preview cell selects its tree item', async ({ page }) => {
  // #given
  await page.goto(PAGE);
  await openFromMenu(page, builder.openD20);

  // #when
  await preview(page).getByRole('button', { name: 'Сила' }).click();

  // #then
  await expect(item(page, '1d20+str').first()).toHaveAttribute('aria-selected', 'true');

  // #when: a click on another tab selects that template.
  await preview(page).getByRole('tab', { name: 'NPC' }).click();

  // #then
  await expect(item(page, `NPC · ${builder.form.kindSingle}`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(preview(page).getByRole('heading', { name: 'NPC', level: 1 })).toBeVisible();
});

test('undo and redo each change, and typing in one input is one step', async ({ page }) => {
  // #given
  await page.goto(PAGE);
  await pick(item(page, builder.addSet));

  const title = form(page).getByRole('textbox', { name: builder.form.title });

  // #when
  await title.selectText();
  await title.pressSequentially('Экипаж');
  await title.blur();
  await page.getByRole('button', { name: builder.undo }).click();

  // #then
  await expect(item(page, `${builder.newSetTitle} · ${builder.form.kindSet}`)).toBeVisible();

  // #when
  await page.getByRole('button', { name: builder.redo }).click();

  // #then
  await expect(item(page, `Экипаж · ${builder.form.kindSet}`)).toBeVisible();

  // #when: the keys undo outside text inputs.
  await pick(item(page, builder.addSection));
  await expect(tree(page).getByRole('row', { name: builder.untitledSection })).toHaveCount(2);
  await pick(item(page, builder.windowItem(600, 600)));
  await page.keyboard.press('ControlOrMeta+z');

  // #then
  await expect(tree(page).getByRole('row', { name: builder.untitledSection })).toHaveCount(1);

  // #when
  await page.keyboard.press('ControlOrMeta+Shift+z');

  // #then
  await expect(tree(page).getByRole('row', { name: builder.untitledSection })).toHaveCount(2);
});

test('drags a row out of a repeat section, and the emptied repeat section shows as a problem', async ({
  page,
}) => {
  // #given
  await page.goto(PAGE);
  await openFromMenu(page, builder.openD20);
  await expect(page.getByText(builder.noProblems)).toBeVisible();

  const names = await rowNames(page);

  const row = tree(page)
    .getByRole('row')
    .nth(names.indexOf('Вещи') + 1);

  await expect(row).toHaveAttribute('aria-label', builder.rowItem(1));

  // #when: the row of "Вещи" goes into "Деньги", away from the tree's edges where it scrolls.
  await item(page, 'Вещи').evaluate((element) => {
    const scroller = element.closest('[data-builder-tree]');

    if (scroller instanceof HTMLElement && element instanceof HTMLElement) {
      scroller.scrollTop = element.offsetTop - scroller.offsetTop;
    }
  });
  await dragOnto(page, row, item(page, 'Деньги'));

  // #then
  const after = await rowNames(page);
  const emptied = after.indexOf('Вещи');
  const money = after.indexOf('Деньги');

  expect(after.slice(emptied, emptied + 2)).toEqual(['Вещи', builder.addRow]);
  expect(after.slice(money, money + 13)).toEqual([
    'Деньги',
    builder.rowItem(1),
    'Золото',
    `gold · ${builder.form.typeNumber}`,
    builder.addLabel,
    builder.addField,
    builder.addDice,
    builder.rowItem(2),
    'Вещь',
    `item · ${builder.form.typeText}`,
    'Количество',
    `qty · ${builder.form.typeNumber}`,
    builder.addLabel,
  ]);
  await expect(problemCounter(page, 1)).toBeVisible();
  await expect(item(page, 'Вещи')).toHaveAttribute('data-problem', 'true');
});

test('Settings in the window links to the builder in a new tab', async ({ page, context }) => {
  // #given
  await openWindowAndBackground(page, context);

  // #when
  await page.getByRole('button', { name: copy.place.settings }).click();

  // #then
  const link = page.getByRole('link', { name: builder.settingsLink });

  await expect(link).toHaveAttribute('href', '/builder.html');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
  await expect(link).toHaveAccessibleDescription(builder.settingsHint);
});

test('the theme follows the switch and the browser keeps it', async ({ page }) => {
  // #given
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(PAGE);

  const toggle = page.getByRole('switch', { name: builder.lightTheme });

  await expect(toggle).not.toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'DARK');

  // #when
  await toggle.check();
  await page.reload();

  // #then
  await expect(page.getByRole('switch', { name: builder.lightTheme })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'LIGHT');
});
