import { describe, expect, test } from 'vitest';

import { getOrCreateI18n } from '../i18next';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from '../locale-config';
import { SUPPORTED_LANGUAGES } from '../resources';

describe('locale config', () => {
  test('LANGUAGE_CODES lists exactly the supported languages', () => {
    expect([...LANGUAGE_CODES].sort()).toEqual(
      Object.keys(SUPPORTED_LANGUAGES).sort()
    );
  });

  test('the default language is supported, right-to-left and bundled', () => {
    expect(DEFAULT_LANGUAGE).toBe('ar');
    const info = SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE];
    expect(info.rtl).toBe(true);
    // Must not be lazy-loaded: the first render needs it synchronously.
    expect(typeof info.resource).not.toBe('function');
  });

  test('switching to the default language is synchronous', () => {
    const i18n = getOrCreateI18n();
    expect(i18n.isInitialized).toBe(true);
    void i18n.changeLanguage(DEFAULT_LANGUAGE);
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(i18n.t('com.affine.editor.text-direction.rtl')).toBe(
      'من اليمين إلى اليسار'
    );
  });
});
