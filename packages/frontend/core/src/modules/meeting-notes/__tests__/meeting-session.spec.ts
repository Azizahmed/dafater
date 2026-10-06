import 'fake-indexeddb/auto';

import { insertMeetingNotesBlock } from '@affine/core/blocksuite/ai/blocks/meeting-notes/content';
import type { MeetingNotesBlockModel } from '@affine/core/blocksuite/ai/blocks/meeting-notes/model';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { UserFriendlyError } from '@affine/error';
import { Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { describe, expect, test, vi } from 'vitest';

import type { MeetingNotesApi } from '../api';
import {
  cleanTranscriptText,
  insertSegment,
  MeetingSession,
} from '../entities/meeting-session';
import type { RecordedChunk } from '../recorder/recorder';

const extensions = getStoreManager().config.init().value.get('store');

function createModel() {
  const workspace = new TestWorkspace({ id: 'test' });
  workspace.meta.initialize();
  const store = workspace.createDoc('doc').getStore({ extensions });
  store.load();
  const rootId = store.addBlock('affine:page', { title: new Text('') });
  const noteId = store.addBlock('affine:note', {}, rootId);
  const { blockId } = insertMeetingNotesBlock(store, noteId);
  return store.getModelById(blockId) as MeetingNotesBlockModel;
}

function chunk(startMs: number, endMs: number, voicedMs = 5_000) {
  return {
    startMs,
    endMs,
    voicedMs,
    wav: new Blob([String(startMs)], { type: 'audio/wav' }),
  } satisfies RecordedChunk;
}

function createSession(
  model: MeetingNotesBlockModel,
  transcribe: MeetingNotesApi['transcribe']
) {
  const ended = vi.fn();
  const api = { transcribe } as unknown as MeetingNotesApi;
  const session = new MeetingSession(
    model.id,
    model.store.id,
    { api: () => api, model: () => model, ended },
    { offsetMs: 0, language: 'ar' }
  );
  const internals = session as unknown as {
    enqueue(chunk: RecordedChunk): void;
    idle(): Promise<void>;
  };
  return { session, ended, internals };
}

describe('cleanTranscriptText', () => {
  test('collapses whitespace', () => {
    expect(cleanTranscriptText('  مرحبًا   بكم \n في الاجتماع ')).toBe(
      'مرحبًا بكم في الاجتماع'
    );
  });

  test('drops what speech-to-text models invent for silence', () => {
    for (const text of [
      'Thank you.',
      'Thanks for watching!',
      'شكرا',
      'شكراً لكم على المشاهدة',
      'اشتركوا في القناة',
      'ترجمة نانسي قنقر',
      '[Music]',
    ]) {
      expect(cleanTranscriptText(text), text).toBe('');
    }
  });

  test('keeps real sentences that contain those words', () => {
    expect(cleanTranscriptText('شكرًا على العرض، لنبدأ بالميزانية.')).toBe(
      'شكرًا على العرض، لنبدأ بالميزانية.'
    );
    expect(cleanTranscriptText('Thank you, Sara. Next item.')).toBe(
      'Thank you, Sara. Next item.'
    );
  });
});

describe('insertSegment', () => {
  test('keeps segments in time order', () => {
    const a = { id: 'a', start: 0, end: 10, text: 'a' };
    const c = { id: 'c', start: 20, end: 30, text: 'c' };
    const b = { id: 'b', start: 10, end: 20, text: 'b' };
    expect(insertSegment([a, c], b).map(item => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(insertSegment([], a)).toEqual([a]);
  });
});

describe('MeetingSession transcription', () => {
  test('appends transcribed chunks to the block in order', async () => {
    const model = createModel();
    const transcribe = vi.fn(async (audio: Blob, _options: object) => {
      const start = Number(await audio.text());
      // the first chunk takes longer than the second
      await new Promise(resolve => setTimeout(resolve, start === 0 ? 30 : 1));
      return start === 0 ? 'أهلًا بالجميع' : 'لنبدأ بالبند الأول';
    });
    const { internals } = createSession(model, transcribe);

    internals.enqueue(chunk(0, 12_000));
    internals.enqueue(chunk(12_000, 20_000));
    await internals.idle();

    expect(model.props.transcript.map(segment => segment.text)).toEqual([
      'أهلًا بالجميع',
      'لنبدأ بالبند الأول',
    ]);
    expect(model.props.transcript[1]).toMatchObject({
      start: 12_000,
      end: 20_000,
    });
    expect(model.props.durationMs).toBe(20_000);
    // the language and the previous text are sent along
    expect(transcribe.mock.calls[0][1]).toMatchObject({ language: 'ar' });
  });

  test('skips chunks without speech but keeps the time', async () => {
    const model = createModel();
    const transcribe = vi.fn(async () => 'text');
    const { internals } = createSession(model, transcribe);
    internals.enqueue(chunk(0, 25_000, 0));
    await internals.idle();
    expect(transcribe).not.toHaveBeenCalled();
    expect(model.props.transcript).toHaveLength(0);
    expect(model.props.durationMs).toBe(25_000);
  });

  test('keeps failed chunks for a retry', async () => {
    const model = createModel();
    let fail = true;
    const transcribe = vi.fn(async () => {
      if (fail) {
        throw new UserFriendlyError({
          status: 400,
          code: 'BAD_REQUEST',
          type: 'BAD_REQUEST',
          name: 'BAD_REQUEST',
          message: 'transcription_not_configured',
        });
      }
      return 'تمت المحاولة';
    });
    const { session, internals } = createSession(model, transcribe);
    internals.enqueue(chunk(0, 10_000));
    await internals.idle();
    expect(session.failed$.value).toHaveLength(1);
    expect(session.lastError$.value).toBe('transcription_not_configured');
    // not transient: no automatic retries
    expect(transcribe).toHaveBeenCalledTimes(1);

    fail = false;
    session.retryFailed();
    await internals.idle();
    expect(session.failed$.value).toHaveLength(0);
    expect(model.props.transcript.map(segment => segment.text)).toEqual([
      'تمت المحاولة',
    ]);
  });

  test('transcript writes stay out of the undo history', async () => {
    const model = createModel();
    model.store.resetHistory();
    const { internals } = createSession(model, async () => 'نص');
    internals.enqueue(chunk(0, 5_000));
    await internals.idle();
    expect(model.props.transcript).toHaveLength(1);
    expect(model.store.canUndo).toBe(false);
  });
});
