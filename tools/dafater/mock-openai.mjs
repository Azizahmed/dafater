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
 * Endpoints:
 *   GET  /v1/models
 *   POST /v1/chat/completions   (non-streaming, and SSE streaming when `stream: true`)
 *   POST /v1/responses          (non-streaming only, for the "Responses" API style)
 *
 * Replies are deterministic Arabic text that quotes the start of the last user
 * message. A `response_format` of json_schema/json_object gets a small JSON
 * object instead. Every request is logged to stdout.
 * No dependencies; Node 18+.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || process.argv[2] || 18080);
const MODEL = 'mock-model';

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

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '');
  let body = {};
  if (req.method === 'POST') {
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: { message: 'invalid JSON body' } });
    }
  }
  console.log(
    `[mock-openai] ${new Date().toISOString()} ${req.method} ${path}` +
      (body.model ? ` model=${body.model}` : '') +
      (body.stream ? ' stream' : '') +
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
    const content = wantsJson(body)
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
    const text = wantsJson(body)
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
