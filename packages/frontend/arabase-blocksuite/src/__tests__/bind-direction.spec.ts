/**
 * @vitest-environment happy-dom
 */
import { Text } from '@blocksuite/affine/store';
import { signal } from '@preact/signals-core';
import { describe, expect, test } from 'vitest';
import * as Y from 'yjs';

import { bindTextDirection } from '../bind-direction';

function setup(initial = '') {
  const doc = new Y.Doc();
  const yText = doc.getText('content');
  if (initial) yText.insert(0, initial);
  const text$ = signal<Text | undefined>(new Text(yText));
  const explicit$ = signal<unknown>(undefined);
  const element = document.createElement('div');
  return { yText, text$, explicit$, element };
}

describe('bindTextDirection', () => {
  test('applies the content direction on bind and follows edits', () => {
    const { yText, text$, explicit$, element } = setup('مرحبا');
    const dispose = bindTextDirection(element, { text$, explicit$ });
    expect(element.getAttribute('dir')).toBe('rtl');

    yText.delete(0, yText.length);
    // No strong characters: inherit from the container.
    expect(element.hasAttribute('dir')).toBe(false);

    yText.insert(0, 'Hello');
    expect(element.getAttribute('dir')).toBe('ltr');

    // Arabic anywhere makes the block RTL (rtl-priority), even after Latin.
    yText.insert(yText.length, ' يا صديقي');
    expect(element.getAttribute('dir')).toBe('rtl');

    // Removing the Arabic part goes back to LTR (full re-scan on delete).
    yText.delete(5, yText.length - 5);
    expect(element.getAttribute('dir')).toBe('ltr');

    dispose();
    yText.insert(0, 'عربي');
    expect(element.getAttribute('dir')).toBe('ltr');
  });

  test('explicit direction wins and auto resumes when cleared', () => {
    const { text$, explicit$, element } = setup('مرحبا');
    bindTextDirection(element, { text$, explicit$ });
    explicit$.value = 'ltr';
    expect(element.getAttribute('dir')).toBe('ltr');
    explicit$.value = undefined;
    expect(element.getAttribute('dir')).toBe('rtl');
    // Garbage values are ignored (treated as automatic).
    explicit$.value = 'sideways';
    expect(element.getAttribute('dir')).toBe('rtl');
  });

  test('explicit direction is not overridden by later edits', () => {
    const { yText, text$, explicit$, element } = setup('Hello');
    explicit$.value = 'rtl';
    bindTextDirection(element, { text$, explicit$ });
    yText.insert(0, 'more English ');
    expect(element.getAttribute('dir')).toBe('rtl');
  });

  test('rebinds when the text instance is replaced', () => {
    const { text$, explicit$, element } = setup('Hello');
    bindTextDirection(element, { text$, explicit$ });
    const doc = new Y.Doc();
    const other = doc.getText('other');
    other.insert(0, 'سلام');
    text$.value = new Text(other);
    expect(element.getAttribute('dir')).toBe('rtl');
  });

  test('first-strong strategy follows the first strong character', () => {
    const { text$, element } = setup('API يرجع');
    bindTextDirection(element, { text$, strategy: 'first-strong' });
    expect(element.getAttribute('dir')).toBe('ltr');
  });

  test('remote updates are applied too', () => {
    const { yText, text$, element } = setup('Hello');
    bindTextDirection(element, { text$ });
    // Simulate a collaborator's change arriving as a Yjs update.
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(yText.doc!));
    remote.getText('content').insert(0, 'مرحبا ');
    Y.applyUpdate(yText.doc!, Y.encodeStateAsUpdate(remote));
    expect(element.getAttribute('dir')).toBe('rtl');
  });
});
