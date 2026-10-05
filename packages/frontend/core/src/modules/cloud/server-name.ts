import { I18n } from '@affine/i18n';

/** Fallback server name reported by a Dafater server without a custom name. */
export const DEFAULT_SELF_HOSTED_SERVER_NAME = 'Dafater';

// default server names used before the rebrand (still stored in old configs)
const LEGACY_DEFAULT_SERVER_NAMES = new Set([
  DEFAULT_SELF_HOSTED_SERVER_NAME,
  'Dafater Self-hosted',
  'Dafater Cloud',
  'AFFiNE Self-hosted',
  'AFFiNE Cloud',
]);

/**
 * User-visible name of a Dafater server: the localized product name
 * («دفاتر» / "Dafater"), followed by the custom server name if the
 * administrator configured one.
 */
export function getSelfHostedServerName(serverName?: string | null) {
  const brandName = I18n['com.affine.brand.name']();
  return serverName && !LEGACY_DEFAULT_SERVER_NAMES.has(serverName)
    ? `${brandName} (${serverName})`
    : brandName;
}
