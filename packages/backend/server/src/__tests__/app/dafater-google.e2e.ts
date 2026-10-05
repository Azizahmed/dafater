import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';

import { buildAppModule } from '../../app.module';
import { ServerService } from '../../core/config';
import { createTestingApp, type TestingApp } from '../utils';

// Dafater: the administrator turns "Sign in with Google" on and off from
// `/api/admin/oauth/google`.
const test = ava as TestFn<{ app: TestingApp; db: PrismaClient }>;
let originalDeploymentType: typeof env.DEPLOYMENT_TYPE;

test.before(async t => {
  originalDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
  // @ts-expect-error override
  globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
  t.context.app = await createTestingApp({
    imports: [buildAppModule(globalThis.env)],
  });
  t.context.db = t.context.app.get(PrismaClient);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
  const server = t.context.app.get(ServerService);
  // @ts-expect-error disable cache
  server._initialized = false;
});

test.after.always(async t => {
  try {
    await t.context.app.close();
  } finally {
    // @ts-expect-error restore mutable test env singleton
    globalThis.env.DEPLOYMENT_TYPE = originalDeploymentType;
  }
});

async function oauthProviders(app: TestingApp) {
  const res = await app.gql<{ serverConfig: { oauthProviders: string[] } }>(
    '{ serverConfig { oauthProviders } }'
  );
  return res.serverConfig.oauthProviders;
}

test('the administrator turns Google sign-in on and off', async t => {
  const { app } = t.context;

  await app
    .POST('/api/auth/sign-up')
    .send({ email: 'owner@dafater.test', password: '12345678' })
    .expect(200);

  const initial = await app.GET('/api/admin/oauth/google').expect(200);
  t.false(initial.body.enabled);
  t.regex(initial.body.callbackUrl, /\/oauth\/callback$/);

  await app
    .PUT('/api/admin/oauth/google')
    .send({ clientId: 'client.apps.googleusercontent.com' })
    .expect(400);

  const saved = await app
    .PUT('/api/admin/oauth/google')
    .send({
      clientId: 'client.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-secret',
    })
    .expect(200);
  t.true(saved.body.enabled);
  t.true(saved.body.hasClientSecret);
  t.false(JSON.stringify(saved.body).includes('GOCSPX-secret'));
  t.true((await oauthProviders(app)).includes('Google'));

  const preflight = await app
    .POST('/api/oauth/preflight')
    .send({ provider: 'Google', client: 'web', client_nonce: 'nonce' })
    .expect(200);
  const url = new URL(preflight.body.url);
  t.is(url.hostname, 'accounts.google.com');
  t.is(url.searchParams.get('client_id'), 'client.apps.googleusercontent.com');

  // a blank secret keeps the stored one
  const kept = await app
    .PUT('/api/admin/oauth/google')
    .send({ clientId: 'client.apps.googleusercontent.com' })
    .expect(200);
  t.true(kept.body.enabled);

  const disabled = await app
    .PUT('/api/admin/oauth/google')
    .send({ clientId: '' })
    .expect(200);
  t.false(disabled.body.enabled);
  t.false((await oauthProviders(app)).includes('Google'));
});

test('only the administrator can change Google sign-in', async t => {
  const { app } = t.context;

  await app.GET('/api/admin/oauth/google').expect(401);

  await app
    .POST('/api/auth/sign-up')
    .send({ email: 'owner@dafater.test', password: '12345678' })
    .expect(200);
  await app.logout();
  await app
    .POST('/api/auth/sign-up')
    .send({ email: 'member@dafater.test', password: '12345678' })
    .expect(200);

  await app.GET('/api/admin/oauth/google').expect(403);
  await app
    .PUT('/api/admin/oauth/google')
    .send({ clientId: 'x', clientSecret: 'y' })
    .expect(403);
  t.pass();
});
