import type { TextDirection } from '@arabase/core';
import { LifeCycleWatcher } from '@blocksuite/affine/std';
import { signal } from '@preact/signals-core';

import { getDirectionTargets, setTextDirectionCommand } from './commands';

/**
 * Pure state machine for the Word / Google Docs convention:
 * Ctrl + Right Shift → right-to-left, Ctrl + Left Shift → left-to-right.
 * It fires when the chord is released and only if no other key was pressed
 * meanwhile, so shortcuts such as Ctrl+Shift+Z are unaffected.
 */
export class DirectionChordTracker {
  private _shiftSide: TextDirection | null = null;
  private _armed: TextDirection | null = null;

  keydown(
    event: Pick<
      KeyboardEvent,
      'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
    >
  ): void {
    const modifier = event.ctrlKey || event.metaKey;
    if (event.key === 'Shift') {
      this._shiftSide =
        event.code === 'ShiftRight'
          ? 'rtl'
          : event.code === 'ShiftLeft'
            ? 'ltr'
            : null;
      this._armed = modifier && !event.altKey ? this._shiftSide : null;
      return;
    }
    if ((event.key === 'Control' || event.key === 'Meta') && event.shiftKey) {
      this._armed = event.altKey ? null : this._shiftSide;
      return;
    }
    this._armed = null;
  }

  /** Returns the direction to apply when the chord completes. */
  keyup(event: Pick<KeyboardEvent, 'key'>): TextDirection | null {
    const isChordKey =
      event.key === 'Shift' || event.key === 'Control' || event.key === 'Meta';
    const armed = isChordKey ? this._armed : null;
    this._armed = null;
    if (event.key === 'Shift') this._shiftSide = null;
    return armed;
  }

  reset(): void {
    this._armed = null;
    this._shiftSide = null;
  }
}

/**
 * Whether Ctrl + Right/Left Shift changes the writing direction. Hosts expose
 * it as a user setting: on Windows the same chord can be bound to switching
 * the keyboard layout.
 */
export const directionShortcutEnabled$ = signal(true);

export class DirectionShortcutWatcher extends LifeCycleWatcher {
  static override readonly key = 'arabase-direction-shortcut';

  private _abort: AbortController | null = null;

  override mounted() {
    super.mounted();
    const tracker = new DirectionChordTracker();
    this._abort = new AbortController();
    const { signal } = this._abort;
    const host = this.std.host;

    host.addEventListener('keydown', event => tracker.keydown(event), {
      capture: true,
      signal,
    });
    host.addEventListener(
      'keyup',
      event => {
        const dir = tracker.keyup(event);
        if (!dir || !directionShortcutEnabled$.peek()) return;
        if (this.std.store.readonly) return;
        const targets = getDirectionTargets(this.std);
        if (!targets.length) return;
        this.std.command.exec(setTextDirectionCommand, {
          textDirection: dir,
          selectedModels: targets,
        });
      },
      { capture: true, signal }
    );
    host.addEventListener('blur', () => tracker.reset(), {
      capture: true,
      signal,
    });
  }

  override unmounted() {
    super.unmounted();
    this._abort?.abort();
    this._abort = null;
  }
}
