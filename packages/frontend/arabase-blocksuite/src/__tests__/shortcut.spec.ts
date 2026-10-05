import { describe, expect, test } from 'vitest';

import { DirectionChordTracker } from '../shortcut';

type Key = Parameters<DirectionChordTracker['keydown']>[0];

const key = (overrides: Partial<Key>): Key => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

const ctrl = key({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
const rightShift = key({
  key: 'Shift',
  code: 'ShiftRight',
  ctrlKey: true,
  shiftKey: true,
});
const leftShift = key({
  key: 'Shift',
  code: 'ShiftLeft',
  ctrlKey: true,
  shiftKey: true,
});

describe('DirectionChordTracker (Ctrl + Right/Left Shift)', () => {
  test('Ctrl then Right Shift → RTL on release', () => {
    const tracker = new DirectionChordTracker();
    tracker.keydown(ctrl);
    tracker.keydown(rightShift);
    expect(tracker.keyup({ key: 'Shift' })).toBe('rtl');
  });

  test('Ctrl then Left Shift → LTR on release', () => {
    const tracker = new DirectionChordTracker();
    tracker.keydown(ctrl);
    tracker.keydown(leftShift);
    expect(tracker.keyup({ key: 'Shift' })).toBe('ltr');
  });

  test('Shift first, then Ctrl, released in any order', () => {
    const tracker = new DirectionChordTracker();
    tracker.keydown(key({ key: 'Shift', code: 'ShiftRight', shiftKey: true }));
    tracker.keydown(
      key({
        key: 'Control',
        code: 'ControlLeft',
        ctrlKey: true,
        shiftKey: true,
      })
    );
    expect(tracker.keyup({ key: 'Control' })).toBe('rtl');
  });

  test('any other key cancels the chord (e.g. Ctrl+Shift+Z)', () => {
    const tracker = new DirectionChordTracker();
    tracker.keydown(ctrl);
    tracker.keydown(rightShift);
    tracker.keydown(
      key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })
    );
    expect(tracker.keyup({ key: 'Shift' })).toBeNull();
  });

  test('Shift alone or with Alt does nothing', () => {
    const tracker = new DirectionChordTracker();
    tracker.keydown(key({ key: 'Shift', code: 'ShiftRight', shiftKey: true }));
    expect(tracker.keyup({ key: 'Shift' })).toBeNull();

    tracker.keydown(
      key({ key: 'Shift', code: 'ShiftLeft', ctrlKey: true, altKey: true })
    );
    expect(tracker.keyup({ key: 'Shift' })).toBeNull();
  });

  test('fires once per chord', () => {
    const tracker = new DirectionChordTracker();
    tracker.keydown(ctrl);
    tracker.keydown(rightShift);
    expect(tracker.keyup({ key: 'Shift' })).toBe('rtl');
    expect(tracker.keyup({ key: 'Control' })).toBeNull();
  });
});
