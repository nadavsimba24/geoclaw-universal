// Geoclaw Web UI — vanilla JS.
// Reads ?k=<token>, keeps it for all API calls. Switches view panes by data-view.
// Themes itself from /api/design (DESIGN.md tokens) when present.

const TOKEN = new URLSearchParams(location.search).get('k') || '';

const q  = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
};

// ── API helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = path.includes('?') ? `${path}&k=${TOKEN}` : `${path}?k=${TOKEN}`;
  const opts = { method, headers: { 'X-Geoclaw-Token': TOKEN } };
  if (body !== undefined) {
    if (body instanceof ArrayBuffer || body instanceof Blob) {
      opts.body = body;
      opts.headers['Content-Type'] = 'application/octet-stream';
    } else {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
  }
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
  return data;
}

function apiEventSource(path, body) {
  // EventSource can't POST, so we open a fetch stream and parse SSE manually.
  const url = path.includes('?') ? `${path}&k=${TOKEN}` : `${path}?k=${TOKEN}`;
  const ctrl = new AbortController();
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Geoclaw-Token': TOKEN, 'Accept': 'text/event-stream' },
    signal: ctrl.signal,
  };
  if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }

  const target = new EventTarget();
  target.close = () => ctrl.abort();

  (async () => {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = 'message', data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          target.dispatchEvent(new CustomEvent(event, { detail: parsed }));
        }
      }
      target.dispatchEvent(new CustomEvent('end'));
    } catch (e) {
      if (e.name !== 'AbortError') target.dispatchEvent(new CustomEvent('error', { detail: { message: e.message } }));
    }
  })();

  return target;
}

// ── Toasts ───────────────────────────────────────────────────────────────────

function toast(text, kind = 'info', ms = 3000) {
  const node = el('div', { class: `toast ${kind}` }, text);
  q('#toasts').appendChild(node);
  setTimeout(() => { node.style.opacity = 0; setTimeout(() => node.remove(), 200); }, ms);
}

// ── Modal ────────────────────────────────────────────────────────────────────

function openModal(title, bodyNode, actionsNode) {
  q('#modal-title').textContent = title;
  const body = q('#modal-body');
  body.innerHTML = '';
  body.appendChild(bodyNode);
  if (actionsNode) body.appendChild(actionsNode);
  q('#modal').hidden = false;
}
function closeModal() { q('#modal').hidden = true; }
q('#modal-close').addEventListener('click', closeModal);
q('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

// ── View switching ───────────────────────────────────────────────────────────

const VIEWS = ['chat', 'inbox', 'agents', 'autopilots', 'files', 'design', 'settings'];
function showView(name) {
  for (const v of VIEWS) {
    const section = q(`.view[data-view="${v}"]`);
    const navBtn  = q(`.nav-item[data-view="${v}"]`);
    const on = v === name;
    if (section) section.hidden = !on;
    if (navBtn)  navBtn.classList.toggle('active', on);
  }
  location.hash = `#${name}`;
  if (name === 'inbox')      loadInbox();
  if (name === 'agents')     loadAgents();
  if (name === 'autopilots') loadAutopilots();
  if (name === 'files')      loadFiles();
  if (name === 'design')     loadDesign();
  if (name === 'settings')   loadSettings();
}
qa('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// ── Theming from DESIGN.md ───────────────────────────────────────────────────

function applyTheme(summary) {
  if (!summary || !summary.ok) return;
  const root = document.documentElement;
  const byName = Object.fromEntries((summary.colors || []).map(c => [c.name, c.value]));
  const pairs = [
    ['primary',    byName.primary],
    ['secondary',  byName.secondary],
    ['tertiary',   byName.tertiary],
    ['neutral',    byName.neutral],
    ['surface',    byName.surface],
    ['violet',     byName.violet],
    ['teal',       byName.teal],
    ['error',      byName.error],
    ['warning',    byName.warning],
    ['success',    byName.success],
    ['on-primary', byName['on-primary']],
    ['on-surface', byName['on-surface']],
  ];
  for (const [k, v] of pairs) if (v) root.style.setProperty(`--${k}`, v);
  if (summary.name) {
    q('#brand-sub').textContent = summary.name;
  }
}

// ── /api/me bootstrap ────────────────────────────────────────────────────────

let ME = null;
async function loadMe() {
  try {
    ME = await api('GET', '/api/me');
    q('#provider-chip').textContent  = `${ME.provider} · ${ME.model}`;
    q('#workspace-chip').textContent = `workspace: ${ME.workspace}`;
    applyTheme(ME.design);
    renderKeyBanner();
  } catch (e) {
    toast(`Boot failed: ${e.message}`, 'error', 6000);
  }
}

function renderKeyBanner() {
  const existing = q('#key-banner');
  if (existing) existing.remove();
  if (!ME || ME.hasKey) return;
  const banner = el('div', { id: 'key-banner', class: 'banner' },
    el('span', {}, '⚠'),
    el('span', { html:
      `No LLM API key set — chat won't work until you set <code>GEOCLAW_MODEL_API_KEY</code> in your <code>.env</code> and restart <code>geoclaw serve</code>.`
    })
  );
  const log = q('#chat-log');
  if (log) log.insertBefore(banner, log.firstChild);
}

// ── Chat ─────────────────────────────────────────────────────────────────────

const chatHistory = [];  // [{ role, content, tool_calls?, tool_call_id? }]

function hideChatEmpty() {
  const e = q('#chat-empty');
  if (e) e.remove();
}

function renderMsg(role, text) {
  hideChatEmpty();
  const log = q('#chat-log');
  const avatar = { user: 'U', assistant: '✳', tool: '⚙', system: 'S' }[role] || '·';
  const node = el('div', { class: `msg ${role}` },
    el('div', { class: 'msg-avatar' }, avatar),
    el('div', { class: 'msg-body' })
  );
  log.appendChild(node);
  if (text) setMsgText(node, text);
  else if (role === 'assistant') {
    // typing indicator while waiting for first content
    q('.msg-body', node).innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  }
  q('#chat-scroll').scrollTop = q('#chat-scroll').scrollHeight;
  return node;
}
function setMsgText(node, text) {
  q('.msg-body', node).innerHTML = markdown(text);
}
function appendInlineError(node, message) {
  const body = q('.msg-body', node);
  // If only the typing indicator was in there, clear it first
  if (body.querySelector('.typing') && !body.textContent.trim().replace(/•/g, '')) {
    body.innerHTML = '';
  }
  body.appendChild(el('div', { class: 'inline-error' },
    el('span', {}, '⚠'),
    el('span', {}, message)
  ));
}
// Ultra-minimal markdown: **bold**, `code`, ```code blocks```, newlines.
function markdown(s) {
  const esc = (x) => x.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  let out = esc(s);
  out = out.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\n\n+/g, '</p><p>');
  out = out.replace(/\n/g, '<br>');
  return `<p>${out}</p>`;
}

q('#chat-clear').addEventListener('click', () => {
  chatHistory.length = 0;
  q('#chat-log').innerHTML = '';
  q('#chat-log').appendChild(el('div', { class: 'chat-empty', id: 'chat-empty' },
    el('div', { class: 'glyph' }, '✳'),
    el('h2', {}, 'How can I help?'),
    el('p', {}, 'Ask anything, or say "build me a dashboard for…"'),
  ));
  renderKeyBanner();
});

q('#chat-composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = q('#chat-input').value.trim();
  if (!text) return;

  // Guard: no API key → explain instead of silent failure.
  if (ME && !ME.hasKey) {
    toast('Set GEOCLAW_MODEL_API_KEY in .env, then restart geoclaw serve.', 'error', 8000);
    return;
  }

  q('#chat-input').value = '';
  q('#chat-input').style.height = 'auto';
  chatHistory.push({ role: 'user', content: text });
  renderMsg('user', text);
  const assistantNode = renderMsg('assistant', '');
  q('#chat-send').disabled = true;

  const source = apiEventSource('/api/chat', { messages: chatHistory });
  let acc = '';
  let gotContent = false;
  let errored = false;

  source.addEventListener('content', (ev) => {
    acc = ev.detail.text;
    gotContent = true;
    setMsgText(assistantNode, acc);
    q('#chat-scroll').scrollTop = q('#chat-scroll').scrollHeight;
  });
  source.addEventListener('tool-start', (ev) => {
    // clear typing indicator once the first event lands
    if (!gotContent) q('.msg-body', assistantNode).innerHTML = '';
    const { name, args } = ev.detail;
    const bubble = el('div', { class: 'tool-bubble' },
      el('span', { class: 'tool-name' }, name),
      args && Object.keys(args).length
        ? el('span', { class: 'tool-args' }, JSON.stringify(args).slice(0, 100))
        : null,
      el('span', { class: 'running', 'data-name': name }, '…')
    );
    q('.msg-body', assistantNode).appendChild(bubble);
    q('#chat-scroll').scrollTop = q('#chat-scroll').scrollHeight;
  });
  source.addEventListener('tool-end', (ev) => {
    const { ok, summary } = ev.detail;
    const bubbles = qa('.tool-bubble', assistantNode);
    const bubble  = bubbles[bubbles.length - 1];
    if (!bubble) return;
    const running = q('.running', bubble);
    if (running) {
      running.textContent = ok ? '✓' : '✗';
      running.className   = ok ? 'tool-ok' : 'tool-fail';
      running.title = summary;
    }
  });
  source.addEventListener('done', () => {
    if (acc) chatHistory.push({ role: 'assistant', content: acc });
    q('#chat-send').disabled = false;
  });
  source.addEventListener('error', (ev) => {
    errored = true;
    const msg = (ev.detail && ev.detail.message) || 'unknown error';
    appendInlineError(assistantNode, msg);
    q('#chat-send').disabled = false;
  });
  source.addEventListener('end', () => {
    q('#chat-send').disabled = false;
    if (!gotContent && !errored) {
      // Server closed stream with no content — treat as generic error
      appendInlineError(assistantNode, 'No response from model. Check that GEOCLAW_MODEL_API_KEY is set and valid.');
    }
  });
});

q('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    q('#chat-composer').requestSubmit();
  }
});
q('#chat-input').addEventListener('input', () => {
  const ta = q('#chat-input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
});

// ── Inbox ────────────────────────────────────────────────────────────────────

async function loadInbox() {
  try {
    const { entries = [] } = await api('GET', '/api/inbox');
    const list = q('#inbox-list');
    list.innerHTML = '';
    if (!entries.length) {
      list.appendChild(el('div', { class: 'empty' }, 'No activity yet.'));
      q('#inbox-badge').hidden = true;
      return;
    }
    q('#inbox-badge').hidden = false;
    q('#inbox-badge').textContent = String(entries.length);
    for (const e of entries) {
      const icon = { done:'✓', error:'!', autopilot:'⏱', file:'📄' }[e.kind] || '·';
      list.appendChild(el('div', { class: 'card' },
        el('div', { class: 'card-avatar' }, icon),
        el('div', {},
          el('div', { class: 'card-title' }, e.title || e.kind),
          e.body ? el('div', { class: 'card-sub' }, e.body) : null,
          el('div', { class: 'card-meta' }, new Date(e.ts).toLocaleString()),
        ),
      ));
    }
  } catch (e) { toast(e.message, 'error'); }
}
q('#inbox-refresh').addEventListener('click', loadInbox);
q('#inbox-clear').addEventListener('click', async () => {
  await api('POST', '/api/inbox/clear');
  loadInbox();
});

// ── Agents ───────────────────────────────────────────────────────────────────

async function loadAgents() {
  try {
    const { runs = [] } = await api('GET', '/api/agents');
    const list = q('#agents-list');
    list.innerHTML = '';
    if (!runs.length) return list.appendChild(el('div', { class: 'empty' }, 'No agent runs yet.'));
    for (const r of runs) {
      list.appendChild(el('div', { class: 'card' },
        el('div', {},
          el('div', { class: 'card-title' }, r.goal),
          el('div', { class: 'card-meta' },
            `${new Date(r.startedAt).toLocaleString()}` +
            (r.endedAt ? ` · ${Math.round((r.endedAt - r.startedAt) / 1000)}s` : '') +
            ` · ${r.source || 'manual'}`),
          r.summary ? el('div', { class: 'card-sub' }, r.summary) : null,
        ),
        el('div', { class: 'card-actions' },
          el('span', { class: `card-status ${r.status}` }, r.status),
          el('button', { onclick: () => openAgentDrawer(r.id, r.goal) }, 'View log'),
        ),
      ));
    }
  } catch (e) { toast(e.message, 'error'); }
}
q('#agents-refresh').addEventListener('click', loadAgents);

q('#agents-new').addEventListener('click', () => {
  const form = el('div', {},
    el('label', {}, 'Goal',
      el('textarea', { id: 'new-goal', rows: '4', placeholder: 'e.g. "summarize my Monday board 5095065110"' }),
    ),
  );
  const actions = el('div', { class: 'modal-actions' },
    el('button', { onclick: closeModal }, 'Cancel'),
    el('button', { class: 'primary', onclick: async () => {
      const goal = q('#new-goal').value.trim();
      if (!goal) return;
      try {
        const { runId } = await api('POST', '/api/agents/run', { goal });
        closeModal();
        toast('Agent running…', 'success');
        loadAgents();
        setTimeout(() => openAgentDrawer(runId, goal), 300);
      } catch (e) { toast(e.message, 'error'); }
    } }, 'Run'),
  );
  openModal('New agent run', form, actions);
});

let drawerSource = null;
function openAgentDrawer(id, goal) {
  q('#agent-drawer-title').textContent = goal;
  q('#agent-drawer-sub').textContent = `id: ${id}`;
  q('#agent-drawer-log').textContent = '';
  q('#agent-drawer').hidden = false;
  if (drawerSource) drawerSource.close();
  drawerSource = apiEventSource(`/api/agents/${id}/stream`);
  drawerSource.addEventListener('log', (ev) => {
    const pre = q('#agent-drawer-log');
    pre.textContent += ev.detail.line + '\n';
    pre.scrollTop = pre.scrollHeight;
  });
  drawerSource.addEventListener('done', () => {
    q('#agent-drawer-sub').textContent += ' · finished';
    loadAgents();
  });
}
q('#agent-drawer-close').addEventListener('click', () => {
  q('#agent-drawer').hidden = true;
  if (drawerSource) { drawerSource.close(); drawerSource = null; }
});

// ── Autopilots ───────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Every hour',           cron: '@hourly' },
  { label: 'Every day at 9am',     cron: '@daily' },
  { label: 'Every Monday at 9am',  cron: '@weekly' },
  { label: 'Every 15 minutes',     cron: '*/15 * * * *' },
  { label: 'Weekdays at 8:30',     cron: '30 8 * * 1-5' },
  { label: 'Custom…',              cron: '' },
];

async function loadAutopilots() {
  try {
    const { autopilots = [] } = await api('GET', '/api/autopilots');
    const list = q('#autopilots-list');
    list.innerHTML = '';
    if (!autopilots.length) return list.appendChild(el('div', { class: 'empty' }, 'No autopilots yet.'));
    for (const p of autopilots) {
      list.appendChild(el('div', { class: 'card' },
        el('div', {},
          el('div', { class: 'card-title' }, p.name),
          el('div', { class: 'card-sub' },  p.goal),
          el('div', { class: 'card-meta' }, `cron: ${p.cron}` + (p.lastRun ? ` · last run: ${new Date(p.lastRun).toLocaleString()}` : '')),
        ),
        el('div', { class: 'card-actions' },
          el('span', { class: `card-status ${p.enabled ? 'running' : 'failed'}` }, p.enabled ? 'on' : 'off'),
          el('button', { onclick: () => toggleAutopilot(p.id, !p.enabled) }, p.enabled ? 'Disable' : 'Enable'),
          el('button', { onclick: () => runAutopilotNow(p.id) }, 'Run now'),
          el('button', { class: 'danger', onclick: () => deleteAutopilot(p.id) }, 'Delete'),
        ),
      ));
    }
  } catch (e) { toast(e.message, 'error'); }
}
q('#autopilot-refresh').addEventListener('click', loadAutopilots);

async function toggleAutopilot(id, enabled) {
  try { await api('PATCH', `/api/autopilots/${id}`, { enabled }); loadAutopilots(); }
  catch (e) { toast(e.message, 'error'); }
}
async function runAutopilotNow(id) {
  try { const { runId } = await api('POST', `/api/autopilots/${id}/run`); toast('autopilot running…', 'success'); setTimeout(() => openAgentDrawer(runId, 'autopilot run'), 200); loadAgents(); }
  catch (e) { toast(e.message, 'error'); }
}
async function deleteAutopilot(id) {
  if (!confirm('Delete this autopilot?')) return;
  try { await api('DELETE', `/api/autopilots/${id}`); loadAutopilots(); }
  catch (e) { toast(e.message, 'error'); }
}

q('#autopilot-new').addEventListener('click', () => {
  const form = el('div', {},
    el('label', {}, 'Name',          el('input', { id: 'ap-name', placeholder: 'Daily Monday digest' })),
    el('label', {}, 'Goal',          el('textarea', { id: 'ap-goal', rows: '3', placeholder: 'e.g. "summarize today\'s Monday board changes and Telegram me"' })),
    el('label', {}, 'Schedule',      el('select', { id: 'ap-preset' }, ...CRON_PRESETS.map(p => el('option', { value: p.cron }, p.label)))),
    el('label', {}, 'Cron expression', el('input', { id: 'ap-cron', placeholder: '@daily' })),
  );
  const actions = el('div', { class: 'modal-actions' },
    el('button', { onclick: closeModal }, 'Cancel'),
    el('button', { class: 'primary', onclick: async () => {
      const body = {
        name: q('#ap-name').value.trim(),
        goal: q('#ap-goal').value.trim(),
        cron: q('#ap-cron').value.trim(),
        enabled: true,
      };
      if (!body.name || !body.goal || !body.cron) { toast('name, goal, and cron are required', 'error'); return; }
      try { await api('POST', '/api/autopilots', body); closeModal(); toast('autopilot created', 'success'); loadAutopilots(); }
      catch (e) { toast(e.message, 'error'); }
    } }, 'Create'),
  );
  openModal('New autopilot', form, actions);
  q('#ap-preset').addEventListener('change', (e) => { q('#ap-cron').value = e.target.value; });
  q('#ap-cron').value = CRON_PRESETS[0].cron;
});

// ── Files ────────────────────────────────────────────────────────────────────

async function loadFiles() {
  try {
    const { sources = [] } = await api('GET', '/api/files');
    const list = q('#files-list');
    list.innerHTML = '';
    if (!sources.length) return list.appendChild(el('div', { class: 'empty' }, 'No files ingested yet.'));
    for (const s of sources) {
      list.appendChild(el('div', { class: 'card' },
        el('div', {},
          el('div', { class: 'card-title' }, s.source),
          el('div', { class: 'card-meta' }, `${s.count} chunks` + (s.lastAt ? ` · ${new Date(s.lastAt).toLocaleString()}` : '')),
        ),
        el('div', { class: 'card-actions' },
          el('button', { class: 'danger', onclick: () => removeFile(s.source) }, 'Remove'),
        ),
      ));
    }
  } catch (e) { toast(e.message, 'error'); }
}
q('#files-refresh').addEventListener('click', loadFiles);

async function removeFile(source) {
  if (!confirm(`Remove all chunks from "${source}"?`)) return;
  try { await api('DELETE', '/api/files/' + encodeURIComponent(source)); loadFiles(); toast('removed', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}

async function uploadFile(file) {
  toast(`uploading ${file.name}…`, 'info', 2000);
  const buf = await file.arrayBuffer();
  try {
    await fetch(`/api/files/upload?name=${encodeURIComponent(file.name)}&k=${TOKEN}`, {
      method: 'POST', body: buf, headers: { 'X-Geoclaw-Token': TOKEN },
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`); });
    toast(`ingested ${file.name}`, 'success');
    loadFiles();
  } catch (e) { toast(`${file.name}: ${e.message}`, 'error', 6000); }
}
q('#files-input').addEventListener('change', async (e) => {
  for (const f of e.target.files) await uploadFile(f);
  e.target.value = '';
});

// Drag-and-drop file upload anywhere on the page.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('drop-target'); });
window.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('drop-target'); });
window.addEventListener('dragover',  (e) => { e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('drop-target');
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  showView('files');
  for (const f of files) await uploadFile(f);
});

// ── Design ───────────────────────────────────────────────────────────────────

async function loadDesign() {
  try {
    const s = await api('GET', '/api/design');
    const panel = q('#design-panel');
    panel.innerHTML = '';
    if (!s.ok) {
      panel.appendChild(el('div', { class: 'empty' }, 'No DESIGN.md in the current directory.'));
      return;
    }
    const preview = el('div', { class: 'design-preview' },
      el('div', { class: 'design-name' }, s.name || 'Untitled'),
      s.description ? el('div', { class: 'card-sub' }, s.description) : null,
      el('div', {},
        el('h2', {}, 'Colors'),
        el('div', { class: 'swatches' },
          ...(s.colors || []).map(c => el('div', { class: 'swatch' },
            el('div', { class: 'swatch-color', style: `background:${c.value}` }),
            el('div', { class: 'swatch-meta' },
              el('div', { class: 'swatch-name' }, c.name),
              el('div', { class: 'swatch-val' }, c.value),
            ),
          )),
        ),
      ),
      s.typography?.length ? el('div', {}, el('h2', {}, 'Typography'), el('div', { class: 'card-meta' }, s.typography.join(', '))) : null,
      s.components?.length ? el('div', {}, el('h2', {}, 'Components'),  el('div', { class: 'card-meta' }, s.components.join(', '))) : null,
      el('div', { class: 'card-meta' }, `file: ${s.file}`),
    );
    panel.appendChild(preview);
    applyTheme(s);
  } catch (e) { toast(e.message, 'error'); }
}
q('#design-refresh').addEventListener('click', loadDesign);

q('#design-init').addEventListener('click', () => {
  const form = el('div', {},
    el('label', {}, 'Template',
      el('select', { id: 'dn-template' },
        ...(ME?.templates || ['editorial','corporate','playful','brutalist']).map(t => el('option', { value: t }, t))
      ),
    ),
    el('label', {}, 'Brand name (optional)', el('input', { id: 'dn-name', placeholder: 'Coffee Co' })),
  );
  const actions = el('div', { class: 'modal-actions' },
    el('button', { onclick: closeModal }, 'Cancel'),
    el('button', { class: 'primary', onclick: async () => {
      const body = { template: q('#dn-template').value, name: q('#dn-name').value.trim() || undefined };
      try { const r = await api('POST', '/api/design/init', body);
        if (!r.ok) throw new Error(r.error);
        closeModal(); toast('DESIGN.md created', 'success');
        loadDesign();
        loadMe();
      } catch (e) { toast(e.message, 'error'); }
    } }, 'Create'),
  );
  openModal('Create DESIGN.md', form, actions);
});

// ── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  if (!ME) await loadMe();
  if (!ME) return;
  q('#s-provider').textContent  = ME.provider;
  q('#s-model').textContent     = ME.model;
  q('#s-workspace').textContent = ME.workspace;
  q('#s-cwd').textContent       = ME.cwd;
  q('#s-version').textContent   = ME.version;
  q('#s-haskey').textContent    = ME.hasKey ? 'yes' : 'no — set GEOCLAW_MODEL_API_KEY';
  const sel = q('#ws-select');
  sel.innerHTML = '';
  for (const w of ME.workspaces || []) {
    const o = el('option', { value: w }, w);
    if (w === ME.workspace) o.selected = true;
    sel.appendChild(o);
  }
}
q('#ws-use').addEventListener('click', async () => {
  const name = q('#ws-select').value;
  try { await api('POST', '/api/workspaces/use', { name }); toast(`switched to ${name}`, 'success'); await loadMe(); loadSettings(); }
  catch (e) { toast(e.message, 'error'); }
});

// ── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  await loadMe();
  const initial = location.hash.replace('#','') || 'chat';
  showView(VIEWS.includes(initial) ? initial : 'chat');
  loadInbox();  // so badge reflects backlog
})();
