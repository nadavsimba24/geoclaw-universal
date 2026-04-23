#!/usr/bin/env node
// Geoclaw web UI — single-file HTTP server. No build step, no framework.
// Routes a vanilla-JS frontend (scripts/components/serve-ui/) plus JSON APIs
// for chat (SSE), files, agents, autopilots, inbox, and design-tokens theming.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { URL } = require('url');
const { spawn } = require('child_process');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch {}

const memory  = require('./memory.js');
const agent   = require('./agent.js');
const design  = require('./design.js');
const skills  = require('./skills.js');
const { env } = require('./env.js');

const PORT = parseInt(process.env.GEOCLAW_SERVE_PORT || '3737', 10);
const HOST = process.env.GEOCLAW_SERVE_HOST || '127.0.0.1';
const UI_DIR = path.join(__dirname, 'serve-ui');
const STATE_DIR = path.join(os.homedir(), '.geoclaw');
const AUTOPILOTS_FILE = path.join(STATE_DIR, 'autopilots.json');
const RUNS_FILE       = path.join(STATE_DIR, 'runs.json');
const INBOX_FILE      = path.join(STATE_DIR, 'inbox.json');
const LLM_TIMEOUT_MS  = parseInt(process.env.GEOCLAW_SERVE_LLM_TIMEOUT_MS || '120000', 10);

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

const PROVIDER = env('GEOCLAW_MODEL_PROVIDER', 'deepseek').toLowerCase();
const MODEL    = env('GEOCLAW_MODEL_NAME', 'deepseek-chat');
const API_KEY  = env('GEOCLAW_MODEL_API_KEY');
const BASE_URL = env('GEOCLAW_MODEL_BASE_URL');

// ── Simple persistent JSON store ──────────────────────────────────────────────

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Auth token (rotated per server start) ─────────────────────────────────────

const TOKEN = crypto.randomBytes(16).toString('hex');
function checkAuth(req) {
  const url  = new URL(req.url, `http://${req.headers.host}`);
  const tok  = url.searchParams.get('k') || req.headers['x-geoclaw-token'] || '';
  return tok === TOKEN;
}

// ── Inbox (recent agent activity) ─────────────────────────────────────────────

function inboxPush(event) {
  const entries = loadJSON(INBOX_FILE, []);
  entries.unshift({ id: crypto.randomBytes(6).toString('hex'), ts: Date.now(), ...event });
  while (entries.length > 200) entries.pop();
  saveJSON(INBOX_FILE, entries);
}

// ── Minimal cron parser ───────────────────────────────────────────────────────
// Supports: `*`, `*/N`, `N`, and `N-M` per field.
// Fields: minute (0-59) hour (0-23) dom (1-31) month (1-12) dow (0-6, sun=0)
// Also presets: "@hourly", "@daily", "@weekly".

const CRON_PRESETS = {
  '@hourly': '0 * * * *',
  '@daily':  '0 9 * * *',
  '@weekly': '0 9 * * 1',
};

function cronParts(cron) {
  const s = CRON_PRESETS[cron] || cron;
  const parts = s.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`bad cron (need 5 fields): "${s}"`);
  return parts;
}

function matchesField(val, expr, min, max) {
  if (expr === '*') return true;
  for (const term of expr.split(',')) {
    const step = term.includes('/') ? parseInt(term.split('/')[1], 10) : 1;
    const base = term.split('/')[0];
    if (base === '*') { if ((val - min) % step === 0) return true; continue; }
    if (base.includes('-')) {
      const [a, b] = base.split('-').map(n => parseInt(n, 10));
      if (val >= a && val <= b && (val - a) % step === 0) return true;
      continue;
    }
    const n = parseInt(base, 10);
    if (!Number.isNaN(n) && n === val) return true;
  }
  return false;
}

function cronMatches(cron, date) {
  try {
    const [mn, hr, dm, mo, dw] = cronParts(cron);
    return matchesField(date.getMinutes(), mn, 0, 59) &&
           matchesField(date.getHours(),   hr, 0, 23) &&
           matchesField(date.getDate(),    dm, 1, 31) &&
           matchesField(date.getMonth()+1, mo, 1, 12) &&
           matchesField(date.getDay(),     dw, 0, 6);
  } catch { return false; }
}

// ── Autopilot scheduler ───────────────────────────────────────────────────────

let autopilotTimer = null;
let lastTickMinute = -1;
function startAutopilotScheduler() {
  const tick = () => {
    const now = new Date();
    const thisMinute = now.getFullYear() * 1e10 + now.getMonth() * 1e8 + now.getDate() * 1e6 + now.getHours() * 1e4 + now.getMinutes() * 1e2;
    if (thisMinute === lastTickMinute) return;
    lastTickMinute = thisMinute;
    const pilots = loadJSON(AUTOPILOTS_FILE, []);
    for (const p of pilots) {
      if (!p.enabled) continue;
      if (cronMatches(p.cron, now)) {
        runAutopilot(p).catch(e => inboxPush({ kind: 'error', title: `autopilot ${p.name} failed`, body: e.message }));
      }
    }
  };
  autopilotTimer = setInterval(tick, 15_000);
  tick();
}

async function runAutopilot(pilot) {
  inboxPush({ kind: 'autopilot', title: `autopilot "${pilot.name}" started`, body: pilot.goal });
  const runId = startAgentRun(pilot.goal, { source: 'autopilot', autopilotId: pilot.id });
  const pilots = loadJSON(AUTOPILOTS_FILE, []);
  const idx = pilots.findIndex(p => p.id === pilot.id);
  if (idx >= 0) {
    pilots[idx].lastRun = Date.now();
    pilots[idx].lastRunId = runId;
    saveJSON(AUTOPILOTS_FILE, pilots);
  }
  return runId;
}

// ── Agent runs — in-memory for tail-ability, persisted summary on finish ──────

const runs = new Map();  // id → { id, goal, status, log[], startedAt, endedAt?, summary?, subscribers:Set<res> }

function startAgentRun(goal, opts = {}) {
  const id = crypto.randomBytes(6).toString('hex');
  const runRec = {
    id, goal,
    status: 'running',
    log: [],
    startedAt: Date.now(),
    source: opts.source || 'manual',
    autopilotId: opts.autopilotId || null,
    subscribers: new Set(),
  };
  runs.set(id, runRec);
  appendRunPersistent({ id, goal, status: 'running', startedAt: runRec.startedAt, source: runRec.source });

  // Fire the agent in a subprocess to keep the HTTP loop free and to leverage
  // the existing agent.js CLI (which already formats logs nicely).
  const child = spawn('node', [path.join(__dirname, 'agent.js'), goal], {
    env: { ...process.env, GEOCLAW_INTERACTIVE: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const push = (kind, line) => {
    const evt = { ts: Date.now(), kind, line };
    runRec.log.push(evt);
    if (runRec.log.length > 1000) runRec.log.shift();
    for (const sub of runRec.subscribers) {
      try { sub.write(`event: log\ndata: ${JSON.stringify(evt)}\n\n`); } catch {}
    }
  };

  const split = (stream, kind) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\x1b\[[0-9;]*m/g, '');
        buf = buf.slice(idx + 1);
        if (line.trim()) push(kind, line);
      }
    });
    stream.on('end', () => { if (buf.trim()) push(kind, buf.replace(/\x1b\[[0-9;]*m/g, '')); });
  };
  split(child.stdout, 'stdout');
  split(child.stderr, 'stderr');

  child.on('close', (code) => {
    runRec.status = code === 0 ? 'completed' : 'failed';
    runRec.endedAt = Date.now();
    runRec.exitCode = code;
    const last = [...runRec.log].reverse().find(e => /✅|finished|summary/i.test(e.line));
    runRec.summary = last ? last.line : `exit ${code}`;
    appendRunPersistent({
      id, goal, status: runRec.status, startedAt: runRec.startedAt,
      endedAt: runRec.endedAt, summary: runRec.summary, source: runRec.source,
    });
    inboxPush({
      kind: runRec.status === 'completed' ? 'done' : 'error',
      title: `agent ${runRec.status}: ${goal.slice(0, 80)}`,
      body: runRec.summary,
    });
    for (const sub of runRec.subscribers) {
      try { sub.write(`event: done\ndata: ${JSON.stringify({ status: runRec.status })}\n\n`); sub.end(); } catch {}
    }
  });

  return id;
}

function appendRunPersistent(entry) {
  const all = loadJSON(RUNS_FILE, []);
  const idx = all.findIndex(r => r.id === entry.id);
  if (idx >= 0) all[idx] = { ...all[idx], ...entry };
  else all.unshift(entry);
  while (all.length > 200) all.pop();
  saveJSON(RUNS_FILE, all);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function sendJSON(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function sendText(res, status, body, type = 'text/plain') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript', '.svg':'image/svg+xml' };
  const type = types[ext] || 'application/octet-stream';
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (e) {
    sendText(res, 404, 'not found');
  }
}

async function readBody(req, { maxBytes = 50 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) { req.destroy(new Error('request too large')); return; }
      chunks.push(c);
    });
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── OpenAI-compatible LLM caller for chat SSE ─────────────────────────────────

function chatEndpoint() {
  if (PROVIDER === 'deepseek')   return 'https://api.deepseek.com/chat/completions';
  if (PROVIDER === 'openai')     return 'https://api.openai.com/v1/chat/completions';
  if (PROVIDER === 'groq')       return 'https://api.groq.com/openai/v1/chat/completions';
  if (PROVIDER === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions';
  if (PROVIDER === 'moonshot')   return 'https://api.moonshot.cn/v1/chat/completions';
  if (BASE_URL)                  return `${BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  return null;
}

function llmCall(messages, { tools, stream } = {}) {
  const endpoint = chatEndpoint();
  if (!endpoint) throw new Error(`provider "${PROVIDER}" has no OpenAI-compatible endpoint`);
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY not set — run `geoclaw setup` or export GEOCLAW_MODEL_API_KEY');

  const body = { model: MODEL, messages };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  if (stream) body.stream = true;

  const u = new URL(endpoint);
  const data = JSON.stringify(body);
  return { u, data, headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(stream && { 'Accept': 'text/event-stream' }) } };
}

function dedupeRepeatedBlock(s) {
  if (!s || s.length < 160) return s;
  const trimmed = s.trim();
  const half = Math.floor(trimmed.length / 2);
  const a = trimmed.slice(0, half).trim();
  const b = trimmed.slice(half).trim();
  if (a.length >= 80 && a === b) return a;
  const m = trimmed.match(/^([\s\S]{80,}?)\n\s*\n([\s\S]+)$/);
  if (m && m[1].trim() === m[2].trim()) return m[1].trim();
  return s;
}

function llmJSON(messages, { tools } = {}) {
  return new Promise((resolve, reject) => {
    const { u, data, headers } = llmCall(messages, { tools });
    const req = https.request(u, { method: 'POST', headers, timeout: LLM_TIMEOUT_MS }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
        try { resolve(JSON.parse(chunks)); } catch { reject(new Error('bad json from model')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('llm timed out')));
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// ── Chat turn over SSE ────────────────────────────────────────────────────────
// Accepts { messages: [...], withTools?: true }. Streams token deltas, tool
// calls, and final. Uses tool-calling for providers that support it.

const CHAT_TOOL_NAMES = new Set([
  'remember', 'recall',
  'monday_list_boards', 'monday_get_board', 'monday_create_item',
  'send_telegram',
  'design_tokens', 'design_lint', 'design_diff', 'design_export', 'design_init', 'design_suggest',
  'read_skill',
  'browse',
  'web_search',
  'firecrawl_scrape',
  'firecrawl_crawl',
  'firecrawl_map',
  'canvas_write',
]);
const CHAT_TOOLS = agent.toolDefinitions.filter(t => CHAT_TOOL_NAMES.has(t.function.name));

const SYSTEM_PROMPT = `You are Geoclaw, a capable assistant with real tools for Monday.com, long-term memory, Telegram, and a design-system toolkit (DESIGN.md — colors, typography, components).

When the user asks you to DO something — create Monday items, remember/recall, send Telegram, generate on-brand UI, search the web, read a URL — USE YOUR TOOLS. Don't tell them to run a shell command. To search the web call web_search({query}), then browse({url}) on the best result. For a direct URL call browse({url}) to get readable markdown with typed refs like [link 7].

When a user asks you to design or build UI (dashboard, app, landing page, form), first check for DESIGN.md via design_tokens; if none exists, scaffold one with design_init (pick a template that fits the domain), then design_suggest your components using those tokens.

Reply in the same language the user writes in (Hebrew → Hebrew, Arabic → Arabic, etc).`;

function buildSystemPrompt() {
  const ws = memory.activeWorkspace();
  const designSummary = (() => {
    try {
      const s = design.summarize('DESIGN.md');
      if (s.ok) {
        const colors = s.colors.slice(0, 6).map(c => `${c.name}=${c.value}`).join(', ');
        return `Active design system: "${s.name}" · colors: ${colors} · components: ${s.components.join(', ') || 'none'}`;
      }
    } catch {}
    return null;
  })();
  const skillsManifest = (() => { try { return skills.buildSkillsManifest(); } catch { return ''; } })();
  return `${SYSTEM_PROMPT}\n\nActive workspace: ${ws}${designSummary ? `\n${designSummary}` : ''}${skillsManifest}`;
}

async function handleChatSSE(req, res, body) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  const send = (event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} };
  const done = () => { try { res.end(); } catch {} };

  req.on('close', () => done());

  try {
    if (!API_KEY) {
      send('error', { message: 'No API key set. Run `geoclaw setup` (or set GEOCLAW_MODEL_API_KEY) and restart the server.', code: 'no-key' });
      return done();
    }
    const { messages: clientMessages = [] } = body;
    const messages = [{ role: 'system', content: buildSystemPrompt() }, ...clientMessages];

    for (let step = 0; step < 10; step++) {
      const data = await llmJSON(messages, { tools: CHAT_TOOLS });
      const msg = data.choices?.[0]?.message;
      if (!msg) { send('error', { message: 'no choice' }); break; }
      messages.push(msg);

      const calls = msg.tool_calls || [];
      if (msg.content) {
        const text = calls.length ? msg.content : dedupeRepeatedBlock(msg.content);
        send('content', { text });
      }
      if (!calls.length) { send('usage', data.usage || {}); break; }

      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        send('tool-start', { name: call.function.name, args });
        const result = await agent.callTool(call.function.name, args, { interactive: false, rl: null });
        send('tool-end',   { name: call.function.name, ok: !!(result && result.ok), summary: JSON.stringify(result).slice(0, 500) });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
    }
    send('done', {});
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    done();
  }
}

// ── Request router ────────────────────────────────────────────────────────────

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Static UI (allowed without auth for the shell so we can show an error page)
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return sendFile(res, path.join(UI_DIR, 'index.html'));
  }
  if (req.method === 'GET' && (pathname === '/app.js' || pathname === '/app.css' || pathname === '/logo.svg')) {
    return sendFile(res, path.join(UI_DIR, pathname.slice(1)));
  }
  // Favicon — browsers request this automatically without the token, so serve
  // it without auth to avoid console spam. We return a small SVG mark.
  if (req.method === 'GET' && (pathname === '/favicon.ico' || pathname === '/favicon.svg')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#7A5FE6"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#fff">✳</text></svg>`;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    return res.end(svg);
  }

  if (!checkAuth(req)) return sendJSON(res, 401, { error: 'auth required (append ?k=<token> to the URL)' });

  // ── /api/me ──────────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/me') {
    const designSummary = (() => { try { const s = design.summarize('DESIGN.md'); return s.ok ? s : null; } catch { return null; } })();
    return sendJSON(res, 200, {
      ok: true,
      provider: PROVIDER,
      model: MODEL,
      workspace: memory.activeWorkspace(),
      workspaces: memory.listWorkspaces(),
      hasKey: !!API_KEY,
      cwd: process.cwd(),
      design: designSummary,
      templates: design.listTemplates(),
      platform: process.platform,
      version: require('../../package.json').version || '0.0.0',
    });
  }

  // ── /api/design ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/design') {
    try { return sendJSON(res, 200, design.summarize(url.searchParams.get('file') || 'DESIGN.md')); }
    catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/design/init') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    return sendJSON(res, 200, design.init(body.file || 'DESIGN.md', { template: body.template || 'editorial', name: body.name }));
  }

  // ── /api/chat ────────────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/chat') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    return handleChatSSE(req, res, body);
  }

  // ── /api/files ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/files') {
    const entries = memory.list({});
    const bySource = {};
    for (const e of entries) {
      const src = e.source || '(inline)';
      const t   = e.timestamp ? Date.parse(e.timestamp) : 0;
      if (!bySource[src]) bySource[src] = { source: src, count: 0, lastAt: 0 };
      bySource[src].count++;
      if (t > bySource[src].lastAt) bySource[src].lastAt = t;
    }
    return sendJSON(res, 200, { ok: true, sources: Object.values(bySource).sort((a,b) => b.lastAt - a.lastAt) });
  }

  if (req.method === 'POST' && pathname === '/api/files/upload') {
    const filename = url.searchParams.get('name') || 'upload.txt';
    const buf = await readBody(req);
    const ingestDir = path.join(STATE_DIR, 'ingest');
    if (!fs.existsSync(ingestDir)) fs.mkdirSync(ingestDir, { recursive: true });
    const safeName = filename.replace(/[^\w.\-]/g, '_');
    const tmp = path.join(ingestDir, `${Date.now()}-${safeName}`);
    fs.writeFileSync(tmp, buf);
    try {
      const ingest = require('./ingest.js');
      const result = await ingest.ingest(tmp, {});
      const count = result.new ?? result.ids?.length ?? 0;
      inboxPush({ kind: 'file', title: `ingested ${filename}`, body: `${count} chunks` });
      return sendJSON(res, 200, { ok: true, source: result.source || path.basename(tmp), count });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/files/')) {
    const src = decodeURIComponent(pathname.slice('/api/files/'.length));
    const n = memory.forgetBySource(src);
    return sendJSON(res, 200, { ok: true, removed: n });
  }

  // ── /api/agents ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/agents') {
    const persisted = loadJSON(RUNS_FILE, []);
    const live = [...runs.values()].map(r => ({
      id: r.id, goal: r.goal, status: r.status, startedAt: r.startedAt,
      endedAt: r.endedAt, summary: r.summary, source: r.source,
      logLines: r.log.length,
    }));
    const merged = [...live];
    for (const p of persisted) if (!runs.has(p.id)) merged.push(p);
    return sendJSON(res, 200, { ok: true, runs: merged.slice(0, 100) });
  }

  if (req.method === 'POST' && pathname === '/api/agents/run') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.goal) return sendJSON(res, 400, { ok: false, error: 'missing goal' });
    const id = startAgentRun(body.goal, { source: 'manual' });
    return sendJSON(res, 200, { ok: true, runId: id });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/agents/') && pathname.endsWith('/stream')) {
    const id = pathname.split('/')[3];
    const run = runs.get(id);
    if (!run) return sendJSON(res, 404, { ok: false, error: 'run not found' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    // Backfill existing log lines.
    for (const evt of run.log) {
      res.write(`event: log\ndata: ${JSON.stringify(evt)}\n\n`);
    }
    if (run.status !== 'running') {
      res.write(`event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
      res.end();
      return;
    }
    run.subscribers.add(res);
    req.on('close', () => run.subscribers.delete(res));
    return;
  }

  // ── /api/autopilots ──────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/autopilots') {
    return sendJSON(res, 200, { ok: true, autopilots: loadJSON(AUTOPILOTS_FILE, []) });
  }
  if (req.method === 'POST' && pathname === '/api/autopilots') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.name || !body.goal || !body.cron) return sendJSON(res, 400, { ok: false, error: 'need name, goal, cron' });
    try { cronParts(body.cron); } catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
    const pilots = loadJSON(AUTOPILOTS_FILE, []);
    const pilot = {
      id: crypto.randomBytes(6).toString('hex'),
      name: body.name, goal: body.goal, cron: body.cron,
      enabled: body.enabled !== false,
      createdAt: Date.now(),
    };
    pilots.push(pilot);
    saveJSON(AUTOPILOTS_FILE, pilots);
    return sendJSON(res, 200, { ok: true, autopilot: pilot });
  }
  if (req.method === 'PATCH' && pathname.startsWith('/api/autopilots/')) {
    const id = pathname.split('/')[3];
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const pilots = loadJSON(AUTOPILOTS_FILE, []);
    const idx = pilots.findIndex(p => p.id === id);
    if (idx < 0) return sendJSON(res, 404, { ok: false, error: 'not found' });
    pilots[idx] = { ...pilots[idx], ...body, id };
    if (body.cron) { try { cronParts(body.cron); } catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); } }
    saveJSON(AUTOPILOTS_FILE, pilots);
    return sendJSON(res, 200, { ok: true, autopilot: pilots[idx] });
  }
  if (req.method === 'DELETE' && pathname.startsWith('/api/autopilots/')) {
    const id = pathname.split('/')[3];
    const pilots = loadJSON(AUTOPILOTS_FILE, []).filter(p => p.id !== id);
    saveJSON(AUTOPILOTS_FILE, pilots);
    return sendJSON(res, 200, { ok: true });
  }
  if (req.method === 'POST' && pathname.startsWith('/api/autopilots/') && pathname.endsWith('/run')) {
    const id = pathname.split('/')[3];
    const pilot = loadJSON(AUTOPILOTS_FILE, []).find(p => p.id === id);
    if (!pilot) return sendJSON(res, 404, { ok: false, error: 'not found' });
    const runId = await runAutopilot(pilot);
    return sendJSON(res, 200, { ok: true, runId });
  }

  // ── /api/inbox ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/inbox') {
    return sendJSON(res, 200, { ok: true, entries: loadJSON(INBOX_FILE, []) });
  }
  if (req.method === 'POST' && pathname === '/api/inbox/clear') {
    saveJSON(INBOX_FILE, []);
    return sendJSON(res, 200, { ok: true });
  }

  // ── /api/approvals ───────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/approvals') {
    const { getConfig } = require('./approvals.js');
    return sendJSON(res, 200, { ok: true, ...getConfig() });
  }
  if (req.method === 'POST' && pathname === '/api/approvals/policy') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try { return sendJSON(res, 200, require('./approvals.js').setPolicy(body.policy)); }
    catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/approvals/override') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try { return sendJSON(res, 200, require('./approvals.js').setOverride(body.tool, body.decision)); }
    catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
  }

  // ── /api/memory ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/memory') {
    const sessions = require('./sessions.js');
    const n = parseInt(new URL(req.url, 'http://x').searchParams.get('n') || '50', 10);
    return sendJSON(res, 200, { ok: true, sessions: sessions.list(n) });
  }
  if (req.method === 'DELETE' && pathname === '/api/memory') {
    const sessions = require('./sessions.js');
    return sendJSON(res, 200, sessions.clear());
  }

  // ── /api/canvas ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/canvas') {
    const canvas = require('./canvas.js');
    const qs = new URL(req.url, `http://x`).searchParams;
    return sendJSON(res, 200, { ok: true, items: canvas.list({ limit: parseInt(qs.get('limit') || '50', 10) }) });
  }
  if (req.method === 'POST' && pathname === '/api/canvas') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try { return sendJSON(res, 200, require('./canvas.js').write(body)); }
    catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/canvas/clear') {
    return sendJSON(res, 200, require('./canvas.js').clear());
  }
  if (req.method === 'DELETE' && pathname.startsWith('/api/canvas/')) {
    const id = pathname.slice('/api/canvas/'.length);
    return sendJSON(res, 200, require('./canvas.js').remove(id));
  }

  // ── /api/firecrawl ───────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/firecrawl/ping') {
    const fc = require('./firecrawl.js');
    return sendJSON(res, 200, await fc.ping());
  }
  if (req.method === 'POST' && pathname === '/api/firecrawl/scrape') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.url) return sendJSON(res, 400, { ok: false, error: 'missing url' });
    try {
      const fc = require('./firecrawl.js');
      return sendJSON(res, 200, await fc.scrape(body.url, { maxChars: body.maxChars }));
    } catch (e) { return sendJSON(res, 502, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/firecrawl/crawl') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.url) return sendJSON(res, 400, { ok: false, error: 'missing url' });
    try {
      const fc = require('./firecrawl.js');
      return sendJSON(res, 200, await fc.crawl(body.url, { limit: body.limit, maxDepth: body.maxDepth }));
    } catch (e) { return sendJSON(res, 502, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/firecrawl/map') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.url) return sendJSON(res, 400, { ok: false, error: 'missing url' });
    try {
      const fc = require('./firecrawl.js');
      return sendJSON(res, 200, await fc.map(body.url, { includeSubdomains: body.includeSubdomains }));
    } catch (e) { return sendJSON(res, 502, { ok: false, error: e.message }); }
  }

  // ── /api/search ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/search') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.query) return sendJSON(res, 400, { ok: false, error: 'missing query' });
    try {
      const { webSearch } = require('./search.js');
      const r = await webSearch(body.query, { limit: body.limit });
      return sendJSON(res, r.ok ? 200 : 502, r);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  // ── /api/settings/set-env ────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/settings/set-env') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.key || !body.key.match(/^GEOCLAW_[A-Z0-9_]+$/)) {
      return sendJSON(res, 400, { ok: false, error: 'invalid key name' });
    }
    try {
      const fs   = require('fs');
      const envPath = path.join(process.cwd(), '.env');
      let content = '';
      try { content = fs.readFileSync(envPath, 'utf8'); } catch { /* new file */ }
      const lines = content.split('\n');
      const prefix = `${body.key}=`;
      const idx = lines.findIndex(l => l.startsWith(prefix));
      const newLine = `${body.key}=${body.value || ''}`;
      if (idx >= 0) lines[idx] = newLine;
      else lines.push(newLine);
      fs.writeFileSync(envPath, lines.join('\n'));
      process.env[body.key] = body.value || '';
      return sendJSON(res, 200, { ok: true });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  // ── /api/browse ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/browse') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.url) return sendJSON(res, 400, { ok: false, error: 'missing url' });
    try {
      const { browse } = require('./browse.js');
      const r = await browse(body.url, { maxChars: body.maxChars });
      return sendJSON(res, r.ok ? 200 : 502, r);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  // ── /api/skills ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/skills') {
    return sendJSON(res, 200, { ok: true, skills: skills.listSkills({}) });
  }
  if (req.method === 'GET' && pathname.startsWith('/api/skills/show/')) {
    const name = decodeURIComponent(pathname.slice('/api/skills/show/'.length));
    const body = skills.readSkillBody(name);
    if (body == null) return sendJSON(res, 404, { ok: false, error: 'not found' });
    return sendJSON(res, 200, { ok: true, name, body });
  }
  if (req.method === 'POST' && pathname === '/api/skills/create') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try {
      let md = null;
      if (body.useLLM && API_KEY) {
        try {
          md = await skills.llmDraft({
            intent: body.intent || body.description || '',
            triggers: body.triggers || [],
            outputs: body.outputs || '',
          });
          const v = skills.validateSkill(md);
          if (!v.ok) md = null;
        } catch (e) {
          inboxPush({ kind: 'error', title: 'skill LLM draft failed', body: e.message });
          md = null;
        }
      }
      const created = await skills.createSkill({
        name: body.name || skills.slugify(body.intent || 'new-skill'),
        description: body.description || body.intent || '',
        scope: body.scope || 'global',
        body: md || undefined,
        overwrite: !!body.overwrite,
      });
      inboxPush({ kind: 'done', title: `skill created: ${created.name}`, body: created.file });
      return sendJSON(res, 200, { ok: true, skill: created, draftedByLLM: !!md });
    } catch (e) {
      return sendJSON(res, 400, { ok: false, error: e.message });
    }
  }
  if (req.method === 'POST' && pathname === '/api/skills/add') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.source) return sendJSON(res, 400, { ok: false, error: 'missing source' });
    try {
      const r = await skills.addFromRegistry(body.source, { scope: body.scope || 'global', agents: body.agents || ['claude-code'] });
      inboxPush({ kind: 'done', title: `skills installed: ${body.source}`, body: (r.stdout || '').slice(0, 200) });
      return sendJSON(res, 200, { ok: true, stdout: r.stdout });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }
  if (req.method === 'POST' && pathname === '/api/skills/install-bundle') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.slug) return sendJSON(res, 400, { ok: false, error: 'missing slug' });
    try {
      const r = await skills.installBundle(body.slug, { scope: body.scope || 'global' });
      const title = r.ok
        ? `bundle installed: ${r.bundle?.name || body.slug}`
        : `bundle partial: ${body.slug} (${r.installed?.length || 0}/${r.bundle?.count || '?'})`;
      const summary = `installed: ${r.installed?.join(', ') || 'none'}` +
        (r.failed?.length ? ` · failed: ${r.failed.map(f => f.slug).join(', ')}` : '');
      inboxPush({ kind: r.ok ? 'done' : 'error', title, body: summary.slice(0, 300) });
      return sendJSON(res, 200, r);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }
  if (req.method === 'GET' && pathname === '/api/skills/registry') {
    const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim();
    try { return sendJSON(res, 200, await skills.searchRegistry(q)); }
    catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/skills/install-registry') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.slug) return sendJSON(res, 400, { ok: false, error: 'missing slug' });
    try { return sendJSON(res, 200, await skills.installFromRegistry(body.slug, { scope: body.scope || 'global' })); }
    catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
  }
  if (req.method === 'DELETE' && pathname.startsWith('/api/skills/')) {
    const name = decodeURIComponent(pathname.slice('/api/skills/'.length));
    try { return sendJSON(res, 200, skills.removeSkill(name)); }
    catch (e) { return sendJSON(res, 404, { ok: false, error: e.message }); }
  }

  // ── /api/workspaces ──────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/workspaces/use') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.name) return sendJSON(res, 400, { ok: false, error: 'missing name' });
    try { memory.useWorkspace(body.name); return sendJSON(res, 200, { ok: true, workspace: memory.activeWorkspace() }); }
    catch (e) { return sendJSON(res, 400, { ok: false, error: e.message }); }
  }

  return sendJSON(res, 404, { error: 'not found', path: pathname });
}

// ── Server startup ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'null');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    await handle(req, res);
  } catch (e) {
    if (!res.headersSent) sendJSON(res, 500, { error: e.message });
    else try { res.end(); } catch {}
  }
});

function banner(actualPort) {
  const url = `http://${HOST}:${actualPort}/?k=${TOKEN}`;
  console.log('');
  console.log('\x1b[38;5;141m┌─────────────────────────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[38;5;141m│\x1b[0m  \x1b[1m✳ Geoclaw Web\x1b[0m — open this URL in your browser:             \x1b[38;5;141m│\x1b[0m');
  console.log('\x1b[38;5;141m│\x1b[0m                                                                 \x1b[38;5;141m│\x1b[0m');
  console.log(`\x1b[38;5;141m│\x1b[0m  \x1b[38;5;80m${url.padEnd(63)}\x1b[0m\x1b[38;5;141m│\x1b[0m`);
  console.log('\x1b[38;5;141m│\x1b[0m                                                                 \x1b[38;5;141m│\x1b[0m');
  console.log(`\x1b[38;5;141m│\x1b[0m  \x1b[2mprovider:\x1b[0m ${(PROVIDER + '/' + MODEL).padEnd(40)}             \x1b[38;5;141m│\x1b[0m`);
  console.log(`\x1b[38;5;141m│\x1b[0m  \x1b[2mworkspace:\x1b[0m ${memory.activeWorkspace().padEnd(40)}            \x1b[38;5;141m│\x1b[0m`);
  console.log('\x1b[38;5;141m│\x1b[0m                                                                 \x1b[38;5;141m│\x1b[0m');
  console.log('\x1b[38;5;141m│\x1b[0m  \x1b[2mctrl-c to stop. token rotates on every restart.\x1b[0m              \x1b[38;5;141m│\x1b[0m');
  console.log('\x1b[38;5;141m└─────────────────────────────────────────────────────────────────┘\x1b[0m');
  console.log('');
}

function start() {
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn(`\x1b[33m⚠  serving on ${HOST} (non-localhost). Anyone on the network who knows the token can use this UI. Be sure.\x1b[0m`);
  }
  server.listen(PORT, HOST, () => {
    const addr = server.address();
    banner(addr.port);
    startAutopilotScheduler();
  });
}

process.on('SIGINT', () => {
  console.log('\n\x1b[2mshutting down…\x1b[0m');
  if (autopilotTimer) clearInterval(autopilotTimer);
  server.close(() => process.exit(0));
});

if (require.main === module) start();

module.exports = { start };
