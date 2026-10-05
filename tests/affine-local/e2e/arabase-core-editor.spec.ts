/**
 * Arabic UI of Dafater's own editor integrations (AI menus and panels,
 * toolbar entries), localised through the Dafater editor catalog.
 */
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { openRightSideBar } from '@affine-test/kit/utils/sidebar';
import { type BrowserContext, expect, type Page } from '@playwright/test';

/** Opt this context into Arabic (the kit pins English for other suites). */
async function useArabic(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('arabase:locale', 'ar');
  });
}

/**
 * In Dafater the AI only appears once the server administrator enables it.
 * These tests cover the AI UI, so report the AI as enabled by the server.
 */
async function withServerAI(page: Page) {
  await page.route('**/graphql', async route => {
    if (!(route.request().postData() ?? '').includes('serverConfig')) {
      return route.continue();
    }
    const response = await route.fetch();
    const json = await response.json();
    const features = json?.data?.serverConfig?.features;
    if (Array.isArray(features) && !features.includes('Copilot')) {
      features.push('Copilot');
    }
    await route.fulfill({ response, json });
  });
}

async function newDocWithText(page: Page, text: string) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Shift+Home');
}

test.describe('editor integrations in Arabic', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await withServerAI(page);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('the Ask AI menu is translated and its sub-menus open to the left', async ({
    page,
  }) => {
    await newDocWithText(page, 'فقرة للتجربة.');
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    const askAI = toolbar.getByTestId('ask-ai-button');
    await expect(askAI).toContainText('اسأل ذكاء دفاتر');
    await askAI.click();

    await expect(
      page
        .locator('ai-panel-input textarea, affine-ai-panel-widget textarea')
        .first()
    ).toHaveAttribute('placeholder', 'بمَ تفكّر؟');
    const translate = page.getByTestId('action-translate');
    await expect(translate).toContainText('ترجمة إلى');
    await expect(page.getByTestId('action-fix-spelling')).toContainText(
      'تصحيح الإملاء'
    );

    await translate.hover();
    const french = page.getByTestId('action-translate-French');
    await expect(french).toHaveText('الفرنسية');
    // RTL: the sub-menu opens toward the inline end (left).
    const itemBox = (await translate.boundingBox())!;
    const subBox = (await french.boundingBox())!;
    expect(subBox.x + subBox.width).toBeLessThanOrEqual(itemBox.x + 1);
  });

  test('the toolbar more menu shows Dafater entries in Arabic', async ({
    page,
  }) => {
    await newDocWithText(page, 'فقرة للتجربة.');
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await toolbar
      .locator('editor-icon-button[aria-label="المزيد"]')
      .last()
      .click();
    await expect(
      page
        .locator('editor-menu-action')
        .filter({ hasText: 'نسخ رابط الكتلة' })
        .filter({ visible: true })
    ).toHaveCount(1);
  });

  test('the AI chat panel is Arabic and its input follows the typed text', async ({
    page,
  }) => {
    await newDocWithText(page, 'فقرة للتجربة.');
    await openRightSideBar(page, 'chat');
    const textarea = page.locator('ai-chat-input textarea').first();
    await expect(textarea).toHaveAttribute('placeholder', 'بمَ تفكّر؟');
    await expect(textarea).toHaveAttribute('dir', 'auto');
    await textarea.fill('Summarize this doc');
    await expect(textarea).toHaveCSS('direction', 'ltr');
    await textarea.fill('لخّص هذا المستند');
    await expect(textarea).toHaveCSS('direction', 'rtl');
  });
});
