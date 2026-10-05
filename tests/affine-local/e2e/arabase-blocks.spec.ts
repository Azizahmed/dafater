/**
 * Arabic-first behaviour (arabase) of content blocks and edgeless tools:
 * translated block UI, mirrored cards, LTR code, RTL canvas text and
 * defaults created in the active language.
 */
import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  locateEditorContainer,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { type BrowserContext, expect, type Page } from '@playwright/test';

/** Opt this context into Arabic (the kit pins English for other suites). */
async function useArabic(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('arabase:locale', 'ar');
  });
}

async function newDocWithParagraph(page: Page, title: string) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await type(page, title);
  await page.keyboard.press('Enter');
}

/** Appends a block to the first note through the store. */
async function addBlock(
  page: Page,
  flavour: string,
  props: Record<string, unknown>
) {
  await locateEditorContainer(page).evaluate(
    (container, { flavour, props }) => {
      const store = (container.querySelector('editor-host') as any).store;
      const note = store.getModelsByFlavour('affine:note')[0];
      store.addBlock(flavour, props, note.id);
    },
    { flavour, props }
  );
}

type EdgelessElementInfo = { type: string; textAlign: string; title: string };

async function edgelessElements(page: Page): Promise<EdgelessElementInfo[]> {
  return locateEditorContainer(page).evaluate(container => {
    const root = container.querySelector('affine-edgeless-root') as any;
    return root.gfx.gfxElements.map((element: any) => ({
      type: (element.type ?? element.flavour) as string,
      textAlign: (element.textAlign ?? element.props?.textAlign) as string,
      title: (element.title ?? element.props?.title)?.toString() as string,
    }));
  });
}

/** Creates an edgeless text block at a viewport point by typing. */
async function addEdgelessText(page: Page, x: number, y: number, text: string) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.mouse.click(x, y);
  await expect(page.locator('affine-edgeless-text')).toBeVisible();
  await type(page, text);
  await page.keyboard.press('Escape');
}

/** Selects everything and wraps it in a frame (shortcut F). */
async function frameAll(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('f');
}

async function canvasCenter(page: Page) {
  const box = await locateEditorContainer(page)
    .locator('affine-edgeless-root')
    .boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

test.describe('Arabic blocks', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('code block: Arabic toolbar, LTR code', async ({ page }) => {
    await newDocWithParagraph(page, 'كتلة برمجية');
    await type(page, '/code');
    await page.keyboard.press('Enter');
    await type(page, 'const x = 1;');

    const code = page.locator('affine-code').first();
    await code.hover();
    const lang = code.locator('.lang-button');
    await expect(lang).toContainText('نص عادي');
    // The code itself stays left-to-right.
    const direction = await code
      .locator('.inline-editor')
      .first()
      .evaluate(el => getComputedStyle(el).direction);
    expect(direction).toBe('ltr');

    await lang.click();
    await expect(
      page.getByPlaceholder('ابحث عن لغة', { exact: false })
    ).toBeVisible();
  });

  test('link cards mirror and show Arabic states', async ({ page }) => {
    await newDocWithParagraph(page, 'بطاقات');
    await addBlock(page, 'affine:bookmark', {
      url: 'https://example.invalid/article',
      style: 'horizontal',
    });
    const card = page.locator('affine-bookmark').first();
    await expect(card).toBeVisible();
    // Failed metadata: the description is Arabic.
    await expect(card).toContainText('تعذّر', { timeout: 20_000 });

    // The banner sits on the inline-end (left) side of the text in RTL.
    const banner = await card
      .locator('.affine-bookmark-banner')
      .first()
      .boundingBox();
    const title = await card
      .locator('.affine-bookmark-content-title')
      .first()
      .boundingBox();
    expect(banner!.x + banner!.width).toBeLessThanOrEqual(title!.x + 1);
  });
});

test.describe('Arabic edgeless', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
  });

  test('defaults are created in Arabic and text starts on the right', async ({
    page,
  }) => {
    await newDocWithParagraph(page, 'لوحة');
    await clickEdgelessModeButton(page);
    const { x, y } = await canvasCenter(page);

    await addEdgelessText(page, x, y + 150, 'نص حر على اللوحة');
    // A frame around the selection gets an Arabic default title.
    await frameAll(page);

    await expect
      .poll(async () => {
        const elements = await edgelessElements(page);
        return {
          text: elements.find(e => e.type === 'affine:edgeless-text')
            ?.textAlign,
          frame: elements.find(e => e.type === 'affine:frame')?.title,
        };
      })
      .toEqual({ text: 'right', frame: 'إطار 1' });
  });

  test('shape labels take their direction from their text', async ({
    page,
  }) => {
    await newDocWithParagraph(page, 'أشكال');
    await clickEdgelessModeButton(page);
    const { x, y } = await canvasCenter(page);

    await page.keyboard.press('Escape');
    await page.keyboard.press('s');
    await page.mouse.move(x - 100, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 100, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(x - 60, y + 20);

    const editor = page.locator('edgeless-shape-text-editor');
    await expect(editor.locator('rich-text')).toBeVisible();
    await type(page, 'مرحبا!');
    const line = editor.locator('v-line > div').first();
    expect(await line.evaluate(el => getComputedStyle(el).unicodeBidi)).toBe(
      'plaintext'
    );
  });
});

test.describe('English edgeless', () => {
  test('edgeless text keeps the English default alignment', async ({
    page,
  }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await newDocWithParagraph(page, 'Board');
    await clickEdgelessModeButton(page);
    const { x, y } = await canvasCenter(page);

    await addEdgelessText(page, x, y + 150, 'Free text');
    await frameAll(page);

    await expect
      .poll(async () => {
        const elements = await edgelessElements(page);
        return {
          text: elements.find(e => e.type === 'affine:edgeless-text')
            ?.textAlign,
          frame: elements.find(e => e.type === 'affine:frame')?.title,
        };
      })
      .toEqual({ text: 'left', frame: 'Frame 1' });
  });
});
