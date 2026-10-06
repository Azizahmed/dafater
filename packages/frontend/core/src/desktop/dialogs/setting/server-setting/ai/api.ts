import type { FetchService } from '@affine/core/modules/cloud';

/**
 * Dafater: REST client for the server administrator's AI provider settings
 * (`/api/admin/ai`, see packages/backend/server/src/plugins/copilot/admin-ai-controller.ts).
 */
export type ServerAiDialect = 'chat_completions' | 'responses';

export interface ServerAiConfig {
  enabled: boolean;
  baseURL: string;
  model: string;
  dialect: ServerAiDialect;
  allowPrivateNetwork: boolean;
  vision: boolean;
  /** the key itself is never sent back */
  hasApiKey: boolean;
  /** speech-to-text model for AI meeting notes; '' = transcription is off */
  transcriptionModel: string;
  /** '' = same as `baseURL` (and its API key) */
  transcriptionBaseURL: string;
  /** a separate transcription key is stored (never sent back) */
  hasTranscriptionApiKey: boolean;
}

export interface ServerAiConfigInput {
  enabled: boolean;
  baseURL: string;
  /** empty or omitted: keep the stored key */
  apiKey?: string;
  model: string;
  dialect: ServerAiDialect;
  allowPrivateNetwork: boolean;
  vision: boolean;
  /** '' turns transcription (AI meeting notes) off */
  transcriptionModel: string;
  /** '' = same as `baseURL` */
  transcriptionBaseURL: string;
  /** empty or omitted: keep the stored key (only used with a separate base URL) */
  transcriptionApiKey?: string;
}

export type ServerAiTestErrorCode =
  | 'private_network'
  | 'blocked_url'
  | 'timeout'
  | 'unauthorized'
  | 'not_found'
  | 'http_error'
  | 'network_error'
  | 'invalid_response';

export interface ServerAiTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  errorCode?: ServerAiTestErrorCode;
  sampleText?: string;
}

const ENDPOINT = '/api/admin/ai';

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function withoutEmptyKey(input: ServerAiConfigInput): ServerAiConfigInput {
  const apiKey = input.apiKey?.trim();
  const transcriptionApiKey = input.transcriptionApiKey?.trim();
  return {
    ...input,
    apiKey: apiKey ? apiKey : undefined,
    transcriptionApiKey: transcriptionApiKey ? transcriptionApiKey : undefined,
  };
}

export async function getServerAiConfig(fetchService: FetchService) {
  const res = await fetchService.fetch(ENDPOINT, { method: 'GET' });
  return (await res.json()) as ServerAiConfig;
}

export async function saveServerAiConfig(
  fetchService: FetchService,
  input: ServerAiConfigInput
) {
  const res = await fetchService.fetch(ENDPOINT, {
    method: 'PUT',
    ...json(withoutEmptyKey(input)),
  });
  return (await res.json()) as ServerAiConfig;
}

export async function testServerAiConfig(
  fetchService: FetchService,
  input: ServerAiConfigInput
) {
  const res = await fetchService.fetch(`${ENDPOINT}/test`, {
    method: 'POST',
    // the server waits up to 15s for the provider
    timeout: 30_000,
    ...json(withoutEmptyKey(input)),
  });
  return (await res.json()) as ServerAiTestResult;
}

/** Sends one second of silence to the transcription endpoint. */
export async function testServerAiTranscription(
  fetchService: FetchService,
  input: ServerAiConfigInput
) {
  const res = await fetchService.fetch(`${ENDPOINT}/test-transcription`, {
    method: 'POST',
    // the server waits up to 30s for the provider
    timeout: 45_000,
    ...json(withoutEmptyKey(input)),
  });
  return (await res.json()) as ServerAiTestResult;
}
