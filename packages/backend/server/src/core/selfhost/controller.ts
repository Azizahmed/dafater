import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  Config,
  InternalServerError,
  Mutex,
  PasswordRequired,
  UseNamedGuard,
} from '../../base';
import { Models } from '../../models';
import { AuthService, Public, SessionIssuer } from '../auth';
import { validators } from '../utils/validators';
import { FIRST_USER_LOCK } from './sign-up';

interface CreateUserInput {
  name?: string;
  email: string;
  password: string;
}

@UseNamedGuard('selfhost')
@Controller('/api/setup')
export class CustomSetupController {
  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly auth: AuthService,
    private readonly sessionIssuer: SessionIssuer,
    private readonly mutex: Mutex
  ) {}

  @Public()
  @Post('/create-admin-user')
  async createAdmin(
    @Req() req: Request,
    @Res() res: Response,
    @Body() input: CreateUserInput
  ) {
    // a fresh count: `ServerService.initialized()` caches `true` forever
    if ((await this.models.user.count()) > 0) {
      throw new ActionForbidden('First user already created');
    }

    validators.assertValidEmail(input.email);

    if (!input.password) {
      throw new PasswordRequired();
    }

    validators.assertValidPassword(
      input.password,
      this.config.auth.passwordRequirements
    );

    await using lock = await this.mutex.acquire(FIRST_USER_LOCK);

    if (!lock) {
      throw new InternalServerError();
    }

    // re-check under the lock: `/api/auth/sign-up` may have registered the
    // first user in the meantime
    if ((await this.models.user.count()) > 0) {
      throw new ActionForbidden('First user already created');
    }

    const user = await this.models.user.create({
      name: input.name || undefined,
      email: input.email,
      password: input.password,
      registered: true,
      // no email verification on a self-hosted server
      emailVerifiedAt: new Date(),
    });

    try {
      await this.models.userFeature.add(
        user.id,
        'administrator',
        'selfhost setup'
      );

      const issued = await this.auth.issueUser(
        user.id,
        this.sessionIssuer.target(req)
      );
      this.sessionIssuer.apply(res, issued);
      res.send({ id: user.id, email: user.email, name: user.name });
    } catch (e) {
      await this.models.user.delete(user.id);
      throw e;
    }
  }
}
