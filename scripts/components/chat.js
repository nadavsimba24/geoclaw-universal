#!/usr/bin/env node
// Geoclaw interactive chat — tool-using, streaming, Claude-Code-style UX.

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
const agent  = require('./agent.js');
const { env } = require('./env.js');

const PROVIDER = env('GEOCLAW_MODEL_PROVIDER', 'deepseek').toLowerCase();
const MODEL    = env('GEOCLAW_MODEL_NAME', 'deepseek-chat');
const API_KEY  = env('GEOCLAW_MODEL_API_KEY');
const BASE_URL = env('GEOCLAW_MODEL_BASE_URL');

const MAX_TOOL_STEPS        = parseInt(process.env.GEOCLAW_CHAT_MAX_TOOL_STEPS     || '10',     10);
const MAX_HISTORY           = parseInt(process.env.GEOCLAW_CHAT_MAX_HISTORY        || '40',     10);
const LLM_TIMEOUT_MS        = parseInt(process.env.GEOCLAW_CHAT_LLM_TIMEOUT_MS     || '120000', 10);
const MAX_TOOL_RESULT_CHARS = parseInt(process.env.GEOCLAW_CHAT_MAX_TOOL_RESULT    || '4000',   10);
const CONTEXT_WARN_TOKENS   = parseInt(process.env.GEOCLAW_CHAT_CONTEXT_WARN_TOKENS|| '80000',  10);
const LLM_RETRIES           = parseInt(process.env.GEOCLAW_CHAT_LLM_RETRIES        || '2',      10);

// ── In-flight abort tracking ──────────────────────────────────────────────────
let activeHttp = null;
function abortActive(reason = 'cancelled by user') {
  if (activeHttp) {
    try { activeHttp.destroy(new Error(reason)); } catch { /* ignore */ }
    activeHttp = null;
    return true;
  }
  return false;
}

// ── ANSI palette ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  boldoff: '\x1b[22m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  gray:    '\x1b[90m',
  orange:  '\x1b[38;5;208m',
  violet:  '\x1b[38;5;141m',
  teal:    '\x1b[38;5;80m',
  rose:    '\x1b[38;5;211m',
  defaultfg:'\x1b[39m',
};
const USE_COLOR = !!process.stdout.isTTY && !process.env.NO_COLOR;
const col = (code, s) => USE_COLOR ? `${code}${s}${C.reset}` : String(s);

const hideCursor = () => { if (USE_COLOR) process.stdout.write('\x1b[?25l'); };
const showCursor = () => { if (USE_COLOR) process.stdout.write('\x1b[?25h'); };
process.on('exit', showCursor);
process.on('SIGINT', () => {
  if (abortActive('cancelled by user')) return;  // abort in-flight; REPL keeps going
  showCursor();
  process.exit(130);
});
process.on('SIGTERM', () => { showCursor(); process.exit(143); });

// ── Tool calling ──────────────────────────────────────────────────────────────
// Reuse the agent's tool catalog. Drop tools that don't fit continuous chat:
// 'finish' (conversation never ends), 'spawn_subagent' (weird inline),
// 'speak' (we have /voice for that).
const CHAT_TOOL_NAMES = new Set([
  'remember', 'recall',
  'monday_list_boards', 'monday_get_board', 'monday_create_item',
  'send_telegram', 'ask_user',
  'design_tokens', 'design_lint', 'design_diff', 'design_export',
  'design_init', 'design_suggest',
  'read_skill',
  'browse',
  'web_search',
  'firecrawl_scrape',
  'firecrawl_crawl',
  'firecrawl_map',
]);
const CHAT_TOOLS = agent.toolDefinitions.filter(t => CHAT_TOOL_NAMES.has(t.function.name));

const OPENAI_COMPAT_PROVIDERS = new Set(['deepseek', 'openai', 'groq', 'openrouter', 'moonshot']);

function providerSupportsTools() {
  if (OPENAI_COMPAT_PROVIDERS.has(PROVIDER)) return true;
  if (!['anthropic', 'google', 'ollama'].includes(PROVIDER) && BASE_URL) return true;
  return false;
}
const TOOLS_ON = providerSupportsTools();

const SYSTEM_PROMPT_TOOLS = `You are Geoclaw, a capable AI assistant with REAL TOOLS for Monday.com, long-term memory, and Telegram.

When the user asks you to DO something — create Monday.com items, save a fact, search the knowledge base, send a Telegram message, search the web, read a URL — USE YOUR TOOLS DIRECTLY. To search the web call web_search({query}), then browse({url}) to read the top result. For a direct URL call browse({url}) to fetch readable markdown with typed refs like [link 7]. Do NOT tell the user to run a shell command themselves; you have hands, use them. Chain multiple tool calls if needed.

You may narrate briefly what you're about to do before calling a tool, but keep it short. After tools run, give the user a clear final answer in plain language.

Relevant knowledge-base snippets are auto-injected in the system prompt. Only call 'recall' when you need to dig deeper.

Ask the user only when you truly can't proceed; prefer reasonable defaults.

Language policy:
- Reply in the SAME language the user writes in. Hebrew → Hebrew (עברית). Arabic → Arabic. Russian → Russian.
- Keep proper nouns, CLI commands, file paths, and code unchanged.`;

const SYSTEM_PROMPT_NO_TOOLS = `You are Geoclaw, a friendly and capable AI assistant.
Your current provider (${PROVIDER}) doesn't support tool-calling in chat. If the user asks you to DO something that requires an integration (Monday, Telegram, memory), tell them the exact command to run.
When context from the knowledge base is provided below, USE it — it contains facts the user saved.

Language policy: reply in the same language the user writes in.`;

const SYSTEM_PROMPT = TOOLS_ON ? SYSTEM_PROMPT_TOOLS : SYSTEM_PROMPT_NO_TOOLS;

function buildSystemPrompt(userMessage) {
  const ws = memory.activeWorkspace();
  const hits = memory.recall(userMessage, 5);
  const skillsManifest = (() => { try { return require('./skills.js').buildSkillsManifest(); } catch { return ''; } })();
  const base = `${SYSTEM_PROMPT}\n\nActive workspace: ${ws}${skillsManifest}`;
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

function makeSpinner(initialQuip) {
  let i = 0, t0 = Date.now(), timer = null, rotator = null;
  let quip = initialQuip || pickQuip();
  const render = () => {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length];
    process.stdout.write(`\r\x1b[2K  ${col(C.orange, frame)} ${col(C.bold, quip)}${col(C.dim, '  ' + secs + 's')}`);
  };
  return {
    start(q) {
      if (q) quip = q;
      t0 = Date.now();
      if (!USE_COLOR) { process.stdout.write('  thinking...\n'); return; }
      hideCursor();
      render();
      timer   = setInterval(render, 80);
      rotator = setInterval(() => { quip = pickQuip(); }, 3500);
    },
    stop() {
      if (timer)   clearInterval(timer);
      if (rotator) clearInterval(rotator);
      timer = null; rotator = null;
      if (USE_COLOR) process.stdout.write('\r\x1b[2K');
      showCursor();
    },
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function jsonPost(urlStr, headers, body, { timeoutMs = LLM_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        if (activeHttp === req) activeHttp = null;
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error(`Bad JSON: ${chunks.slice(0, 400)}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`request timed out after ${timeoutMs}ms — set GEOCLAW_CHAT_LLM_TIMEOUT_MS to extend`)));
    req.on('error',   (e) => { if (activeHttp === req) activeHttp = null; reject(e); });
    activeHttp = req;
    req.write(data);
    req.end();
  });
}

function postStream(urlStr, headers, body, onEvent, { timeoutMs = LLM_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errChunks = '';
        res.on('data', (c) => (errChunks += c));
        res.on('end', () => {
          if (activeHttp === req) activeHttp = null;
          const err = new Error(`HTTP ${res.statusCode}: ${errChunks.slice(0, 400)}`);
          err.statusCode = res.statusCode;
          reject(err);
        });
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
          try { onEvent(JSON.parse(payload)); } catch { /* ignore */ }
        }
      });
      res.on('end',   () => { if (activeHttp === req) activeHttp = null; resolve(); });
      res.on('error', (e) => { if (activeHttp === req) activeHttp = null; reject(e); });
    });
    req.on('timeout', () => req.destroy(new Error(`stream timed out after ${timeoutMs}ms — set GEOCLAW_CHAT_LLM_TIMEOUT_MS to extend`)));
    req.on('error',   (e) => { if (activeHttp === req) activeHttp = null; reject(e); });
    activeHttp = req;
    req.write(data);
    req.end();
  });
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

function isRetryable(err) {
  const msg = (err && err.message) || '';
  if (/cancelled by user/i.test(msg)) return false;
  const status = err && err.statusCode;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|ENOTFOUND|timed out/i.test(msg)) return true;
  return false;
}

async function retrying(fn, { retries = LLM_RETRIES, baseDelayMs = 800, label = 'LLM', onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      if (onRetry) onRetry(e, attempt + 1, retries, delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Classify LLM errors into friendlier messages.
function explainError(err) {
  const msg = (err && err.message) || String(err);
  if (/cancelled by user/i.test(msg)) return { kind: 'cancel', text: msg };
  if (err && err.statusCode === 401) return { kind: 'auth',  text: `auth failed (401). Run ${col(C.cyan, 'geoclaw setup')} or check GEOCLAW_MODEL_API_KEY.` };
  if (err && err.statusCode === 429) return { kind: 'rate',  text: `rate-limited (429). Wait a moment and try ${col(C.cyan, '/retry')}.` };
  if (err && err.statusCode >= 500)  return { kind: 'server',text: `${PROVIDER} server error (${err.statusCode}). Try ${col(C.cyan, '/retry')}.` };
  if (/timed out/i.test(msg))        return { kind: 'timeout',text: `${msg}.` };
  return { kind: 'generic', text: msg };
}

// ── Render helpers ────────────────────────────────────────────────────────────

async function typewrite(text, onDelta, perChunkMs = 8) {
  const parts = text.match(/\S+\s*|\s+/g) || [text];
  for (const p of parts) {
    onDelta(p);
    if (perChunkMs) await new Promise(r => setTimeout(r, perChunkMs));
  }
}

// DeepSeek occasionally emits the same final answer twice in one message
// (typically separated by a blank line) when it loops on empty tool results.
// If the content is literally `X\n\nX` with X ≥ 80 chars, collapse to X.
function dedupeRepeatedBlock(s) {
  if (!s || s.length < 160) return s;
  const trimmed = s.trim();
  const half = Math.floor(trimmed.length / 2);
  const a = trimmed.slice(0, half).trim();
  const b = trimmed.slice(half).trim();
  if (a.length >= 80 && a === b) return a;
  // Also handle "X\n\nX" with optional whitespace in between.
  const m = trimmed.match(/^([\s\S]{80,}?)\n\s*\n([\s\S]+)$/);
  if (m && m[1].trim() === m[2].trim()) return m[1].trim();
  return s;
}

// Lightweight markdown: bold + inline code. Triple-backtick blocks pass through.
function mdRender(s) {
  if (!USE_COLOR || !s) return s || '';
  return s
    .replace(/\*\*([^\n*]+)\*\*/g, `${C.bold}$1${C.boldoff}`)
    .replace(/`([^\n`]+)`/g,        `${C.teal}$1${C.defaultfg}`);
}

function shortenJSON(obj, max) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Cap content pushed into LLM history so one big tool result doesn't blow context.
function truncateForHistory(jsonStr) {
  if (jsonStr.length <= MAX_TOOL_RESULT_CHARS) return jsonStr;
  return jsonStr.slice(0, MAX_TOOL_RESULT_CHARS) +
    `\n...[truncated ${jsonStr.length - MAX_TOOL_RESULT_CHARS} chars — ask for specifics if you need them]`;
}

// ── Tool-using turn (OpenAI-compatible providers) ─────────────────────────────

function chatEndpoint() {
  if (PROVIDER === 'deepseek')   return 'https://api.deepseek.com/chat/completions';
  if (PROVIDER === 'openai')     return 'https://api.openai.com/v1/chat/completions';
  if (PROVIDER === 'groq')       return 'https://api.groq.com/openai/v1/chat/completions';
  if (PROVIDER === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions';
  if (PROVIDER === 'moonshot')   return 'https://api.moonshot.cn/v1/chat/completions';
  if (BASE_URL)                  return `${BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  return null;
}

async function llmWithTools(messages, { tools = CHAT_TOOLS } = {}) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const endpoint = chatEndpoint();
  if (!endpoint) throw new Error(`Tool-using chat needs an OpenAI-compatible provider (got "${PROVIDER}")`);
  const body = { model: MODEL, messages };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const data = await jsonPost(endpoint, {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type':  'application/json',
  }, body);
  return {
    msg:   data.choices?.[0]?.message || { content: '[no content]' },
    usage: data.usage || null,
  };
}

function llmWithToolsRetrying(messages, opts) {
  return retrying(() => llmWithTools(messages, opts), {
    label: 'LLM',
    onRetry: (e, n, max, delay) => {
      // Clear the spinner line, print a retry notice, spinner will resume.
      process.stdout.write(`\r\x1b[2K  ${col(C.yellow, '⚠')} ${explainError(e).text} (retry ${n}/${max} in ${Math.round(delay/1000)}s)\n`);
    },
  });
}

async function runTurnWithTools(history, ctx, marker) {
  const spin = makeSpinner();
  spin.start();

  let aggUsage = null;
  let finalReply = '';

  try {
    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const { msg, usage } = await llmWithToolsRetrying(history);
      if (usage) {
        aggUsage = aggUsage
          ? {
              total_tokens:     (aggUsage.total_tokens ?? 0)     + (usage.total_tokens ?? 0),
              prompt_tokens:    (aggUsage.prompt_tokens ?? 0)    + (usage.prompt_tokens ?? 0),
              completion_tokens:(aggUsage.completion_tokens ?? 0)+ (usage.completion_tokens ?? 0),
            }
          : usage;
      }
      history.push(msg);

      const calls = msg.tool_calls || [];

      // Inline narration alongside tool calls — print dim, above the tool lines.
      if (msg.content && calls.length > 0) {
        spin.stop();
        console.log(`  ${col(C.dim, msg.content.trim())}`);
      }

      if (calls.length === 0) {
        spin.stop();
        process.stdout.write(marker);
        const content = dedupeRepeatedBlock(msg.content || '');
        await typewrite(mdRender(content), (d) => process.stdout.write(d));
        process.stdout.write('\n');
        finalReply = content;
        break;
      }

      for (const call of calls) {
        spin.stop();
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* keep {} */ }
        const argsStr = Object.keys(args).length ? ' ' + col(C.dim, shortenJSON(args, 80)) : '';
        console.log(`  ${col(C.violet, '⚙')} ${col(C.bold, call.function.name)}${argsStr}`);

        const result = await agent.callTool(call.function.name, args, ctx);
        const okSym = result && result.ok ? col(C.green, '✓') : col(C.red, '✗');
        const summary = result && result.ok
          ? shortenJSON(result, 120)
          : (result && result.error) || 'error';
        console.log(`    ${okSym} ${col(C.dim, summary)}`);

        history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: truncateForHistory(JSON.stringify(result)),
        });
      }

      spin.start();
    }

    if (!finalReply) {
      spin.stop();
      console.log(`  ${col(C.yellow, '⚠')} hit tool-call step limit (${MAX_TOOL_STEPS}) — set GEOCLAW_CHAT_MAX_TOOL_STEPS or rephrase.`);
    }
  } finally {
    spin.stop();
  }

  return { reply: finalReply, usage: aggUsage };
}

// ── Streaming-only turn (for providers without tool support) ──────────────────

async function streamOpenAIish(messages, endpoint, onDelta) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const url = BASE_URL ? `${BASE_URL.replace(/\/+$/, '')}/chat/completions` : endpoint;
  let reply = '', usage = null;
  await postStream(url, {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type':  'application/json',
    'Accept':        'text/event-stream',
  }, { model: MODEL, messages, stream: true }, (evt) => {
    const d = evt.choices?.[0]?.delta?.content;
    if (d) { reply += d; onDelta(d); }
    if (evt.usage) usage = evt.usage;
  });
  return { reply, usage };
}

async function streamAnthropic(messages, onDelta) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const system = messages.find(m => m.role === 'system')?.content ?? '';
  const rest   = messages.filter(m => m.role !== 'system');
  let reply = '', usage = null;
  await postStream('https://api.anthropic.com/v1/messages', {
    'x-api-key':         API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Type':      'application/json',
    'Accept':            'text/event-stream',
  }, { model: MODEL, system, messages: rest, max_tokens: 4096, stream: true }, (evt) => {
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      reply += evt.delta.text;
      onDelta(evt.delta.text);
    }
    if (evt.type === 'message_delta' && evt.usage) usage = evt.usage;
  });
  return { reply, usage };
}

async function streamGoogle(messages, onDelta) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const contents = messages.filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const system = messages.find(m => m.role === 'system')?.content;
  const body = { contents, ...(system && { systemInstruction: { parts: [{ text: system }] } }) };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const data = await jsonPost(url, { 'Content-Type': 'application/json' }, body);
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[no content]';
  await typewrite(mdRender(reply), onDelta);
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
      timeout: LLM_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errChunks = '';
        res.on('data', (c) => (errChunks += c));
        res.on('end', () => { if (activeHttp === req) activeHttp = null; reject(new Error(`HTTP ${res.statusCode}: ${errChunks.slice(0, 400)}`)); });
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
      res.on('end',   () => { if (activeHttp === req) activeHttp = null; resolve(); });
      res.on('error', (e) => { if (activeHttp === req) activeHttp = null; reject(e); });
    });
    req.on('timeout', () => req.destroy(new Error(`ollama stream timed out after ${LLM_TIMEOUT_MS}ms`)));
    req.on('error',   (e) => { if (activeHttp === req) activeHttp = null; reject(e); });
    activeHttp = req;
    req.write(data);
    req.end();
  });
  return { reply, usage: null };
}

async function runTurnStreaming(history, marker) {
  const spin = makeSpinner();
  spin.start();
  let firstChunk = true;
  const onDelta = (d) => {
    if (firstChunk) { spin.stop(); process.stdout.write(marker); firstChunk = false; }
    process.stdout.write(d);
  };
  let res;
  try {
    const run = async () => {
      switch (PROVIDER) {
        case 'anthropic':   return streamAnthropic(history, onDelta);
        case 'google':      return streamGoogle(history, onDelta);
        case 'ollama':      return streamOllama(history, onDelta);
        case 'openai':      return streamOpenAIish(history, 'https://api.openai.com/v1/chat/completions', onDelta);
        case 'deepseek':    return streamOpenAIish(history, 'https://api.deepseek.com/chat/completions',  onDelta);
        case 'groq':        return streamOpenAIish(history, 'https://api.groq.com/openai/v1/chat/completions', onDelta);
        case 'openrouter':  return streamOpenAIish(history, 'https://openrouter.ai/api/v1/chat/completions',   onDelta);
        case 'moonshot':    return streamOpenAIish(history, 'https://api.moonshot.cn/v1/chat/completions',     onDelta);
        default:            return streamOpenAIish(history, chatEndpoint() || '', onDelta);
      }
    };
    res = await retrying(run, {
      label: 'LLM',
      onRetry: (e, n, max, delay) => {
        if (!firstChunk) return;  // already committed content to screen; don't retry
        process.stdout.write(`\r\x1b[2K  ${col(C.yellow, '⚠')} ${explainError(e).text} (retry ${n}/${max} in ${Math.round(delay/1000)}s)\n`);
      },
    });
  } finally {
    if (firstChunk) spin.stop();
  }
  if (!firstChunk) process.stdout.write('\n');
  return res;
}

// ── Context trim — preserves tool_call groups ─────────────────────────────────
// A "turn" = user message + everything after it up to (not including) the next user.
// We keep system + last N turns that fit within MAX_HISTORY messages.
function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY) return messages;

  const system = messages[0];
  const turns = [];
  let current = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      if (current.length) turns.push(current);
      current = [messages[i]];
    } else {
      current.push(messages[i]);
    }
  }
  if (current.length) turns.push(current);

  const kept = [];
  let total = 1;  // system
  for (let i = turns.length - 1; i >= 0; i--) {
    if (total + turns[i].length > MAX_HISTORY) break;
    kept.unshift(turns[i]);
    total += turns[i].length;
  }

  const dropped = turns.length - kept.length;
  const out = [system];
  if (dropped > 0) {
    out.push({
      role: 'system',
      content: `[${dropped} earlier conversation turn(s) trimmed to keep context small — use /compact to summarize instead]`,
    });
  }
  for (const t of kept) out.push(...t);
  return out;
}

// ── Compaction — summarize older turns into one system message ────────────────
async function compactHistory(history) {
  if (history.length <= 3) throw new Error('not enough history to compact');
  if (!TOOLS_ON && !chatEndpoint()) throw new Error('compaction needs an OpenAI-compatible provider');

  const transcript = history.slice(1).map(m => {
    if (m.role === 'tool') return `[tool result] ${(m.content || '').slice(0, 600)}`;
    const who = m.role === 'user' ? 'User' : 'Assistant';
    const tools = m.tool_calls ? ` [called: ${m.tool_calls.map(c => c.function.name).join(', ')}]` : '';
    return `${who}${tools}: ${m.content || ''}`;
  }).join('\n\n');

  const messages = [
    { role: 'system', content:
`You are condensing a conversation transcript. Produce a concise summary that preserves:
- User's goals and preferences
- Important facts and decisions
- Any IDs, names, file paths, or code verbatim
- Open questions or unfinished work

Be terse — aim for under 400 words. Do not include meta commentary about summarizing.`
    },
    { role: 'user', content: 'Transcript to summarize:\n\n' + transcript },
  ];

  const { msg } = await llmWithTools(messages, { tools: [] });
  return msg.content || '[empty summary]';
}

// ── Slash commands (single source of truth for /help + tab completer) ─────────
const SLASH_COMMANDS = [
  { cmd: '/exit',    desc: 'quit chat' },
  { cmd: '/clear',   desc: 'reset conversation history' },
  { cmd: '/retry',   desc: 'redo the last user turn' },
  { cmd: '/undo',    desc: 'drop the last user + assistant exchange' },
  { cmd: '/compact', desc: 'summarize older history into one note to free context' },
  { cmd: '/btw',     desc: '<text> — side-note folded into your next message' },
  { cmd: '/tool',    desc: '<name> [json] — call a tool directly, bypassing the LLM' },
  { cmd: '/design',  desc: '[init|tokens|lint|export|diff|suggest] — design-system toolkit' },
  { cmd: '/history', desc: 'show message count, ~tokens, pending btw' },
  { cmd: '/system',  desc: 'show current system prompt' },
  { cmd: '/tools',   desc: 'list available tools' },
  { cmd: '/voice',   desc: 'on|off — toggle text-to-speech for replies' },
  { cmd: '/help',    desc: 'this message' },
];
const SLASH_NAMES = SLASH_COMMANDS.map(c => c.cmd);

// ── /design slash-command handler ─────────────────────────────────────────────

async function handleDesignCommand(rest) {
  const design = require('./design.js');
  const parts = rest ? rest.split(/\s+/).filter(Boolean) : [];
  const sub   = (parts[0] || '').toLowerCase();

  const printSummary = (s) => {
    console.log('');
    console.log(`  ${col(C.bold, s.name || '(unnamed)')} ${col(C.dim, s.file)}`);
    if (s.description) console.log(`  ${col(C.dim, s.description)}`);
    if (s.colors.length) {
      console.log('');
      console.log(col(C.violet, '  colors'));
      for (const { name, value } of s.colors) {
        console.log(`    ${col(C.teal, name.padEnd(14))} ${col(C.dim, String(value))}`);
      }
    }
    if (s.typography.length) {
      console.log('');
      console.log(col(C.violet, '  typography'));
      console.log(`    ${col(C.dim, s.typography.join(', '))}`);
    }
    if (s.spacing.length || s.rounded.length) {
      console.log('');
      if (s.spacing.length) console.log(`  ${col(C.violet, 'spacing')}  ${col(C.dim, s.spacing.join(', '))}`);
      if (s.rounded.length) console.log(`  ${col(C.violet, 'rounded')}  ${col(C.dim, s.rounded.join(', '))}`);
    }
    if (s.components.length) {
      console.log('');
      console.log(col(C.violet, '  components'));
      console.log(`    ${col(C.dim, s.components.join(', '))}`);
    }
  };

  const printJSON = (obj) => {
    console.log('');
    console.log(JSON.stringify(obj, null, 2));
  };

  // Bare `/design` → summarize ./DESIGN.md (or GEOCLAW.md as fallback).
  if (!sub) {
    const candidates = ['DESIGN.md', 'design.md', 'GEOCLAW.md'];
    const path_ = require('path');
    const fs_   = require('fs');
    const pick = candidates.find(c => fs_.existsSync(path_.resolve(c)));
    if (!pick) {
      console.log(col(C.dim, '  (no DESIGN.md here — try /design init [template] to create one)'));
      console.log(col(C.dim, '  templates: ' + design.listTemplates().join(', ')));
      return;
    }
    const s = design.summarize(pick);
    if (!s.ok) { console.log(`  ${col(C.red, '✗')} ${s.error}`); return; }
    printSummary(s);
    return;
  }

  try {
    switch (sub) {
      case 'help': {
        console.log('');
        console.log(col(C.bold, '  /design — design-system toolkit'));
        console.log(`  ${col(C.cyan, '/design')}                           summary of ./DESIGN.md`);
        console.log(`  ${col(C.cyan, '/design tokens [file]')}             parsed tokens + sections`);
        console.log(`  ${col(C.cyan, '/design init [template] [name]')}    scaffold DESIGN.md (templates below)`);
        console.log(`  ${col(C.cyan, '/design lint [file]')}               contrast + token refs + structure`);
        console.log(`  ${col(C.cyan, '/design diff <a> <b>')}              compare two DESIGN.md files`);
        console.log(`  ${col(C.cyan, '/design export <fmt> [file]')}       fmt = tailwind | dtcg`);
        console.log(`  ${col(C.cyan, '/design suggest <comp> [file]')}     comp = button | card | input | heading`);
        console.log(`  ${col(C.cyan, '/design templates')}                 list built-in templates`);
        console.log('');
        console.log(col(C.dim, '  templates: ' + design.listTemplates().join(', ')));
        return;
      }
      case 'tokens':
      case 'summary': {
        const file = parts[1] || 'DESIGN.md';
        const s = design.summarize(file);
        if (!s.ok) { console.log(`  ${col(C.red, '✗')} ${s.error}`); return; }
        printSummary(s);
        return;
      }
      case 'templates': {
        console.log('');
        for (const t of design.listTemplates()) console.log(`  ${col(C.teal, t)}`);
        return;
      }
      case 'init': {
        // /design init [template] [name]  → writes ./DESIGN.md
        const template = parts[1] || 'editorial';
        const name     = parts.slice(2).join(' ') || undefined;
        const r = design.init('DESIGN.md', { template, name });
        if (!r.ok) { console.log(`  ${col(C.red, '✗')} ${r.error}`); return; }
        console.log(`  ${col(C.green, '✓')} created ${col(C.bold, r.file)} ${col(C.dim, 'from ' + r.template)}`);
        return;
      }
      case 'lint': {
        const file = parts[1] || 'DESIGN.md';
        const spin = makeSpinner('Linting');
        spin.start();
        const r = await design.lint(file);
        spin.stop();
        if (!r.ok && r.error) { console.log(`  ${col(C.red, '✗')} ${r.error}`); return; }
        printJSON(r.data ?? r);
        return;
      }
      case 'diff': {
        if (parts.length < 3) { console.log(col(C.dim, '  (usage: /design diff <a> <b>)')); return; }
        const spin = makeSpinner('Diffing');
        spin.start();
        const r = await design.diff(parts[1], parts[2]);
        spin.stop();
        if (!r.ok && r.error) { console.log(`  ${col(C.red, '✗')} ${r.error}`); return; }
        printJSON(r.data ?? r);
        return;
      }
      case 'export': {
        const fmt  = (parts[1] || '').toLowerCase();
        const file = parts[2] || 'DESIGN.md';
        if (!['tailwind', 'dtcg'].includes(fmt)) {
          console.log(col(C.dim, '  (usage: /design export <tailwind|dtcg> [file])'));
          return;
        }
        const spin = makeSpinner(`Exporting to ${fmt}`);
        spin.start();
        const r = await design.exportFormat(file, fmt);
        spin.stop();
        if (!r.ok && r.error) { console.log(`  ${col(C.red, '✗')} ${r.error}`); return; }
        printJSON(r.data ?? r);
        return;
      }
      case 'suggest': {
        const comp = (parts[1] || '').toLowerCase();
        const file = parts[2] || 'DESIGN.md';
        if (!comp) { console.log(col(C.dim, '  (usage: /design suggest <button|card|input|heading> [file])')); return; }
        const r = design.suggestSnippet(file, comp);
        if (!r.ok) { console.log(`  ${col(C.red, '✗')} ${r.error}`); return; }
        console.log('');
        console.log(`  ${col(C.bold, r.component)} ${col(C.dim, 'using ' + JSON.stringify(r.tokensUsed))}`);
        console.log('');
        console.log(r.snippet.html);
        if (r.snippet.react) {
          console.log('');
          console.log(col(C.dim, '  // React variant:'));
          console.log(r.snippet.react);
        }
        return;
      }
      default:
        console.log(col(C.dim, `  (unknown /design subcommand "${sub}" — try /design help)`));
    }
  } catch (e) {
    console.log(`  ${col(C.red, '✗')} ${e.message}`);
  }
}

// ── REPL ──────────────────────────────────────────────────────────────────────

function banner() {
  const w = Math.min((process.stdout.columns || 80), 78);
  const inner = w - 2;
  const hline = '─'.repeat(inner);
  const pad = (s, visibleLen) => s + ' '.repeat(Math.max(0, inner - visibleLen));

  const title = '  ✳ Geoclaw Chat';
  const tag   = '  your universal agent platform';

  console.log('');
  console.log(col(C.violet, `┌${hline}┐`));
  console.log(col(C.violet, '│') + col(C.bold, pad(title, title.length)) + col(C.violet, '│'));
  console.log(col(C.violet, '│') + col(C.dim,  pad(tag,   tag.length))   + col(C.violet, '│'));
  console.log(col(C.violet, `└${hline}┘`));

  const toolNote = TOOLS_ON ? col(C.teal, 'tools: on') : col(C.yellow, 'tools: off');
  console.log(`  ${col(C.teal, PROVIDER)} ${col(C.dim, '·')} ${col(C.bold, MODEL)} ${col(C.dim, '·')} ws: ${col(C.cyan, memory.activeWorkspace())} ${col(C.dim, '·')} ${toolNote}`);
  console.log(col(C.dim, '  type a message, or /help for commands  ·  /exit to quit'));
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(col(C.bold, '  Commands'));
  for (const { cmd, desc } of SLASH_COMMANDS) {
    console.log(`  ${col(C.cyan, cmd.padEnd(10))} ${col(C.dim, desc)}`);
  }
  console.log(col(C.dim, '  (tab completes; ctrl-c cancels a running reply; ctrl-c at the prompt quits)'));
  console.log('');
}

function printTools() {
  console.log('');
  console.log(col(C.bold, `  Tools ${TOOLS_ON ? col(C.green, '(active)') : col(C.yellow, '(inactive — provider does not support tools)')}`));
  for (const t of CHAT_TOOLS) {
    console.log(`  ${col(C.violet, '⚙')} ${col(C.bold, t.function.name)} ${col(C.dim, '— ' + t.function.description)}`);
  }
  console.log('');
}

function historyCharCount(history) {
  return history.reduce((n, m) => {
    const c = (typeof m.content === 'string' ? m.content.length : 0);
    const tc = (m.tool_calls || []).reduce((x, c) => x + (c.function?.arguments?.length || 0), 0);
    return n + c + tc;
  }, 0);
}

async function repl() {
  banner();

  const slashCompleter = (line) => {
    if (!line.startsWith('/')) return [[], line];
    const hits = SLASH_NAMES.filter(c => c.startsWith(line));
    return [hits.length ? hits : SLASH_NAMES, line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: slashCompleter,
  });

  const history = [{ role: 'system', content: SYSTEM_PROMPT }];
  let voiceOn      = process.argv.slice(2).includes('--voice');
  let pendingNote  = '';
  let turnInFlight = false;
  let lastUserText = '';

  const ctx = {
    rl,
    workspace: memory.activeWorkspace(),
    depth: 0,
    interactive: true,
    done: false,
    summary: null,
  };

  const PROMPT = `${col(C.cyan, '▌')} ${col(C.bold, 'you')} ${col(C.dim, '›')} `;
  const MARKER = `${col(C.orange, '▌')} ${col(C.bold, 'geoclaw')} ${col(C.dim, '›')} `;

  rl.on('SIGINT', () => {
    // During a turn: abort HTTP; the turn's catch prints "(cancelled)".
    if (turnInFlight && abortActive('cancelled by user')) return;
    // At the prompt: quit cleanly.
    console.log(col(C.dim, '\n  bye.'));
    rl.close();
  });

  // Run one turn. Returns normally on success/cancel; errors are handled inside.
  const runTurn = async (userText) => {
    lastUserText = userText;
    const preTurnLength = history.length;
    history.push({ role: 'user', content: userText });
    ctx.workspace = memory.activeWorkspace();
    history[0] = { role: 'system', content: buildSystemPrompt(userText) };

    turnInFlight = true;
    const t0 = Date.now();
    try {
      let reply = '', usage = null;
      if (TOOLS_ON) ({ reply, usage } = await runTurnWithTools(trimHistory(history), ctx, MARKER));
      else          ({ reply, usage } = await runTurnStreaming(trimHistory(history), MARKER));

      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const tokens = usage
        ? (usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)) ?? 0)
        : 0;
      const stats = tokens ? `${tokens} tokens · ${secs}s` : `${secs}s`;
      console.log(col(C.dim, `  ${stats}`));

      // Push the assistant's final content to real history so subsequent turns see it.
      if (reply) history.push({ role: 'assistant', content: reply });

      // Warn if context is getting heavy.
      const approxCtx = Math.round(historyCharCount(history) / 4);
      if (approxCtx > CONTEXT_WARN_TOKENS) {
        console.log(col(C.yellow, `  ⚠ context ~${approxCtx.toLocaleString()} tokens — run ${col(C.cyan, '/compact')} to summarize older turns`));
      }

      if (voiceOn && reply) tts.speak(reply, { silent: true }).catch(() => {});
    } catch (err) {
      // Full rollback — ensures no orphaned tool_calls / tool messages remain.
      history.length = preTurnLength;
      const { kind, text } = explainError(err);
      if (kind === 'cancel') {
        console.log(col(C.dim, '\n  (cancelled — use /retry to re-run, or just type a new message)'));
      } else {
        console.log(`  ${col(C.red, '✗')} ${text}`);
      }
    } finally {
      turnInFlight = false;
    }
  };

  const ask = () => {
    rl.question(PROMPT, async (line) => {
      const text = line.trim();
      if (!text) return ask();

      // ── Meta commands ─────────────────────────────────────────────────────
      if (text === '/exit' || text === '/quit') {
        console.log(col(C.dim, '  bye.'));
        rl.close();
        return;
      }
      if (text === '/clear') {
        history.length = 1;
        pendingNote = '';
        console.log(col(C.dim, '  (history cleared)'));
        console.log('');
        return ask();
      }
      if (text === '/help')  { printHelp();  return ask(); }
      if (text === '/tools') { printTools(); return ask(); }
      if (text === '/system') {
        console.log('');
        console.log(col(C.dim, history[0].content));
        console.log('');
        return ask();
      }
      if (text === '/history') {
        const userCount      = history.filter(m => m.role === 'user').length;
        const assistantCount = history.filter(m => m.role === 'assistant').length;
        const toolCount      = history.filter(m => m.role === 'tool').length;
        const tokEst         = Math.round(historyCharCount(history) / 4);
        const pct            = Math.round((tokEst / CONTEXT_WARN_TOKENS) * 100);
        console.log('');
        console.log(col(C.dim, `  messages: ${history.length} (${userCount} user, ${assistantCount} assistant, ${toolCount} tool)`));
        console.log(col(C.dim, `  ~${tokEst.toLocaleString()} tokens in context  ·  ${pct}% of warn threshold`));
        if (pendingNote) console.log(col(C.dim, `  pending btw: ${pendingNote.slice(0, 120)}${pendingNote.length > 120 ? '…' : ''}`));
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
      if (text.startsWith('/btw')) {
        const note = text.slice(4).trim();
        if (!note) {
          if (pendingNote) console.log(col(C.dim, `  (pending btw: ${pendingNote})`));
          else             console.log(col(C.dim, '  (usage: /btw <text to fold into the next message>)'));
        } else {
          pendingNote = pendingNote ? pendingNote + '\n' + note : note;
          console.log(col(C.dim, '  (noted — will be added to your next message)'));
        }
        console.log('');
        return ask();
      }
      if (text === '/undo') {
        let popped = 0;
        while (history.length > 1 && history[history.length - 1].role !== 'user') { history.pop(); popped++; }
        if (history.length > 1 && history[history.length - 1].role === 'user')    { history.pop(); popped++; }
        console.log(col(C.dim, popped ? `  (undid ${popped} message${popped === 1 ? '' : 's'})` : '  (nothing to undo)'));
        console.log('');
        return ask();
      }
      if (text === '/retry') {
        if (!lastUserText) { console.log(col(C.dim, '  (no previous turn to retry)')); console.log(''); return ask(); }
        // If the last user message is still in history (successful prior turn), splice back to it.
        for (let i = history.length - 1; i > 0; i--) {
          if (history[i].role === 'user') { history.length = i; break; }
        }
        const toRun = lastUserText;
        console.log(col(C.dim, `  (retrying: ${toRun.slice(0, 80)}${toRun.length > 80 ? '…' : ''})`));
        await runTurn(toRun);
        console.log('');
        return ask();
      }
      if (text === '/compact') {
        if (history.length <= 3) { console.log(col(C.dim, '  (not enough history to compact)')); console.log(''); return ask(); }
        const spin = makeSpinner('Compacting');
        spin.start();
        turnInFlight = true;
        try {
          const summary = await compactHistory(history);
          const oldCount = history.length;
          history.splice(1, history.length - 1, {
            role: 'system',
            content: `## Previously in this conversation (compacted summary)\n\n${summary}`,
          });
          spin.stop();
          console.log(`  ${col(C.green, '✓')} compacted ${col(C.dim, `(${oldCount} messages → ${history.length})`)}`);
        } catch (e) {
          spin.stop();
          console.log(`  ${col(C.red, '✗')} compaction failed: ${e.message}`);
        } finally {
          turnInFlight = false;
        }
        console.log('');
        return ask();
      }
      if (text.startsWith('/tool')) {
        const rest = text.slice(5).trim();
        if (!rest) {
          console.log(col(C.dim, '  (usage: /tool <name> [json-args]  — e.g. /tool recall {"query":"hebrew"})'));
          console.log('');
          return ask();
        }
        const spaceIdx = rest.indexOf(' ');
        const name     = spaceIdx < 0 ? rest : rest.slice(0, spaceIdx);
        const argsRaw  = spaceIdx < 0 ? ''   : rest.slice(spaceIdx + 1).trim();
        let args = {};
        if (argsRaw) {
          try { args = JSON.parse(argsRaw); }
          catch { console.log(`  ${col(C.red, '✗')} bad JSON for tool args: ${argsRaw.slice(0, 80)}`); console.log(''); return ask(); }
        }
        console.log(`  ${col(C.violet, '⚙')} ${col(C.bold, name)} ${col(C.dim, JSON.stringify(args))}`);
        try {
          const result = await agent.callTool(name, args, ctx);
          const okSym = result && result.ok ? col(C.green, '✓') : col(C.red, '✗');
          console.log(`    ${okSym} ${col(C.dim, shortenJSON(result, 200))}`);
        } catch (e) {
          console.log(`  ${col(C.red, '✗')} ${e.message}`);
        }
        console.log('');
        return ask();
      }

      if (text.startsWith('/design')) {
        await handleDesignCommand(text.slice(7).trim());
        console.log('');
        return ask();
      }

      // Unknown /command — don't send it to the LLM by accident.
      if (text.startsWith('/')) {
        console.log(col(C.dim, `  (unknown command: ${text.split(' ')[0]} — try /help)`));
        console.log('');
        return ask();
      }

      // ── Real user message ─────────────────────────────────────────────────
      let userText = text;
      if (pendingNote) {
        userText = `[btw: ${pendingNote}]\n\n${text}`;
        pendingNote = '';
      }

      await runTurn(userText);
      console.log('');
      ask();
    });
  };

  ask();
  rl.on('close', () => { showCursor(); process.exit(0); });
}

// ── One-shot mode ─────────────────────────────────────────────────────────────

async function oneShot(prompt) {
  const ctx = {
    rl: null,
    workspace: memory.activeWorkspace(),
    depth: 0,
    interactive: false,
    done: false,
    summary: null,
  };
  const messages = [
    { role: 'system', content: buildSystemPrompt(prompt) },
    { role: 'user',   content: prompt },
  ];
  if (TOOLS_ON) await runTurnWithTools(messages, ctx, '');
  else          await runTurnStreaming(messages, '');
}

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => a !== '--voice');
  const arg  = args.join(' ').trim();
  if (arg) oneShot(arg).catch((e) => { console.error(`${col(C.red, '✗')} ${explainError(e).text}`); process.exit(1); });
  else     repl();
}
