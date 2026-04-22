#!/usr/bin/env node
// Geoclaw Telegram bot — long-poll, per-chat workspace, document ingestion.

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch {}

const memory = require('./memory.js');
const { ingest } = require('./ingest.js');
const { env } = require('./env.js');

const BOT_TOKEN = env('GEOCLAW_TELEGRAM_BOT_TOKEN');
const ALLOWED = env('GEOCLAW_TELEGRAM_ALLOWED_IDS')
  .split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_WS = env('GEOCLAW_TELEGRAM_DEFAULT_WS', 'telegram');
const MAX_FILE_BYTES = parseInt(env('GEOCLAW_TELEGRAM_MAX_BYTES') || String(20 * 1024 * 1024), 10);

if (!BOT_TOKEN) {
  console.error('❌ GEOCLAW_TELEGRAM_BOT_TOKEN not set. Run: geoclaw setup (and enable Telegram).');
  process.exit(1);
}

const BINDINGS_FILE = path.join(os.homedir(), '.geoclaw', 'telegram-bindings.json');

// ── Per-chat workspace bindings ───────────────────────────────────────────────

function loadBindings() {
  try { return JSON.parse(fs.readFileSync(BINDINGS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveBindings(obj) {
  fs.mkdirSync(path.dirname(BINDINGS_FILE), { recursive: true });
  fs.writeFileSync(BINDINGS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}
function workspaceFor(chatId) {
  const b = loadBindings();
  return b[chatId] || DEFAULT_WS;
}
function bindWorkspace(chatId, ws) {
  const b = loadBindings();
  b[chatId] = ws;
  saveBindings(b);
}

// ── Telegram API helpers (zero deps) ──────────────────────────────────────────

function tg(method, params = {}, timeoutMs = 65_000) {
  const body = JSON.stringify(params);
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(chunks);
          if (!j.ok) return reject(new Error(j.description || `telegram ${method} failed`));
          resolve(j.result);
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`telegram ${method} timed out`)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function downloadFile(filePath, destPath) {
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`download HTTP ${res.statusCode}`));
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    }).on('error', reject);
  });
}

async function reply(chatId, text, opts = {}) {
  try {
    await tg('sendMessage', { chat_id: chatId, text, parse_mode: opts.parseMode, disable_web_page_preview: true });
  } catch (e) {
    console.error(`[tg] sendMessage failed: ${e.message}`);
  }
}

// ── Access control ────────────────────────────────────────────────────────────

function isAllowed(fromId) {
  if (ALLOWED.length === 0) return true;          // open mode
  return ALLOWED.includes(String(fromId));
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleStart(chat) {
  await reply(chat.id,
    `Hi! I'm your Geoclaw knowledge-base bot.\n` +
    `שלום! אני בוט בסיס הידע של Geoclaw.\n\n` +
    `Your chat ID / מזהה הצ'אט שלך: ${chat.id}\n` +
    `Your workspace / סביבת העבודה שלך: ${workspaceFor(chat.id)}\n\n` +
    `Commands / פקודות:\n` +
    `/workspace [name]   switch workspace / החלפת סביבת עבודה\n` +
    `/workspaces         list workspaces / הצגת כל הסביבות\n` +
    `/recall <query>     search / חיפוש\n` +
    `/list               recent entries / רשומות אחרונות\n` +
    `/forget <id>        delete an entry / מחיקת רשומה\n` +
    `/help               this message / הודעה זו\n\n` +
    `Send any text → saved as a fact.\n` +
    `שלחו טקסט → יישמר כעובדה.\n\n` +
    `Send a document (PDF/DOCX/XLSX/TXT/MD…) → ingested into the knowledge base.\n` +
    `שלחו מסמך (PDF/DOCX/XLSX/TXT/MD…) → ייקלט לבסיס הידע.`);
}

async function handleWorkspace(chat, arg) {
  if (!arg) { await reply(chat.id, `Current workspace: ${workspaceFor(chat.id)}`); return; }
  try {
    memory.createWorkspace(arg);
    bindWorkspace(chat.id, arg);
    await reply(chat.id, `✓ switched to workspace: ${arg}`);
  } catch (e) { await reply(chat.id, `❌ ${e.message}`); }
}

async function handleWorkspaces(chat) {
  const all = memory.listWorkspaces();
  const cur = workspaceFor(chat.id);
  const lines = all.map(w => w === cur ? `● ${w}` : `  ${w}`).join('\n');
  await reply(chat.id, `Workspaces:\n${lines || '(none)'}`);
}

async function handleRecall(chat, query) {
  if (!query) { await reply(chat.id, 'Usage: /recall your question'); return; }
  const ws = workspaceFor(chat.id);
  const hits = memory.recall(query, 5, { workspace: ws });
  if (hits.length === 0) { await reply(chat.id, '(no matches)'); return; }
  const body = hits.map(h => `• [${h.score.toFixed(2)}] ${h.text.slice(0, 400)}${h.text.length > 400 ? '…' : ''}`).join('\n\n');
  await reply(chat.id, `Top ${hits.length} from ${ws}:\n\n${body}`);
}

async function handleList(chat) {
  const ws = workspaceFor(chat.id);
  const mems = memory.list({}, { workspace: ws }).slice(-10).reverse();
  if (mems.length === 0) { await reply(chat.id, '(empty)'); return; }
  const body = mems.map(m => `${m.id}  ${m.source ? '(' + m.source + ') ' : ''}${m.text.slice(0, 200)}${m.text.length > 200 ? '…' : ''}`).join('\n\n');
  await reply(chat.id, `Last ${mems.length} in ${ws}:\n\n${body}`);
}

async function handleForget(chat, id) {
  if (!id) { await reply(chat.id, 'Usage: /forget <memory-id>'); return; }
  const ws = workspaceFor(chat.id);
  const ok = memory.forget(id, { workspace: ws });
  await reply(chat.id, ok ? `✓ forgotten ${id}` : `(no memory with id ${id} in ${ws})`);
}

async function handleText(chat, text) {
  const ws = workspaceFor(chat.id);
  memory.remember(text, { tags: [`telegram:${chat.id}`] }, { workspace: ws });
  await reply(chat.id, `✓ saved to ${ws} / נשמר בסביבה ${ws}`);
}

async function handleDocument(chat, doc) {
  if (doc.file_size && doc.file_size > MAX_FILE_BYTES) {
    await reply(chat.id, `❌ file too large (${doc.file_size} bytes > ${MAX_FILE_BYTES}). Raise GEOCLAW_TELEGRAM_MAX_BYTES if needed.`);
    return;
  }
  const ws = workspaceFor(chat.id);
  const safeName = (doc.file_name || `file_${doc.file_id}`).replace(/[/\\]/g, '_');
  await reply(chat.id, `📄 downloading ${safeName}...`);
  try {
    const info = await tg('getFile', { file_id: doc.file_id });
    const tmp = path.join(os.tmpdir(), `geoclaw-tg-${Date.now()}-${safeName}`);
    await downloadFile(info.file_path, tmp);
    await reply(chat.id, `⚙  ingesting into ${ws}...`);
    const saved = await ingest(tmp, { workspace: ws, tags: [`telegram:${chat.id}`] });
    try { fs.unlinkSync(tmp); } catch {}
    await reply(chat.id, `✓ ingested ${safeName}: ${saved.length} chunk(s) saved to ${ws}`);
  } catch (e) {
    await reply(chat.id, `❌ ingest failed: ${e.message}`);
  }
}

// ── Update dispatch ───────────────────────────────────────────────────────────

async function onUpdate(upd) {
  const msg = upd.message || upd.edited_message;
  if (!msg || !msg.chat) return;
  const chat = msg.chat;
  const from = msg.from || {};

  if (!isAllowed(from.id)) {
    await reply(chat.id, '(not authorized — ask the admin to add your ID to GEOCLAW_TELEGRAM_ALLOWED_IDS)');
    console.error(`[tg] blocked unauthorized from=${from.id}`);
    return;
  }

  const text = (msg.text || '').trim();

  if (msg.document) return handleDocument(chat, msg.document);

  if (text.startsWith('/')) {
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.split('@')[0].toLowerCase();
    const arg = rest.join(' ').trim();
    switch (cmd) {
      case '/start':      return handleStart(chat);
      case '/help':       return handleStart(chat);
      case '/workspace':  return handleWorkspace(chat, arg);
      case '/workspaces': return handleWorkspaces(chat);
      case '/recall':     return handleRecall(chat, arg);
      case '/list':       return handleList(chat);
      case '/forget':     return handleForget(chat, arg);
      default:            return reply(chat.id, `Unknown command. Try /help.`);
    }
  }

  if (text) return handleText(chat, text);
}

// ── Long-poll loop ────────────────────────────────────────────────────────────

async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Geoclaw Telegram Bot                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Default workspace: ${DEFAULT_WS}`);
  console.log(`Allowlist:         ${ALLOWED.length ? ALLOWED.join(', ') : '(open — anyone who finds the bot can write)'}`);
  if (!ALLOWED.length) console.log('\x1b[33m⚠  No allowlist — set GEOCLAW_TELEGRAM_ALLOWED_IDS to lock it down.\x1b[0m');
  console.log('\nPolling. Ctrl-C to stop.\n');

  let offset = 0;
  let failures = 0;
  while (true) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 50 }, 60_000);
      failures = 0;
      for (const upd of updates) {
        offset = upd.update_id + 1;
        try { await onUpdate(upd); }
        catch (e) { console.error(`[tg] update ${upd.update_id} failed: ${e.message}`); }
      }
    } catch (e) {
      failures++;
      const backoff = Math.min(30_000, 1000 * Math.pow(2, Math.min(failures, 5)));
      console.error(`[tg] getUpdates failed (${failures}): ${e.message} — retrying in ${backoff}ms`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
}

if (require.main === module) {
  run().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
}

module.exports = { run };
