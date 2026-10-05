/**
 * Arabic-first app UI (arabase): the React app chrome — sidebar, settings,
 * showcase workspace — is Arabic in the Arabic UI and unchanged in English.
 */
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import {
  openAppearancePanel,
  openEditorSetting,
  openSettingModal,
} from '@affine-test/kit/utils/setting';
import { type BrowserContext, expect, type Page } from '@playwright/test';

/** Opt this context into Arabic (the kit pins English for other suites). */
async function useArabic(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('arabase:locale', 'ar');
  });
}

async function openAppearance(page: Page) {
  await openSettingModal(page);
  await openAppearancePanel(page);
}

/**
 * Show all docs as cards and return the x of the first two cards. The view
 * toggle lists masonry, grid and list in that order.
 */
async function firstTwoCardsX(page: Page, view: 'masonry' | 'grid') {
  await page.getByTestId('all-pages').click();
  await page
    .getByRole('radio')
    .nth(view === 'masonry' ? 0 : 1)
    .click();
  const cards = page.getByTestId('doc-list-item');
  await expect(cards.nth(1)).toBeVisible();
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  return [first?.x ?? 0, second?.x ?? 0];
}

test.describe('Arabic UI', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('showcase workspace and sidebar are Arabic', async ({ page }) => {
    await expect(page.getByTestId('current-workspace-card')).toContainText(
      'مساحة العمل التجريبية'
    );
    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar).toContainText('كل المستندات');
    await expect(sidebar).toContainText('اليوميات');
    await expect(sidebar).toContainText('سلة المهملات');
    await expect(sidebar).not.toContainText('All docs');
  });

  test('appearance settings: language list and font picker', async ({
    page,
  }) => {
    await openAppearance(page);
    const modal = page.getByTestId('setting-modal');
    await expect(modal).toContainText('إعدادات المظهر');

    // Only Arabic and English, both complete: no completeness percentage.
    await page.getByTestId('language-menu-button').click();
    const languages = page.locator('[role="menuitem"][lang]');
    await expect(languages).toHaveCount(2);
    await expect(languages.filter({ hasText: '%' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('font-setting')).toContainText('الخط');
    await expect(page.getByTestId('font-menu-button')).toContainText(
      'ثمانية (افتراضي)'
    );
    await page.getByTestId('font-menu-button').click();
    await expect(page.getByTestId('font-option-noto')).toContainText(
      'نوتو سانس عربي'
    );
    await expect(page.getByTestId('font-option-system')).toContainText(
      'خطوط النظام'
    );
    // Each option previews its own typeface.
    await expect(page.getByTestId('font-option-thmanyah')).toHaveCSS(
      'font-family',
      /Thmanyah Sans/
    );
  });

  test('editor settings: text direction shortcut switch', async ({ page }) => {
    await openEditorSetting(page);
    const modal = page.getByTestId('setting-modal');
    await expect(modal).toContainText('اختصار اتجاه النص');
    const toggle = page.getByTestId('text-direction-shortcut-trigger');
    await expect(toggle.locator('input')).toBeChecked();
    await toggle.click();
    await expect(toggle.locator('input')).not.toBeChecked();
    await toggle.click();
    await expect(toggle.locator('input')).toBeChecked();
  });

  for (const view of ['grid', 'masonry'] as const) {
    test(`doc cards (${view}) flow from the right`, async ({ page }) => {
      const [first, second] = await firstTwoCardsX(page, view);
      expect(first).toBeGreaterThan(second);
    });
  }

  test('right sidebar toggle is Arabic', async ({ page }) => {
    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.getByTestId('right-sidebar-toggle').hover();
    await expect(page.getByRole('tooltip')).toContainText('فتح الشريط الجانبي');
  });
});

test.describe('English UI', () => {
  test('doc cards flow from the left', async ({ page }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    const [first, second] = await firstTwoCardsX(page, 'grid');
    expect(first).toBeLessThan(second);
  });

  test('stays English', async ({ page }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await expect(page.getByTestId('current-workspace-card')).toContainText(
      'Demo Workspace'
    );
    await expect(page.getByTestId('app-sidebar')).toContainText('All docs');

    await openAppearance(page);
    await expect(page.getByTestId('font-setting')).toContainText(
      'Typeface of the interface and documents.'
    );
    await expect(page.getByTestId('font-menu-button')).toContainText(
      'Thmanyah (default)'
    );
    await page.getByTestId('editor-panel-trigger').click();
    await expect(page.getByTestId('setting-modal')).toContainText(
      'Text direction shortcut'
    );
  });
});
