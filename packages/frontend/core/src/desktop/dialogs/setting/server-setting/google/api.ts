import type { FetchService } from '@affine/core/modules/cloud';

/**
 * Dafater: REST client for the administrator's "Sign in with Google" settings
 * (`/api/admin/oauth/google`, see
 * packages/backend/server/src/plugins/oauth/admin-google-controller.ts).
 */
export interface ServerGoogleConfig {
  enabled: boolean;
  clientId: string;
  /** the secret itself is never sent back */
  hasClientSecret: boolean;
  /** "Authorized redirect URI" to register in the Google Cloud console */
  callbackUrl: string;
}

export interface ServerGoogleConfigInput {
  clientId: string;
  /** empty or omitted: keep the stored secret */
  clientSecret?: string;
}

const ENDPOINT = '/api/admin/oauth/google';

export async function getServerGoogleConfig(fetchService: FetchService) {
  const res = await fetchService.fetch(ENDPOINT, { method: 'GET' });
  return (await res.json()) as ServerGoogleConfig;
}

export async function saveServerGoogleConfig(
  fetchService: FetchService,
  input: ServerGoogleConfigInput
) {
  const clientSecret = input.clientSecret?.trim();
  const res = await fetchService.fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId.trim(),
      clientSecret: clientSecret ? clientSecret : undefined,
    }),
  });
  return (await res.json()) as ServerGoogleConfig;
}
