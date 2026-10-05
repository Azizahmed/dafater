import {
  type BlockComponent,
  ConfigExtensionFactory,
  LifeCycleWatcher,
  type ViewUpdatePayload,
} from '@blocksuite/affine/std';
import type { BlockModel, ExtensionType, Text } from '@blocksuite/affine/store';
import { effect, type ReadonlySignal } from '@preact/signals-core';
import type { Subscription } from 'rxjs';

import {
  bindContentDirection,
  bindTextDirection,
  type DirectionStrategyInput,
  setElementDirection,
} from './bind-direction';

/** Blocks whose rich text decides their own direction. */
export const TEXT_DIRECTION_FLAVOURS: readonly string[] = [
  'affine:paragraph',
  'affine:list',
];

/** Blocks that are always laid out left-to-right (source code, math). */
export const LTR_FLAVOURS: readonly string[] = ['affine:code', 'affine:latex'];

type ContentDirectionSource = (model: BlockModel) => string;

const textOf = (value: unknown): string =>
  value && typeof value === 'object' && 'toString' in value
    ? String(value)
    : '';

/**
 * Blocks made of many texts whose direction follows all of their content:
 * an Arabic table is laid out right-to-left (first column on the right).
 */
export const CONTENT_DIRECTION_SOURCES: Readonly<
  Record<string, ContentDirectionSource>
> = {
  'affine:table': model => {
    const cells = (
      model.props as { cells?: Record<string, { text?: unknown }> }
    ).cells;
    if (!cells) return '';
    let text = '';
    for (const key in cells) text += textOf(cells[key]?.text) + '\n';
    return text;
  },
  'affine:database': model => {
    let text = textOf((model.props as { title?: unknown }).title) + '\n';
    for (const child of model.children) {
      text += textOf((child.props as { text?: unknown }).text) + '\n';
    }
    return text;
  },
};

export interface BlockDirectionOptions {
  strategy?: DirectionStrategyInput;
}

type TextBlockProps = {
  text$: ReadonlySignal<Text | undefined>;
  textDirection$?: ReadonlySignal<unknown>;
};

/**
 * Calls `onChange` after any change to the block's own data (including the
 * texts nested in it, e.g. table cells) or to its children's texts
 * (database rows).
 */
function observeContent(model: BlockModel, onChange: () => void) {
  const yBlock = model.yBlock;
  yBlock.observeDeep(onChange);
  // Re-subscribed whenever the children change (rows added or removed).
  const disposeChildren = effect(() => {
    const texts = model.children
      .map(child => (child.props as { text?: Text }).text?.yText)
      .filter(yText => !!yText);
    texts.forEach(yText => yText.observe(onChange));
    return () => texts.forEach(yText => yText.unobserve(onChange));
  });
  return () => {
    yBlock.unobserveDeep(onChange);
    disposeChildren();
  };
}

/** Options of {@link BlockDirectionWatcher}, provided through DI. */
export const BlockDirectionConfig =
  ConfigExtensionFactory<BlockDirectionOptions>('arabase-block-direction');

/**
 * Gives every text block its own writing direction, so a single document can
 * mix Arabic and English paragraphs. Each block element gets `dir` from (in
 * order) the user's explicit choice, its content, or — when the block is
 * empty or neutral — the direction it inherits from its parent / the editor.
 *
 * Runs as a lifecycle watcher: blocks are bound in `connectedCallback`,
 * before their first paint, so there is never a frame in the wrong direction.
 *
 * A top-level named class on purpose: BlockSuite's DI identifies classes by
 * `constructor.name`, which minifiers drop from anonymous class expressions.
 */
export class BlockDirectionWatcher extends LifeCycleWatcher {
  static override readonly key = 'arabase-block-direction';

  private readonly _bindings = new Map<BlockComponent, () => void>();

  private _subscription: Subscription | null = null;

  private get _strategy() {
    return this.std.getOptional(BlockDirectionConfig.identifier)?.strategy;
  }

  private readonly _bind = (view: BlockComponent) => {
    this._unbind(view);
    const flavour = view.model.flavour;
    if (LTR_FLAVOURS.includes(flavour)) {
      setElementDirection(view, 'ltr');
      return;
    }
    const source = CONTENT_DIRECTION_SOURCES[flavour];
    if (source) {
      const model = view.model;
      this._bindings.set(
        view,
        bindContentDirection(view, {
          read: () => source(model),
          observe: onChange => observeContent(model, onChange),
          explicit$: (model.props as Partial<TextBlockProps>).textDirection$,
          strategy: this._strategy,
        })
      );
      return;
    }
    if (!TEXT_DIRECTION_FLAVOURS.includes(flavour)) return;

    const props = view.model.props as unknown as TextBlockProps;
    this._bindings.set(
      view,
      bindTextDirection(view, {
        text$: props.text$,
        explicit$: props.textDirection$,
        strategy: this._strategy,
      })
    );
  };

  private readonly _unbind = (view: BlockComponent) => {
    this._bindings.get(view)?.();
    this._bindings.delete(view);
  };

  private readonly _onViewUpdated = (payload: ViewUpdatePayload) => {
    if (payload.type !== 'block') return;
    if (payload.method === 'add') this._bind(payload.view);
    else this._unbind(payload.view);
  };

  override mounted() {
    super.mounted();
    this.std.view.views.forEach(this._bind);
    this._subscription = this.std.view.viewUpdated.subscribe(
      this._onViewUpdated
    );
  }

  override unmounted() {
    super.unmounted();
    this._subscription?.unsubscribe();
    this._subscription = null;
    this._bindings.forEach(dispose => dispose());
    this._bindings.clear();
  }
}

/** The watcher together with its options. */
export function BlockDirectionExtension(
  options: BlockDirectionOptions = {}
): ExtensionType[] {
  return [BlockDirectionConfig(options), BlockDirectionWatcher];
}
