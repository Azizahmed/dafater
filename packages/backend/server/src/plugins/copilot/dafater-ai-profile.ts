import { BadRequest, SsrfBlockedError } from '../../base';
import type { Models } from '../../models';
import type {
  CopilotProviderProfile,
  OpenAICompatibleProviderConfig,
} from './config';
import { CopilotProviderType } from './providers/types';

/**
 * Dafater: the administrator's OpenAI-compatible provider is stored as one
 * `openai` profile inside the `copilot.providers.profiles` app config. Its
 * `config` also carries the speech-to-text settings used by AI meeting notes
 * (the native runtime ignores these extra keys).
 */
export const DAFATER_AI_PROFILE_ID = 'dafater-openai-compatible';
export const PROFILES_CONFIG_KEY = 'copilot.providers.profiles';

export type DafaterProfileConfig = Partial<OpenAICompatibleProviderConfig> & {
  /** e.g. `whisper-1`, `gpt-4o-mini-transcribe`, `whisper-large-v3` */
  transcriptionModel?: string;
  /** '' or absent: the main `baseURL` (and its `apiKey`) */
  transcriptionBaseURL?: string;
  /** only used with a separate `transcriptionBaseURL` */
  transcriptionApiKey?: string;
};

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

/** `right` must already be normalized. */
export function sameEndpoint(left: unknown, right: string | undefined) {
  if (typeof left !== 'string' || !left || !right) return false;
  try {
    return normalizeBaseUrl(left) === right;
  } catch {
    return false;
  }
}

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function findDafaterProfile(
  profiles: unknown
): CopilotProviderProfile | undefined {
  if (!Array.isArray(profiles)) return undefined;
  const list = profiles as CopilotProviderProfile[];
  return (
    list.find(profile => profile?.id === DAFATER_AI_PROFILE_ID) ??
    list.find(
      profile =>
        profile?.type === CopilotProviderType.OpenAI &&
        typeof profile.config?.baseURL === 'string'
    )
  );
}

/** Reads the stored (unredacted) profiles straight from the app config row. */
export async function readStoredProfiles(
  models: Models
): Promise<CopilotProviderProfile[]> {
  const row = await models.appConfig.get(PROFILES_CONFIG_KEY);
  return Array.isArray(row?.value)
    ? (row.value as unknown as CopilotProviderProfile[])
    : [];
}

export async function readDafaterProfile(models: Models) {
  return findDafaterProfile(await readStoredProfiles(models));
}

export function profileConfig(
  profile: CopilotProviderProfile | undefined
): DafaterProfileConfig {
  return (profile?.config ?? {}) as DafaterProfileConfig;
}

/**
 * The stored key for `endpoint` (normalized), looking at both the main and the
 * transcription endpoint of the stored config. A stored key is only ever
 * reused for the endpoint it was saved with, so changing a base URL never
 * sends a key to a different host.
 */
export function storedKeyForEndpoint(
  stored: DafaterProfileConfig,
  endpoint: string
): string | undefined {
  if (
    nonEmpty(stored.transcriptionBaseURL) &&
    sameEndpoint(stored.transcriptionBaseURL, endpoint) &&
    nonEmpty(stored.transcriptionApiKey)
  ) {
    return nonEmpty(stored.transcriptionApiKey);
  }
  if (sameEndpoint(stored.baseURL, endpoint) && nonEmpty(stored.apiKey)) {
    return nonEmpty(stored.apiKey);
  }
  return undefined;
}

export interface TranscriptionTarget {
  model: string;
  /** normalized, without trailing slash, e.g. `https://api.openai.com/v1` */
  baseURL: string;
  apiKey?: string;
  allowPrivateNetwork: boolean;
}

/**
 * The endpoint used for speech-to-text, from a stored profile config:
 * `transcriptionBaseURL` + `transcriptionApiKey` when a separate base URL is
 * set, otherwise the main `baseURL` + `apiKey`. `null` when no transcription
 * model or no base URL is configured.
 */
export function resolveTranscriptionTarget(
  config: DafaterProfileConfig | undefined
): TranscriptionTarget | null {
  if (!config) return null;
  const model = nonEmpty(config.transcriptionModel);
  if (!model) return null;
  const separate = nonEmpty(config.transcriptionBaseURL);
  const rawBaseURL = separate ?? nonEmpty(config.baseURL);
  if (!rawBaseURL) return null;
  let baseURL: string;
  try {
    baseURL = normalizeBaseUrl(rawBaseURL);
  } catch {
    return null;
  }
  const apiKey = separate
    ? nonEmpty(config.transcriptionApiKey)
    : nonEmpty(config.apiKey);
  return {
    model,
    baseURL,
    ...(apiKey ? { apiKey } : {}),
    allowPrivateNetwork: config.allowPrivateNetwork === true,
  };
}

/**
 * The transcription key to save (or test with) for a separate transcription
 * endpoint: the key typed now, else the key the main endpoint uses when both
 * endpoints are the same, else the stored key for that same endpoint.
 * Returns `undefined` when no separate endpoint is set (the main key is used).
 */
export function resolveTranscriptionApiKey(input: {
  /** normalized, '' for "same as the main base URL" */
  transcriptionBaseURL: string;
  transcriptionApiKey?: string;
  /** normalized main base URL */
  mainBaseURL: string;
  /** effective main key (typed now or reused) */
  mainApiKey?: string;
  stored: DafaterProfileConfig;
}): string | undefined {
  if (!input.transcriptionBaseURL) return undefined;
  return (
    nonEmpty(input.transcriptionApiKey) ??
    (input.mainBaseURL === input.transcriptionBaseURL
      ? nonEmpty(input.mainApiKey)
      : undefined) ??
    storedKeyForEndpoint(input.stored, input.transcriptionBaseURL)
  );
}

// ========== upstream errors (shared by the admin tests and meeting notes) ==========

export type UpstreamErrorCode =
  | 'private_network'
  | 'blocked_url'
  | 'timeout'
  | 'unauthorized'
  | 'not_found'
  | 'http_error'
  | 'network_error'
  | 'invalid_response';

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Maps a thrown `safeFetch` error to a stable code. */
export function classifyFetchError(
  error: unknown,
  allowPrivateNetwork: boolean
): UpstreamErrorCode {
  const message = errorMessage(error);
  const ssrfReason =
    error instanceof SsrfBlockedError &&
    typeof (error.data as { reason?: unknown } | undefined)?.reason === 'string'
      ? (error.data as { reason: string }).reason
      : undefined;
  const blocked = ssrfReason
    ? ssrfReason === 'blocked_ip' || ssrfReason === 'blocked_hostname'
    : /blocked_ip|blocked_hostname|private or reserved|private network/i.test(
        message
      );
  if (blocked) return allowPrivateNetwork ? 'blocked_url' : 'private_network';
  if (ssrfReason === 'unresolvable_hostname') return 'network_error';
  if (
    ssrfReason ||
    /ssrf|invalid_url|disallowed_protocol|url_has_credentials/i.test(message)
  ) {
    return 'blocked_url';
  }
  if (/time(d)?[ _-]?out/i.test(message)) return 'timeout';
  return 'network_error';
}

/** A short, secret-free description of a non-2xx upstream response. */
export function describeHttpError(
  status: number,
  text: string
): { error: string; errorCode: UpstreamErrorCode } {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    // plain text body
  }
  const detail =
    (typeof json?.error?.message === 'string' && json.error.message) ||
    (typeof json?.error === 'string' && json.error) ||
    (typeof json?.message === 'string' && json.message) ||
    (typeof json?.detail === 'string' && json.detail) ||
    text.slice(0, 300);
  return {
    error: `HTTP ${status}${detail ? `: ${String(detail).slice(0, 500)}` : ''}`,
    errorCode:
      status === 401 || status === 403
        ? 'unauthorized'
        : status === 404
          ? 'not_found'
          : 'http_error',
  };
}
