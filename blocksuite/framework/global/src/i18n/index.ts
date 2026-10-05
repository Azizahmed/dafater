import { signal } from '@preact/signals-core';

/**
 * Returns the translation of an English UI string, or `undefined` when the
 * active language has none (the English text is then used).
 */
export type Translator = (source: string) => string | undefined;

export type TranslateParams = Record<string, string | number>;

const translator$ = signal<Translator | null>(null);

/**
 * Installs the translator for editor UI strings; `null` restores English.
 * Components rendered through `SignalWatcher` re-render automatically.
 */
export function setTranslator(translator: Translator | null) {
  translator$.value = translator;
}

/**
 * Translates an editor UI string. The English text is the key, so strings
 * without a translation stay in English. `{name}` placeholders are filled
 * from `params`.
 *
 * Call it while rendering (not at module load) so the active language is
 * used and language changes are picked up.
 */
export function t(source: string, params?: TranslateParams): string {
  const text = translator$.value?.(source) ?? source;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

const ARABIC_FOLDS: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ى: 'ي',
  ة: 'ه',
  ؤ: 'و',
  ئ: 'ي',
};

/**
 * Folds text for forgiving search: lower-cases it and, for Arabic, drops
 * tashkeel and tatweel and unifies letters people type interchangeably
 * (أ/إ/آ/ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي). Apply it to both the query and
 * the candidates. Whitespace is kept as is.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱىةؤئ]/g, char => ARABIC_FOLDS[char] ?? char);
}
