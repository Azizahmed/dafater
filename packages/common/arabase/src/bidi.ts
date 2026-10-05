import type { TextDirection } from './direction';

/**
 * Strong right-to-left characters (Unicode bidi classes R and AL): Hebrew,
 * Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic, the Arabic presentation
 * forms and the supplementary RTL blocks. Arabic-Indic digits (class AN/EN)
 * and combining marks (NSM) are deliberately excluded: they never decide the
 * direction of a paragraph on their own.
 */
const RTL_CHAR =
  /[א-״؈؋؍؛-ي٭-ٯٱ-ەۥۦۮۯۺ-ܐܒ-ܯݍ-ޥޱ߀-ߪߴߵߺࠀ-ࠕࠚࠤࠨ࠰-࠾ࡀ-ࡘ࡞ࡠ-ࡪࡰ-ࢎࢠ-ࣉיִײַ-ﬨשׁ-ﭏﭐ-ﴽﵐ-﷿ﹰ-ﻼ\u{10800}-\u{10FFF}\u{1E800}-\u{1EEFF}]/u;

/** Any letter. Only consulted once RTL letters are known to be absent. */
const ANY_LETTER = /\p{L}/u;

/** The first character that has a strong direction. */
const FIRST_STRONG = new RegExp(`(${RTL_CHAR.source})|\\p{L}`, 'u');

/**
 * How a block of text picks its direction.
 *
 * - `rtl-priority` (Arabic-first): any RTL letter makes the text RTL. Arabic
 *   sentences very often *start* with a Latin term ("API", "Notion", a
 *   product name); the Unicode first-strong rule would wrongly lay those
 *   paragraphs out left-to-right. Text with Latin letters only stays LTR.
 * - `first-strong`: the Unicode bidi algorithm rule (P2/P3), identical to the
 *   browser's `dir="auto"`.
 */
export type DirectionStrategy = 'rtl-priority' | 'first-strong';

/**
 * Detects the direction of a piece of text. Returns `null` when the text has
 * no strong characters (empty, digits, punctuation, emoji) so the caller can
 * fall back to the surrounding direction.
 */
export function detectTextDirection(
  text: string,
  strategy: DirectionStrategy = 'rtl-priority'
): TextDirection | null {
  if (!text) return null;
  if (strategy === 'first-strong') {
    const match = FIRST_STRONG.exec(text);
    if (!match) return null;
    return match[1] ? 'rtl' : 'ltr';
  }
  if (RTL_CHAR.test(text)) return 'rtl';
  return ANY_LETTER.test(text) ? 'ltr' : null;
}

export function hasRtlCharacters(text: string): boolean {
  return RTL_CHAR.test(text);
}

/**
 * Resolves the direction of a text block:
 * an explicit (user chosen) direction wins, then the content, then `fallback`
 * (usually the direction inherited from the container or the UI locale).
 */
export function resolveTextDirection(
  explicit: TextDirection | null | undefined,
  text: string,
  fallback: TextDirection | null,
  strategy?: DirectionStrategy
): TextDirection | null {
  return explicit ?? detectTextDirection(text, strategy) ?? fallback;
}
