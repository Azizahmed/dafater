import { t } from '@blocksuite/global/i18n';

import {
  EdgelessBrushDarkIcon,
  EdgelessBrushLightIcon,
  EdgelessHighlighterDarkIcon,
  EdgelessHighlighterLightIcon,
} from './icons';
import type { Pen } from './types';

export const penIconMap = {
  dark: {
    brush: EdgelessBrushDarkIcon,
    highlighter: EdgelessHighlighterDarkIcon,
  },
  light: {
    brush: EdgelessBrushLightIcon,
    highlighter: EdgelessHighlighterLightIcon,
  },
};

export const penInfoMap: { [k in Pen]: { tip: string; shortcut: string } } = {
  brush: {
    get tip() {
      return t('Pen');
    },
    shortcut: 'P',
  },
  highlighter: {
    get tip() {
      return t('Highlighter');
    },
    shortcut: '⇧ P',
  },
};
