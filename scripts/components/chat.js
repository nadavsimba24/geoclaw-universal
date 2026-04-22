#!/usr/bin/env node
// Geoclaw interactive chat — uses whatever model is configured in .env

const https = require('https');
const http = require('http');
const readline = require('readline');
const path = require('path');
const { URL } = require('url');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch { /* dotenv is optional — env vars from the shell still work */ }

const memory = require('./memory.js');
const tts    = require('./tts.js');
const { env } = require('./env.js');

const PROVIDER = env('GEOCLAW_MODEL_PROVIDER', 'deepseek').toLowerCase();
const MODEL    = env('GEOCLAW_MODEL_NAME', 'deepseek-chat');
const API_KEY  = env('GEOCLAW_MODEL_API_KEY');
const BASE_URL = env('GEOCLAW_MODEL_BASE_URL');

// ── ANSI palette ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  gray:    '\x1b[90m',
  orange:  '\x1b[38;5;208m',
  violet:  '\x1b[38;5;141m',
  teal:    '\x1b[38;5;80m',
  rose:    '\x1b[38;5;211m',
};
const USE_COLOR = !!process.stdout.isTTY && !process.env.NO_COLOR;
const col = (code, s) => USE_COLOR ? `${code}${s}${C.reset}` : String(s);

const hideCursor = () => { if (USE_COLOR) process.stdout.write('\x1b[?25l'); };
const showCursor = () => { if (USE_COLOR) process.stdout.write('\x1b[?25h'); };
process.on('exit', showCursor);
process.on('SIGINT',  () => { showCursor(); process.exit(130); });
process.on('SIGTERM', () => { showCursor(); process.exit(143); });

const SYSTEM_PROMPT = `You are Geoclaw, a friendly and capable AI assistant.
You have access to integrations the user has enabled: Monday.com, n8n, Telegram, MCP tools, memory, and more.
If the user asks you to DO something that requires one of those integrations, tell them the exact command to run (e.g. 'geoclaw monday boards', 'geoclaw agent "your goal"').
When context from the knowledge base is provided below, USE it — it contains relevant facts the user previously saved.

Language policy:
- Always reply in the SAME language the user writes in.
- Hebrew input → reply in Hebrew (עברית). Arabic → Arabic. Russian → Russian. Etc.
- Mixed-language input → use the dominant language of the user's latest message.
- Keep proper nouns, CLI commands, file paths, and code in their original form — do not translate 'geoclaw agent', 'Monday.com', etc.`;

// Build an ephemeral system prompt with relevant memories injected for this turn
function buildSystemPrompt(userMessage) {
  const ws = memory.activeWorkspace();
  const hits = memory.recall(userMessage, 5);
  const base = `${SYSTEM_PROMPT}\n\nActive workspace: ${ws}`;
  if (hits.length === 0) return base;
  const facts = hits.map(h => `- ${h.text}` + (h.source ? ` (source: ${h.source})` : '')).join('\n');
  return `${base}\n\n## Relevant knowledge base context:\n${facts}`;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const QUIPS = [
  'Thinking', 'Pondering', 'Consulting memory', 'Wiring it up',
  'Cooking up a reply', 'Turning cogs', 'Combing context',
  'Drafting', 'Tuning tokens', 'Synthesizing', 'Mulling',
  'Sharpening pencils', 'Warming up',
];
function pickQuip() { return QUIPS[Math.floor(Math.random() * QUIPS.length)]; }

function makeSpinner() {
  let i = 0, t0 = Date.now(), timer = null, quip = pickQuip(), rotator = null;
  const render = () => {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length];
    const msg = `\r\x1b[2K  ${col(C.orange, frame)} ${col(C.bold, quip)}${col(C.dim, '  ' + secs + 's')}`;
    process.stdout.write(msg);
  };
  return {
    start() {
      if (!USE_COLOR) { process.stdout.write('  thinking...\n'); return; }
      hideCursor();
      render();
      timer   = setInterval(render, 80);
      rotator = setInterval(() => { quip = pickQuip(); }, 3500);
    },
    stop() {
      if (timer)   clearInterval(timer);
      if (rotator) clearInterval(rotator);
      if (USE_COLOR) process.stdout.write('\r\x1b[2K');
      showCursor();
    },
  };
}

// ── Streaming HTTP (SSE) ──────────────────────────────────────────────────────

function postStream(urlStr, headers, body, onEvent) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errChunks = '';
        res.on('data', (c) => (errChunks += c));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errChunks.slice(0, 400)}`)));
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (!line || !line.startsWith('data:')) continue;
          const payload = line.slice(5).trimStart();
          if (payload === '[DONE]') continue;
          try { onEvent(JSON.parse(payload)); } catch { /* ignore keepalives */ }
        }
      });
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Streaming provider adapters ───────────────────────────────────────────────
// Each returns { reply: string, usage: object|null } and calls onDelta(text) as chunks arrive.

async function streamOpenAIish(messages, endpoint, onDelta) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const url = BASE_URL ? `${BASE_URL.replace(/\/+$/, '')}/chat/completions` : endpoint;
  let reply = '';
  let usage = null;
  await postStream(url, {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }, { model: MODEL, messages, stream: true }, (evt) => {
    const delta = evt.choices?.[0]?.delta?.content;
    if (delta) { reply += delta; onDelta(delta); }
    if (evt.usage) usage = evt.usage;
  });
  return { reply, usage };
}

async function streamAnthropic(messages, onDelta) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const system = messages.find(m => m.role === 'system')?.content ?? '';
  const rest   = messages.filter(m => m.role !== 'system');
  let reply = '';
  let usage = null;
  await postStream('https://api.anthropic.com/v1/messages', {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }, { model: MODEL, system, messages: rest, max_tokens: 4096, stream: true }, (evt) => {
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      reply += evt.delta.text;
      onDelta(evt.delta.text);
    }
    if (evt.type === 'message_delta' && evt.usage) usage = evt.usage;
    if (evt.type === 'message_start'  && evt.message?.usage) usage = { ...(usage || {}), ...evt.message.usage };
  });
  return { reply, usage };
}

// Google: no zero-dep SSE helper is easy here — do a blocking fetch, then typewrite.
async function streamGoogle(messages, onDelta) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const contents = messages.filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const system = messages.find(m => m.role === 'system')?.content;
  const body = { contents, ...(system && { systemInstruction: { parts: [{ text: system }] } }) };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const data = await jsonPost(url, { 'Content-Type': 'application/json' }, body);
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[no content]';
  await typewrite(reply, onDelta);
  return { reply, usage: data.usageMetadata ?? null };
}

async function streamOllama(messages, onDelta) {
  const url = (BASE_URL || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  const data = JSON.stringify({ model: MODEL, messages, stream: true });
  let reply = '';
  await new Promise((resolve, reject) => {
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errChunks = '';
        res.on('data', (c) => (errChunks += c));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errChunks.slice(0, 400)}`)));
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const j = JSON.parse(line);
            const d = j.message?.content;
            if (d) { reply += d; onDelta(d); }
          } catch { /* ignore */ }
        }
      });
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
  return { reply, usage: null };
}

// Shared non-stream JSON POST (used only by google adapter)
function jsonPost(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
        }
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error(`Bad JSON: ${chunks.slice(0, 400)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function typewrite(text, onDelta, perChunkMs = 10) {
  const parts = text.match(/\S+\s*|\s+/g) || [text];
  for (const p of parts) {
    onDelta(p);
    if (perChunkMs) await new Promise(r => setTimeout(r, perChunkMs));
  }
}

function dispatch(messages, onDelta) {
  switch (PROVIDER) {
    case 'deepseek':  return streamOpenAIish(messages, 'https://api.deepseek.com/chat/completions', onDelta);
    case 'openai':    return streamOpenAIish(messages, 'https://api.openai.com/v1/chat/completions', onDelta);
    case 'anthropic': return streamAnthropic(messages, onDelta);
    case 'google':    return streamGoogle(messages, onDelta);
    case 'ollama':    return streamOllama(messages, onDelta);
    default:          return streamOpenAIish(messages, '', onDelta);
  }
}

// ── Interactive REPL ──────────────────────────────────────────────────────────

function banner() {
  const w = Math.min((process.stdout.columns || 80), 78);
  const inner = w - 2;
  const hline = '─'.repeat(inner);
  const pad = (s, visibleLen) => s + ' '.repeat(Math.max(0, inner - visibleLen));

  const title  = '  ✳ Geoclaw Chat';
  const tag    = '  your universal agent platform';

  console.log('');
  console.log(col(C.violet, `┌${hline}┐`));
  console.log(col(C.violet, '│') + col(C.bold,  pad(title, title.length)) + col(C.violet, '│'));
  console.log(col(C.violet, '│') + col(C.dim,   pad(tag,   tag.length))   + col(C.violet, '│'));
  console.log(col(C.violet, `└${hline}┘`));

  const info = `  ${col(C.teal, PROVIDER)} ${col(C.dim, '·')} ${col(C.bold, MODEL)} ${col(C.dim, '·')} ws: ${col(C.cyan, memory.activeWorkspace())}`;
  console.log(info);
  console.log(col(C.dim, '  type a message, or /help for commands  ·  /exit to quit'));
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(col(C.bold, '  Commands'));
  const rows = [
    ['/exit',         'quit chat'],
    ['/clear',        'reset conversation history'],
    ['/system',       'show current system prompt'],
    ['/voice on|off', 'toggle text-to-speech for replies'],
    ['/help',         'this message'],
  ];
  for (const [cmd, desc] of rows) {
    console.log(`  ${col(C.cyan, cmd.padEnd(15))} ${col(C.dim, desc)}`);
  }
  console.log('');
}

async function repl() {
  banner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const history = [{ role: 'system', content: SYSTEM_PROMPT }];
  let voiceOn = process.argv.slice(2).includes('--voice');

  const PROMPT = `${col(C.cyan, '▌')} ${col(C.bold, 'you')} ${col(C.dim, '›')} `;
  const MARKER = `${col(C.orange, '▌')} ${col(C.bold, 'geoclaw')} ${col(C.dim, '›')} `;

  const ask = () => {
    rl.question(PROMPT, async (line) => {
      const text = line.trim();
      if (!text) return ask();

      if (text === '/exit' || text === '/quit') {
        console.log(col(C.dim, '  bye.'));
        rl.close();
        return;
      }
      if (text === '/clear') {
        history.length = 1;
        console.log(col(C.dim, '  (history cleared)'));
        console.log('');
        return ask();
      }
      if (text === '/help') { printHelp(); return ask(); }
      if (text === '/system') {
        console.log('');
        console.log(col(C.dim, history[0].content));
        console.log('');
        return ask();
      }
      if (text.startsWith('/voice')) {
        const mode = text.split(/\s+/)[1];
        if (mode === 'on')       { voiceOn = true;  console.log(col(C.dim, '  (voice on)')); }
        else if (mode === 'off') { voiceOn = false; console.log(col(C.dim, '  (voice off)')); }
        else console.log(col(C.dim, `  (voice ${voiceOn ? 'on' : 'off'} — use /voice on or /voice off)`));
        console.log('');
        return ask();
      }

      history.push({ role: 'user', content: text });
      history[0] = { role: 'system', content: buildSystemPrompt(text) };

      const spin = makeSpinner();
      spin.start();

      let firstChunk = true;
      const onDelta = (delta) => {
        if (firstChunk) {
          spin.stop();
          process.stdout.write(MARKER);
          firstChunk = false;
        }
        process.stdout.write(delta);
      };

      const t0 = Date.now();
      try {
        const { reply, usage } = await dispatch(history, onDelta);
        if (firstChunk) { spin.stop(); process.stdout.write(MARKER); }
        process.stdout.write('\n');

        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const tokens = usage
          ? (usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)) ?? 0)
          : 0;
        const stats = tokens ? `${tokens} tokens · ${secs}s` : `${secs}s`;
        console.log(col(C.dim, `  ${stats}`));

        history.push({ role: 'assistant', content: reply });
        if (voiceOn) tts.speak(reply, { silent: true }).catch(() => {});
      } catch (err) {
        spin.stop();
        console.log(`  ${col(C.red, '✗')} ${err.message}`);
        history.pop();
      }

      console.log('');
      ask();
    });
  };

  ask();
  rl.on('close', () => { showCursor(); process.exit(0); });
}

// ── One-shot mode: geoclaw chat "your question" ───────────────────────────────

async function oneShot(prompt) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
  await dispatch(messages, (d) => process.stdout.write(d));
  process.stdout.write('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => a !== '--voice');
  const arg  = args.join(' ').trim();
  if (arg) oneShot(arg).catch((e) => { console.error(`${col(C.red, '✗')} ${e.message}`); process.exit(1); });
  else     repl();
}
