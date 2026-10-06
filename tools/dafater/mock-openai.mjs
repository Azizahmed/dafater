#!/usr/bin/env node
/**
 * Dafater: tiny mock of an OpenAI-compatible API, for testing the server's
 * administrator AI configuration without real API keys.
 *
 * Run:
 *   node tools/dafater/mock-openai.mjs            # listens on http://localhost:18080
 *   PORT=18081 node tools/dafater/mock-openai.mjs
 *
 * Then, as the Dafater server administrator (Settings → Server administration
 * → AI, or PUT /api/admin/ai):
 *   base URL: http://localhost:18080/v1   model: mock-model
 *   API key:  anything (the mock accepts any key, or none)
 *   advanced: API style "Chat Completions", "Allow local network" ON
 *
 *   transcription (AI meeting notes): model whisper-1, separate base URL empty
 *
 * Endpoints:
 *   GET  /v1/models
 *   POST /v1/chat/completions     (non-streaming, and SSE streaming when `stream: true`)
 *   POST /v1/responses            (non-streaming only, for the "Responses" API style)
 *   POST /v1/audio/transcriptions (multipart/form-data, like OpenAI Whisper)
 *
 * Chat replies are deterministic Arabic text that quotes the start of the last
 * user message. A `response_format` of json_schema/json_object gets a small
 * JSON object instead. A request whose prompt contains the meeting-summary
 * marker (`dafater-meeting-notes-summary`, see
 * packages/backend/server/src/plugins/copilot/meeting-notes/prompt.ts) gets an
 * Arabic meeting summary in the expected Markdown shape.
 * Transcriptions rotate through a few short Arabic meeting sentences (English
 * when `language=en`); a WAV that is pure silence gets "".
 * Every request is logged to stdout.
 * No dependencies; Node 18+.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || process.argv[2] || 18080);
const MODEL = 'mock-model';
const MEETING_SUMMARY_MARKER = 'dafater-meeting-notes-summary';

const AR_SENTENCES = [
  'مرحبًا بالجميع، لنبدأ اجتماعنا الأسبوعي.',
  'أنهينا تصميم الصفحة الرئيسية، وننتظر مراجعة الفريق.',
  'اتفقنا على إطلاق النسخة التجريبية يوم الخميس القادم.',
  'ستتولى سارة إعداد خطة التسويق قبل نهاية الأسبوع.',
  'هل لدى أحدكم أي أسئلة قبل أن نختم الاجتماع؟',
];
const EN_SENTENCES = [
  "Hi everyone, let's start our weekly meeting.",
  'We finished the home page design and are waiting for a review.',
  'We agreed to launch the beta next Thursday.',
  'Sarah will prepare the marketing plan by the end of the week.',
  'Does anyone have questions before we wrap up?',
];
let transcriptionCount = 0;

function lastUserText(messages) {
  const user = [...(messages ?? [])].reverse().find(m => m?.role === 'user');
  if (!user) return '';
  if (typeof user.content === 'string') return user.content;
  if (Array.isArray(user.content)) {
    return user.content
      .map(part =>
        typeof part === 'string' ? part : (part?.text ?? part?.input_text ?? '')
      )
      .join(' ');
  }
  return '';
}

function reply(text) {
  const quoted = text.replace(/\s+/g, ' ').trim().slice(0, 40);
  return quoted
    ? `مرحبًا من الخادم التجريبي لدفاتر. وصلتني رسالتك: «${quoted}».`
    : 'مرحبًا من الخادم التجريبي لدفاتر.';
}

function wantsJson(body) {
  const type = body?.response_format?.type ?? body?.text?.format?.type;
  return type === 'json_schema' || type === 'json_object';
}

function usage(prompt, completion) {
  const prompt_tokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completion_tokens = Math.max(1, Math.ceil(completion.length / 4));
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };
}

function isMeetingSummary(body) {
  return JSON.stringify(body).includes(MEETING_SUMMARY_MARKER);
}

function meetingSummary(body) {
  const prompt = JSON.stringify(body);
  const lines = (prompt.match(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g) ?? []).length;
  return [
    '# اجتماع تجريبي من دفاتر',
    '',
    '## نظرة عامة',
    '- هذا ملخص تجريبي أعدّه الخادم التجريبي لدفاتر.',
    `- عدد مقاطع التفريغ النصي: ${lines}.`,
    '',
    '## القرارات',
    '- اعتماد موعد إطلاق النسخة التجريبية يوم الخميس.',
    '',
    '## المهام',
    '- [ ] إعداد خطة التسويق — سارة',
    '- [ ] مراجعة تصميم الصفحة الرئيسية',
  ].join('\n');
}

/** Minimal multipart/form-data parser: { fields, file: { filename, type, data } } */
function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  const fields = {};
  let file;
  if (!match) return { fields, file };
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    const next = buffer.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = buffer.subarray(start + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const data = part.subarray(headerEnd + 4);
      const name = /name="([^"]*)"/i.exec(headers)?.[1];
      const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1];
      if (filename !== undefined) file = { name, filename, type, data };
      else if (name) fields[name] = data.toString('utf8');
    }
    start = next;
  }
  return { fields, file };
}

/** A 16-bit PCM WAV whose samples are all near zero. */
function isSilentWav(data) {
  if (!data || data.length < 44) return false;
  if (data.toString('latin1', 0, 4) !== 'RIFF') return false;
  if (data.toString('latin1', 8, 12) !== 'WAVE') return false;
  if (data.readUInt16LE(34) !== 16) return false;
  for (let i = 44; i + 1 < data.length; i += 2) {
    if (Math.abs(data.readInt16LE(i)) > 200) return false;
  }
  return true;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '');
  let body = {};
  let raw = Buffer.alloc(0);
  const multipart = /multipart\/form-data/i.test(
    req.headers['content-type'] ?? ''
  );
  if (req.method === 'POST') {
    raw = await readRaw(req);
    if (multipart) {
      body = parseMultipart(raw, req.headers['content-type']);
    } else {
      try {
        body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        return sendJson(res, 400, { error: { message: 'invalid JSON body' } });
      }
    }
  }

  if (req.method === 'POST' && path === '/v1/audio/transcriptions') {
    const { fields = {}, file } = body;
    console.log(
      `[mock-openai] ${new Date().toISOString()} POST ${path}` +
        ` model=${fields.model ?? '-'} language=${fields.language ?? 'auto'}` +
        ` file=${file?.filename ?? '-'} bytes=${file?.data.length ?? 0}` +
        (fields.prompt ? ` prompt=${fields.prompt.length}ch` : '') +
        ` auth=${req.headers.authorization ? 'yes' : 'no'}`
    );
    if (!file || !file.data.length) {
      return sendJson(res, 400, {
        error: { message: 'missing audio file field "file"' },
      });
    }
    if (!fields.model) {
      return sendJson(res, 400, { error: { message: 'missing "model"' } });
    }
    if (isSilentWav(file.data)) return sendJson(res, 200, { text: '' });
    const sentences = fields.language === 'en' ? EN_SENTENCES : AR_SENTENCES;
    const text = sentences[transcriptionCount++ % sentences.length];
    return sendJson(res, 200, { text });
  }
  console.log(
    `[mock-openai] ${new Date().toISOString()} ${req.method} ${path}` +
      (body.model ? ` model=${body.model}` : '') +
      (body.stream ? ' stream' : '') +
      (isMeetingSummary(body) ? ' meeting-summary' : '') +
      (Array.isArray(body.tools) && body.tools.length
        ? ` tools=${body.tools.length}`
        : '') +
      ` auth=${req.headers.authorization ? 'yes' : 'no'}`
  );

  if (req.method === 'GET' && path === '/v1/models') {
    return sendJson(res, 200, {
      object: 'list',
      data: [{ id: MODEL, object: 'model', created: 0, owned_by: 'dafater' }],
    });
  }

  if (req.method === 'POST' && path === '/v1/chat/completions') {
    const prompt = lastUserText(body.messages);
    const content = isMeetingSummary(body)
      ? meetingSummary(body)
      : wantsJson(body)
        ? JSON.stringify({ result: reply(prompt) })
        : reply(prompt);
    const id = `chatcmpl-mock-${Date.now()}`;
    const model = body.model || MODEL;
    const created = Math.floor(Date.now() / 1000);

    if (!body.stream) {
      return sendJson(res, 200, {
        id,
        object: 'chat.completion',
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: usage(prompt, content),
      });
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const chunk = (delta, finish_reason = null) => ({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta, finish_reason }],
    });
    send(chunk({ role: 'assistant', content: '' }));
    // stream word by word so the client sees several deltas
    for (const piece of content.match(/\S+\s*/g) ?? [content]) {
      send(chunk({ content: piece }));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    send(chunk({}, 'stop'));
    send({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [],
      usage: usage(prompt, content),
    });
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  if (req.method === 'POST' && path === '/v1/responses') {
    const input =
      typeof body.input === 'string'
        ? body.input
        : lastUserText(Array.isArray(body.input) ? body.input : []);
    const text = isMeetingSummary(body)
      ? meetingSummary(body)
      : wantsJson(body)
        ? JSON.stringify({ result: reply(input) })
        : reply(input);
    const u = usage(input, text);
    return sendJson(res, 200, {
      id: `resp-mock-${Date.now()}`,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model: body.model || MODEL,
      status: 'completed',
      output: [
        {
          id: 'msg-mock',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      ],
      output_text: text,
      usage: {
        input_tokens: u.prompt_tokens,
        output_tokens: u.completion_tokens,
        total_tokens: u.total_tokens,
      },
    });
  }

  sendJson(res, 404, { error: { message: `unknown route ${path}` } });
});

server.listen(PORT, () => {
  console.log(`[mock-openai] listening on http://localhost:${PORT}/v1`);
});
