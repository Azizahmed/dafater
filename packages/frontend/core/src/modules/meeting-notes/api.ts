import type { MeetingNotesInstructions } from '@affine/core/blocksuite/ai/blocks/meeting-notes/model';
import { UserFriendlyError } from '@affine/error';

import type { FetchService } from '../cloud';

/**
 * Dafater: REST client for AI meeting notes
 * (packages/backend/server/src/plugins/copilot/meeting-notes).
 */
export type MeetingNotesCapabilities = {
  /** the server's AI is on: summaries work */
  summary: boolean;
  /** a speech-to-text model is configured: recording works */
  transcription: boolean;
};

export type MeetingSummaryInput = {
  title?: string;
  date?: string;
  attendees?: string[];
  notes?: string;
  /** `start` in seconds from the start of the meeting */
  transcript?: { start: number; text: string }[];
  instructions?: MeetingNotesInstructions;
  customInstructions?: string;
  language?: string;
  uiLanguage?: string;
};

export type MeetingSummary = { title: string; markdown: string };

const ENDPOINT = '/api/copilot/meeting-notes';

export class MeetingNotesApi {
  constructor(private readonly fetchService: FetchService) {}

  async capabilities(): Promise<MeetingNotesCapabilities> {
    const res = await this.fetchService.fetch(`${ENDPOINT}/capabilities`, {
      method: 'GET',
    });
    const body = (await res.json()) as Partial<MeetingNotesCapabilities>;
    return {
      summary: body.summary === true,
      transcription: body.transcription === true,
    };
  }

  async transcribe(
    audio: Blob,
    options: { language?: string; prompt?: string; signal?: AbortSignal }
  ): Promise<string> {
    const search = new URLSearchParams({
      mimeType: audio.type || 'audio/wav',
    });
    if (options.language && options.language !== 'auto') {
      search.set('language', options.language);
    }
    if (options.prompt) search.set('prompt', options.prompt.slice(-400));
    const res = await this.fetchService.fetch(
      `${ENDPOINT}/transcribe?${search.toString()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: audio,
        signal: options.signal,
        timeout: 180_000,
      }
    );
    const body = (await res.json()) as { text?: unknown };
    return typeof body.text === 'string' ? body.text.trim() : '';
  }

  async summarize(
    input: MeetingSummaryInput,
    signal?: AbortSignal
  ): Promise<MeetingSummary> {
    const res = await this.fetchService.fetch(`${ENDPOINT}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
      timeout: 300_000,
    });
    const body = (await res.json()) as Partial<MeetingSummary>;
    if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
      throw new UserFriendlyError({
        status: 502,
        code: 'MEETING_SUMMARY_EMPTY',
        type: 'INTERNAL_SERVER_ERROR',
        name: 'INTERNAL_SERVER_ERROR',
        message: 'The AI returned an empty summary.',
      });
    }
    return {
      title: typeof body.title === 'string' ? body.title.trim() : '',
      markdown: body.markdown,
    };
  }
}

/** Errors worth retrying: network, timeouts, rate limits, server errors. */
export function isTransientError(error: unknown) {
  if (!(error instanceof UserFriendlyError)) return true;
  return (
    error.status === 429 ||
    error.status >= 500 ||
    error.code === 'NETWORK_ERROR' ||
    error.status === 499
  );
}

export function errorMessage(error: unknown) {
  if (error instanceof UserFriendlyError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
