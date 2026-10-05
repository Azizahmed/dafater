/**
 * Arabic-first database block (arabase): Arabic UI strings, right-to-left
 * table layout, and the English UI left unchanged.
 */
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { type BrowserContext, expect, type Page } from '@playwright/test';

/** Opt this context into Arabic (the kit pins English for other suites). */
async function useArabic(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('arabase:locale', 'ar');
  });
}

async function insertDatabase(page: Page) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('Enter');
  // The English command keeps working in the localized slash menu.
  await page.keyboard.type('/database', { delay: 20 });
  await expect(page.locator('.slash-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  const database = page.locator('affine-database').first();
  await expect(database).toBeVisible();
  // A second column, created with a default name in the UI language.
  await database.locator('.header-add-column-button').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(
    database.locator('affine-database-header-column').nth(1)
  ).toBeVisible();
  return database;
}

/** Left edges of the header columns, in DOM (reading) order. */
async function headerLefts(page: Page) {
  const headers = page.locator('affine-database affine-database-header-column');
  await expect(headers.first()).toBeVisible();
  return headers.evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().left)
  );
}

test.describe('database in the Arabic UI', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('shows Arabic strings and lays the table out right to left', async ({
    page,
  }) => {
    const database = await insertDatabase(page);

    await expect(database).toHaveCSS('direction', 'rtl');
    await expect(
      database.locator('affine-database-header-column').first()
    ).toContainText('العنوان');
    await expect(database.locator('data-view-header-views')).toContainText(
      'عرض جدول'
    );
    await expect(
      database.locator('.data-view-table-group-add-row')
    ).toContainText('صف جديد');

    // New columns are named in Arabic.
    await expect(
      database.locator('affine-database-header-column').nth(1)
    ).toContainText('عمود');

    // The title column is the right-most one; the next column is on its left.
    const [title, next] = await headerLefts(page);
    expect(title).toBeGreaterThan(next);

    // The column menu is translated, with the visual sides swapped in RTL.
    await database.locator('affine-database-header-column').nth(1).click();
    const menu = page.locator('affine-menu').last();
    await expect(menu).toContainText('إخفاء من العرض');
    await expect(menu).toContainText('إدراج عمود يمينًا');
    await expect(menu).toContainText('ترتيب تصاعدي');
  });

  test('a database with English content stays left to right', async ({
    page,
  }) => {
    const database = await insertDatabase(page);
    await database.locator('affine-database-title textarea').click();
    await page.keyboard.type('Project tasks');
    await page.keyboard.press('Enter');

    await expect(database).toHaveCSS('direction', 'ltr');
    const [title, next] = await headerLefts(page);
    expect(title).toBeLessThan(next);
  });
});

test.describe('database in the English UI', () => {
  test('keeps English strings and the left-to-right layout', async ({
    page,
  }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    const database = await insertDatabase(page);

    await expect(database).toHaveCSS('direction', 'ltr');
    await expect(
      database.locator('affine-database-header-column').first()
    ).toContainText('Title');
    await expect(
      database.locator('.data-view-table-group-add-row')
    ).toContainText('New Record');
    const [title, next] = await headerLefts(page);
    expect(title).toBeLessThan(next);
  });
});
