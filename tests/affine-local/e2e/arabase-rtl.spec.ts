/**
 * Arabic-first behaviour (arabase): language & direction from the first
 * frame, runtime switching, and per-block writing direction in the editor.
 */
import { test } from '@affine-test/kit/playwright';
import { selectAllByKeyboard } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { openSettingModal } from '@affine-test/kit/utils/setting';
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

const HINT_KEY = 'arabase:locale';

/** Records every distinct `lang|dir` the page could have painted with. */
async function recordLocaleFrames(context: BrowserContext) {
  await context.addInitScript(() => {
    const frames: string[] = ((window as any).__localeFrames = []);
    const sample = () => {
      const html = document.documentElement;
      // Nothing can be painted before <body> exists.
      if (html && document.body) {
        const state = `${html.lang}|${html.dir}`;
        if (frames.at(-1) !== state) frames.push(state);
      }
      if (performance.now() < 20_000) requestAnimationFrame(sample);
    };
    sample();
  });
}

async function localeFrames(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__localeFrames);
}

/** Opt this context into Arabic (the kit pins English for other suites). */
async function useArabic(context: BrowserContext) {
  await context.addInitScript(key => {
    window.localStorage.setItem(key, 'ar');
  }, HINT_KEY);
}

async function newDocWithParagraph(page: Page) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('Enter');
}

function paragraph(page: Page, text: string): Locator {
  return page.locator('affine-paragraph', { hasText: text }).first();
}

test.describe('locale boot', () => {
  test('a fresh install renders Arabic, RTL, from the first frame', async ({
    browser,
  }) => {
    // A context without the English pin used by the other suites.
    const context = await browser.newContext({
      baseURL: 'http://localhost:8080/',
      viewport: { width: 1440, height: 800 },
    });
    await context.addInitScript(() => {
      window.localStorage.setItem('app_config', '{"onBoarding":false}');
      window.localStorage.setItem('dismissAiOnboarding', 'true');
      window.localStorage.setItem('dismissAiOnboardingLocal', 'true');
    });
    await recordLocaleFrames(context);
    const page = await context.newPage();

    // Not openHomePage(): it pins English for the upstream suites.
    await page.goto('/');
    await waitForEditorLoad(page);
    await expect(page.getByTestId('app-sidebar')).toContainText('كل المستندات');
    expect(await localeFrames(page)).toEqual(['ar|rtl']);
    expect(
      await page.evaluate(key => localStorage.getItem(key), HINT_KEY)
    ).toBe('ar');
    // UI primitives (Radix scroll areas, menus…) follow the app direction:
    // nothing outside the editor content is forced back to LTR.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[dir="ltr"]')]
          .filter(el => !el.closest('[data-affine-editor-container]'))
          .map(el => el.className)
      )
    ).toEqual([]);

    // Reload: still Arabic, still no other frame.
    await page.reload();
    await waitForEditorLoad(page);
    expect(await localeFrames(page)).toEqual(['ar|rtl']);
    await context.close();
  });

  test('a user who chose English never sees an Arabic/RTL frame', async ({
    page,
    context,
  }) => {
    await recordLocaleFrames(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
    await expect(page.getByTestId('app-sidebar')).toContainText('All docs');
    expect(await localeFrames(page)).toEqual(['en|ltr']);
  });

  test('switching the language updates direction without reload', async ({
    page,
  }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await openSettingModal(page);

    await page.getByTestId('language-menu-button').click();
    await page.locator('[role="menuitem"][lang="ar"]').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('language-menu-button')).toContainText(
      'العربية'
    );

    await page.getByTestId('language-menu-button').click();
    await page.locator('[role="menuitem"][lang="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('editor writing direction', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('blocks follow their content; empty blocks start RTL', async ({
    page,
  }) => {
    await newDocWithParagraph(page);

    // Empty paragraph in the Arabic UI: RTL, caret on the right.
    const empty = page.locator('affine-paragraph').last();
    await expect(empty).toHaveCSS('direction', 'rtl');

    await page.keyboard.type('هذه فقرة عربية فيها كلمة English ورقم 2026.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Plain English paragraph.');
    await page.keyboard.press('Enter');
    // Arabic sentence that starts with a Latin term stays RTL.
    await page.keyboard.type('API endpoint يرجع بيانات JSON');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# عنوان رئيسي');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- عنصر قائمة');

    await expect(paragraph(page, 'هذه فقرة عربية')).toHaveAttribute(
      'dir',
      'rtl'
    );
    await expect(paragraph(page, 'Plain English')).toHaveAttribute(
      'dir',
      'ltr'
    );
    await expect(paragraph(page, 'API endpoint')).toHaveAttribute('dir', 'rtl');
    await expect(paragraph(page, 'عنوان رئيسي')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.locator('affine-list', { hasText: 'عنصر قائمة' })
    ).toHaveAttribute('dir', 'rtl');

    // Arabic text is right-aligned: its right edge sits at the block's
    // right edge; English text sits at the left edge.
    const arabicLine = await paragraph(page, 'هذه فقرة عربية')
      .locator('v-line')
      .boundingBox();
    const arabicBlock = await paragraph(page, 'هذه فقرة عربية').boundingBox();
    expect(
      Math.abs(
        arabicLine!.x +
          arabicLine!.width -
          (arabicBlock!.x + arabicBlock!.width)
      )
    ).toBeLessThan(4);

    // Directions are recomputed identically after reload (content saved).
    await page.reload();
    await waitForEditorLoad(page);
    await expect(paragraph(page, 'هذه فقرة عربية')).toHaveAttribute(
      'dir',
      'rtl'
    );
    await expect(paragraph(page, 'Plain English')).toHaveAttribute(
      'dir',
      'ltr'
    );
  });

  test('code blocks stay LTR inside Arabic documents', async ({ page }) => {
    await newDocWithParagraph(page);
    await page.keyboard.type('```');
    await page.keyboard.press('Space');
    await page.keyboard.type('const x = 1; // تعليق');
    await expect(page.locator('affine-code')).toHaveAttribute('dir', 'ltr');
  });

  test('Ctrl + Left/Right Shift sets an explicit direction that is saved and undoable', async ({
    page,
  }) => {
    await newDocWithParagraph(page);
    await page.keyboard.type('فقرة عربية');
    const block = paragraph(page, 'فقرة عربية');
    await expect(block).toHaveAttribute('dir', 'rtl');

    await page.keyboard.down('Control');
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('Control');
    await expect(block).toHaveAttribute('dir', 'ltr');

    // Explicit choice survives a reload (stored with the content).
    await page.reload();
    await waitForEditorLoad(page);
    await expect(paragraph(page, 'فقرة عربية')).toHaveAttribute('dir', 'ltr');

    // And it is undoable back to automatic (RTL from content).
    await paragraph(page, 'فقرة عربية').locator('.inline-editor').click();
    await page.keyboard.down('Control');
    await page.keyboard.down('ShiftRight');
    await page.keyboard.up('ShiftRight');
    await page.keyboard.up('Control');
    await expect(paragraph(page, 'فقرة عربية')).toHaveAttribute('dir', 'rtl');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph(page, 'فقرة عربية')).toHaveAttribute('dir', 'ltr');
  });

  test('the format toolbar offers the text direction menu', async ({
    page,
  }) => {
    await newDocWithParagraph(page);
    await page.keyboard.type('Hello world');
    const block = paragraph(page, 'Hello world');
    await expect(block).toHaveAttribute('dir', 'ltr');

    await selectAllByKeyboard(page);
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(toolbar).toBeVisible();
    await toolbar.getByLabel('اتجاه النص').click();
    await toolbar.getByLabel('من اليمين إلى اليسار').click();
    await expect(block).toHaveAttribute('dir', 'rtl');

    // Back to automatic: the English content decides again.
    await selectAllByKeyboard(page);
    await toolbar.getByLabel('اتجاه النص').click();
    await toolbar.getByLabel('تلقائي').click();
    await expect(block).toHaveAttribute('dir', 'ltr');
  });

  test('the slash menu offers text direction items', async ({ page }) => {
    await newDocWithParagraph(page);
    await page.keyboard.type('Hello world');
    await page.keyboard.type('/rtl');
    const item = page
      .locator('affine-slash-menu')
      .getByText('من اليمين إلى اليسار', { exact: true });
    await expect(item).toBeVisible();
    await item.click();
    await expect(paragraph(page, 'Hello world')).toHaveAttribute('dir', 'rtl');
  });

  test('the slash menu is localized and still accepts English commands', async ({
    page,
  }) => {
    await newDocWithParagraph(page);
    const menu = page.locator('affine-slash-menu');

    await page.keyboard.type('/');
    // Items are labelled (and test-id'd) by their localized names.
    const heading1 = menu.getByTestId('عنوان 1');
    await expect(heading1).toBeVisible();
    await expect(heading1).toHaveAttribute('subtext', 'عنوان بأكبر حجم خط.');
    await expect(
      menu.locator('.slash-menu-group-name', { hasText: 'أساسي' })
    ).toBeVisible();
    await expect(menu.getByTestId('Heading 1')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.keyboard.press('Backspace');

    // English commands still match through the original names.
    await page.keyboard.type('/heading');
    await expect(heading1).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('affine-paragraph .h1')).toHaveCount(1);
  });

  test('Arabic slash commands work: /جدول inserts an RTL table', async ({
    page,
  }) => {
    await newDocWithParagraph(page);
    await page.keyboard.type('/جدول');
    const menu = page.locator('affine-slash-menu');
    await expect(menu.getByTestId('جدول')).toBeVisible();
    await expect(menu.getByTestId('نص')).toHaveCount(0);
    await page.keyboard.press('Enter');
    const table = page.locator('affine-table');
    await expect(table).toHaveCSS('direction', 'rtl');
    const [first, second] = await table
      .locator('td')
      .evaluateAll(cells =>
        cells.slice(0, 2).map(cell => cell.getBoundingClientRect().right)
      );
    expect(first).toBeGreaterThan(second);
  });

  test('the doc title follows its own content', async ({ page }) => {
    await clickNewPageButton(page);
    const title = getBlockSuiteEditorTitle(page);
    await title.click();
    await page.keyboard.type('خطة العمل');
    await expect(page.locator('doc-title')).toHaveAttribute('dir', 'rtl');
    await title.fill('Project plan');
    await expect(page.locator('doc-title')).toHaveAttribute('dir', 'ltr');
  });

  test('copied HTML keeps each paragraph direction (Word, Gmail…)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await newDocWithParagraph(page);
    await page.keyboard.type('فقرة عربية للنسخ');
    await page.keyboard.press('Enter');
    await page.keyboard.type('English paragraph to copy');
    await expect(paragraph(page, 'English paragraph')).toHaveAttribute(
      'dir',
      'ltr'
    );

    // Select both paragraphs: from the end of the second to the first.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+c');
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const [item] = await navigator.clipboard.read();
          if (!item?.types.includes('text/html')) return '';
          return (await item.getType('text/html')).text();
        })
      )
      .toContain('dir="rtl"');
    const html = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return (await item.getType('text/html')).text();
    });
    expect(html).toMatch(/<p dir="rtl">فقرة عربية للنسخ<\/p>/);
    expect(html).toMatch(/<p dir="ltr">English paragraph to copy<\/p>/);
  });

  test('the drag handle sits on the inline-start side of RTL blocks', async ({
    page,
  }) => {
    await newDocWithParagraph(page);
    await page.keyboard.type('فقرة للسحب');
    const block = paragraph(page, 'فقرة للسحب');
    await block.hover();
    const handle = page.locator('.affine-drag-handle-container');
    await expect(handle).toBeVisible();
    const handleBox = await handle.boundingBox();
    const blockBox = await block.boundingBox();
    expect(handleBox!.x).toBeGreaterThanOrEqual(
      blockBox!.x + blockBox!.width - 1
    );
  });
});
