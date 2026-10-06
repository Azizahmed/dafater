import { expect, test } from 'vitest';
import { Array as YArray, Doc as YDoc, Map as YMap, Text as YText } from 'yjs';

import { parsePageDoc, readAllBlocksFromDoc } from '../src';

type Props = Record<string, unknown>;

/** A doc with a Dafater AI meeting notes block, as BlockSuite stores it. */
function meetingDoc() {
  const doc = new YDoc({ guid: 'meeting-doc' });
  const blocks = doc.getMap<YMap<unknown>>('blocks');
  const add = (
    id: string,
    flavour: string,
    props: Props,
    children: string[] = []
  ) => {
    const block = new YMap<unknown>();
    blocks.set(id, block);
    block.set('sys:id', id);
    block.set('sys:flavour', flavour);
    block.set('sys:version', 1);
    const childList = new YArray<string>();
    childList.push(children);
    block.set('sys:children', childList);
    for (const [key, value] of Object.entries(props)) {
      block.set(`prop:${key}`, value);
    }
  };
  const transcript = new YArray<YMap<unknown>>();
  transcript.push(
    [
      {
        id: 's2',
        start: 6_000,
        end: 12_000,
        text: 'اتفقنا على الإطلاق يوم الخميس.',
      },
      { id: 's1', start: 0, end: 6_000, text: 'مرحبًا بالجميع.' },
    ].map(segment => {
      const map = new YMap<unknown>();
      for (const [key, value] of Object.entries(segment)) map.set(key, value);
      return map;
    })
  );
  doc.transact(() => {
    add('page', 'affine:page', { title: new YText('Weekly') }, ['note']);
    add('note', 'affine:note', { displayMode: 'both' }, ['meeting']);
    add(
      'meeting',
      'affine:meeting-notes',
      {
        title: 'مراجعة الإطلاق',
        date: Date.UTC(2026, 9, 6),
        transcript,
        attendees: new YArray(),
      },
      ['notes', 'summary']
    );
    add('notes', 'affine:meeting-notes-section', { kind: 'notes' }, ['n1']);
    add('n1', 'affine:paragraph', {
      type: 'text',
      text: new YText('الميزانية'),
    });
    add('summary', 'affine:meeting-notes-section', { kind: 'summary' }, ['s1']);
    add('s1', 'affine:list', {
      type: 'todo',
      checked: false,
      text: new YText('إرسال المحضر'),
    });
  });
  return doc;
}

test('meeting notes are part of the doc Markdown', () => {
  const { md } = parsePageDoc({
    workspaceId: 'space',
    doc: meetingDoc(),
    buildBlobUrl: id => `blob://${id}`,
    buildDocUrl: id => `doc://${id}`,
  });
  expect(md).toBe(
    [
      '### مراجعة الإطلاق (2026-10-06)',
      '**Notes**',
      'الميزانية',
      '',
      '**AI summary**',
      '- [ ] إرسال المحضر',
      '**Transcript**',
      '',
      '[00:00] مرحبًا بالجميع.',
      '',
      '[00:06] اتفقنا على الإطلاق يوم الخميس.',
      '',
    ].join('\n')
  );
});

test('meeting title and transcript are indexed', async () => {
  const result = await readAllBlocksFromDoc({
    ydoc: meetingDoc(),
    spaceId: 'space',
  });
  const meeting = result?.blocks.find(
    block => block.flavour === 'affine:meeting-notes'
  );
  expect(meeting?.content).toEqual([
    'مراجعة الإطلاق',
    'اتفقنا على الإطلاق يوم الخميس.',
    'مرحبًا بالجميع.',
  ]);
  // notes and summary blocks are indexed as usual
  expect(result?.blocks.map(block => block.content)).toEqual(
    expect.arrayContaining(['الميزانية', 'إرسال المحضر'])
  );
});
