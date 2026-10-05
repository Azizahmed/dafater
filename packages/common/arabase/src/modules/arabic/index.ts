import type { ArabaseModule } from '../../kernel';

/**
 * Arabic-capable system fonts, best first. Each platform ships at least one:
 * macOS/iOS (SF Arabic, Geeza Pro), Windows (Segoe UI, Dubai, Tahoma),
 * Linux/Android (Noto). Hosts place this *after* their Latin font so Latin
 * glyphs keep the product typeface and only Arabic glyphs fall through.
 *
 * System fonts come first, so nothing is downloaded where they exist (no
 * swap-induced layout shift). The bundled Noto Sans Arabic of
 * `@arabase/core/arabic/fonts.css` is the last resort.
 */
export const ARABIC_FONT_STACK =
  '"SF Arabic", "Geeza Pro", "Segoe UI", "Noto Sans Arabic", "Noto Naskh Arabic", "Dubai", Tahoma, "Arabase Noto Sans Arabic"';

/** Arabic Naskh-style fonts for serif text. */
export const ARABIC_SERIF_FONT_STACK =
  '"Noto Naskh Arabic", "Amiri", "Geeza Pro", "Times New Roman", "Traditional Arabic"';

export interface ArabicModuleOptions {
  /** Overrides {@link ARABIC_FONT_STACK}. */
  fontFamily?: string;
}

/** Exposes the Arabic font stacks as CSS variables for hosts to compose. */
export function arabicTypographyCss(fontFamily: string): string {
  return `:root{--arabase-arabic-font:${fontFamily};--arabase-arabic-serif-font:${ARABIC_SERIF_FONT_STACK};}`;
}

/**
 * Text typed into form fields takes its direction from its own content, like
 * `dir="auto"`: an e-mail or URL typed in the Arabic UI, or Arabic typed in
 * the English UI, reads correctly. Zero specificity (`:where`), so components
 * can still opt out; fields whose content matches the UI are unaffected.
 */
export const FORM_FIELD_BIDI_CSS = `:where(input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],textarea){unicode-bidi:plaintext;}`;

export function arabicModule(options: ArabicModuleOptions = {}): ArabaseModule {
  const fontFamily = options.fontFamily ?? ARABIC_FONT_STACK;
  return {
    id: 'arabic',
    locales: {
      ar: { dir: 'rtl', fontFamily, directionStrategy: 'rtl-priority' },
    },
    styles: arabicTypographyCss(fontFamily) + FORM_FIELD_BIDI_CSS,
  };
}
