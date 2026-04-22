#!/usr/bin/env node
// Geoclaw interactive chat — tool-using, streams replies, Claude-Code-style UX.

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

const MAX_TOOL_STEPS = parseInt(process.env.GEOCLAW_CHAT_MAX_TOOL_STEPS || '8', 10);
const MAX_HISTORY    = parseInt(process.env.GEOCLAW_CHAT_MAX_HISTORY    || '40', 10);
const LLM_TIMEOUT_MS = parseInt(process.env.GEOCLAW_CHAT_LLM_TIMEOUT_MS || '120000', 10);

// Track the in-flight HTTP request so Ctrl-C can abort it without killing the REPL.
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
// SIGINT fires here when readline ISN'T actively reading — i.e. during an in-flight turn.
// At the prompt, the rl.on('SIGINT') handler below takes over. So here: abort if we can.
process.on('SIGINT', () => {
  if (abortActive('cancelled by user')) return;  // request aborted — REPL keeps going
  showCursor();
  process.exit(130);
});
process.on('SIGTERM', () => { showCursor(); process.exit(143); });

// ── Tool calling ──────────────────────────────────────────────────────────────
// Reuse the agent's tool catalog. Drop tools that don't make sense in continuous
// chat: 'finish' (the conversation never ends), 'spawn_subagent' (nested agents
// feel weird inline), 'speak' (we already have /voice for that).
const CHAT_TOOL_NAMES = new Set([
  'remember', 'recall',
  'monday_list_boards', 'monday_get_board', 'monday_create_item',
  'send_telegram', 'ask_user',
]);
const CHAT_TOOLS = agent.toolDefinitions.filter(t => CHAT_TOOL_NAMES.has(t.function.name));

function providerSupportsTools() {
  if (PROVIDER === 'deepseek' || PROVIDER === 'openai') return true;
  if (!['anthropic', 'google', 'ollama'].includes(PROVIDER) && BASE_URL) return true;  // custom OpenAI-compat
  return false;
}
const TOOLS_ON = providerSupportsTools();

const SYSTEM_PROMPT_TOOLS = `You are Geoclaw, a capable AI assistant with REAL TOOLS for Monday.com, long-term memory, and Telegram.

When the user asks you to DO something — create Monday.com items, save a fact, search the knowledge base, send a Telegram message — USE YOUR TOOLS DIRECTLY. Do NOT tell the user to run a shell command themselves; you have hands, use them. Chain multiple tool calls if needed.

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
          return reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
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

async function typewrite(text, onDelta, perChunkMs = 8) {
  const parts = text.match(/\S+\s*|\s+/g) || [text];
  for (const p of parts) {
    onDelta(p);
    if (perChunkMs) await new Promise(r => setTimeout(r, perChunkMs));
  }
}

// ── Tool-using turn (OpenAI-compatible providers) ─────────────────────────────

function chatEndpoint() {
  if (PROVIDER === 'deepseek') return 'https://api.deepseek.com/chat/completions';
  if (PROVIDER === 'openai')   return 'https://api.openai.com/v1/chat/completions';
  if (BASE_URL)                return `${BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  return null;
}

async function llmWithTools(messages) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const endpoint = chatEndpoint();
  if (!endpoint) throw new Error(`Tool-using chat needs an OpenAI-compatible provider (got "${PROVIDER}")`);
  const data = await jsonPost(endpoint, {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type':  'application/json',
  }, {
    model:       MODEL,
    messages,
    tools:       CHAT_TOOLS,
    tool_choice: 'auto',
  });
  return {
    msg:   data.choices?.[0]?.message || { content: '[no content]' },
    usage: data.usage || null,
  };
}

function shortenJSON(obj, max) {
  const s = JSON.stringify(obj);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function runTurnWithTools(history, ctx, marker) {
  const spin = makeSpinner();
  spin.start();

  let aggUsage = null;
  let finalReply = '';

  try {
    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const { msg, usage } = await llmWithTools(history);
      if (usage) {
        aggUsage = aggUsage
          ? { total_tokens: (aggUsage.total_tokens || 0) + (usage.total_tokens || 0) }
          : usage;
      }
      history.push(msg);

      const calls = msg.tool_calls || [];

      // Inline narration alongside tool calls — print it dim, above the tool lines.
      if (msg.content && calls.length > 0) {
        spin.stop();
        console.log(`  ${col(C.dim, msg.content.trim())}`);
      }

      if (calls.length === 0) {
        spin.stop();
        process.stdout.write(marker);
        const content = msg.content || '';
        await typewrite(content, (d) => process.stdout.write(d));
        process.stdout.write('\n');
        finalReply = content;
        break;
      }

      // Run each tool call, show it Claude-Code-style.
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
          content: JSON.stringify(result),
        });
      }

      // Let the spinner tick again while we wait for the next LLM call.
      spin.start();
    }

    if (!finalReply) {
      spin.stop();
      console.log(`  ${col(C.yellow, '⚠')} hit tool-call step limit (${MAX_TOOL_STEPS}) — consider rephrasing.`);
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
    switch (PROVIDER) {
      case 'anthropic': res = await streamAnthropic(history, onDelta); break;
      case 'google':    res = await streamGoogle(history, onDelta); break;
      case 'ollama':    res = await streamOllama(history, onDelta); break;
      case 'openai':    res = await streamOpenAIish(history, 'https://api.openai.com/v1/chat/completions', onDelta); break;
      case 'deepseek':  res = await streamOpenAIish(history, 'https://api.deepseek.com/chat/completions',  onDelta); break;
      default:          res = await streamOpenAIish(history, '', onDelta);
    }
  } finally {
    if (firstChunk) spin.stop();
  }
  if (!firstChunk) process.stdout.write('\n');
  return res;
}

// ── Context trim ──────────────────────────────────────────────────────────────

function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY) return messages;
  const head = messages.slice(0, 1);  // system
  const tail = messages.slice(-(MAX_HISTORY - 2));
  return [...head, { role: 'system', content: '[earlier turns trimmed to fit context]' }, ...tail];
}

// ── Interactive REPL ──────────────────────────────────────────────────────────

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

  const toolNote = TOOLS_ON
    ? col(C.teal, 'tools: on')
    : col(C.yellow, 'tools: off');
  const info = `  ${col(C.teal, PROVIDER)} ${col(C.dim, '·')} ${col(C.bold, MODEL)} ${col(C.dim, '·')} ws: ${col(C.cyan, memory.activeWorkspace())} ${col(C.dim, '·')} ${toolNote}`;
  console.log(info);
  console.log(col(C.dim, '  type a message, or /help for commands  ·  /exit to quit'));
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(col(C.bold, '  Commands'));
  const rows = [
    ['/exit',            'quit chat'],
    ['/clear',           'reset conversation history'],
    ['/retry',           'redo the last user turn'],
    ['/undo',            'drop the last user + assistant exchange'],
    ['/btw <text>',      'add a side-note the next turn should consider'],
    ['/tool <name> [j]', 'call a tool directly — e.g. /tool recall {"query":"..."}'],
    ['/history',         'show message count, token estimate, pending btw'],
    ['/system',          'show current system prompt'],
    ['/tools',           'list available tools'],
    ['/voice on|off',    'toggle text-to-speech for replies'],
    ['/help',            'this message'],
  ];
  for (const [cmd, desc] of rows) {
    console.log(`  ${col(C.cyan, cmd.padEnd(18))} ${col(C.dim, desc)}`);
  }
  console.log(col(C.dim, `  (ctrl-c while geoclaw is thinking cancels the reply; ctrl-c at the prompt quits)`));
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

async function repl() {
  banner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const history = [{ role: 'system', content: SYSTEM_PROMPT }];
  let voiceOn = process.argv.slice(2).includes('--voice');
  let pendingNote = '';   // text added via /btw to be folded into the next user message
  let turnInFlight = false;

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

  // Ctrl-C behaviour: during a turn, abort the HTTP request and drop back to prompt.
  // At the prompt (no turn in flight), quit cleanly.
  rl.on('SIGINT', () => {
    // During a turn: abort the HTTP request; the turn's catch prints "(cancelled)".
    if (turnInFlight && abortActive('cancelled by user')) return;
    // At the prompt (or if no request is in flight): quit cleanly.
    console.log(col(C.dim, '\n  bye.'));
    rl.close();
  });

  // Run one conversation turn — returns when done, aborted, or errored.
  const runTurn = async (userText) => {
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

      if (reply) history.push({ role: 'assistant', content: reply });
      if (voiceOn && reply) tts.speak(reply, { silent: true }).catch(() => {});
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/cancelled by user/i.test(msg)) {
        console.log(col(C.dim, '\n  (cancelled — use /retry to re-run, or just type a new message)'));
      } else {
        console.log(`  ${col(C.red, '✗')} ${msg}`);
      }
      // On error/abort we drop the failed user turn so /retry or a fresh message works.
      if (history[history.length - 1]?.role === 'user') history.pop();
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
        const charCount      = history.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
        const tokEst         = Math.round(charCount / 4);  // rough
        console.log('');
        console.log(col(C.dim, `  messages: ${history.length} (${userCount} user, ${assistantCount} assistant, ${toolCount} tool)`));
        console.log(col(C.dim, `  ~${tokEst.toLocaleString()} tokens in context  ·  limit is ${MAX_HISTORY} messages`));
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
          if (pendingNote) { console.log(col(C.dim, `  (pending btw: ${pendingNote})`)); }
          else             { console.log(col(C.dim, '  (usage: /btw <text to fold into the next message>)')); }
        } else {
          pendingNote = pendingNote ? pendingNote + '\n' + note : note;
          console.log(col(C.dim, `  (noted — will be added to your next message)`));
        }
        console.log('');
        return ask();
      }
      if (text === '/undo') {
        let popped = 0;
        // Drop trailing tool messages, then assistant, then user.
        while (history.length > 1 && history[history.length - 1].role !== 'user') { history.pop(); popped++; }
        if (history.length > 1 && history[history.length - 1].role === 'user')   { history.pop(); popped++; }
        console.log(col(C.dim, popped ? `  (undid ${popped} message${popped === 1 ? '' : 's'})` : '  (nothing to undo)'));
        console.log('');
        return ask();
      }
      if (text === '/retry') {
        // Find the last user message, drop everything after it, re-run.
        let lastUserIdx = -1;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx < 0) { console.log(col(C.dim, '  (no previous turn to retry)')); console.log(''); return ask(); }
        const lastUser = history[lastUserIdx].content;
        history.splice(lastUserIdx);  // drop that user + everything after
        console.log(col(C.dim, `  (retrying: ${lastUser.slice(0, 80)}${lastUser.length > 80 ? '…' : ''})`));
        await runTurn(lastUser);
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

// ── One-shot mode: geoclaw chat "your question" ───────────────────────────────

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
  if (TOOLS_ON) {
    const { reply } = await runTurnWithTools(messages, ctx, '');
    if (reply && !process.stdout.isTTY) process.stdout.write(reply + '\n');
  } else {
    await runTurnStreaming(messages, '');
  }
}

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => a !== '--voice');
  const arg  = args.join(' ').trim();
  if (arg) oneShot(arg).catch((e) => { console.error(`${col(C.red, '✗')} ${e.message}`); process.exit(1); });
  else     repl();
}
