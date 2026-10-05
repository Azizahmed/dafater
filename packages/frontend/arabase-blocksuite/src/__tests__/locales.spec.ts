import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { t } from '@blocksuite/affine/global/i18n';
import { afterEach, describe, expect, test } from 'vitest';

import {
  createEditorTranslator,
  getEditorCatalog,
  setEditorLocale,
} from '../locales';
import { AR_CATALOG_PARTS } from '../locales/ar';

const BLOCKSUITE_ROOT = fileURLToPath(
  new URL('../../../../../blocksuite/affine', import.meta.url)
);

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

/** Every `t('…')` call with a literal argument in BlockSuite's sources. */
function collectSourceStrings() {
  const strings = new Map<string, string>();
  const dynamic: string[] = [];
  const files = readdirSync(BLOCKSUITE_ROOT, { recursive: true }) as string[];
  for (const file of files) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    if (/(^|\/)(node_modules|dist|__tests__)\//.test(file)) continue;
    if (/\.(spec|test)\.ts$/.test(file)) continue;
    const code = readFileSync(join(BLOCKSUITE_ROOT, file), 'utf8');
    if (!code.includes('t(')) continue;
    for (const match of code.matchAll(
      /(?<![\w$.])t\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*[,)]/g
    )) {
      const [, quote, raw] = match;
      if (quote === '`' && raw.includes('${')) {
        dynamic.push(`${file}: ${raw}`);
        continue;
      }
      const source = raw.replace(/\\(.)/g, '$1');
      if (!strings.has(source)) strings.set(source, file);
    }
  }
  return { strings, dynamic };
}

afterEach(() => setEditorLocale('en'));

describe('editor UI translation', () => {
  test('t() uses the installed catalog and falls back to English', () => {
    setEditorLocale('ar');
    expect(t('Bold')).not.toBe('Bold');
    expect(t('A string nobody translated')).toBe('A string nobody translated');
    setEditorLocale('en');
    expect(t('Bold')).toBe('Bold');
  });

  test('regional variants use the base language', () => {
    expect(getEditorCatalog('ar-EG')).toBe(getEditorCatalog('ar'));
    expect(getEditorCatalog('en')).toBeNull();
  });

  test('placeholders are filled in the translated text', () => {
    const translate = createEditorTranslator('ar')!;
    const withCount = [...getEditorCatalog('ar')!.keys()].find(key =>
      key.includes('{')
    );
    if (!withCount) return;
    setEditorLocale('ar');
    const params = Object.fromEntries(
      placeholders(withCount).map(name => [name, '7'])
    );
    const result = t(withCount, params);
    expect(result).toBe(translate(withCount)!.replace(/\{(\w+)\}/g, () => '7'));
  });

  test('catalog entries keep their placeholders', () => {
    const broken: string[] = [];
    for (const [part, entries] of Object.entries(AR_CATALOG_PARTS)) {
      for (const [source, text] of Object.entries(entries)) {
        if (
          placeholders(source).join() !== placeholders(text).join() ||
          !text.trim()
        ) {
          broken.push(`${part}: ${source} => ${text}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  test('a source string has a single translation across catalog files', () => {
    const seen = new Map<string, { part: string; text: string }>();
    const conflicts: string[] = [];
    for (const [part, entries] of Object.entries(AR_CATALOG_PARTS)) {
      for (const [source, text] of Object.entries(entries)) {
        const previous = seen.get(source);
        if (previous && previous.text !== text) {
          conflicts.push(
            `${source}: ${previous.part}=${previous.text} / ${part}=${text}`
          );
        }
        seen.set(source, { part, text });
      }
    }
    expect(conflicts).toEqual([]);
  });

  test('every t() string in BlockSuite has an Arabic translation', () => {
    const { strings, dynamic } = collectSourceStrings();
    const catalog = getEditorCatalog('ar')!;
    const missing = [...strings]
      .filter(([source]) => !catalog.has(source))
      .map(([source, file]) => `${file}: ${source}`);
    expect(dynamic, 'use t("… {name} …", { name }) instead').toEqual([]);
    expect(missing).toEqual([]);
  });
});
