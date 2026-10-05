import { ServerDeploymentType, ServerFeature } from '@affine/graphql';

import { DEFAULT_SELF_HOSTED_SERVER_NAME } from './server-name';
import type { ServerConfig, ServerMetadata } from './types';

/**
 * The Dafater server the app talks to (exactly one built-in server).
 *
 * - Web / mobile web: the server that serves the app (`location.origin`).
 * - Native builds (electron / ios / android): the build-time
 *   `BUILD_CONFIG.dafaterServerUrl` (env `DAFATER_SERVER_URL`).
 *
 * The id stays `affine-cloud` (internal identifier, used by storage keys and
 * workspace flavours). The default config below is only a placeholder: the
 * real name, features and `initialized` flag are fetched from the server's
 * `serverConfig` query at runtime (`Server.revalidateConfig`).
 *
 * NOTE: a native build without `DAFATER_SERVER_URL` still registers the entry,
 * because `DefaultServerService` (and everything built on it) requires the
 * `affine-cloud` server to exist. It then points at the app's own origin
 * (`assets://` / `capacitor://`), which is never reachable, so the app behaves
 * as local-only (the server simply stays "offline") and users can still add
 * their own server through the "add server" flow.
 */
function getDafaterServerBaseUrl(): string {
  if (BUILD_CONFIG.isNative && BUILD_CONFIG.dafaterServerUrl) {
    return BUILD_CONFIG.dafaterServerUrl.replace(/\/+$/, '');
  }
  return location.origin;
}

export const BUILD_IN_SERVERS: (ServerMetadata & { config: ServerConfig })[] = [
  {
    id: 'affine-cloud',
    baseUrl: getDafaterServerBaseUrl(),
    config: {
      serverName: DEFAULT_SELF_HOSTED_SERVER_NAME,
      features: [ServerFeature.LocalWorkspace],
      oauthProviders: [],
      type: ServerDeploymentType.Selfhosted,
      credentialsRequirement: {
        password: {
          minLength: 8,
          maxLength: 32,
        },
      },
    },
  },
];
