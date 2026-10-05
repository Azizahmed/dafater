import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { t } from '@blocksuite/global/i18n';

type Color = {
  /** Display name, in the active language. */
  readonly name: string;
  color: string;
};
export const colorList: Color[] = [
  {
    get name() {
      return t('Blue');
    },
    color: cssVarV2.table.headerBackground.blue,
  },
  {
    get name() {
      return t('Green');
    },
    color: cssVarV2.table.headerBackground.green,
  },
  {
    get name() {
      return t('Grey');
    },
    color: cssVarV2.table.headerBackground.grey,
  },
  {
    get name() {
      return t('Orange');
    },
    color: cssVarV2.table.headerBackground.orange,
  },
  {
    get name() {
      return t('Purple');
    },
    color: cssVarV2.table.headerBackground.purple,
  },
  {
    get name() {
      return t('Red');
    },
    color: cssVarV2.table.headerBackground.red,
  },
  {
    get name() {
      return t('Teal');
    },
    color: cssVarV2.table.headerBackground.teal,
  },
  {
    get name() {
      return t('Yellow');
    },
    color: cssVarV2.table.headerBackground.yellow,
  },
];

const colorMap = Object.fromEntries(colorList.map(item => [item.color, item]));

export const getColorByColor = (color: string): Color | undefined => {
  return colorMap[color] ?? undefined;
};
