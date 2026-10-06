import { randomUUID } from 'node:crypto';

import { safeFetch } from '../../../base';
import {
  classifyFetchError,
  describeHttpError,
  errorMessage,
  type TranscriptionTarget,
  type UpstreamErrorCode,
} from '../dafater-ai-profile';

/**
 * Dafater: speech-to-text through the administrator's OpenAI-compatible
 * `/audio/transcriptions` endpoint (OpenAI Whisper / gpt-4o-transcribe, Groq,
 * or a local Whisper server such as Speaches or faster-whisper-server).
 */
export const TRANSCRIPTION_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const TRANSCRIPTION_PROMPT_MAX_CHARS = 500;
const TRANSCRIPTION_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class TranscriptionUpstreamError extends Error {
  constructor(
    message: string,
    readonly errorCode: UpstreamErrorCode,
    readonly status?: number
  ) {
    super(message);
    this.name = 'TranscriptionUpstreamError';
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'application/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'video/mp4': 'mp4',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  flac: 'audio/flac',
};

function sniffAudioExtension(audio: Uint8Array): string | undefined {
  const ascii = (start: number, end: number) =>
    Buffer.from(audio.subarray(start, end)).toString('latin1');
  if (audio.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE')
    return 'wav';
  if (
    audio.length >= 4 &&
    audio[0] === 0x1a &&
    audio[1] === 0x45 &&
    audio[2] === 0xdf &&
    audio[3] === 0xa3
  )
    return 'webm';
  if (audio.length >= 4 && ascii(0, 4) === 'OggS') return 'ogg';
  if (audio.length >= 4 && ascii(0, 4) === 'fLaC') return 'flac';
  if (audio.length >= 8 && ascii(4, 8) === 'ftyp') return 'm4a';
  if (
    (audio.length >= 3 && ascii(0, 3) === 'ID3') ||
    (audio.length >= 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
  )
    return 'mp3';
  return undefined;
}

/**
 * File name + content type for the upload. Providers pick the decoder from the
 * file extension, so the declared mime type wins, then the magic bytes.
 */
export function audioFileInfo(
  mimeType: string | undefined,
  audio: Uint8Array
): { filename: string; contentType: string } {
  const declared = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const extension =
    EXTENSION_BY_MIME[declared] ?? sniffAudioExtension(audio) ?? 'wav';
  return {
    filename: `audio.${extension}`,
    contentType:
      declared && EXTENSION_BY_MIME[declared]
        ? declared
        : MIME_BY_EXTENSION[extension],
  };
}

/** ISO-639-1 code (region dropped) or `undefined` for auto-detection. */
export function normalizeLanguage(language: string | undefined | null) {
  const value = language?.trim().toLowerCase();
  if (!value || value === 'auto') return undefined;
  const match = /^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})*$/.exec(value);
  return match ? match[1] : undefined;
}

/** Keeps the end of the previous transcript (the most relevant context). */
export function truncatePrompt(prompt: string | undefined | null) {
  const value = prompt?.replace(/\s+/g, ' ').trim();
  if (!value) return undefined;
  const chars = Array.from(value);
  return chars.length > TRANSCRIPTION_PROMPT_MAX_CHARS
    ? chars.slice(-TRANSCRIPTION_PROMPT_MAX_CHARS).join('').trimStart()
    : value;
}

/** Minimal multipart/form-data encoder (`safeFetch` only takes bytes). */
export function encodeMultipart(
  fields: Record<string, string | undefined>,
  file: {
    name: string;
    filename: string;
    contentType: string;
    data: Uint8Array;
  }
): { body: Buffer; contentType: string } {
  const boundary = `----dafater-${randomUUID()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8'
      )
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      'utf8'
    ),
    Buffer.from(file.data.buffer, file.data.byteOffset, file.data.byteLength),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  );
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** A 16-bit mono PCM WAV of silence (used to test the endpoint). */
export function silentWav(seconds = 1, sampleRate = 16_000) {
  const samples = Math.round(seconds * sampleRate);
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'latin1');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'latin1');
  wav.write('fmt ', 12, 'latin1');
  wav.writeUInt32LE(16, 16); // PCM chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write('data', 36, 'latin1');
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

export interface TranscribeOptions {
  mimeType?: string;
  language?: string;
  prompt?: string;
  timeoutMs?: number;
}

/**
 * POSTs the audio to `{baseURL}/audio/transcriptions` and returns the trimmed
 * text. Throws {@link TranscriptionUpstreamError} on any upstream failure.
 */
export async function transcribeAudio(
  target: TranscriptionTarget,
  audio: Uint8Array,
  options: TranscribeOptions = {}
): Promise<{ text: string }> {
  const file = audioFileInfo(options.mimeType, audio);
  const { body, contentType } = encodeMultipart(
    {
      model: target.model,
      response_format: 'json',
      temperature: '0',
      language: normalizeLanguage(options.language),
      prompt: truncatePrompt(options.prompt),
    },
    { name: 'file', ...file, data: audio }
  );

  let response: Response;
  try {
    response = await safeFetch(
      `${target.baseURL}/audio/transcriptions`,
      {
        method: 'POST',
        headers: {
          'content-type': contentType,
          accept: 'application/json',
          ...(target.apiKey
            ? { authorization: `Bearer ${target.apiKey}` }
            : {}),
        },
        body,
      },
      {
        timeoutMs: options.timeoutMs ?? 120_000,
        maxRedirects: 2,
        maxBytes: TRANSCRIPTION_MAX_RESPONSE_BYTES,
        allowedHeaders: ['authorization', 'content-type', 'accept'],
        allowHttp: true,
        allowPrivateTargetOrigin: target.allowPrivateNetwork,
      }
    );
  } catch (error) {
    throw new TranscriptionUpstreamError(
      errorMessage(error),
      classifyFetchError(error, target.allowPrivateNetwork)
    );
  }

  const text = await response.text();
  if (!response.ok) {
    const { error, errorCode } = describeHttpError(response.status, text);
    throw new TranscriptionUpstreamError(error, errorCode, response.status);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // handled below
  }
  const value = (json as { text?: unknown } | undefined)?.text;
  if (typeof value !== 'string') {
    throw new TranscriptionUpstreamError(
      'The endpoint did not return an OpenAI-compatible transcription.',
      'invalid_response',
      response.status
    );
  }
  return { text: value.trim() };
}
