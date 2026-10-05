import { Body, Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { get } from 'lodash-es';
import { z } from 'zod';

import {
  Config,
  EmailAlreadyUsed,
  InternalServerError,
  InvalidEmail,
  Mutex,
  PasswordRequired,
  SignUpForbidden,
  Throttle,
  UseNamedGuard,
} from '../../base';
import { Models } from '../../models';
import { AuthService, Public, SessionIssuer } from '../auth';
import { ServerService } from '../config';
import { validators } from '../utils/validators';

/**
 * Shared with `/api/setup/create-admin-user`, so that the "first user becomes
 * the administrator" decision is serialized across both endpoints.
 */
export const FIRST_USER_LOCK = 'createFirstAdmin';

const SignUpBodySchema = z.object({
  email: z.string().trim().max(320),
  password: z.string().max(1024).optional(),
  name: z.string().trim().max(64).optional(),
});

export interface SignUpResponse {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  hasPassword: boolean | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  exchangeCode?: string;
}

/**
 * Dafater account sign-up: email + password (+ optional name), no email
 * verification. The first account registered on the server automatically
 * becomes the server administrator.
 */
@Throttle('strict')
@Controller('/api/auth')
export class SignUpController {
  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly auth: AuthService,
    private readonly sessionIssuer: SessionIssuer,
    private readonly mutex: Mutex,
    private readonly server: ServerService
  ) {}

  /**
   * `auth.allowSignup` is owned by the native runtime, so it is not part of
   * the node `Config` object: read the effective value (default, config file
   * and admin overrides) instead.
   */
  private async allowSignup() {
    const config = await this.server.getEffectiveAdminConfig();
    return get(config, 'auth.allowSignup') !== false;
  }

  @Public()
  @UseNamedGuard('version', 'captcha', 'selfhost')
  @Post('/sign-up')
  async signUp(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body?: unknown
  ) {
    const parsed = SignUpBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new InvalidEmail({ email: 'not provided' });
    }
    const { email, password } = parsed.data;
    const name = parsed.data.name || undefined;

    validators.assertValidEmail(email);
    if (!password) {
      throw new PasswordRequired();
    }
    validators.assertValidPassword(
      password,
      this.config.auth.passwordRequirements
    );

    await using lock = await this.mutex.acquire(FIRST_USER_LOCK);
    if (!lock) {
      throw new InternalServerError();
    }

    // do not rely on `ServerService.initialized()`: it caches `true` forever,
    // while the first-admin decision must reflect the real users table.
    const isFirstUser = (await this.models.user.count()) === 0;
    if (!isFirstUser && !(await this.allowSignup())) {
      throw new SignUpForbidden();
    }

    const existing = await this.models.user.getUserByEmail(email, {
      withDisabled: true,
    });
    if (existing && (existing.registered || existing.disabled)) {
      throw new EmailAlreadyUsed();
    }

    // an unregistered user (e.g. invited into a workspace before having an
    // account) claims the existing record instead of creating a new one
    const user = existing
      ? await this.models.user.completeSignUp(existing.id, {
          password,
          name,
          emailVerifiedAt: new Date(),
        })
      : await this.models.user.create({
          name,
          email,
          password,
          registered: true,
          emailVerifiedAt: new Date(),
        });

    try {
      if (isFirstUser) {
        await this.models.userFeature.add(
          user.id,
          'administrator',
          'first registered user'
        );
      }

      const issued = await this.auth.issueUser(
        user.id,
        this.sessionIssuer.target(req)
      );
      this.sessionIssuer.apply(res, issued);

      res.status(HttpStatus.OK).send({
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: isFirstUser,
        hasPassword: true,
        avatarUrl: user.avatarUrl ?? null,
        emailVerified: true,
        exchangeCode: issued.exchangeCode,
      } satisfies SignUpResponse);
    } catch (e) {
      if (!existing) {
        await this.models.user.delete(user.id).catch(() => {});
      }
      throw e;
    }
  }
}
