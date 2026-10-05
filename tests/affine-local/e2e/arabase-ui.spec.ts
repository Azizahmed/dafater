/**
 * Arabic-first editor chrome (arabase): BlockSuite's shared widgets and
 * components are translated and laid out right-to-left in Arabic.
 */
import { test } from '@affine-test/kit/playwright';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
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

async function newDocWithText(page: Page, text: string) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
}

test.describe('editor chrome in Arabic', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('format toolbar is translated and mirrored', async ({ page }) => {
    await newDocWithText(page, 'نص عربي للتجربة');
    await page.keyboard.press('Shift+Home');

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    const bold = toolbar.locator('editor-icon-button[data-testid="bold"]');
    const italic = toolbar.locator('editor-icon-button[data-testid="italic"]');
    await expect(bold).toHaveAttribute('aria-label', 'عريض');

    // Actions are laid out right-to-left: Bold comes before Italic and the
    // "more" menu is at the far left.
    await expect(italic).toBeVisible();
    const [boldX, italicX, moreX] = await toolbar.evaluate(el =>
      [
        '[data-testid="bold"]',
        '[data-testid="italic"]',
        'editor-menu-button[aria-label="قائمة المزيد"]',
      ].map(selector => el.querySelector(selector)!.getBoundingClientRect().x)
    );
    expect(boldX).toBeGreaterThan(italicX);
    expect(moreX).toBeLessThan(italicX);

    await expect(bold.locator('affine-tooltip')).toContainText('عريض');
  });

  test('slash menu opens from the caret towards the left', async ({ page }) => {
    await newDocWithText(page, '');
    await page.keyboard.type('/');
    const menu = page.locator('inner-slash-menu .slash-menu').first();
    await expect(menu).toBeVisible();

    const paragraphBox = await page
      .locator('affine-paragraph')
      .last()
      .boundingBox();
    const menuBox = await menu.boundingBox();
    // Anchored at the caret (right edge of the empty RTL paragraph).
    expect(
      Math.abs(
        menuBox!.x + menuBox!.width - (paragraphBox!.x + paragraphBox!.width)
      )
    ).toBeLessThan(30);

    // Sub-menu arrows point left.
    const arrow = menu.locator('.sub-menu-arrow').first();
    await expect(arrow).toHaveCSS('transform', /^matrix\([^,]+, 1, -1,/);
  });

  test('date picker uses Arabic names and an RTL grid', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('date-picker') as HTMLElement & {
        value?: number;
      };
      el.value = new Date(2026, 9, 5).getTime();
      el.id = 'arabase-date-picker';
      document.body.append(el);
    });
    const picker = page.locator('#arabase-date-picker');
    await expect(
      picker.locator('.date-picker-header__date').first()
    ).toHaveText('أكتوبر');
    await expect(picker.locator('.days-header .date-cell').first()).toHaveText(
      'ح'
    );
    await expect(picker.locator('.action-label.today')).toHaveText('اليوم');

    // Sunday is the rightmost column.
    const days = picker.locator('.days-header .date-cell');
    const sunday = await days.nth(0).boundingBox();
    const monday = await days.nth(1).boundingBox();
    expect(sunday!.x).toBeGreaterThan(monday!.x);

    // In RTL, ArrowLeft moves to the next day.
    await picker.locator('button.date-cell[tabindex="0"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(picker.locator('button.date-cell[tabindex="0"]')).toHaveText(
      '6'
    );
  });

  test('edgeless toolbars are translated and mirrored', async ({ page }) => {
    await newDocWithText(page, 'نص');
    await clickEdgelessModeButton(page);

    // The zoom controls sit at the bottom-right in RTL.
    const zoom = page.locator('affine-edgeless-zoom-toolbar-widget');
    const zoomBox = await zoom.boundingBox();
    const viewport = page.viewportSize()!;
    expect(zoomBox!.x).toBeGreaterThan(viewport.width / 2);

    const toggle = page.locator(
      'zoom-bar-toggle-button .toggle-button > edgeless-tool-icon-button'
    );
    if (await toggle.isVisible()) {
      await expect(toggle.locator('affine-tooltip')).toContainText(
        'إظهار شريط التكبير أو إخفاؤه'
      );
    } else {
      await expect(
        page
          .locator('edgeless-zoom-toolbar edgeless-tool-icon-button')
          .first()
          .locator('affine-tooltip')
      ).toContainText('ملاءمة الشاشة');
    }

    // Tool tooltips (with shortcuts) are Arabic.
    await expect(
      page.locator(
        'edgeless-frame-tool-button affine-tooltip-content-with-shortcut'
      )
    ).toContainText('إطار');
  });
});
