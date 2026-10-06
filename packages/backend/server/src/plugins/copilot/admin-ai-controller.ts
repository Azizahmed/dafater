import { performance } from 'node:perf_hooks';

import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { BadRequest, safeFetch } from '../../base';
import { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Admin } from '../../core/common';
import { ServerService } from '../../core/config';
import { Models } from '../../models';
import type { CopilotProviderProfile } from './config';
import {
  classifyFetchError,
  DAFATER_AI_PROFILE_ID,
  type DafaterProfileConfig,
  describeHttpError,
  errorMessage,
  normalizeBaseUrl,
  profileConfig,
  readDafaterProfile,
  resolveTranscriptionApiKey,
  storedKeyForEndpoint,
  type UpstreamErrorCode,
} from './dafater-ai-profile';
import {
  silentWav,
  transcribeAudio,
  TranscriptionUpstreamError,
} from './meeting-notes/transcription';
import { CopilotProviderType } from './providers/types';

/**
 * Dafater: the server administrator points the server's AI at any
 * OpenAI-compatible API (base URL + API key + model). Every signed-in user can
 * then use the AI features; the native runtime routes built-in prompts to this
 * profile (see `load_managed_profiles` in the native copilot runtime).
 *
 * Plain REST instead of GraphQL so no client codegen is needed.
 */
export { DAFATER_AI_PROFILE_ID, normalizeBaseUrl };
const TEST_TIMEOUT_MS = 15_000;
const TRANSCRIPTION_TEST_TIMEOUT_MS = 30_000;
const TEST_MAX_BYTES = 1024 * 1024;

const AiDialect = z.enum(['chat_completions', 'responses']);
type AiDialect = z.infer<typeof AiDialect>;

const AiConfigInput = z.object({
  enabled: z.boolean(),
  baseURL: z.string().trim().max(2048).default(''),
  apiKey: z.string().trim().max(4096).optional(),
  model: z.string().trim().max(512).default(''),
  dialect: AiDialect.optional(),
  allowPrivateNetwork: z.boolean().optional(),
  vision: z.boolean().optional(),
  // speech-to-text for AI meeting notes: omitted = keep the stored value,
  // '' = off (model) / same as the main base URL and key (base URL)
  transcriptionModel: z.string().trim().max(512).optional(),
  transcriptionBaseURL: z.string().trim().max(2048).optional(),
  // empty or omitted = keep the stored key for the same endpoint
  transcriptionApiKey: z.string().trim().max(4096).optional(),
});
type AiConfigInput = z.infer<typeof AiConfigInput>;

export interface AdminAiConfig {
  enabled: boolean;
  baseURL: string;
  model: string;
  dialect: AiDialect;
  allowPrivateNetwork: boolean;
  vision: boolean;
  /** The key itself is never returned. */
  hasApiKey: boolean;
  /** '' = transcription (AI meeting notes) is off */
  transcriptionModel: string;
  /** '' = the main base URL (and its API key) */
  transcriptionBaseURL: string;
  /** a separate transcription key is stored (never returned) */
  hasTranscriptionApiKey: boolean;
}

export type AdminAiTestErrorCode = UpstreamErrorCode;

export interface AdminAiTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  errorCode?: AdminAiTestErrorCode;
  sampleText?: string;
}

function parseInput(body: unknown, forTest = false): AiConfigInput {
  const parsed = AiConfigInput.safeParse(
    forTest && body && typeof body === 'object'
      ? { enabled: true, ...body }
      : body
  );
  if (!parsed.success) {
    throw new BadRequest(
      parsed.error.issues
        .map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ')
    );
  }
  return parsed.data;
}

@Admin()
@Controller('/api/admin/ai')
export class AdminAiConfigController {
  constructor(
    private readonly server: ServerService,
    private readonly runtime: BackendRuntimeProvider,
    private readonly models: Models
  ) {}

  @Get()
  async getConfig(): Promise<AdminAiConfig> {
    return await this.read();
  }

  @Put()
  async updateConfig(
    @CurrentUser() me: CurrentUser,
    @Body() body: unknown
  ): Promise<AdminAiConfig> {
    const input = parseInput(body);
    if (input.enabled && (!input.baseURL || !input.model)) {
      throw new BadRequest('Base URL and model are required to enable AI.');
    }

    let profiles: CopilotProviderProfile[] = [];
    if (input.baseURL && input.model) {
      const stored = await this.storedConfig();
      const baseURL = normalizeBaseUrl(input.baseURL);
      const apiKey = input.apiKey || storedKeyForEndpoint(stored, baseURL);
      // omitted transcription fields keep their stored values
      const transcriptionModel = (
        input.transcriptionModel ??
        stored.transcriptionModel ??
        ''
      ).trim();
      const rawTranscriptionBaseURL = (
        input.transcriptionBaseURL ??
        stored.transcriptionBaseURL ??
        ''
      ).trim();
      const transcriptionBaseURL = rawTranscriptionBaseURL
        ? normalizeBaseUrl(rawTranscriptionBaseURL)
        : '';
      const transcriptionApiKey = resolveTranscriptionApiKey({
        transcriptionBaseURL,
        transcriptionApiKey: input.transcriptionApiKey,
        mainBaseURL: baseURL,
        mainApiKey: apiKey,
        stored,
      });
      const config: DafaterProfileConfig = {
        ...(apiKey ? { apiKey } : {}),
        baseURL,
        dialect: input.dialect ?? 'chat_completions',
        defaultModel: input.model,
        allowPrivateNetwork: input.allowPrivateNetwork ?? false,
        vision: input.vision ?? false,
        // speech-to-text for AI meeting notes; the native runtime ignores
        // these keys
        ...(transcriptionModel ? { transcriptionModel } : {}),
        ...(transcriptionBaseURL ? { transcriptionBaseURL } : {}),
        ...(transcriptionApiKey ? { transcriptionApiKey } : {}),
      };
      profiles = [
        {
          id: DAFATER_AI_PROFILE_ID,
          type: CopilotProviderType.OpenAI,
          enabled: true,
          models: [input.model],
          config,
        },
      ];
    }

    // the same validated + persisted path as the admin `updateAppConfig`
    // GraphQL mutation
    await this.server.updateConfig(me.id, [
      { module: 'copilot', key: 'enabled', value: input.enabled },
      { module: 'copilot', key: 'providers.profiles', value: profiles },
      // In Dafater only the administrator configures AI: per-workspace BYOK is
      // off (it would also require a stable `crypto.privateKey`).
      ...(input.enabled
        ? [{ module: 'copilot', key: 'byok.enabled', value: false }]
        : []),
    ]);
    return await this.read();
  }

  @Post('/test')
  @HttpCode(200)
  async testConnection(@Body() body: unknown): Promise<AdminAiTestResult> {
    const input = parseInput(body, true);
    if (!input.baseURL || !input.model) {
      throw new BadRequest('Base URL and model are required.');
    }
    const baseURL = normalizeBaseUrl(input.baseURL);
    const apiKey =
      input.apiKey || storedKeyForEndpoint(await this.storedConfig(), baseURL);
    const dialect = input.dialect ?? 'chat_completions';
    const allowPrivateNetwork = input.allowPrivateNetwork ?? false;

    const started = performance.now();
    const latencyMs = () => Math.round(performance.now() - started);
    try {
      let result = await this.ping(
        baseURL,
        apiKey,
        input.model,
        dialect,
        allowPrivateNetwork,
        false
      );
      // newer OpenAI models reject `max_tokens` on chat completions
      if (
        !result.ok &&
        result.status === 400 &&
        dialect === 'chat_completions' &&
        result.error?.includes('max_tokens')
      ) {
        result = await this.ping(
          baseURL,
          apiKey,
          input.model,
          dialect,
          allowPrivateNetwork,
          true
        );
      }
      return {
        ok: result.ok,
        latencyMs: latencyMs(),
        ...(result.ok
          ? { sampleText: result.sampleText }
          : { error: result.error, errorCode: result.errorCode }),
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: latencyMs(),
        error: errorMessage(error),
        errorCode: classifyFetchError(error, allowPrivateNetwork),
      };
    }
  }

  /**
   * Sends one second of silence to `{base URL}/audio/transcriptions` with the
   * transcription settings from the form (stored keys are reused only for the
   * same endpoint).
   */
  @Post('/test-transcription')
  @HttpCode(200)
  async testTranscription(@Body() body: unknown): Promise<AdminAiTestResult> {
    const input = parseInput(body, true);
    const stored = await this.storedConfig();
    const model = (input.transcriptionModel ?? '').trim();
    if (!model) {
      throw new BadRequest('Transcription model is required.');
    }
    const mainBaseURL = input.baseURL ? normalizeBaseUrl(input.baseURL) : '';
    const transcriptionBaseURL = input.transcriptionBaseURL
      ? normalizeBaseUrl(input.transcriptionBaseURL)
      : '';
    const baseURL = transcriptionBaseURL || mainBaseURL;
    if (!baseURL) {
      throw new BadRequest('Base URL is required.');
    }
    const mainApiKey =
      input.apiKey ||
      (mainBaseURL ? storedKeyForEndpoint(stored, mainBaseURL) : undefined);
    const apiKey = transcriptionBaseURL
      ? resolveTranscriptionApiKey({
          transcriptionBaseURL,
          transcriptionApiKey: input.transcriptionApiKey,
          mainBaseURL,
          mainApiKey,
          stored,
        })
      : mainApiKey;
    const allowPrivateNetwork = input.allowPrivateNetwork ?? false;

    const started = performance.now();
    const latencyMs = () => Math.round(performance.now() - started);
    try {
      const { text } = await transcribeAudio(
        { model, baseURL, apiKey, allowPrivateNetwork },
        silentWav(1),
        { mimeType: 'audio/wav', timeoutMs: TRANSCRIPTION_TEST_TIMEOUT_MS }
      );
      return { ok: true, latencyMs: latencyMs(), sampleText: text };
    } catch (error) {
      if (error instanceof TranscriptionUpstreamError) {
        return {
          ok: false,
          latencyMs: latencyMs(),
          error: error.message,
          errorCode: error.errorCode,
        };
      }
      return {
        ok: false,
        latencyMs: latencyMs(),
        error: errorMessage(error),
        errorCode: classifyFetchError(error, allowPrivateNetwork),
      };
    }
  }

  private async ping(
    baseURL: string,
    apiKey: string | undefined,
    model: string,
    dialect: AiDialect,
    allowPrivateNetwork: boolean,
    maxCompletionTokens: boolean
  ): Promise<{
    ok: boolean;
    status?: number;
    sampleText?: string;
    error?: string;
    errorCode?: AdminAiTestErrorCode;
  }> {
    const path = dialect === 'responses' ? '/responses' : '/chat/completions';
    const payload: Record<string, unknown> =
      dialect === 'responses'
        ? { model, input: 'ping', max_output_tokens: 16 }
        : {
            model,
            messages: [{ role: 'user', content: 'ping' }],
            stream: false,
            [maxCompletionTokens ? 'max_completion_tokens' : 'max_tokens']: 16,
          };
    const response = await safeFetch(
      `${baseURL}${path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      },
      {
        timeoutMs: TEST_TIMEOUT_MS,
        maxRedirects: 2,
        maxBytes: TEST_MAX_BYTES,
        allowedHeaders: ['authorization', 'content-type', 'accept'],
        allowHttp: true,
        allowPrivateTargetOrigin: allowPrivateNetwork,
      }
    );
    const text = await response.text();
    let json: any = undefined;
    try {
      json = JSON.parse(text);
    } catch {
      // handled below
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        ...describeHttpError(response.status, text),
      };
    }
    const sample =
      dialect === 'responses'
        ? typeof json?.output_text === 'string'
          ? json.output_text
          : Array.isArray(json?.output)
            ? json.output
                .flatMap((item: any) =>
                  Array.isArray(item?.content) ? item.content : []
                )
                .map((content: any) =>
                  typeof content?.text === 'string' ? content.text : ''
                )
                .join('')
            : undefined
        : json?.choices?.[0]?.message?.content;
    if (typeof sample !== 'string') {
      return {
        ok: false,
        status: response.status,
        error: 'The endpoint did not return an OpenAI-compatible response.',
        errorCode: 'invalid_response',
      };
    }
    return { ok: true, status: response.status, sampleText: sample.trim() };
  }

  private async storedConfig(): Promise<DafaterProfileConfig> {
    // internal read: the public admin config redacts this secret key
    return profileConfig(await readDafaterProfile(this.models));
  }

  private async read(): Promise<AdminAiConfig> {
    const profile = await readDafaterProfile(this.models);
    const config = profileConfig(profile);
    return {
      enabled: this.runtime.copilotEnabled(),
      baseURL: typeof config.baseURL === 'string' ? config.baseURL : '',
      model:
        (typeof config.defaultModel === 'string' && config.defaultModel) ||
        profile?.models?.[0] ||
        '',
      dialect:
        config.dialect === 'responses' ? 'responses' : 'chat_completions',
      allowPrivateNetwork: config.allowPrivateNetwork === true,
      vision: config.vision === true,
      hasApiKey: typeof config.apiKey === 'string' && config.apiKey.length > 0,
      transcriptionModel:
        typeof config.transcriptionModel === 'string'
          ? config.transcriptionModel
          : '',
      transcriptionBaseURL:
        typeof config.transcriptionBaseURL === 'string'
          ? config.transcriptionBaseURL
          : '',
      hasTranscriptionApiKey:
        typeof config.transcriptionApiKey === 'string' &&
        config.transcriptionApiKey.length > 0,
    };
  }
}
