#!/usr/bin/env node
// Geoclaw web upload — local HTTP UI for managing the knowledge base.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch {}

const memory = require('./memory.js');
const { ingest } = require('./ingest.js');

const HOST = process.env.GEOCLAW_WEB_HOST || '127.0.0.1';
const PORT = parseInt(process.env.GEOCLAW_WEB_PORT || '7711', 10);
const PASSPHRASE = process.env.GEOCLAW_WEB_PASSPHRASE || '';
const MAX_UPLOAD_BYTES = parseInt(process.env.GEOCLAW_WEB_MAX_BYTES || String(100 * 1024 * 1024), 10);

// ── HTML page ─────────────────────────────────────────────────────────────────

const INDEX_HTML = `<!doctype html>
<html dir="auto">
<head>
<meta charset="utf-8">
<title>Geoclaw — Knowledge Base</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", "Arial Hebrew", "SBL Hebrew", Roboto, sans-serif; margin: 0; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { margin-top: 0; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  select, input[type=text], input[type=password], button {
    font-size: 14px; padding: 8px 12px; border: 1px solid #8884; border-radius: 6px;
    background: #fff2; color: inherit;
    unicode-bidi: plaintext;
  }
  button { cursor: pointer; background: #4c6ef5; color: #fff; border: none; }
  button.secondary { background: #8884; color: inherit; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .drop {
    border: 2px dashed #8886; border-radius: 10px; padding: 48px; text-align: center;
    transition: all .15s; margin: 16px 0;
  }
  .drop.over { border-color: #4c6ef5; background: #4c6ef518; }
  .memlist { margin-top: 24px; }
  .mem { padding: 12px; border: 1px solid #8883; border-radius: 6px; margin-bottom: 8px; }
  .mem .meta { font-size: 12px; color: #888; margin-bottom: 4px; unicode-bidi: plaintext; }
  .mem pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; unicode-bidi: plaintext; }
  .mem .actions { margin-top: 8px; }
  .mem button { font-size: 12px; padding: 4px 10px; }
  .msg { padding: 10px 14px; border-radius: 6px; margin: 8px 0; }
  .msg.ok  { background: #2ecc4025; }
  .msg.err { background: #e7454525; }
  .group-header { font-weight: 600; margin: 18px 0 8px; font-size: 14px; color: #888; }
  code { background: #8883; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <h1>🧠 Geoclaw Knowledge Base</h1>
  <p style="color:#888">Drag files in to add them, or type a fact below. Everything stays local on this machine.<br>
  <span style="font-size:13px">גררו קבצים כדי להוסיף אותם, או כתבו עובדה למטה. הכול נשאר מקומי במחשב הזה.</span></p>

  <div id="auth" style="display:none">
    <div class="msg err">This instance is protected. Enter the passphrase to continue.</div>
    <div class="row">
      <input id="authPass" type="password" placeholder="passphrase" style="flex:1">
      <button id="authBtn">Unlock</button>
    </div>
  </div>

  <div id="app" style="display:none">
    <div class="row">
      <label>Workspace:</label>
      <select id="workspace" dir="auto"></select>
      <input id="newWs" type="text" dir="auto" placeholder="new workspace name / שם סביבה חדש" style="flex:1">
      <button id="createWs" class="secondary">Create</button>
    </div>

    <div id="drop" class="drop">
      <div style="font-size:18px;margin-bottom:6px">📄 Drop files here to ingest</div>
      <div style="color:#888;font-size:13px">or <label for="filepick" style="color:#4c6ef5;cursor:pointer;text-decoration:underline">browse</label></div>
      <input id="filepick" type="file" multiple style="display:none">
      <div style="color:#888;font-size:12px;margin-top:12px">Supported: .txt · .md · .pdf · .docx · .xlsx · .csv · .json · .html</div>
    </div>

    <div class="row">
      <input id="factText" type="text" dir="auto" placeholder="Add a single fact... / הוסיפו עובדה..." style="flex:1">
      <button id="addFact">Remember</button>
    </div>

    <div class="row">
      <input id="searchQ" type="text" dir="auto" placeholder="Search this workspace... / חיפוש בסביבת העבודה..." style="flex:1">
      <button id="searchBtn" class="secondary">Search</button>
      <button id="listBtn"   class="secondary">List all</button>
    </div>

    <div id="messages"></div>
    <div id="memlist" class="memlist"></div>
  </div>

<script>
const auth = { token: null };

async function api(method, url, body, isForm=false) {
  const headers = {};
  if (auth.token) headers['x-geoclaw-auth'] = auth.token;
  const opts = { method, headers };
  if (body !== undefined) {
    if (isForm) { opts.body = body; }
    else { headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(url, opts);
  if (r.status === 401) { showAuth(); throw new Error('auth required'); }
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!r.ok) throw new Error(json.error || ('HTTP ' + r.status));
  return json;
}

function msg(kind, text) {
  const m = document.createElement('div');
  m.className = 'msg ' + kind;
  m.textContent = text;
  document.getElementById('messages').prepend(m);
  setTimeout(() => m.remove(), 6000);
}

function showAuth() {
  document.getElementById('auth').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}
function showApp()  {
  document.getElementById('auth').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

async function loadWorkspaces() {
  const data = await api('GET', '/api/workspaces');
  const sel = document.getElementById('workspace');
  sel.innerHTML = '';
  for (const w of data.workspaces) {
    const o = document.createElement('option');
    o.value = w; o.textContent = w;
    if (w === data.active) o.selected = true;
    sel.appendChild(o);
  }
}

async function refreshMemories(query) {
  const ws = document.getElementById('workspace').value;
  const url = query
    ? '/api/recall?workspace=' + encodeURIComponent(ws) + '&query=' + encodeURIComponent(query)
    : '/api/memories?workspace=' + encodeURIComponent(ws);
  const data = await api('GET', url);
  renderMemories(data.memories || data.results || []);
}

function renderMemories(list) {
  const box = document.getElementById('memlist');
  box.innerHTML = '';
  if (list.length === 0) { box.innerHTML = '<div style="color:#888">(nothing here yet)</div>'; return; }
  // Group chunks by source so documents collapse nicely.
  const groups = new Map();
  for (const m of list) {
    const k = m.source || '__facts__';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  for (const [source, items] of groups) {
    if (source !== '__facts__') {
      const h = document.createElement('div');
      h.className = 'group-header';
      h.innerHTML = '📄 ' + source + ' <button class="secondary" data-src="' + source + '" style="font-size:11px;margin-left:8px">remove source</button>';
      h.querySelector('button').onclick = async (e) => {
        const src = e.target.dataset.src;
        if (!confirm('Remove all chunks from ' + src + '?')) return;
        const ws = document.getElementById('workspace').value;
        await api('DELETE', '/api/source?workspace=' + encodeURIComponent(ws) + '&source=' + encodeURIComponent(src));
        msg('ok', 'removed ' + src);
        refreshMemories();
      };
      box.appendChild(h);
    }
    for (const m of items) {
      const div = document.createElement('div');
      div.className = 'mem';
      const tags = (m.tags || []).join(', ');
      const date = new Date(m.timestamp).toLocaleString();
      div.innerHTML = '<div class="meta">' + m.id + ' · ' + date + (tags ? ' · [' + tags + ']' : '') + (m.score != null ? ' · score ' + m.score.toFixed(2) : '') + '</div>' +
                      '<pre dir="auto"></pre>' +
                      '<div class="actions"><button class="secondary" data-id="' + m.id + '">forget</button></div>';
      div.querySelector('pre').textContent = m.text;
      div.querySelector('button').onclick = async (e) => {
        if (!confirm('Delete this memory?')) return;
        const ws = document.getElementById('workspace').value;
        await api('DELETE', '/api/memory/' + e.target.dataset.id + '?workspace=' + encodeURIComponent(ws));
        msg('ok', 'forgotten');
        refreshMemories();
      };
      box.appendChild(div);
    }
  }
}

async function uploadFiles(files) {
  const ws = document.getElementById('workspace').value;
  for (const f of files) {
    try {
      msg('ok', 'uploading ' + f.name + '...');
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const r = await api('POST', '/api/ingest', {
        workspace: ws, filename: f.name, contentBase64: b64, replace: false,
      });
      msg('ok', f.name + ' → ' + r.saved + ' chunk(s) saved' + (r.deduped ? ', ' + r.deduped + ' already existed' : ''));
    } catch (e) { msg('err', f.name + ': ' + e.message); }
  }
  refreshMemories();
}

document.getElementById('authBtn').onclick = async () => {
  auth.token = document.getElementById('authPass').value.trim();
  try { await loadWorkspaces(); showApp(); refreshMemories(); }
  catch (e) { msg('err', 'unlock failed'); }
};

document.getElementById('workspace').onchange = () => refreshMemories();
document.getElementById('createWs').onclick = async () => {
  const name = document.getElementById('newWs').value.trim();
  if (!name) return;
  try {
    await api('POST', '/api/workspaces', { name });
    document.getElementById('newWs').value = '';
    await loadWorkspaces();
    document.getElementById('workspace').value = name;
    refreshMemories();
    msg('ok', 'created workspace ' + name);
  } catch (e) { msg('err', e.message); }
};

document.getElementById('addFact').onclick = async () => {
  const t = document.getElementById('factText').value.trim();
  if (!t) return;
  const ws = document.getElementById('workspace').value;
  try {
    await api('POST', '/api/remember', { workspace: ws, text: t });
    document.getElementById('factText').value = '';
    msg('ok', 'remembered');
    refreshMemories();
  } catch (e) { msg('err', e.message); }
};

document.getElementById('searchBtn').onclick = () => {
  const q = document.getElementById('searchQ').value.trim();
  if (!q) return refreshMemories();
  refreshMemories(q);
};
document.getElementById('listBtn').onclick = () => {
  document.getElementById('searchQ').value = '';
  refreshMemories();
};

const drop = document.getElementById('drop');
drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop',      e => { e.preventDefault(); drop.classList.remove('over'); uploadFiles(e.dataTransfer.files); });
document.getElementById('filepick').addEventListener('change', e => uploadFiles(e.target.files));

(async () => {
  try { await loadWorkspaces(); showApp(); refreshMemories(); }
  catch (e) { /* showAuth already triggered on 401 */ }
})();
</script>
</body>
</html>`;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const isString = typeof body === 'string';
  const payload = isString ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isString ? 'text/html; charset=utf-8' : 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, max = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { req.destroy(); return reject(new Error(`payload too large (>${max} bytes)`)); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function checkAuth(req) {
  if (!PASSPHRASE) return true;
  const t = req.headers['x-geoclaw-auth'] || '';
  if (t.length !== PASSPHRASE.length) return false;
  // Constant-time compare.
  try { return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(PASSPHRASE)); }
  catch { return false; }
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method;

  // Index is always public so the auth form can render.
  if (method === 'GET' && url.pathname === '/') return send(res, 200, INDEX_HTML);

  if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });

  try {
    if (method === 'GET' && url.pathname === '/api/workspaces') {
      return send(res, 200, { workspaces: memory.listWorkspaces(), active: memory.activeWorkspace() });
    }
    if (method === 'POST' && url.pathname === '/api/workspaces') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      memory.createWorkspace(body.name);
      return send(res, 200, { ok: true, name: body.name });
    }

    if (method === 'GET' && url.pathname === '/api/memories') {
      const ws = url.searchParams.get('workspace') || memory.activeWorkspace();
      const mems = memory.list({}, { workspace: ws });
      return send(res, 200, { memories: mems.slice().reverse() });
    }

    if (method === 'GET' && url.pathname === '/api/recall') {
      const ws = url.searchParams.get('workspace') || memory.activeWorkspace();
      const q  = url.searchParams.get('query') || '';
      const hits = memory.recall(q, 50, { workspace: ws });
      return send(res, 200, { results: hits });
    }

    if (method === 'POST' && url.pathname === '/api/remember') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const ws = body.workspace || memory.activeWorkspace();
      const entry = memory.remember(body.text, { tags: body.tags || [] }, { workspace: ws });
      return send(res, 200, { ok: true, id: entry.id });
    }

    if (method === 'POST' && url.pathname === '/api/ingest') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.filename || !body.contentBase64) return send(res, 400, { error: 'filename and contentBase64 required' });
      const ws = body.workspace || memory.activeWorkspace();
      // Give the file a clean basename — the source tag uses path.basename(filepath).
      const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geoclaw-upload-'));
      const safeName = body.filename.replace(/[/\\]/g, '_');
      const filePath = path.join(uploadDir, safeName);
      try {
        fs.writeFileSync(filePath, Buffer.from(body.contentBase64, 'base64'));
        const result = await ingest(filePath, { workspace: ws, tags: body.tags || [], replace: !!body.replace });
        return send(res, 200, { ok: true, saved: result.new, deduped: result.deduped, source: result.source });
      } finally {
        try { fs.rmSync(uploadDir, { recursive: true, force: true }); } catch {}
      }
    }

    if (method === 'DELETE' && url.pathname.startsWith('/api/memory/')) {
      const id = url.pathname.slice('/api/memory/'.length);
      const ws = url.searchParams.get('workspace') || memory.activeWorkspace();
      const ok = memory.forget(id, { workspace: ws });
      return send(res, ok ? 200 : 404, { ok });
    }

    if (method === 'DELETE' && url.pathname === '/api/source') {
      const ws = url.searchParams.get('workspace') || memory.activeWorkspace();
      const source = url.searchParams.get('source');
      if (!source) return send(res, 400, { error: 'source required' });
      const removed = memory.forgetBySource(source, { workspace: ws });
      return send(res, 200, { ok: true, removed });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`[web] ${method} ${url.pathname}: ${e.message}`);
    return send(res, 500, { error: e.message });
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

function start() {
  const server = http.createServer(handle);
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              Geoclaw Knowledge Base — Web UI                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`URL:        http://${HOST}:${PORT}`);
    console.log(`Workspace:  ${memory.activeWorkspace()} (switchable in the UI)`);
    if (PASSPHRASE) console.log('Auth:       passphrase required (set via GEOCLAW_WEB_PASSPHRASE)');
    else            console.log('Auth:       none — anyone who reaches this port can write');
    if (HOST === '0.0.0.0' && !PASSPHRASE) {
      console.log('\x1b[33m⚠  Listening on 0.0.0.0 without a passphrase. Set GEOCLAW_WEB_PASSPHRASE.\x1b[0m');
    }
    console.log('\nPress Ctrl-C to stop.\n');
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} is already in use. Set GEOCLAW_WEB_PORT=<other>.`);
    else console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}

module.exports = { start };

if (require.main === module) start();
