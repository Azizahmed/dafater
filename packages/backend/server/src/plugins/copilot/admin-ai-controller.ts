import { performance } from 'node:perf_hooks';

import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { BadRequest, safeFetch } from '../../base';
import { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Admin } from '../../core/common';
import { ServerService } from '../../core/config';
import { Models } from '../../models';
import type {
  CopilotProviderProfile,
  OpenAICompatibleProviderConfig,
} from './config';
import { CopilotProviderType } from './providers/types';

/**
 * Dafater: the server administrator points the server's AI at any
 * OpenAI-compatible API (base URL + API key + model). Every signed-in user can
 * then use the AI features; the native runtime routes built-in prompts to this
 * profile (see `load_managed_profiles` in the native copilot runtime).
 *
 * Plain REST instead of GraphQL so no client codegen is needed.
 */
export const DAFATER_AI_PROFILE_ID = 'dafater-openai-compatible';
const PROFILES_CONFIG_KEY = 'copilot.providers.profiles';
const TEST_TIMEOUT_MS = 15_000;
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
}

export type AdminAiTestErrorCode =
  | 'private_network'
  | 'blocked_url'
  | 'timeout'
  | 'unauthorized'
  | 'not_found'
  | 'http_error'
  | 'network_error'
  | 'invalid_response';

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

/** Same canonical form as the native `canonicalize_endpoint`. */
export function normalizeBaseUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequest('Base URL must be a valid http(s) URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new BadRequest(
      'Base URL must be an http(s) URL without credentials.'
    );
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/+$/, '');
}

function sameEndpoint(left: unknown, right: string) {
  if (typeof left !== 'string' || !left) return false;
  try {
    return normalizeBaseUrl(left) === right;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
      const baseURL = normalizeBaseUrl(input.baseURL);
      const apiKey = input.apiKey || (await this.storedApiKey(baseURL));
      const config: OpenAICompatibleProviderConfig = {
        ...(apiKey ? { apiKey } : {}),
        baseURL,
        dialect: input.dialect ?? 'chat_completions',
        defaultModel: input.model,
        allowPrivateNetwork: input.allowPrivateNetwork ?? false,
        vision: input.vision ?? false,
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
    const apiKey = input.apiKey || (await this.storedApiKey(baseURL));
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
      const message = errorMessage(error);
      const blocked =
        /blocked_ip|blocked_hostname|private or reserved|private network/i.test(
          message
        );
      const errorCode: AdminAiTestErrorCode = blocked
        ? allowPrivateNetwork
          ? 'blocked_url'
          : 'private_network'
        : /ssrf|invalid_url|disallowed_protocol|url_has_credentials/i.test(
              message
            )
          ? 'blocked_url'
          : /time(d)?[ _-]?out/i.test(message)
            ? 'timeout'
            : 'network_error';
      return { ok: false, latencyMs: latencyMs(), error: message, errorCode };
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
      const detail =
        (typeof json?.error?.message === 'string' && json.error.message) ||
        (typeof json?.error === 'string' && json.error) ||
        (typeof json?.message === 'string' && json.message) ||
        text.slice(0, 300);
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        errorCode:
          response.status === 401 || response.status === 403
            ? 'unauthorized'
            : response.status === 404
              ? 'not_found'
              : 'http_error',
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

  private async storedProfiles(): Promise<CopilotProviderProfile[]> {
    // internal read: the public admin config redacts this secret key
    const row = await this.models.appConfig.get(PROFILES_CONFIG_KEY);
    return Array.isArray(row?.value)
      ? (row.value as unknown as CopilotProviderProfile[])
      : [];
  }

  private async storedProfile() {
    const profiles = await this.storedProfiles();
    return (
      profiles.find(profile => profile?.id === DAFATER_AI_PROFILE_ID) ??
      profiles.find(
        profile =>
          profile?.type === CopilotProviderType.OpenAI &&
          typeof profile.config?.baseURL === 'string'
      )
    );
  }

  /**
   * The stored key is only reused for the same endpoint, so changing the base
   * URL never sends the old provider's key to a new host.
   */
  private async storedApiKey(baseURL: string) {
    const profile = await this.storedProfile();
    const config = profile?.config as
      | Partial<OpenAICompatibleProviderConfig>
      | undefined;
    return sameEndpoint(config?.baseURL, baseURL) &&
      typeof config?.apiKey === 'string' &&
      config.apiKey
      ? config.apiKey
      : undefined;
  }

  private async read(): Promise<AdminAiConfig> {
    const profile = await this.storedProfile();
    const config = (profile?.config ??
      {}) as Partial<OpenAICompatibleProviderConfig>;
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
    };
  }
}
