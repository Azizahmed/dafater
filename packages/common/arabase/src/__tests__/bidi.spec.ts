import { describe, expect, test } from 'vitest';

import { detectTextDirection, resolveTextDirection } from '../bidi';
import { isRtlLocale, localeDirection } from '../direction';

describe('detectTextDirection (rtl-priority)', () => {
  test.each([
    ['مرحبا بالعالم', 'rtl'],
    ['Hello world', 'ltr'],
    ['שלום', 'rtl'],
    // Arabic sentence that starts with a Latin term stays RTL.
    ['API endpoint يرجع JSON', 'rtl'],
    ['Notion هو تطبيق ملاحظات', 'rtl'],
    ['تم بيع 50% من المنتجات.', 'rtl'],
    ['React hooks', 'ltr'],
    ['Привет', 'ltr'],
    ['你好', 'ltr'],
    // The Arabic question mark is a strong AL character in Unicode.
    ['؟', 'rtl'],
    // Adlam (supplementary plane) is RTL.
    ['𞤀𞤁𞤂', 'rtl'],
  ] as const)('%s → %s', (text, dir) => {
    expect(detectTextDirection(text)).toBe(dir);
  });

  test.each([
    '',
    '   ',
    '2026',
    // Arabic-Indic digits are not strong characters.
    '١٢٣٤',
    '۱۲۳',
    // The Arabic comma is a weak (CS) character.
    '... ! ، - ()',
    '🙂🎉',
    // Arabic diacritics alone carry no direction.
    'ًٌ',
  ])('%j has no strong direction', text => {
    expect(detectTextDirection(text)).toBeNull();
  });
});

describe('detectTextDirection (first-strong)', () => {
  test('follows the first strong character like dir="auto"', () => {
    expect(detectTextDirection('API endpoint يرجع', 'first-strong')).toBe(
      'ltr'
    );
    expect(detectTextDirection('١٢ مرحبا Hello', 'first-strong')).toBe('rtl');
    expect(detectTextDirection('123 !?', 'first-strong')).toBeNull();
  });
});

describe('resolveTextDirection', () => {
  test('explicit choice beats content, content beats fallback', () => {
    expect(resolveTextDirection('ltr', 'مرحبا', 'rtl')).toBe('ltr');
    expect(resolveTextDirection(undefined, 'Hello', 'rtl')).toBe('ltr');
    expect(resolveTextDirection(null, '', 'rtl')).toBe('rtl');
    expect(resolveTextDirection(null, '123', null)).toBeNull();
  });
});

describe('localeDirection', () => {
  test.each([
    ['ar', 'rtl'],
    ['ar-EG', 'rtl'],
    ['AR_sa', 'rtl'],
    ['fa', 'rtl'],
    ['ur', 'rtl'],
    ['he', 'rtl'],
    ['ckb', 'rtl'],
    ['en', 'ltr'],
    ['zh-Hant', 'ltr'],
    ['es-AR', 'ltr'],
    // Script subtag overrides the language default.
    ['az-Arab', 'rtl'],
    ['pa-Arab-PK', 'rtl'],
    ['ku-Latn', 'ltr'],
    ['uz-Arab', 'rtl'],
  ] as const)('%s → %s', (locale, dir) => {
    expect(localeDirection(locale)).toBe(dir);
    expect(isRtlLocale(locale)).toBe(dir === 'rtl');
  });
});
