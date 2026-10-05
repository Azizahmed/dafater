import serverNativeModule from '@affine/server-native';

import { defineNativeModuleConfig, StorageProviderConfig } from '../../base';
import { CopilotProviderType } from './providers/types';

export type ProviderSpecificConfig = Record<string, unknown>;

/**
 * Dafater: config of an `openai` profile pointing at any OpenAI-compatible
 * API (OpenAI, OpenRouter, Ollama, LM Studio, vLLM...). When no profile lists
 * a built-in route's model, the native runtime serves chat/structured routes
 * with the first enabled `openai` profile that has a `baseURL`.
 * Embeddings, rerank, image generation and transcription are never routed to
 * it.
 */
export type OpenAICompatibleProviderConfig = {
  /** Optional for local servers that need no key. */
  apiKey?: string;
  /** e.g. https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:11434/v1 */
  baseURL: string;
  /** API style; defaults to `chat_completions` when `baseURL` is set. */
  dialect?: 'chat_completions' | 'responses';
  /** Upstream model per built-in model id. */
  modelMap?: Record<string, string>;
  /** Upstream model for every built-in route (fallback: `models[0]`). */
  defaultModel?: string;
  /** Allow `baseURL` to resolve to private/loopback addresses. */
  allowPrivateNetwork?: boolean;
  /** The model accepts image input. */
  vision?: boolean;
};

export type RustRequestMiddleware =
  | 'normalize_messages'
  | 'clamp_max_tokens'
  | 'tool_schema_rewrite'
  | 'openai_request_compat'
  | 'omit_tool_choice';

export type RustStreamMiddleware =
  | 'stream_event_normalize'
  | 'citation_indexing';

export type NodeTextMiddleware =
  | 'citation_footnote'
  | 'callout'
  | 'thinking_format';

export type ProviderMiddlewareConfig = {
  rust?: { request?: RustRequestMiddleware[]; stream?: RustStreamMiddleware[] };
  node?: { text?: NodeTextMiddleware[] };
};

type CopilotProviderProfileCommon = {
  id: string;
  displayName?: string;
  priority?: number;
  enabled?: boolean;
  models?: string[];
  middleware?: ProviderMiddlewareConfig;
};

export type CopilotProviderProfile = CopilotProviderProfileCommon & {
  type: CopilotProviderType;
  config: ProviderSpecificConfig;
};

declare global {
  interface AppConfigSchema {
    copilot: {
      enabled: boolean;
      byok: {
        enabled: ConfigItem<boolean>;
        allowedProviders: ConfigItem<
          Array<'openai' | 'anthropic' | 'gemini' | 'fal'>
        >;
        allowCustomEndpoint: ConfigItem<boolean>;
        allowPrivateEndpoint: ConfigItem<boolean>;
      };
      unsplash: ConfigItem<{
        key: string;
      }>;
      exa: ConfigItem<{
        key: string;
      }>;
      storage: ConfigItem<StorageProviderConfig>;
      providers: {
        profiles: ConfigItem<CopilotProviderProfile[]>;
      };
    };
  }
}

defineNativeModuleConfig(
  'copilot',
  serverNativeModule.appConfigDescriptors('copilot'),
  serverNativeModule.validateAppConfigValue,
  {
    unsplash: {
      desc: 'The config for the unsplash key.',
      default: {
        key: '',
      },
    },
    exa: {
      desc: 'The config for the exa web search key.',
      default: {
        key: '',
      },
    },
  }
);
