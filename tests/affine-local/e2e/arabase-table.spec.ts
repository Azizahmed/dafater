/**
 * Arabic-first (arabase): the simple table block is laid out right-to-left
 * when its content is Arabic, and every interaction follows that layout.
 */
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

/** Opt this context into Arabic (the kit pins English for other suites). */
async function useArabic(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('arabase:locale', 'ar');
  });
}

async function newDocWithTable(page: Page, sentence: string) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type(sentence);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await expect(page.locator('affine-slash-menu .slash-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('affine-table')).toHaveCount(1);
}

function cell(page: Page, row: number, column: number): Locator {
  return page.locator(
    `affine-table tr:nth-child(${row + 1}) > affine-table-cell:nth-child(${column + 1}) td`
  );
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

async function typeInCell(
  page: Page,
  row: number,
  column: number,
  text: string
) {
  await cell(page, row, column).click();
  await page.keyboard.type(text);
}

async function columnTexts(page: Page) {
  return page
    .locator('affine-table tr:first-child td rich-text')
    .evaluateAll(texts =>
      texts.map(text => (text.textContent ?? '').replace(/\u200b/g, '').trim())
    );
}

test.describe('Arabic table', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('a table created after an Arabic sentence is RTL', async ({ page }) => {
    await newDocWithTable(page, 'هذه جملة عربية قبل الجدول');
    const table = page.locator('affine-table');
    // Empty: inherits the Arabic UI direction.
    await expect(table).toHaveCSS('direction', 'rtl');

    await typeInCell(page, 0, 0, 'الاسم');
    await typeInCell(page, 0, 1, 'المدينة');
    await expect(table).toHaveAttribute('dir', 'rtl');

    // The first column is on the right.
    const first = await box(cell(page, 0, 0));
    const second = await box(cell(page, 0, 1));
    expect(first.x).toBeGreaterThan(second.x);
    // The table starts at the inline-start (right) edge of the note.
    const paragraph = await box(
      page.locator('affine-paragraph', { hasText: 'هذه جملة عربية' })
    );
    expect(
      Math.abs(first.x + first.width - (paragraph.x + paragraph.width))
    ).toBeLessThan(4);

    // The add-column button is on the left (inline-end), add-row below.
    await cell(page, 0, 1).hover();
    const addColumn = page.getByTestId('add-column-button');
    expect(
      (await box(addColumn)).x + (await box(addColumn)).width
    ).toBeLessThan(second.x + 1);
    const addRow = await box(page.getByTestId('add-row-button'));
    expect(addRow.y).toBeGreaterThan(first.y + first.height);

    await addColumn.click();
    await expect(page.locator('affine-table tr:first-child td')).toHaveCount(3);
    const third = await box(cell(page, 0, 2));
    expect(third.x).toBeLessThan(second.x);
  });

  test('an English table in the Arabic UI is LTR', async ({ page }) => {
    await newDocWithTable(page, 'Plain English sentence');
    await typeInCell(page, 0, 0, 'Name');
    await typeInCell(page, 0, 1, 'City');
    await expect(page.locator('affine-table')).toHaveAttribute('dir', 'ltr');
    const first = await box(cell(page, 0, 0));
    const second = await box(cell(page, 0, 1));
    expect(first.x).toBeLessThan(second.x);
  });

  test('dragging the resize handle leftwards widens an RTL column', async ({
    page,
  }) => {
    await newDocWithTable(page, 'جدول للاختبار');
    await typeInCell(page, 0, 0, 'الاسم');
    await expect(page.locator('affine-table')).toHaveAttribute('dir', 'rtl');
    const before = await box(cell(page, 0, 0));

    await cell(page, 1, 0).hover();
    const handle = page.locator(
      'affine-table tr:nth-child(2) > affine-table-cell:nth-child(1) [data-width-adjust-column-id]'
    );
    const handleBox = await box(handle);
    // The handle is on the column's left (inline-end) edge.
    expect(Math.abs(handleBox.x + handleBox.width / 2 - before.x)).toBeLessThan(
      4
    );
    const y = handleBox.y + handleBox.height / 2;
    await page.mouse.move(handleBox.x + handleBox.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 20, y, { steps: 4 });
    await page.mouse.move(handleBox.x - 50, y, { steps: 4 });
    await page.mouse.up();

    await expect
      .poll(async () => (await box(cell(page, 0, 0))).width)
      .toBeGreaterThan(before.width + 40);
    // Its right (inline-start) edge did not move.
    const after = await box(cell(page, 0, 0));
    expect(
      Math.abs(after.x + after.width - (before.x + before.width))
    ).toBeLessThan(2);
  });

  test('column menu: Insert Left and Move Left follow the visual sides', async ({
    page,
  }) => {
    await newDocWithTable(page, 'جدول للاختبار');
    await typeInCell(page, 0, 0, 'أ');
    await typeInCell(page, 0, 1, 'ب');
    await expect(page.locator('affine-table')).toHaveAttribute('dir', 'rtl');

    await cell(page, 0, 0).hover();
    await cell(page, 0, 0).getByTestId('drag-column-handle').click();
    await page.getByText('إدراج يسارًا', { exact: true }).click();
    // A new empty column right after (visually left of) «أ».
    await expect.poll(() => columnTexts(page)).toEqual(['أ', '', 'ب']);

    await page.keyboard.press('Escape');
    await cell(page, 0, 0).hover();
    await cell(page, 0, 0).getByTestId('drag-column-handle').click();
    await page.getByText('نقل يسارًا', { exact: true }).click();
    await expect.poll(() => columnTexts(page)).toEqual(['', 'أ', 'ب']);
  });

  test('dragging a column to the left moves it towards the end', async ({
    page,
  }) => {
    await newDocWithTable(page, 'جدول للاختبار');
    await typeInCell(page, 0, 0, 'أ');
    await typeInCell(page, 0, 1, 'ب');
    await expect(page.locator('affine-table')).toHaveAttribute('dir', 'rtl');
    const last = await box(cell(page, 0, 1));

    await cell(page, 0, 0).hover();
    const handle = await box(
      cell(page, 0, 0).getByTestId('drag-column-handle')
    );
    const y = handle.y + handle.height / 2;
    await page.mouse.move(handle.x + handle.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(handle.x - 20, y, { steps: 4 });
    await page.mouse.move(last.x + 10, y, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => columnTexts(page)).toEqual(['ب', 'أ']);
  });

  test('mouse area selection covers the cells under the pointer', async ({
    page,
  }) => {
    await newDocWithTable(page, 'جدول للاختبار');
    await typeInCell(page, 0, 0, 'أ');
    await expect(page.locator('affine-table')).toHaveAttribute('dir', 'rtl');
    const from = await box(cell(page, 0, 0));
    const to = await box(cell(page, 1, 1));

    await page.mouse.move(from.x + from.width / 2, from.y + 15);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 15, { steps: 8 });

    // Checked while dragging: the selection under the pointer is what this
    // test is about (what happens on mouseup is direction-independent).
    const selection = await page
      .locator('affine-table')
      .evaluate(table => (table as any).selectionController.getSelected());
    expect(selection).toMatchObject({
      type: 'area',
      rowStartIndex: 0,
      rowEndIndex: 1,
      columnStartIndex: 0,
      columnEndIndex: 1,
    });
    // The selection outline covers both columns.
    const outline = await box(
      page.locator('affine-table-selection-layer > div')
    );
    expect(Math.abs(outline.x - to.x)).toBeLessThan(4);
    expect(
      Math.abs(outline.x + outline.width - (from.x + from.width))
    ).toBeLessThan(4);
    await page.mouse.up();
  });
});

test.describe('English UI table', () => {
  test('stays LTR with the add-column button on the right', async ({
    page,
  }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await newDocWithTable(page, 'An English sentence');
    await expect(page.locator('affine-table')).toHaveCSS('direction', 'ltr');
    const first = await box(cell(page, 0, 0));
    const second = await box(cell(page, 0, 1));
    expect(first.x).toBeLessThan(second.x);
    await cell(page, 0, 1).hover();
    const addColumn = await box(page.getByTestId('add-column-button'));
    expect(addColumn.x).toBeGreaterThan(second.x + second.width - 1);
  });
});
