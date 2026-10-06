import '../../plugins/copilot';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { RawBodyRequest } from '@nestjs/common';
import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { TestFn } from 'ava';
import ava from 'ava';
import type { Request } from 'express';
import request from 'supertest';

import { ServerService } from '../../core';
import { Models } from '../../models';
import { DAFATER_AI_PROFILE_ID } from '../../plugins/copilot/dafater-ai-profile';
import { MEETING_SUMMARY_MARKER } from '../../plugins/copilot/meeting-notes/prompt';
import { configureBodyParsers } from '../../server';
import { createTestingApp, type TestingApp } from '../utils';

/**
 * Dafater AI meeting notes: REST endpoints end to end, with an in-process
 * OpenAI-compatible mock provider (transcriptions + chat completions).
 */

interface RecordedTranscription {
  authorization?: string;
  url?: string;
  fields: Record<string, string>;
  file?: { name: string; type: string; size: number };
}

type Context = {
  app: TestingApp;
  provider: Server;
  baseURL: string;
  transcriptions: RecordedTranscription[];
  chats: any[];
  mode: { transcription: 'ok' | 'unauthorized' };
};

const test = ava.serial as TestFn<Context>;

const SUMMARY = [
  'Sure, here are the notes:',
  '```markdown',
  '# خطة إطلاق النسخة الجديدة',
  '',
  '## نظرة عامة',
  '- إطلاق النسخة الجديدة في نهاية الشهر.',
  '',
  '## المهام',
  '- [ ] تجهيز خطة التسويق — سارة',
  '```',
].join('\n');

async function readBody(req: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function startProvider(t: { context: Partial<Context> }) {
  const ctx = t.context;
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.url?.endsWith('/audio/transcriptions')) {
      const form = await new Response(body, {
        headers: { 'content-type': String(req.headers['content-type']) },
      }).formData();
      const fields: Record<string, string> = {};
      let file: RecordedTranscription['file'];
      for (const [key, value] of form.entries()) {
        if (typeof value === 'string') fields[key] = value;
        else file = { name: value.name, type: value.type, size: value.size };
      }
      ctx.transcriptions!.push({
        authorization: req.headers.authorization,
        url: req.url,
        fields,
        file,
      });
      if (ctx.mode!.transcription === 'unauthorized') {
        return send(401, { error: { message: 'Invalid API key provided' } });
      }
      return send(200, { text: '  مرحبًا بكم في اجتماع التخطيط.  ' });
    }
    if (req.url === '/v1/chat/completions') {
      const json = JSON.parse(body.toString('utf8'));
      ctx.chats!.push(json);
      const content = JSON.stringify(json).includes(MEETING_SUMMARY_MARKER)
        ? SUMMARY
        : 'pong';
      if (!json.stream) {
        return send(200, {
          id: 'c1',
          object: 'chat.completion',
          created: 0,
          model: json.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta: object, finish_reason: string | null = null) =>
        res.write(
          `data: ${JSON.stringify({
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 0,
            model: json.model,
            choices: [{ index: 0, delta, finish_reason }],
          })}\n\n`
        );
      chunk({ role: 'assistant', content: '' });
      for (const piece of content.match(/[\s\S]{1,40}/g) ?? []) {
        chunk({ content: piece });
      }
      chunk({}, 'stop');
      res.write(
        `data: ${JSON.stringify({
          id: 'c1',
          object: 'chat.completion.chunk',
          created: 0,
          model: json.model,
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })}\n\n`
      );
      res.end('data: [DONE]\n\n');
      return;
    }
    send(404, { error: { message: `unknown route ${req.url}` } });
  });
  return new Promise<Server>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(server))
  );
}

test.before(async t => {
  t.context.transcriptions = [];
  t.context.chats = [];
  t.context.mode = { transcription: 'ok' };
  t.context.provider = await startProvider(t);
  const { port } = t.context.provider.address() as AddressInfo;
  t.context.baseURL = `http://127.0.0.1:${port}/v1`;
  t.context.app = await createTestingApp();
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
  t.context.transcriptions.length = 0;
  t.context.chats.length = 0;
  t.context.mode.transcription = 'ok';
});

test.after.always(async t => {
  await t.context.app?.close();
  await new Promise(resolve => t.context.provider?.close(resolve));
});

async function configure(
  t: { context: Context },
  extra: Record<string, unknown> = {}
) {
  const { app, baseURL } = t.context;
  await app.signup({ feature: 'administrator' });
  const res = await app
    .PUT('/api/admin/ai')
    .send({
      enabled: true,
      baseURL,
      apiKey: 'sk-main',
      model: 'mock-model',
      allowPrivateNetwork: true,
      transcriptionModel: 'whisper-1',
      ...extra,
    })
    .expect(200);
  return res.body;
}

async function storedConfig(app: TestingApp) {
  const row = await app.get(Models).appConfig.get('copilot.providers.profiles');
  const profiles = row?.value as any[];
  return profiles.find(p => p.id === DAFATER_AI_PROFILE_ID)?.config;
}

test('meeting notes endpoints require a signed-in user', async t => {
  const { app } = t.context;
  await app.GET('/api/copilot/meeting-notes/capabilities').expect(401);
  await app
    .POST('/api/copilot/meeting-notes/summarize')
    .send({ notes: 'x' })
    .expect(401);
  await app
    .POST('/api/copilot/meeting-notes/transcribe')
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from('RIFF'))
    .expect(401);
  t.is(t.context.transcriptions.length, 0);
});

test('capabilities report nothing when AI is disabled', async t => {
  const { app } = t.context;
  const server = app.get(ServerService);
  await app.signup();
  await server.updateConfig(null, [
    { module: 'copilot', key: 'enabled', value: false },
  ]);
  try {
    const res = await app
      .GET('/api/copilot/meeting-notes/capabilities')
      .expect(200);
    t.deepEqual(res.body, { summary: false, transcription: false });
    const transcribe = await app
      .POST('/api/copilot/meeting-notes/transcribe?mimeType=audio/wav')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from('RIFF'))
      .expect(400);
    t.is(transcribe.body.message, 'transcription_not_configured');
  } finally {
    await server.updateConfig(null, [
      { module: 'copilot', key: 'enabled', clear: true },
    ]);
  }
});

test('admin stores the transcription settings without exposing keys', async t => {
  const { app, baseURL } = t.context;
  const body = await configure(t, {
    transcriptionBaseURL: 'http://127.0.0.1:1/v1/',
    transcriptionApiKey: 'sk-stt',
  });
  t.like(body, {
    enabled: true,
    model: 'mock-model',
    transcriptionModel: 'whisper-1',
    transcriptionBaseURL: 'http://127.0.0.1:1/v1',
    hasApiKey: true,
    hasTranscriptionApiKey: true,
  });
  t.false(JSON.stringify(body).includes('sk-'));
  t.like(await storedConfig(app), {
    apiKey: 'sk-main',
    transcriptionModel: 'whisper-1',
    transcriptionBaseURL: 'http://127.0.0.1:1/v1',
    transcriptionApiKey: 'sk-stt',
  });

  // empty key + same endpoint → kept
  const put = (extra: object) =>
    app
      .PUT('/api/admin/ai')
      .send({
        enabled: true,
        baseURL,
        model: 'mock-model',
        allowPrivateNetwork: true,
        transcriptionModel: 'whisper-1',
        ...extra,
      })
      .expect(200);
  await put({ transcriptionBaseURL: 'http://127.0.0.1:1/v1' });
  t.is((await storedConfig(app)).transcriptionApiKey, 'sk-stt');
  t.is((await storedConfig(app)).apiKey, 'sk-main');

  // omitted transcription fields keep the stored values
  await app
    .PUT('/api/admin/ai')
    .send({
      enabled: true,
      baseURL,
      model: 'mock-model',
      allowPrivateNetwork: true,
    })
    .expect(200);
  t.like(await storedConfig(app), {
    transcriptionModel: 'whisper-1',
    transcriptionApiKey: 'sk-stt',
  });

  // a different endpoint never inherits the stored key
  await put({ transcriptionBaseURL: 'http://127.0.0.1:2/v1' });
  t.is((await storedConfig(app)).transcriptionApiKey, undefined);

  // '' = same as the main endpoint: nothing separate is stored
  const same = await put({ transcriptionBaseURL: '' });
  t.like(same.body, {
    transcriptionBaseURL: '',
    hasTranscriptionApiKey: false,
  });

  // validation still passes through the native config validator
  await app
    .PUT('/api/admin/ai')
    .send({
      enabled: true,
      baseURL,
      model: 'mock-model',
      transcriptionBaseURL: 'ftp://nope',
    })
    .expect(400);
});

test('admin can test the transcription endpoint', async t => {
  const { app, baseURL } = t.context;
  await configure(t);
  const ok = await app
    .POST('/api/admin/ai/test-transcription')
    .send({
      baseURL,
      model: 'mock-model',
      allowPrivateNetwork: true,
      transcriptionModel: 'whisper-1',
    })
    .expect(200);
  t.like(ok.body, { ok: true, sampleText: 'مرحبًا بكم في اجتماع التخطيط.' });
  t.is(typeof ok.body.latencyMs, 'number');
  const sent = t.context.transcriptions.at(-1)!;
  // the stored main key is reused for the same endpoint
  t.is(sent.authorization, 'Bearer sk-main');
  t.is(sent.fields.model, 'whisper-1');
  t.is(sent.fields.response_format, 'json');
  t.like(sent.file, { name: 'audio.wav', type: 'audio/wav', size: 32_044 });

  t.context.mode.transcription = 'unauthorized';
  const denied = await app
    .POST('/api/admin/ai/test-transcription')
    .send({
      baseURL,
      model: 'mock-model',
      allowPrivateNetwork: true,
      transcriptionModel: 'whisper-1',
    })
    .expect(200);
  t.like(denied.body, { ok: false, errorCode: 'unauthorized' });
  t.regex(denied.body.error, /HTTP 401: Invalid API key provided/);

  const blocked = await app
    .POST('/api/admin/ai/test-transcription')
    .send({ baseURL, model: 'mock-model', transcriptionModel: 'whisper-1' })
    .expect(200);
  t.like(blocked.body, { ok: false, errorCode: 'private_network' });

  // a separate endpoint never gets the stored main key...
  t.context.mode.transcription = 'ok';
  const separate = {
    baseURL,
    model: 'mock-model',
    allowPrivateNetwork: true,
    transcriptionModel: 'whisper-large-v3',
    transcriptionBaseURL: baseURL.replace('/v1', '/stt/v1'),
  };
  await app.POST('/api/admin/ai/test-transcription').send(separate).expect(200);
  t.like(t.context.transcriptions.at(-1), {
    url: '/stt/v1/audio/transcriptions',
    authorization: undefined,
  });
  t.is(t.context.transcriptions.at(-1)!.fields.model, 'whisper-large-v3');
  // ...but uses the key typed for it
  await app
    .POST('/api/admin/ai/test-transcription')
    .send({ ...separate, transcriptionApiKey: 'gsk-typed' })
    .expect(200);
  t.is(t.context.transcriptions.at(-1)!.authorization, 'Bearer gsk-typed');

  await app
    .POST('/api/admin/ai/test-transcription')
    .send({ baseURL, model: 'mock-model' })
    .expect(400);

  // non-admins can't use it
  await app.signup();
  await app
    .POST('/api/admin/ai/test-transcription')
    .send({ baseURL, transcriptionModel: 'whisper-1' })
    .expect(403);
});

test('transcribe forwards audio to the configured endpoint', async t => {
  const { app } = t.context;
  await configure(t);
  await app.signup();

  const caps = await app
    .GET('/api/copilot/meeting-notes/capabilities')
    .expect(200);
  t.deepEqual(caps.body, { summary: true, transcription: true });

  const prompt = 'س'.repeat(600);
  const res = await app
    .POST(
      `/api/copilot/meeting-notes/transcribe?mimeType=audio/webm;codecs=opus&language=ar-SA&prompt=${encodeURIComponent(prompt)}`
    )
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]))
    .expect(200);
  t.deepEqual(res.body, { text: 'مرحبًا بكم في اجتماع التخطيط.' });

  const sent = t.context.transcriptions.at(-1)!;
  t.is(sent.authorization, 'Bearer sk-main');
  t.like(sent.fields, {
    model: 'whisper-1',
    response_format: 'json',
    temperature: '0',
    language: 'ar',
  });
  t.is(Array.from(sent.fields.prompt).length, 500);
  t.like(sent.file, { name: 'audio.webm', type: 'audio/webm', size: 7 });

  // auto language → omitted
  await app
    .POST(
      '/api/copilot/meeting-notes/transcribe?mimeType=audio/wav&language=auto'
    )
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from('RIFF0000WAVE'))
    .expect(200);
  t.false('language' in t.context.transcriptions.at(-1)!.fields);
  t.false('prompt' in t.context.transcriptions.at(-1)!.fields);

  // empty body
  await app
    .POST('/api/copilot/meeting-notes/transcribe')
    .set('content-type', 'application/octet-stream')
    .expect(400);

  // upstream failure → 502 with the upstream status, no secrets
  t.context.mode.transcription = 'unauthorized';
  const failed = await app
    .POST('/api/copilot/meeting-notes/transcribe?mimeType=audio/wav')
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from('RIFF0000WAVE'))
    .expect(502);
  t.regex(failed.body.message, /unauthorized.*HTTP 401: Invalid API key/);
  t.false(JSON.stringify(failed.body).includes('sk-main'));
});

test('transcription is unavailable without a transcription model', async t => {
  const { app } = t.context;
  await configure(t, { transcriptionModel: '' });
  const caps = await app
    .GET('/api/copilot/meeting-notes/capabilities')
    .expect(200);
  t.deepEqual(caps.body, { summary: true, transcription: false });
  const res = await app
    .POST('/api/copilot/meeting-notes/transcribe')
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from('RIFF0000WAVE'))
    .expect(400);
  t.is(res.body.message, 'transcription_not_configured');
  t.is(t.context.transcriptions.length, 0);
});

test('summarize validates the input', async t => {
  const { app } = t.context;
  await configure(t);
  await app
    .POST('/api/copilot/meeting-notes/summarize')
    .send({ notes: '  ', transcript: [] })
    .expect(400);
  await app
    .POST('/api/copilot/meeting-notes/summarize')
    .send({ notes: 'x', instructions: 'haiku' })
    .expect(400);
  t.is(t.context.chats.length, 0);
});

test('summarize routes to the administrator provider', async t => {
  const { app } = t.context;
  await configure(t);
  await app.signup();
  const res = await app
    .POST('/api/copilot/meeting-notes/summarize')
    .send({
      title: '',
      date: '2026-10-06',
      attendees: ['سارة', 'عمر'],
      notes: '- موعد الإطلاق',
      transcript: [
        { start: 0, text: 'مرحبًا بالجميع، لنبدأ اجتماع التخطيط.' },
        { start: 14, text: 'سنطلق النسخة الجديدة في نهاية الشهر.' },
      ],
      instructions: 'auto',
      language: 'ar',
      uiLanguage: 'ar',
    })
    .expect(200);
  t.deepEqual(res.body, {
    title: 'خطة إطلاق النسخة الجديدة',
    markdown:
      '## نظرة عامة\n- إطلاق النسخة الجديدة في نهاية الشهر.\n\n## المهام\n- [ ] تجهيز خطة التسويق — سارة',
  });

  const chat = t.context.chats.at(-1);
  t.is(chat.model, 'mock-model');
  const sent = JSON.stringify(chat.messages);
  t.true(sent.includes(MEETING_SUMMARY_MARKER));
  t.true(sent.includes('[00:14] سنطلق النسخة الجديدة'));
  t.true(sent.includes('<meeting_notes>'));
});

@Controller()
class BodyProbeController {
  private probe(req: RawBodyRequest<Request>) {
    return {
      raw: Buffer.isBuffer(req.rawBody) ? req.rawBody.length : null,
      json:
        req.body && !Buffer.isBuffer(req.body) ? Object.keys(req.body) : null,
    };
  }

  @Post('/api/copilot/meeting-notes/transcribe')
  @HttpCode(200)
  transcribe(@Req() req: RawBodyRequest<Request>) {
    return this.probe(req);
  }

  @Post('/api/copilot/meeting-notes/summarize')
  @HttpCode(200)
  summarize(@Req() req: RawBodyRequest<Request>) {
    return this.probe(req);
  }

  @Post('/api/auth/sign-in')
  @HttpCode(200)
  other(@Req() req: RawBodyRequest<Request>) {
    return this.probe(req);
  }
}

test('production body parsers accept audio and long transcripts', async t => {
  const module = await Test.createTestingModule({
    controllers: [BodyProbeController],
  }).compile();
  const http = module.createNestApplication<NestExpressApplication>({
    logger: false,
    rawBody: true,
  });
  configureBodyParsers(http, '/');
  await http.init();
  await http.listen(0);
  try {
    const server = http.getHttpServer();
    // any content type, up to 25 MB
    const audio = await request(server)
      .post('/api/copilot/meeting-notes/transcribe?mimeType=audio/webm')
      .set('content-type', 'audio/webm')
      .send(Buffer.alloc(2 * 1024 * 1024))
      .expect(200);
    t.is(audio.body.raw, 2 * 1024 * 1024);
    await request(server)
      .post('/api/copilot/meeting-notes/transcribe')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.alloc(26 * 1024 * 1024))
      .expect(413);
    // transcripts larger than the default 100 KB JSON limit
    const summary = await request(server)
      .post('/api/copilot/meeting-notes/summarize')
      .set('content-type', 'application/json')
      .send(
        JSON.stringify({
          transcript: [{ start: 0, text: 'ن'.repeat(300_000) }],
        })
      )
      .expect(200);
    t.deepEqual(summary.body.json, ['transcript']);
    // other routes keep Nest's global JSON parser
    const other = await request(server)
      .post('/api/auth/sign-in')
      .set('content-type', 'application/json')
      .send({ email: 'a@b.c' })
      .expect(200);
    t.deepEqual(other.body.json, ['email']);
  } finally {
    await http.close();
  }
});
