/**
 * Arabic translations of BlockSuite's UI strings, keyed by the English text.
 * Split by editor area; the same English text must map to the same Arabic
 * text in every file (checked by tests). Terms: ./GLOSSARY.md.
 */
import blocks from './blocks.json' with { type: 'json' };
import common from './common.json' with { type: 'json' };
import dataView from './data-view.json' with { type: 'json' };
import gfx from './gfx.json' with { type: 'json' };
import table from './table.json' with { type: 'json' };
import widgets from './widgets.json' with { type: 'json' };

export const AR_CATALOG_PARTS: Readonly<
  Record<string, Record<string, string>>
> = { common, blocks, 'data-view': dataView, gfx, table, widgets };
