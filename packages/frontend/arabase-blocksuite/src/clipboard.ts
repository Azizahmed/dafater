import {
  detectTextDirection,
  type DirectionStrategy,
  type TextDirection,
} from '@arabase/core';
import { HtmlAdapter } from '@blocksuite/affine/shared/adapters';
import { ClipboardAdapterConfigIdentifier } from '@blocksuite/affine/std';
import type {
  BlockSnapshot,
  ExtensionType,
  FromSliceSnapshotPayload,
  FromSliceSnapshotResult,
} from '@blocksuite/affine/store';

import { isTextDirection } from './bind-direction';
import { editorDirectionStrategy$ } from './locales';

/** HTML elements that start a paragraph in word processors and mail apps. */
const TEXT_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th';

/** The element's own text, without nested lists (list items). */
function ownText(element: Element): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node instanceof Element && /^(UL|OL)$/.test(node.tagName)) continue;
    text += node.textContent ?? '';
  }
  return text;
}

export interface HtmlDirectionOptions {
  strategy?: DirectionStrategy;
  /** Directions chosen by the user, keyed by the block's plain text. */
  explicit?: ReadonlyMap<string, TextDirection>;
}

/**
 * Adds `dir` to every paragraph-like element of an HTML fragment, so text
 * copied out of the editor keeps its direction in Word, Google Docs, Gmail…
 * Code stays left-to-right. Elements that already have `dir` are kept.
 */
export function addHtmlTextDirections(
  html: string,
  { strategy = 'rtl-priority', explicit }: HtmlDirectionOptions = {}
): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  let changed = false;
  const set = (element: Element, dir: TextDirection | null) => {
    if (!dir || element.hasAttribute('dir')) return;
    element.setAttribute('dir', dir);
    changed = true;
  };

  body.querySelectorAll('pre').forEach(pre => set(pre, 'ltr'));
  body.querySelectorAll('table').forEach(table => {
    set(table, detectTextDirection(table.textContent ?? '', strategy));
  });
  body.querySelectorAll(TEXT_BLOCKS).forEach(element => {
    if (element.closest('pre')) return;
    const text = ownText(element);
    set(
      element,
      explicit?.get(text.trim()) ?? detectTextDirection(text, strategy)
    );
  });
  return changed ? body.innerHTML : html;
}

type TextProp = { delta?: { insert?: unknown }[] };

/** Explicit `textDirection` props of a slice, keyed by plain text. */
function collectExplicitDirections(
  blocks: BlockSnapshot[],
  result = new Map<string, TextDirection>()
) {
  for (const block of blocks) {
    const { textDirection, text } = block.props as {
      textDirection?: unknown;
      text?: TextProp;
    };
    if (isTextDirection(textDirection) && text?.delta) {
      const plain = text.delta
        .map(op => (typeof op.insert === 'string' ? op.insert : ''))
        .join('')
        .trim();
      if (plain) result.set(plain, textDirection);
    }
    collectExplicitDirections(block.children, result);
  }
  return result;
}

/** BlockSuite's HTML clipboard adapter with writing directions on export. */
export class BidiHtmlAdapter extends HtmlAdapter {
  override async fromSliceSnapshot(
    payload: FromSliceSnapshotPayload
  ): Promise<FromSliceSnapshotResult<string>> {
    const result = await super.fromSliceSnapshot(payload);
    return {
      ...result,
      file: addHtmlTextDirections(result.file, {
        strategy: editorDirectionStrategy$.peek(),
        explicit: collectExplicitDirections(payload.snapshot.content),
      }),
    };
  }
}

/**
 * Replaces the `text/html` clipboard adapter with {@link BidiHtmlAdapter}.
 * Must be registered after the editor's own clipboard configs.
 */
export const BidiHtmlClipboardExtension: ExtensionType = {
  setup: di => {
    di.override(ClipboardAdapterConfigIdentifier('text/html'), () => ({
      mimeType: 'text/html',
      adapter: BidiHtmlAdapter,
      priority: 90,
    }));
  },
};
