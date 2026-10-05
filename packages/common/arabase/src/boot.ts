/**
 * Pre-paint locale boot.
 *
 * The document language and direction must be correct on the very first
 * frame, before any framework renders. Two pieces cooperate:
 *
 * 1. `htmlRootAttributes()` gives the static `<html lang dir>` for the product
 *    default, so a fresh install is right even before any script runs.
 * 2. `createBootScript()` returns a tiny inline `<script>` for `<head>` that
 *    corrects `lang`/`dir` from the locale hint stored by `writeLocaleHint()`
 *    for users who picked another language.
 *
 * This file must stay dependency-free: build tools and servers import it to
 * render HTML.
 */
import {
  localeDirection,
  RTL_LANGUAGES,
  RTL_SCRIPTS,
  type TextDirection,
} from './direction';
import { matchLocale } from './locale';

export const LOCALE_HINT_KEY = 'arabase:locale';

export interface BootOptions {
  defaultLocale: string;
  /**
   * When given, hints outside this list are ignored and directions are
   * precomputed. When omitted (e.g. in build tools that must not load the
   * app's language list), any well-formed tag is accepted and its direction
   * is derived from the built-in script tables.
   */
  supportedLocales?: readonly string[];
  /** localStorage key holding the locale hint. */
  storageKey?: string;
  /** Direction lookup; defaults to the script of each locale. */
  directionOf?: (locale: string) => TextDirection;
  /**
   * Where earlier versions stored the user's language, read when no hint is
   * stored yet (first start after an update). Trusted JavaScript expressions
   * written by the host at build time, evaluated in order inside try/catch;
   * the first acceptable string wins.
   */
  legacySources?: readonly string[];
}

export function htmlRootAttributes(locale: string): {
  lang: string;
  dir: TextDirection;
} {
  return { lang: locale, dir: localeDirection(locale) };
}

/** Serialises `html` attributes, e.g. `lang="ar" dir="rtl"`. */
export function htmlRootAttributesString(locale: string): string {
  const { lang, dir } = htmlRootAttributes(locale);
  return `lang="${lang}" dir="${dir}"`;
}

/**
 * Inline script equivalent to `readLocaleHint()` + `applyDocumentLocale()`,
 * ~300-500 bytes, safe to embed in a `<script>` tag.
 */
export function createBootScript({
  defaultLocale,
  supportedLocales,
  storageKey = LOCALE_HINT_KEY,
  directionOf = localeDirection,
  legacySources = [],
}: BootOptions): string {
  const json = (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c');

  // `v(l)`: is the hint acceptable; `r(l)`: is it right-to-left.
  let helpers: string;
  if (supportedLocales) {
    const rtl = supportedLocales.filter(l => directionOf(l) === 'rtl');
    helpers =
      `var s=${json(supportedLocales)},t=${json(rtl)};` +
      `function v(l){return s.indexOf(l)>-1}` +
      `function r(l){return t.indexOf(l)>-1}`;
  } else {
    helpers =
      `var L=${json([...RTL_LANGUAGES])},S=${json([...RTL_SCRIPTS])};` +
      `function v(l){return /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(l)}` +
      `function r(l){var p=l.toLowerCase().split(/[-_]/),i;` +
      `for(i=1;i<p.length;i++)if(/^[a-z]{4}$/.test(p[i]))return S.indexOf(p[i])>-1;` +
      `return L.indexOf(p[0])>-1}`;
  }
  return (
    `(function(){try{${helpers}var l=null;` +
    `try{l=localStorage.getItem(${json(storageKey)})}catch(e){}` +
    legacySources.map(source => `if(!l)try{l=(${source})}catch(e){}`).join('') +
    `if(typeof l!=="string"||!v(l))l=${json(defaultLocale)};` +
    `var h=document.documentElement;if(h.lang!==l)h.lang=l;` +
    `var d=r(l)?"rtl":"ltr";if(h.dir!==d)h.dir=d}catch(e){}})();`
  );
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage throws in sandboxed iframes / disabled storage.
    return null;
  }
}

export function readLocaleHint(
  supportedLocales: readonly string[],
  storageKey = LOCALE_HINT_KEY,
  storage = localStorageOrNull()
): string | null {
  try {
    return matchLocale(storage?.getItem(storageKey), supportedLocales);
  } catch {
    return null;
  }
}

export function writeLocaleHint(
  locale: string,
  storageKey = LOCALE_HINT_KEY,
  storage = localStorageOrNull()
): void {
  try {
    if (storage && storage.getItem(storageKey) !== locale) {
      storage.setItem(storageKey, locale);
    }
  } catch {
    // Quota exceeded or storage disabled: the static default still applies.
  }
}

/**
 * Sets `lang`/`dir` on the root element. Attributes are only written when
 * they change, so repeated calls never trigger a style recalculation.
 */
export function applyDocumentLocale(
  locale: string,
  dir: TextDirection = localeDirection(locale),
  root: HTMLElement | null = typeof document === 'undefined'
    ? null
    : document.documentElement
): void {
  if (!root) return;
  if (root.lang !== locale) root.lang = locale;
  if (root.dir !== dir) root.dir = dir;
}
