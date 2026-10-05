import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getEditorCatalog } from '@arabase/blocksuite/locales';
import { describe, expect, test } from 'vitest';

import dafaterAr from '../locales/ar.json';

const EDITOR_ROOT = fileURLToPath(
  new URL('../../../blocksuite', import.meta.url)
);

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

/** `t('…')` calls with a literal argument in Dafater's editor integrations. */
function collectSourceStrings() {
  const strings = new Map<string, string>();
  const dynamic: string[] = [];
  const files = readdirSync(EDITOR_ROOT, { recursive: true }) as string[];
  for (const file of files) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    if (/(^|\/)(node_modules|dist|__tests__)\//.test(file)) continue;
    if (/\.(spec|test)\.ts$/.test(file)) continue;
    const code = readFileSync(join(EDITOR_ROOT, file), 'utf8');
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

const dafater: Record<string, string> = dafaterAr;

describe('Dafater editor catalog', () => {
  test('every t() string in the editor integrations has an Arabic translation', () => {
    const { strings, dynamic } = collectSourceStrings();
    // BlockSuite's built-in catalog (without the host part) + Dafater's.
    const blocksuite = getEditorCatalog('ar')!;
    const missing = [...strings]
      .filter(([source]) => !dafater[source] && !blocksuite.has(source))
      .map(([source, file]) => `${file}: ${source}`);
    expect(dynamic, 'use t("… {name} …", { name }) instead').toEqual([]);
    expect(missing).toEqual([]);
  });

  test('entries keep their placeholders', () => {
    const broken = Object.entries(dafater)
      .filter(
        ([source, text]) =>
          !text.trim() ||
          placeholders(source).join() !== placeholders(text).join()
      )
      .map(([source, text]) => `${source} => ${text}`);
    expect(broken).toEqual([]);
  });

  test('strings shared with BlockSuite use the same Arabic', () => {
    const blocksuite = getEditorCatalog('ar')!;
    const conflicts = Object.entries(dafater)
      .filter(([source, text]) => {
        const other = blocksuite.get(source);
        return other !== undefined && other !== text;
      })
      .map(
        ([source, text]) => `${source}: ${text} / ${blocksuite.get(source)}`
      );
    expect(conflicts).toEqual([]);
  });
});
