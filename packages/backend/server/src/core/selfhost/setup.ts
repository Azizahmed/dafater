import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Config } from '../../base';
import { ServerService } from '../config';

/**
 * Guards the admin panel of a self-hosted server:
 * - not initialized (no users yet): every `/admin*` page goes to `/admin/setup`
 * - initialized: `/admin/setup` goes back to `/admin`
 *
 * The web app itself (everything outside `/admin`) is never redirected: on a
 * fresh Dafater server the first account is created from the app's own
 * sign-up form (`POST /api/auth/sign-up`) and becomes the administrator.
 */
@Injectable()
export class SetupMiddleware implements NestMiddleware {
  constructor(
    private readonly server: ServerService,
    private readonly config: Config
  ) {}

  use = (req: Request, res: Response, next: (error?: Error | any) => void) => {
    if (!env.selfhosted) {
      next();
      return;
    }

    const basePath = this.config.server.path ?? '';
    const path =
      basePath && req.path.startsWith(basePath)
        ? req.path.slice(basePath.length) || '/'
        : req.path;
    const isAdminPath = path === '/admin' || path.startsWith('/admin/');

    if (!isAdminPath) {
      next();
      return;
    }

    const isSetupPath = path === '/admin/setup' || path === '/admin/setup/';

    // never throw
    this.server
      .initialized()
      .then(initialized => {
        // Redirect to setup page if not initialized
        if (!initialized && !isSetupPath) {
          res.redirect(basePath + '/admin/setup');
          return;
        }

        // redirect to admin page if initialized
        if (initialized && isSetupPath) {
          res.redirect(basePath + '/admin');
          return;
        }

        next();
      })
      .catch(() => {
        next();
      });
  };
}
