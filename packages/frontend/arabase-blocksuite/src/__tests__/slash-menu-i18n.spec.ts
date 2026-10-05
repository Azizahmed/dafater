import type {
  SlashMenuActionItem,
  SlashMenuContext,
  SlashMenuItem,
  SlashMenuSubMenu,
} from '@blocksuite/affine/widgets/slash-menu';
import { html } from 'lit';
import { describe, expect, test } from 'vitest';

import {
  localizeSlashMenuItem,
  type SlashMenuTextField,
} from '../slash-menu-i18n';

const AR: Record<string, string> = {
  'Heading 1': 'عنوان 1',
  'Headings in the largest font.': 'عنوان بأكبر حجم خط.',
  'Heading #1': 'عنوان 1',
  Basic: 'أساسي',
  'Other Headings': 'عناوين أخرى',
  'Heading 4': 'عنوان 4',
  Delete: 'حذف',
  Broken: 'a_b@c',
};

const calls: [string, SlashMenuTextField][] = [];
const translate = (english: string, field: SlashMenuTextField) => {
  calls.push([english, field]);
  return AR[english];
};

const noop = () => {};

const heading1: SlashMenuActionItem = {
  name: 'Heading 1',
  description: 'Headings in the largest font.',
  group: '0_Basic@0',
  tooltip: { figure: html`<svg></svg>`, caption: 'Heading #1' },
  action: noop,
};

describe('localizeSlashMenuItem', () => {
  test('rewrites name, description, group label and tooltip caption', () => {
    const item = localizeSlashMenuItem(heading1, translate);
    expect(item.name).toBe('عنوان 1');
    expect(item.description).toBe('عنوان بأكبر حجم خط.');
    expect(item.group).toBe('0_أساسي@0');
    expect((item as SlashMenuActionItem).tooltip?.caption).toBe('عنوان 1');
    expect((item as SlashMenuActionItem).tooltip?.figure).toBe(
      heading1.tooltip!.figure
    );
    expect((item as SlashMenuActionItem).action).toBe(noop);
    // The source item is left untouched.
    expect(heading1.name).toBe('Heading 1');
  });

  test('keeps the English name and existing aliases searchable', () => {
    expect(localizeSlashMenuItem(heading1, translate).searchAlias).toEqual([
      'Heading 1',
    ]);
    const item = localizeSlashMenuItem(
      { name: 'Delete', searchAlias: ['remove'], action: noop },
      translate
    );
    expect(item.searchAlias).toEqual(['remove', 'Delete']);
  });

  test('passes the field of each string to the translator', () => {
    calls.length = 0;
    localizeSlashMenuItem(heading1, translate);
    expect(calls).toEqual([
      ['Heading 1', 'name'],
      ['Headings in the largest font.', 'description'],
      ['Basic', 'group'],
      ['Heading #1', 'caption'],
    ]);
  });

  test('unknown strings stay English and gain no alias', () => {
    const today: SlashMenuActionItem = {
      name: 'Today',
      description: '2026-10-05',
      group: '6_Date@0',
      searchAlias: ['now'],
      tooltip: { figure: html``, caption: 'Today' },
      action: noop,
    };
    expect(localizeSlashMenuItem(today, translate)).toEqual(today);
    expect(localizeSlashMenuItem(today, () => '')).toEqual(today);
    expect(localizeSlashMenuItem(today, english => english)).toEqual(today);
  });

  test('group labels that would break the group format are ignored', () => {
    const item = localizeSlashMenuItem(
      { name: 'x', group: '3_Broken@1', action: noop },
      translate
    );
    expect(item.group).toBe('3_Broken@1');
  });
});

describe('with the slash menu engine', () => {
  type Build = (
    items: SlashMenuItem[],
    context: SlashMenuContext,
    transform?: (item: SlashMenuItem) => SlashMenuItem
  ) => SlashMenuItem[];

  // The engine helper is internal to the widget package; import it by path
  // (dynamically, so it stays outside this package's type-check scope).
  const loadBuild = async (): Promise<Build> => {
    const path = new URL(
      '../../../../../blocksuite/affine/widgets/slash-menu/src/utils.ts',
      import.meta.url
    ).pathname;
    const module = await import(/* @vite-ignore */ path);
    return module.buildSlashMenuItems;
  };

  test('sub-menu items are localised too', async () => {
    const build = await loadBuild();
    const subMenu: SlashMenuSubMenu = {
      name: 'Other Headings',
      group: '0_Basic@4',
      subMenu: [{ name: 'Heading 4', action: noop }],
    };
    const [menu] = build([subMenu], {} as SlashMenuContext, item =>
      localizeSlashMenuItem(item, translate)
    ) as SlashMenuSubMenu[];
    expect(menu.name).toBe('عناوين أخرى');
    expect(menu.group).toBe('0_أساسي@4');
    expect(menu.subMenu[0].name).toBe('عنوان 4');
    expect(menu.subMenu[0].searchAlias).toEqual(['Heading 4']);
  });
});
