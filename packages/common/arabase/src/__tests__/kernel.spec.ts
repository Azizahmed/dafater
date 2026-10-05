/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createBootScript,
  htmlRootAttributesString,
  LOCALE_HINT_KEY,
} from '../boot';
import { localeDirection } from '../direction';
import { createArabase } from '../kernel';
import { resolveLocale } from '../locale';
import { arabicModule } from '../modules/arabic';

const supportedLocales = ['en', 'ar', 'fr', 'fa', 'zh-Hant'] as const;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

function runBootScript(script: string) {
  // Evaluate the inline script exactly as the browser would.
  new Function(script)();
  const root = document.documentElement;
  return { lang: root.lang, dir: root.dir };
}

describe('resolveLocale', () => {
  const options = { supportedLocales, defaultLocale: 'ar' };

  test('fresh install uses the product default', () => {
    expect(resolveLocale([undefined, null], options)).toBe('ar');
  });

  test('stored choice wins, matched case-insensitively or by base language', () => {
    expect(resolveLocale(['en'], options)).toBe('en');
    expect(resolveLocale(['ZH-hant'], options)).toBe('zh-Hant');
    expect(resolveLocale(['fr-CA'], options)).toBe('fr');
  });

  test('unsupported stored values are skipped', () => {
    expect(resolveLocale(['xx', 'en'], options)).toBe('en');
    expect(resolveLocale(['xx'], options)).toBe('ar');
  });
});

describe('boot script', () => {
  const options = { supportedLocales, defaultLocale: 'ar' };

  test('applies the default for fresh installs', () => {
    expect(runBootScript(createBootScript(options))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  test('restores the stored hint', () => {
    localStorage.setItem(LOCALE_HINT_KEY, 'en');
    expect(runBootScript(createBootScript(options))).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
    localStorage.setItem(LOCALE_HINT_KEY, 'fa');
    expect(runBootScript(createBootScript(options))).toEqual({
      lang: 'fa',
      dir: 'rtl',
    });
  });

  test('ignores unsupported hints', () => {
    localStorage.setItem(LOCALE_HINT_KEY, '<script>');
    expect(runBootScript(createBootScript(options))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  test('falls back to where earlier versions stored the language', () => {
    const legacy = {
      ...options,
      legacySources: [
        'JSON.parse(localStorage.getItem("global-cache:i18n_lng"))',
        'window.__missing.get("i18n_lng")',
      ],
    };
    localStorage.setItem('global-cache:i18n_lng', JSON.stringify('en'));
    expect(runBootScript(createBootScript(legacy))).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
    // The hint, once written, wins over the legacy location.
    localStorage.setItem(LOCALE_HINT_KEY, 'ar');
    expect(runBootScript(createBootScript(legacy))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
    // Unusable legacy values (missing, not a string, unsupported) are ignored.
    localStorage.removeItem(LOCALE_HINT_KEY);
    localStorage.setItem('global-cache:i18n_lng', '42');
    expect(runBootScript(createBootScript(legacy))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  test('survives storage access errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(runBootScript(createBootScript(options))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  test('cannot break out of the script tag', () => {
    const script = createBootScript({
      supportedLocales: ['</script><b>'],
      defaultLocale: '</script><b>',
    });
    expect(script).not.toContain('</script>');
  });

  test('without a supported list, accepts well-formed tags and derives the direction', () => {
    const script = createBootScript({ defaultLocale: 'ar' });
    for (const hint of [
      'en',
      'fa',
      'ur-PK',
      'az-Arab',
      'ku-Latn',
      'zh-Hant',
      'he',
    ]) {
      localStorage.setItem(LOCALE_HINT_KEY, hint);
      expect(runBootScript(script)).toEqual({
        lang: hint,
        dir: localeDirection(hint),
      });
    }
    for (const hint of ['', '<b>', 'e', 'english language', 'ar-']) {
      localStorage.setItem(LOCALE_HINT_KEY, hint);
      expect(runBootScript(script)).toEqual({ lang: 'ar', dir: 'rtl' });
    }
  });

  test('static html attributes match the default', () => {
    expect(htmlRootAttributesString('ar')).toBe('lang="ar" dir="rtl"');
    expect(htmlRootAttributesString('en')).toBe('lang="en" dir="ltr"');
  });
});

describe('Arabase kernel', () => {
  test('setLocale applies the document locale and persists the hint', () => {
    const arabase = createArabase({
      supportedLocales,
      defaultLocale: 'ar',
      modules: [arabicModule()],
    });
    const listener = vi.fn();
    // Detached on purpose: hosts pass `subscribe` around unbound.
    const { subscribe } = arabase;
    const unsubscribe = subscribe(listener);

    arabase.setLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem(LOCALE_HINT_KEY)).toBe('en');
    expect(listener).toHaveBeenCalledWith('en', 'ltr');

    // Same locale again: no notification.
    arabase.setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);

    arabase.setLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(arabase.dir).toBe('rtl');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    arabase.setLocale('en');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('the boot script agrees with the runtime resolution', () => {
    const arabase = createArabase({ supportedLocales, defaultLocale: 'ar' });
    for (const hint of [null, 'en', 'fa', 'zh-Hant', 'nope']) {
      localStorage.clear();
      if (hint) localStorage.setItem(LOCALE_HINT_KEY, hint);
      const fromScript = runBootScript(arabase.bootScript());
      const locale = arabase.resolveInitialLocale(null);
      expect(fromScript).toEqual({
        lang: locale,
        dir: arabase.directionOf(locale),
      });
    }
  });

  test('resolveInitialLocale prefers the host stored value over the hint', () => {
    const arabase = createArabase({ supportedLocales, defaultLocale: 'ar' });
    localStorage.setItem(LOCALE_HINT_KEY, 'fr');
    expect(arabase.resolveInitialLocale('en')).toBe('en');
    expect(arabase.resolveInitialLocale(undefined)).toBe('fr');
  });

  test('modules contribute locale metadata and styles once', () => {
    const arabase = createArabase({
      supportedLocales,
      defaultLocale: 'ar',
      modules: [arabicModule({ fontFamily: 'Test Arabic' })],
    });
    expect(arabase.localeInfo('ar-EG')).toMatchObject({
      dir: 'rtl',
      fontFamily: 'Test Arabic',
      directionStrategy: 'rtl-priority',
    });
    arabase.installStyles();
    arabase.installStyles();
    const styles = document.head.querySelectorAll(
      'style[data-arabase-module="arabic"]'
    );
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('--arabase-arabic-font');
  });

  test('module setup runs once and is disposed', () => {
    const dispose = vi.fn();
    const setup = vi.fn(() => dispose);
    const arabase = createArabase({
      supportedLocales,
      defaultLocale: 'ar',
      modules: [{ id: 'probe', setup }],
    });
    expect(setup).toHaveBeenCalledWith(arabase);
    arabase.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('rejects duplicated module ids', () => {
    expect(() =>
      createArabase({
        supportedLocales,
        defaultLocale: 'ar',
        modules: [arabicModule(), arabicModule()],
      })
    ).toThrow(/duplicated module "arabic"/);
  });
});
