/**
 * Dafater's integration of the arabase layer. Product decisions live here
 * (default language, typography of the AFFiNE theme, editor labels); the
 * reusable mechanics live in `@arabase/core` and `@arabase/blocksuite`.
 */
// Fallback Arabic web font, downloaded only when no system font has Arabic.
import '@arabase/core/arabic/fonts.css';

import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from '@affine/i18n/locale-config';
import {
  editorLocaleModule,
  registerEditorCatalog,
} from '@arabase/blocksuite/locales';
import { createArabase } from '@arabase/core';
import { arabicModule } from '@arabase/core/arabic';

import { initFont } from './fonts';
import editorAr from './locales/ar.json';

/**
 * Arabic for Dafater's own editor plugins (AI panels, editor integrations)
 * that use BlockSuite's `t()`. Keys are the English texts; BlockSuite's own
 * strings live in `@arabase/blocksuite`.
 */
registerEditorCatalog('ar', 'dafater', editorAr);

export const arabase = createArabase({
  defaultLocale: DEFAULT_LANGUAGE,
  supportedLocales: LANGUAGE_CODES,
  modules: [arabicModule(), editorLocaleModule()],
});

// The product font (Thmanyah by default), before anything is painted.
initFont();

/**
 * Localised CSS strings (e.g. pseudo-element placeholders) as `:root`
 * variables. Kept in a dedicated stylesheet rather than the root's inline
 * style, which other features rewrite.
 */
export function setLocalizedCssVariables(vars: Record<string, string>): void {
  const id = 'dafater-localized-css-variables';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.append(style);
  }
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${JSON.stringify(value)};`)
    .join('');
  const css = `:root{${body}}`;
  if (style.textContent !== css) style.textContent = css;
}

export { arabaseEditorTranslate } from './editor';
export {
  DEFAULT_FONT,
  FONT_CHOICES,
  type FontChoice,
  getFont,
  setFont,
  subscribeFont,
} from './fonts';
export { dafaterSlashMenuTranslate } from './slash-menu';
