/**
 * Notion-style databases from the "/" menu (arabase): the "Database" group,
 * Arabic-tolerant search, inline insert with the title focused, and the
 * full-page database (a new doc linked from the current one).
 */
import { test } from '@affine-test/kit/playwright';
import { locateEditorContainer } from '@affine-test/kit/utils/editor';
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

async function newDocWithEmptyLine(page: Page) {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('Enter');
}

const slashMenu = (page: Page) => page.locator('affine-slash-menu .slash-menu');

/** Names of the items the slash menu shows, in order. */
async function openSlashMenu(page: Page, query: string) {
  await page.keyboard.type(`/${query}`, { delay: 30 });
  await expect(slashMenu(page), `menu for /${query}`).toBeVisible();
  return slashMenu(page).locator('icon-button .text');
}

/** The menu lists all `names`, in any order. */
async function expectItems(items: Locator, names: string[]) {
  await expect
    .poll(async () => {
      const shown = await items.allTextContents();
      return names.filter(name => !shown.includes(name));
    })
    .toEqual([]);
}

/** Closes the menu and removes the typed "/query" (the whole line). */
async function clearSlashQuery(page: Page) {
  await page.keyboard.press('Escape');
  await expect(slashMenu(page)).toHaveCount(0);
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
}

/**
 * The current doc's note children, and for each linked card the title,
 * blocks and database views of the doc it points to.
 */
async function docStructure(page: Page) {
  return locateEditorContainer(page).evaluate(container => {
    const store = (container.querySelector('editor-host') as any).store;
    const allFlavours = (model: any): string[] => [
      model.flavour,
      ...model.children.flatMap(allFlavours),
    ];
    const note = store.getModelsByFlavour('affine:note')[0];
    const cards = store
      .getModelsByFlavour('affine:embed-linked-doc')
      .map((card: any) => {
        const linked = store.workspace.getDoc(card.props.pageId)?.getStore();
        const database = linked?.getModelsByFlavour('affine:database')[0];
        return {
          title: linked?.root?.props.title.toString() as string | undefined,
          flavours: linked?.root ? allFlavours(linked.root) : [],
          views: (database?.props.views ?? []).map((view: any) => ({
            mode: view.mode as string,
            name: view.name as string,
          })),
        };
      });
    return {
      noteChildren: note.children.map((child: any) => ({
        flavour: child.flavour as string,
        text: (child.text?.toString() ?? '') as string,
      })),
      cards,
    };
  });
}

test.describe('database from the slash menu, Arabic UI', () => {
  test.beforeEach(async ({ context, page }) => {
    await useArabic(context);
    await openHomePage(page);
    await waitForEditorLoad(page);
    await newDocWithEmptyLine(page);
  });

  test('Arabic queries surface the database items', async ({ page }) => {
    const items = await openSlashMenu(page, 'قاعدة');
    await expect(items.nth(0)).toHaveText('قاعدة بيانات');
    await expect(items.nth(1)).toHaveText('قاعدة بيانات في صفحة مستقلة');
    await expectItems(items, ['جدول بيانات', 'لوحة كانبان', 'تقويم']);
    await clearSlashQuery(page);

    // Spelling variants fold together: ه for ة, and tatweel/tashkeel.
    for (const query of ['قاعده', 'قـاعِدة']) {
      const variant = await openSlashMenu(page, query);
      await expect(variant.nth(0)).toHaveText('قاعدة بيانات');
      await expect(variant.nth(1)).toHaveText('قاعدة بيانات في صفحة مستقلة');
      await clearSlashQuery(page);
    }

    const expectations: [query: string, expected: string][] = [
      ['بيانات', 'قاعدة بيانات'],
      ['كانبان', 'لوحة كانبان'],
      ['لوحة', 'لوحة كانبان'],
      ['تقويم', 'تقويم'],
      ['صفحة', 'قاعدة بيانات في صفحة مستقلة'],
      ['جدول بيانات', 'جدول بيانات'],
      ['db', 'قاعدة بيانات'],
    ];
    for (const [query, expected] of expectations) {
      const found = await openSlashMenu(page, query);
      await expect(found.filter({ hasText: expected }).first()).toBeVisible();
      await clearSlashQuery(page);
    }

    // The simple table keeps the top spot for «جدول».
    const tables = await openSlashMenu(page, 'جدول');
    await expect(tables.nth(0)).toHaveText('جدول');
    await expect(tables).toContainText(['جدول بيانات']);
  });

  test('inline database: inserted in place with its title focused', async ({
    page,
  }) => {
    const before = (await docStructure(page)).noteChildren.length;
    await openSlashMenu(page, 'قاعدة');
    await page.keyboard.press('Enter');

    const database = page.locator('affine-database');
    await expect(database).toHaveCount(1);
    const title = database.locator('affine-database-title textarea');
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute(
      'placeholder',
      'قاعدة بيانات بدون عنوان'
    );
    await expect(database.locator('data-view-header-views')).toContainText(
      'عرض جدول'
    );

    // The database replaced the "/قاعدة" line.
    const { noteChildren } = await docStructure(page);
    expect(noteChildren).toHaveLength(before);
    expect(noteChildren.map(child => child.flavour)).toContain(
      'affine:database'
    );
    expect(noteChildren.some(child => child.text.includes('/'))).toBe(false);

    await page.keyboard.type('مهام المشروع');
    await page.keyboard.press('Enter');
    await expect(
      database.locator('affine-database-title .text').nth(1)
    ).toHaveText('مهام المشروع');
  });

  test('full-page database: a new doc with a database, linked here', async ({
    page,
  }) => {
    const url = page.url();
    await openSlashMenu(page, 'قاعده');
    await slashMenu(page).getByTestId('قاعدة بيانات في صفحة مستقلة').click();

    const card = page.locator('affine-embed-linked-doc-block');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('قاعدة بيانات بدون عنوان');
    // The writer stays in the current doc.
    expect(page.url()).toBe(url);
    await expect(page.locator('affine-database')).toHaveCount(0);

    const structure = await docStructure(page);
    expect(structure.noteChildren.map(child => child.flavour)).not.toContain(
      'affine:database'
    );
    expect(structure.cards).toHaveLength(1);
    expect(structure.cards[0].title).toBe('قاعدة بيانات بدون عنوان');
    expect(structure.cards[0].flavours).toContain('affine:database');
    expect(structure.cards[0].views).toEqual([
      { mode: 'table', name: 'عرض جدول' },
    ]);

    // Opening the card shows the database.
    await card.dblclick();
    const peek = page.getByTestId('peek-view-modal');
    await expect(peek).toBeVisible();
    await expect(peek.locator('affine-database')).toBeVisible();
  });
});

test.describe('database from the slash menu, English UI', () => {
  test('/database lists the database items and inserts one', async ({
    page,
  }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await newDocWithEmptyLine(page);

    const items = await openSlashMenu(page, 'database');
    await expect(items.nth(0)).toHaveText('Database');
    await expect(items.nth(1)).toHaveText('Database – Full Page');
    await expectItems(items, ['Table View', 'Board View', 'Calendar View']);

    await page.keyboard.press('Enter');
    const title = page.locator(
      'affine-database affine-database-title textarea'
    );
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('placeholder', 'Untitled database');
  });
});
