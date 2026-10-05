import {
  detectTextDirection,
  type DirectionStrategy,
  type TextDirection,
} from '@arabase/core';
import type { Text } from '@blocksuite/affine/store';
import { effect, type ReadonlySignal, untracked } from '@preact/signals-core';

/** A fixed strategy, or a signal (e.g. one that follows the UI language). */
export type DirectionStrategyInput =
  | DirectionStrategy
  | ReadonlySignal<DirectionStrategy>;

function readStrategy(
  input: DirectionStrategyInput | undefined
): DirectionStrategy {
  if (!input) return 'rtl-priority';
  return typeof input === 'string' ? input : input.value;
}

type YTextDelta = { insert?: unknown; delete?: number; retain?: number }[];

export function isTextDirection(value: unknown): value is TextDirection {
  return value === 'ltr' || value === 'rtl';
}

/**
 * Writes `dir` only when it changes. `null` removes the attribute so the
 * element inherits the direction of its container.
 */
export function setElementDirection(
  element: HTMLElement,
  dir: TextDirection | null
): void {
  if (dir) {
    if (element.getAttribute('dir') !== dir) element.setAttribute('dir', dir);
  } else if (element.hasAttribute('dir')) {
    element.removeAttribute('dir');
  }
}

/**
 * Direction after an insert-only change under the `rtl-priority` strategy,
 * computed from the inserted text alone (O(inserted) instead of O(text)).
 * Returns `undefined` when the change is not insert-only.
 */
function directionAfterInsert(
  current: TextDirection | null,
  delta: YTextDelta
): TextDirection | null | undefined {
  let inserted = '';
  for (const op of delta) {
    if (op.delete) return undefined;
    if (typeof op.insert === 'string') inserted += op.insert;
  }
  if (current === 'rtl') return 'rtl';
  const added = detectTextDirection(inserted, 'rtl-priority');
  if (added === 'rtl') return 'rtl';
  return current ?? added;
}

export interface BindTextDirectionOptions {
  /** The rich text whose content decides the direction. */
  text$: ReadonlySignal<Text | undefined | null>;
  /** A user-chosen direction stored with the content; wins when set. */
  explicit$?: ReadonlySignal<unknown>;
  strategy?: DirectionStrategyInput;
}

/**
 * Keeps `element.dir` in sync with a rich text: the explicit direction if the
 * user set one, otherwise the direction detected from the content, otherwise
 * inherited. Reacts to local and remote edits. Returns a disposer.
 */
export function bindTextDirection(
  element: HTMLElement,
  { text$, explicit$, strategy: strategyInput }: BindTextDirectionOptions
): () => void {
  return effect(() => {
    const strategy = readStrategy(strategyInput);
    const explicit = explicit$?.value;
    if (isTextDirection(explicit)) {
      setElementDirection(element, explicit);
      return;
    }

    const yText = text$.value?.yText;
    if (!yText) {
      setElementDirection(element, null);
      return;
    }

    let current = detectTextDirection(yText.toString(), strategy);
    setElementDirection(element, current);

    const onChange = (event: { delta: YTextDelta }) => {
      let next =
        strategy === 'rtl-priority'
          ? directionAfterInsert(current, event.delta)
          : undefined;
      if (next === undefined) {
        next = detectTextDirection(yText.toString(), strategy);
      }
      if (next === current) return;
      current = next;
      setElementDirection(element, current);
    };
    yText.observe(onChange);
    return () => yText.unobserve(onChange);
  });
}

export interface BindContentDirectionOptions {
  /** All the text that decides the direction (e.g. every table cell). */
  read: () => string;
  /** Subscribes to content changes; returns an unsubscribe function. */
  observe: (onChange: () => void) => () => void;
  /** A user-chosen direction stored with the content; wins when set. */
  explicit$?: ReadonlySignal<unknown>;
  strategy?: DirectionStrategyInput;
}

/**
 * `bindTextDirection` for blocks made of many texts (tables, databases): the
 * direction is detected from all of their content, re-checked at most once
 * per task after changes. Returns a disposer.
 */
export function bindContentDirection(
  element: HTMLElement,
  {
    read,
    observe,
    explicit$,
    strategy: strategyInput,
  }: BindContentDirectionOptions
): () => void {
  return effect(() => {
    const strategy = readStrategy(strategyInput);
    const explicit = explicit$?.value;
    if (isTextDirection(explicit)) {
      setElementDirection(element, explicit);
      return;
    }

    // Content is read untracked: changes arrive through `observe`.
    const update = () =>
      setElementDirection(
        element,
        detectTextDirection(untracked(read), strategy)
      );
    update();

    let scheduled = false;
    let disposed = false;
    const unobserve = observe(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!disposed) update();
      });
    });
    return () => {
      disposed = true;
      unobserve();
    };
  });
}
