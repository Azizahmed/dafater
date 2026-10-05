import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Controller, Post, RawBody } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { buildAppModule } from '../../app.module';
import { Public } from '../../core/auth';
import { ServerService } from '../../core/config';
import { createTestingApp, type TestingApp } from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
  db: PrismaClient;
}>;
let originalDeploymentType: typeof env.DEPLOYMENT_TYPE;

const mobileUAString =
  'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

function initTestStaticFiles(staticPath: string) {
  const files = {
    'selfhost.html': `<!DOCTYPE html><html><body>AFFiNE</body><script src="main.a.js"/></html>`,
    'main.a.js': `const name = 'affine'`,
    'admin/selfhost.html': `<!DOCTYPE html><html><body>AFFiNE Admin</body><script src="/admin/main.b.js"/></html>`,
    'admin/main.b.js': `const name = 'affine-admin'`,
    'mobile/selfhost.html': `<!DOCTYPE html><html><body>AFFiNE mobile</body><script src="/mobile/main.c.js"/></html>`,
    'mobile/main.c.js': `const name = 'affine-mobile'`,
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(staticPath, filename);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

@Controller('/')
export class TestResolver {
  @Public()
  @Post('/upload')
  async upload(@RawBody() buffer: Buffer | undefined): Promise<number> {
    return buffer?.length || 0;
  }
}

test.before('init selfhost server', async t => {
  originalDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
  // @ts-expect-error override
  globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
  const app = await createTestingApp({
    imports: [buildAppModule(globalThis.env)],
    controllers: [TestResolver],
  });

  t.context.app = app;
  t.context.db = t.context.app.get(PrismaClient);

  const staticPath = path.join(env.projectRoot, 'static');
  initTestStaticFiles(staticPath);
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

test('do not allow visit index.html directly', async t => {
  let res = await request(t.context.app.getHttpServer())
    .get('/index.html')
    .expect(302);

  t.is(res.header.location, '');

  res = await request(t.context.app.getHttpServer())
    .get('/admin/index.html')
    .expect(302);

  t.is(res.header.location, '/admin');

  // no static file there: it falls back to the web app, which Dafater serves
  // even before the first account exists (no redirect to /admin/setup)
  res = await request(t.context.app.getHttpServer())
    .get('/mobile/index.html')
    .expect(200);
});

test('should always return static asset files', async t => {
  let res = await request(t.context.app.getHttpServer())
    .get('/main.a.js')
    .expect(200);
  t.is(res.text, "const name = 'affine'");

  res = await request(t.context.app.getHttpServer())
    .get('/admin/main.b.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-admin'");

  res = await request(t.context.app.getHttpServer())
    .get('/main.c.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-mobile'");

  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  res = await request(t.context.app.getHttpServer())
    .get('/main.a.js')
    .expect(200);
  t.is(res.text, "const name = 'affine'");

  res = await request(t.context.app.getHttpServer())
    .get('/admin/main.b.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-admin'");

  res = await request(t.context.app.getHttpServer())
    .get('/main.c.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-mobile'");
});

test('should be able to call apis', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/info')
    .expect(200);

  t.is(res.body.flavor, 'allinone');
});

const adminPages = ['/admin', '/admin/', '/admin/accounts'];
const appPages = ['/', '/workspace'];

test('should redirect admin pages to setup if server is not initialized', async t => {
  for (const path of adminPages) {
    const res = await request(t.context.app.getHttpServer()).get(path);

    t.is(res.status, 302, `Failed to redirect ${path}`);
    t.is(res.header.location, '/admin/setup');
  }
});

test('should serve the web app even if server is not initialized', async t => {
  for (const path of appPages) {
    const res = await request(t.context.app.getHttpServer()).get(path);

    t.is(res.status, 200, `Failed to visit ${path}`);
  }
});

test('should allow visiting all pages if initialized', async t => {
  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  for (const path of [...appPages, ...adminPages]) {
    const res = await request(t.context.app.getHttpServer()).get(path);

    t.is(res.status, 200, `Failed to visit ${path}`);
  }

  t.pass();
});

test('should allow visiting setup page if not initialized', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/admin/setup')
    .expect(200);

  t.true(res.text.includes('AFFiNE Admin'));
});

test('should redirect to admin if initialized', async t => {
  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  const res = await request(t.context.app.getHttpServer())
    .get('/admin/setup')
    .expect(302);

  t.is(res.header.location, '/admin');
});

async function isAdmin(db: PrismaClient, userId: string) {
  const feature = await db.userFeature.findFirst({
    where: { userId, name: 'administrator', activated: true },
  });
  return !!feature;
}

test('should make the first signed up user the administrator', async t => {
  const { app, db } = t.context;

  const first = await app
    .POST('/api/auth/sign-up')
    .send({ email: 'owner@dafater.test', password: '12345678', name: 'Owner' })
    .expect(200);

  t.is(first.body.email, 'owner@dafater.test');
  t.is(first.body.name, 'Owner');
  t.true(first.body.isAdmin);
  t.true(await isAdmin(db, first.body.id));
  t.truthy(
    ([] as string[])
      .concat(first.headers['set-cookie'] ?? [])
      .find(cookie => cookie.startsWith('affine_session='))
  );
  const owner = await db.user.findUniqueOrThrow({
    where: { id: first.body.id },
  });
  t.true(owner.registered);
  t.truthy(owner.emailVerifiedAt);

  const second = await app
    .POST('/api/auth/sign-up')
    .send({ email: 'member@dafater.test', password: '12345678' })
    .expect(200);

  t.false(second.body.isAdmin);
  t.false(await isAdmin(db, second.body.id));
  t.is(second.body.name, 'member');

  const duplicated = await app
    .POST('/api/auth/sign-up')
    .send({ email: 'MEMBER@dafater.test', password: '12345678' });
  t.is(duplicated.body.name, 'EMAIL_ALREADY_USED');

  await app
    .POST('/api/auth/sign-in')
    .send({ email: 'member@dafater.test', password: '12345678' })
    .expect(200);

  // the setup endpoint is closed once the first user exists
  const setup = await app
    .POST('/api/setup/create-admin-user')
    .send({ email: 'late@dafater.test', password: '12345678' });
  t.is(setup.status, 403);
});

test('should validate sign up input', async t => {
  const { app } = t.context;

  let res = await app
    .POST('/api/auth/sign-up')
    .send({ email: 'not-an-email', password: '12345678' });
  t.is(res.body.name, 'INVALID_EMAIL');

  res = await app
    .POST('/api/auth/sign-up')
    .send({ email: 'short@dafater.test', password: '1' });
  t.is(res.body.name, 'INVALID_PASSWORD_LENGTH');

  res = await app
    .POST('/api/auth/sign-up')
    .send({ email: 'nopass@dafater.test' });
  t.is(res.body.name, 'PASSWORD_REQUIRED');

  t.is(await t.context.db.user.count(), 0);
});

test('should still create the admin through the setup endpoint', async t => {
  const { app, db } = t.context;

  const res = await app
    .POST('/api/setup/create-admin-user')
    .send({ email: 'admin@dafater.test', password: '12345678' })
    .expect(201);

  t.true(await isAdmin(db, res.body.id));
});

// TODO(@forehalo): return mobile when it's ready
test.skip('should return web assets if visited by mobile', async t => {
  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  const res = await request(t.context.app.getHttpServer())
    .get('/')
    .set('user-agent', mobileUAString)
    .expect(200);

  t.true(res.text.includes('AFFiNE mobile'));
});

test('should can send maximum size of body', async t => {
  const { app } = t.context;

  const body = 'a'.repeat(1 * 1024 * 1024);
  const res = await app
    .POST('/upload')
    .set('Content-Type', 'application/octet-stream')
    .send(body)
    .expect(201);

  t.is(Number(res.text), body.length);
});
