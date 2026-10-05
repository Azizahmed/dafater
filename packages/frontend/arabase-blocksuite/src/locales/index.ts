import {
  type ArabaseModule,
  baseLanguage,
  type DirectionStrategy,
} from '@arabase/core';
import { setTranslator, type Translator } from '@blocksuite/affine/global/i18n';
import { signal } from '@preact/signals-core';

import { AR_CATALOG_PARTS } from './ar';

export type Catalog = ReadonlyMap<string, string>;

function mergeParts(parts: Readonly<Record<string, Record<string, string>>>) {
  const catalog = new Map<string, string>();
  for (const part of Object.values(parts)) {
    for (const [source, text] of Object.entries(part)) {
      if (text) catalog.set(source, text);
    }
  }
  return catalog;
}

const CATALOG_PARTS: Record<string, Record<string, Record<string, string>>> = {
  ar: { ...AR_CATALOG_PARTS },
};

const catalogs = new Map<string, Catalog>();

let activeLocale: string | null = null;

/**
 * Adds a host catalog (e.g. the product's own editor plugins) for `locale`.
 * Entries use the same English-text keys as the built-in catalogs and win
 * over them. Re-applies the active language if it is affected.
 */
export function registerEditorCatalog(
  locale: string,
  name: string,
  entries: Record<string, string>
) {
  const parts = (CATALOG_PARTS[locale] ??= {});
  parts[`host:${name}`] = entries;
  catalogs.delete(locale);
  if (activeLocale && getCatalogKey(activeLocale) === locale) {
    setEditorLocale(activeLocale);
  }
}

function getCatalogKey(locale: string) {
  return locale in CATALOG_PARTS ? locale : baseLanguage(locale);
}

/** The editor UI catalog of a language (exact match, then base language). */
export function getEditorCatalog(locale: string): Catalog | null {
  const key = getCatalogKey(locale);
  const parts = CATALOG_PARTS[key];
  if (!parts) return null;
  let catalog = catalogs.get(key);
  if (!catalog) {
    catalog = mergeParts(parts);
    catalogs.set(key, catalog);
  }
  return catalog;
}

const missing = new Set<string>();
const MAX_MISSING = 2000;

/**
 * English UI strings that were displayed without a translation since the
 * page loaded (development aid for finding gaps).
 */
export function missingEditorTranslations(): string[] {
  return [...missing];
}

/** A translator for `t()` of `@blocksuite/affine/global/i18n`. */
export function createEditorTranslator(locale: string): Translator | null {
  const catalog = getEditorCatalog(locale);
  if (!catalog) return null;
  return source => {
    const text = catalog.get(source);
    if (
      text === undefined &&
      missing.size < MAX_MISSING &&
      /[A-Za-z]/.test(source)
    ) {
      missing.add(source);
    }
    return text;
  };
}

/**
 * Switches BlockSuite's own UI strings (toolbars, menus, database, edgeless
 * tools…) to `locale`. Languages without a catalog show English.
 */
export function setEditorLocale(locale: string) {
  activeLocale = locale;
  setTranslator(createEditorTranslator(locale));
}

/**
 * How the editor picks the direction of text that has no explicit one. It
 * follows the UI language: `rtl-priority` while Arabic is active (an Arabic
 * sentence starting with a Latin term stays RTL), the Unicode first-strong
 * rule otherwise (an English sentence with one Arabic word stays LTR).
 */
export const editorDirectionStrategy$ =
  signal<DirectionStrategy>('first-strong');

/**
 * arabase module that keeps the editor in the active language: its UI
 * strings (`setEditorLocale`) and its direction strategy.
 */
export function editorLocaleModule(): ArabaseModule {
  return {
    id: 'blocksuite-editor-locale',
    setup(arabase) {
      const apply = (locale: string) => {
        setEditorLocale(locale);
        editorDirectionStrategy$.value =
          arabase.localeInfo(locale).directionStrategy ?? 'first-strong';
      };
      apply(arabase.locale);
      return arabase.subscribe(apply);
    },
  };
}
