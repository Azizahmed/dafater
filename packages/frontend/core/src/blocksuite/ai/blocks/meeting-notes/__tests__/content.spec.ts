import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { describe, expect, test } from 'vitest';

import {
  ensureSection,
  insertMeetingNotesBlock,
  isSectionEmpty,
  sectionToMarkdown,
  writeSummary,
} from '../content';
import {
  MeetingNotesBlockFlavour,
  type MeetingNotesBlockModel,
  MeetingNotesSectionFlavour,
} from '../model';
import { parseSummaryMarkdown } from '../summary-markdown';

const extensions = getStoreManager().config.init().value.get('store');

function setup() {
  const workspace = new TestWorkspace({ id: 'test' });
  workspace.meta.initialize();
  const store = workspace.createDoc('doc').getStore({ extensions });
  store.load();
  const rootId = store.addBlock('affine:page', { title: new Text('') });
  const noteId = store.addBlock('affine:note', {}, rootId);
  const { blockId, sectionId, paragraphId } = insertMeetingNotesBlock(
    store,
    noteId
  );
  const model = store.getModelById(blockId) as MeetingNotesBlockModel;
  return { store, noteId, model, sectionId, paragraphId };
}

describe('meeting notes block', () => {
  test('is created with an empty notes section and today’s date', () => {
    const { model, sectionId } = setup();
    expect(model.flavour).toBe(MeetingNotesBlockFlavour);
    expect(model.notesSection?.id).toBe(sectionId);
    expect(model.summarySection).toBeNull();
    expect(model.props.instructions).toBe('auto');
    expect(model.props.language).toBe('auto');
    expect(Date.now() - model.props.date).toBeLessThan(10_000);
    expect(isSectionEmpty(model.notesSection)).toBe(true);
  });

  test('accepts text blocks in its sections, and only sections as children', () => {
    const { store } = setup();
    const schema = store.schema;
    for (const flavour of [
      'affine:paragraph',
      'affine:list',
      'affine:code',
      'affine:divider',
      'affine:callout',
      'affine:image',
    ]) {
      expect(schema.isValid(flavour, MeetingNotesSectionFlavour), flavour).toBe(
        true
      );
    }
    expect(schema.isValid('affine:paragraph', MeetingNotesBlockFlavour)).toBe(
      false
    );
    expect(
      schema.isValid(MeetingNotesBlockFlavour, MeetingNotesSectionFlavour)
    ).toBe(false);
    expect(schema.isValid(MeetingNotesBlockFlavour, 'affine:note')).toBe(true);
  });

  test('turns the notes into Markdown for the AI', () => {
    const { store, model, sectionId, paragraphId } = setup();
    store.updateBlock(store.getModelById(paragraphId)!, {
      type: 'h2',
      text: new Text('جدول الأعمال'),
    });
    const listId = store.addBlock(
      'affine:list',
      { type: 'bulleted', text: new Text('الميزانية') },
      sectionId
    );
    store.addBlock(
      'affine:list',
      { type: 'todo', checked: true, text: new Text('اعتماد الخطة') },
      listId
    );
    store.addBlock(
      'affine:list',
      { type: 'numbered', text: new Text('Hiring') },
      sectionId
    );
    store.addBlock('affine:divider', {}, sectionId);
    store.addBlock('affine:paragraph', { text: new Text('') }, sectionId);

    expect(sectionToMarkdown(model.notesSection)).toBe(
      [
        '## جدول الأعمال',
        '- الميزانية',
        '  - [x] اعتماد الخطة',
        '1. Hiring',
        '---',
      ].join('\n')
    );
    expect(isSectionEmpty(model.notesSection)).toBe(false);
  });

  test('writes the summary after the notes, replacing an older one', () => {
    const { store, model } = setup();
    const first = parseSummaryMarkdown('# A\n## Overview\n- one\n- two');
    writeSummary(store, model, first.blocks, { summarizedAt: 1, title: 'A' });
    expect(model.children.map(child => child.id)[0]).toBe(
      model.notesSection?.id
    );
    expect(model.summarySection?.children).toHaveLength(3);
    expect(model.props.title).toBe('A');
    expect(model.props.summarizedAt).toBe(1);

    const second = parseSummaryMarkdown(
      '## Action Items\n- [ ] Send the minutes'
    );
    writeSummary(store, model, second.blocks, { summarizedAt: 2 });
    expect(sectionToMarkdown(model.summarySection)).toBe(
      '#### Action Items\n- [ ] Send the minutes'
    );
    // still exactly one summary section
    expect(model.children).toHaveLength(2);
  });

  test('AI writes stay out of the undo history', () => {
    const { store, model } = setup();
    store.captureSync();
    store.resetHistory();
    writeSummary(store, model, parseSummaryMarkdown('- point').blocks, {
      summarizedAt: 5,
    });
    expect(store.canUndo).toBe(false);
  });

  test('ensureSection reuses existing sections', () => {
    const { store, model } = setup();
    const notes = ensureSection(store, model, 'notes');
    expect(notes.id).toBe(model.notesSection?.id);
    const summary = ensureSection(store, model, 'summary');
    expect(ensureSection(store, model, 'summary').id).toBe(summary.id);
  });
});
