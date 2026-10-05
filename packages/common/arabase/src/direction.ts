export type TextDirection = 'ltr' | 'rtl';

/**
 * Languages whose default script is written right-to-left (ISO 639 codes).
 * A script subtag always wins over this list, e.g. `az-Arab` is RTL and
 * `ku-Latn` is LTR.
 */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set([
  'ar',
  'arc',
  'bal',
  'ckb',
  'dv',
  'fa',
  'glk',
  'he',
  'iw',
  'ks',
  'lrc',
  'mzn',
  'nqo',
  'pnb',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
  'yi',
]);

/** ISO 15924 scripts written right-to-left. */
export const RTL_SCRIPTS: ReadonlySet<string> = new Set([
  'adlm',
  'arab',
  'hebr',
  'mand',
  'nkoo',
  'rohg',
  'samr',
  'syrc',
  'thaa',
  'yezi',
]);

/** Splits a BCP 47 tag (`ar-EG`, `az_Arab`) into lowercase subtags. */
function subtags(locale: string): string[] {
  return locale.toLowerCase().split(/[-_]/);
}

export function baseLanguage(locale: string): string {
  return subtags(locale)[0] ?? '';
}

/** Direction of the script a locale is written in. */
export function localeDirection(locale: string): TextDirection {
  const [language, ...rest] = subtags(locale);
  const script = rest.find(tag => tag.length === 4 && /^[a-z]{4}$/.test(tag));
  if (script) {
    return RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
  }
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

export function isRtlLocale(locale: string): boolean {
  return localeDirection(locale) === 'rtl';
}

export function oppositeDirection(dir: TextDirection): TextDirection {
  return dir === 'rtl' ? 'ltr' : 'rtl';
}
