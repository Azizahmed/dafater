import type {
  MeetingNotesBlockModel,
  MeetingTranscriptSegment,
} from '@affine/core/blocksuite/ai/blocks/meeting-notes/model';
import { DebugLogger } from '@affine/debug';
import { LiveData } from '@toeverything/infra';
import { nanoid } from 'nanoid';

import { errorMessage, isTransientError, type MeetingNotesApi } from '../api';
import { MIN_VOICED_MS } from '../recorder/audio';
import {
  chunkAudioFile,
  MeetingRecorder,
  type RecordedChunk,
  type RecordingSource,
} from '../recorder/recorder';

const logger = new DebugLogger('affine:meeting-notes');

export type MeetingSessionState =
  | 'starting'
  | 'recording'
  | 'paused'
  /** uploaded file being transcribed */
  | 'importing'
  | 'stopping';

export interface MeetingSessionHost {
  api(): MeetingNotesApi | null;
  /** the block, through a doc reference that outlives the editor */
  model(): MeetingNotesBlockModel | null;
  ended(session: MeetingSession, summarize: boolean): void;
}

const RETRY_DELAYS = [2_000, 6_000];
const CONCURRENCY = 2;

/**
 * Phrases speech-to-text models produce for silence or noise (learnt from
 * subtitle data). Dropped when they are all a chunk contains.
 */
const HALLUCINATIONS = [
  /^(thank you|thanks)( (so much|very much|for watching|for listening))?[.!]*$/i,
  /^(please )?subscribe( to (my|the|our) channel)?[.!]*$/i,
  /^you[.!]*$/i,
  /^شكر(ا|اً|ًا)?( لكم| جزيلا| جزيلًا)?( على المشاهدة| على الاستماع)?[.!]*$/,
  /^(لا تنسوا )?الاشتراك في القناة[.!]*$/,
  /^اشتركوا في القناة[.!]*$/,
  /^ترجمة [^\s]+ [^\s]+[.!]*$/,
  /^موسيقى[.!]*$/,
  /^\[?(music|موسيقى|silence|صمت)\]?$/i,
];

export function cleanTranscriptText(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (HALLUCINATIONS.some(pattern => pattern.test(cleaned))) return '';
  return cleaned;
}

/** Keeps segments sorted by start (chunks may finish out of order). */
export function insertSegment(
  segments: MeetingTranscriptSegment[],
  segment: MeetingTranscriptSegment
) {
  const next = segments.map(({ id, start, end, text }) => ({
    id,
    start,
    end,
    text,
  }));
  const index = next.findIndex(item => item.start > segment.start);
  next.splice(index === -1 ? next.length : index, 0, segment);
  return next;
}

/**
 * One recording of a meeting block: captures audio, transcribes it chunk by
 * chunk and appends the text to the block's transcript.
 */
export class MeetingSession {
  readonly state$ = new LiveData<MeetingSessionState>('starting');
  /** audio chunks waiting for, or being, transcribed */
  readonly pending$ = new LiveData(0);
  /** chunks that could not be transcribed (kept for a retry) */
  readonly failed$ = new LiveData<RecordedChunk[]>([]);
  readonly lastError$ = new LiveData<string | null>(null);
  readonly positionMs$: LiveData<number>;

  private recorder: MeetingRecorder | null = null;
  private readonly queue: RecordedChunk[] = [];
  private running = 0;
  private idleWaiters: (() => void)[] = [];
  private lastText = '';
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly abort = new AbortController();

  constructor(
    readonly blockId: string,
    readonly docId: string,
    private readonly host: MeetingSessionHost,
    private readonly options: {
      offsetMs: number;
      language: string;
    }
  ) {
    this.positionMs$ = new LiveData(options.offsetMs);
    const transcript = host.model()?.props.transcript ?? [];
    this.lastText = transcript.at(-1)?.text ?? '';
  }

  get levels(): readonly number[] {
    return this.recorder?.levels ?? [];
  }

  async record(source: RecordingSource) {
    const recorder = new MeetingRecorder({
      source,
      offsetMs: this.options.offsetMs,
      onChunk: chunk => this.enqueue(chunk),
      onInterrupted: reason => {
        logger.warn('recording interrupted', reason);
        if (reason === 'device-lost') {
          this.stop(true).catch(logger.error);
        }
      },
    });
    this.recorder = recorder;
    await recorder.start();
    this.state$.setValue('recording');
    this.ticker = setInterval(() => {
      this.positionMs$.setValue(recorder.positionMs);
    }, 250);
  }

  async importFile(file: Blob) {
    this.state$.setValue('importing');
    try {
      const durationMs = await chunkAudioFile(
        file,
        this.options.offsetMs,
        async chunk => {
          this.enqueue(chunk);
          this.positionMs$.setValue(chunk.endMs);
          // keep at most a few chunks in memory
          while (this.queue.length >= CONCURRENCY) {
            await this.waitForProgress();
          }
        },
        this.abort.signal
      );
      await this.idle();
      this.saveDuration(this.options.offsetMs + durationMs);
      this.host.ended(this, true);
    } catch (error) {
      this.host.ended(this, false);
      throw error;
    }
  }

  pause() {
    if (this.state$.value !== 'recording') return;
    this.recorder?.pause();
    this.state$.setValue('paused');
  }

  async resume() {
    if (this.state$.value !== 'paused') return;
    await this.recorder?.resume();
    this.state$.setValue('recording');
  }

  /** Stops recording, waits for the last transcriptions, then hands over. */
  async stop(summarize: boolean) {
    const state = this.state$.value;
    if (state === 'stopping') return;
    this.state$.setValue('stopping');
    if (this.ticker) clearInterval(this.ticker);
    await this.recorder?.stop();
    if (this.recorder) this.positionMs$.setValue(this.recorder.positionMs);
    await this.idle();
    this.saveDuration(this.positionMs$.value);
    this.host.ended(this, summarize);
  }

  /** Discards everything still queued (the block was deleted, …). */
  dispose() {
    this.abort.abort();
    if (this.ticker) clearInterval(this.ticker);
    this.queue.length = 0;
    this.recorder?.stop().catch(logger.error);
  }

  retryFailed() {
    const failed = this.failed$.value;
    if (!failed.length) return;
    this.failed$.setValue([]);
    this.lastError$.setValue(null);
    failed.forEach(chunk => this.enqueue(chunk));
  }

  private enqueue(chunk: RecordedChunk) {
    this.saveDuration(chunk.endMs);
    if (chunk.voicedMs < MIN_VOICED_MS) return;
    this.queue.push(chunk);
    this.pending$.setValue(this.queue.length + this.running);
    this.drain();
  }

  private drain() {
    while (this.running < CONCURRENCY && this.queue.length) {
      const chunk = this.queue.shift();
      if (!chunk) break;
      this.running++;
      this.transcribe(chunk)
        .catch(error => logger.error('transcription failed', error))
        .finally(() => {
          this.running--;
          this.pending$.setValue(this.queue.length + this.running);
          this.notifyProgress();
          this.drain();
        });
    }
  }

  private progressWaiters: (() => void)[] = [];

  private waitForProgress() {
    return new Promise<void>(resolve => this.progressWaiters.push(resolve));
  }

  private notifyProgress() {
    const waiters = this.progressWaiters;
    this.progressWaiters = [];
    waiters.forEach(resolve => resolve());
    if (!this.running && !this.queue.length) {
      const idle = this.idleWaiters;
      this.idleWaiters = [];
      idle.forEach(resolve => resolve());
    }
  }

  private idle() {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise<void>(resolve => this.idleWaiters.push(resolve));
  }

  private async transcribe(chunk: RecordedChunk) {
    for (let attempt = 0; ; attempt++) {
      if (this.abort.signal.aborted) return;
      try {
        const api = this.host.api();
        if (!api) throw new Error('Not connected to the server');
        const text = cleanTranscriptText(
          await api.transcribe(chunk.wav, {
            language: this.options.language,
            prompt: this.lastText,
            signal: this.abort.signal,
          })
        );
        if (text) {
          this.lastText = text;
          this.appendSegment({
            id: nanoid(),
            start: Math.round(chunk.startMs),
            end: Math.round(chunk.endMs),
            text,
          });
        }
        return;
      } catch (error) {
        const delay = RETRY_DELAYS[attempt];
        if (
          this.abort.signal.aborted ||
          delay === undefined ||
          !isTransientError(error)
        ) {
          this.lastError$.setValue(errorMessage(error));
          this.failed$.setValue([...this.failed$.value, chunk]);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private appendSegment(segment: MeetingTranscriptSegment) {
    const model = this.host.model();
    if (!model) return;
    const store = model.store;
    store.withoutTransact(() => {
      store.updateBlock(model, {
        transcript: insertSegment(model.props.transcript, segment),
      });
    });
  }

  private saveDuration(positionMs: number) {
    const model = this.host.model();
    if (!model || model.props.durationMs >= positionMs) return;
    const store = model.store;
    store.withoutTransact(() => {
      store.updateBlock(model, { durationMs: Math.round(positionMs) });
    });
  }
}
