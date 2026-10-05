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
  return { ...input, apiKey: apiKey ? apiKey : undefined };
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
