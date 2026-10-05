import { Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';

import { BadRequest, URLHelper } from '../../base';
import { CurrentUser } from '../../core/auth';
import { Admin } from '../../core/common';
import { ServerService } from '../../core/config';
import { Models } from '../../models';
import { type OAuthProviderConfig, OAuthProviderName } from './config';
import { OAuthService } from './service';

const GOOGLE_CONFIG_KEY = 'oauth.providers.google';

const InputSchema = z.object({
  clientId: z.string().trim().max(512),
  // blank keeps the stored secret while the client id stays the same
  clientSecret: z.string().trim().max(512).optional(),
});

export interface AdminGoogleConfig {
  enabled: boolean;
  clientId: string;
  hasClientSecret: boolean;
  /** "Authorized redirect URI" to register in the Google Cloud console */
  callbackUrl: string;
}

/**
 * Dafater: the administrator turns on "Sign in with Google" from the app's
 * settings. Writes `oauth.providers.google` through the same validated path
 * as the admin `updateAppConfig` mutation.
 */
@Admin()
@Controller('/api/admin/oauth/google')
export class AdminGoogleOAuthController {
  constructor(
    private readonly server: ServerService,
    private readonly models: Models,
    private readonly oauth: OAuthService,
    private readonly url: URLHelper
  ) {}

  @Get()
  async getConfig(): Promise<AdminGoogleConfig> {
    return await this.read();
  }

  @Put()
  async updateConfig(
    @CurrentUser() me: CurrentUser,
    @Body() body: unknown
  ): Promise<AdminGoogleConfig> {
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequest('Invalid Google sign-in settings.');
    }
    const { clientId, clientSecret } = parsed.data;
    const stored = await this.stored();
    const secret =
      clientSecret ||
      (stored.clientId === clientId ? (stored.clientSecret ?? '') : '');
    if (clientId && !secret) {
      throw new BadRequest('The client secret is required.');
    }

    const value: OAuthProviderConfig = clientId
      ? { clientId, clientSecret: secret, args: {} }
      : { clientId: '', clientSecret: '', args: {} };
    await this.server.updateConfig(me.id, [
      { module: 'oauth', key: 'providers.google', value },
    ]);
    await this.oauth.refreshProviders();
    return await this.read();
  }

  private async stored(): Promise<Partial<OAuthProviderConfig>> {
    // internal read: the public admin config redacts the secret
    const row = await this.models.appConfig.get(GOOGLE_CONFIG_KEY);
    return row?.value && typeof row.value === 'object'
      ? (row.value as Partial<OAuthProviderConfig>)
      : {};
  }

  private async read(): Promise<AdminGoogleConfig> {
    const stored = await this.stored();
    return {
      enabled: this.oauth.providers.includes(OAuthProviderName.Google),
      clientId: typeof stored.clientId === 'string' ? stored.clientId : '',
      hasClientSecret:
        typeof stored.clientSecret === 'string' &&
        stored.clientSecret.length > 0,
      callbackUrl: this.url.link('/oauth/callback'),
    };
  }
}
