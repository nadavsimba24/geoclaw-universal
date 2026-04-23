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

const VIEWS = ['capabilities', 'chat', 'browser', 'inbox', 'agents', 'autopilots', 'files', 'skills', 'design', 'settings'];
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
  if (name === 'skills')     loadSkills();
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

// ── Skills ───────────────────────────────────────────────────────────────────

const SKILL_BUNDLE_PRESETS = [
  { slug: 'freelancer-accountant', label: 'Freelancer accountant (tax + invoicing + VAT)' },
  { slug: 'restaurant-owner',      label: 'Restaurant owner (food + suppliers + staff)' },
  { slug: 'small-law-firm',        label: 'Small law firm (legal docs + compliance)' },
  { slug: 'startup-founder',       label: 'Startup founder (growth + legal + finance)' },
];
const SKILL_REPO_PRESETS = [
  { src: 'skills-il/tax-and-finance',     label: 'Israeli tax, invoicing, VAT' },
  { src: 'skills-il/accounting',          label: 'Israeli accounting & bookkeeping' },
  { src: 'skills-il/localization',        label: 'Hebrew, RTL, translation' },
  { src: 'skills-il/government-services', label: 'Israeli gov APIs & digital services' },
  { src: 'skills-il/security-compliance', label: 'Privacy, GDPR, regulation' },
  { src: 'skills-il/legal-tech',          label: 'Legal tech' },
  { src: 'skills-il/communication',       label: 'SMS, email, customer comms' },
  { src: 'skills-il/health-services',     label: 'Health services' },
  { src: 'skills-il/education',           label: 'Education' },
  { src: 'skills-il/developer-tools',     label: 'Developer utilities' },
];

async function loadSkills() {
  try {
    const { skills = [] } = await api('GET', '/api/skills');
    const list = q('#skills-list');
    list.innerHTML = '';
    if (!skills.length) {
      list.appendChild(el('div', { class: 'empty' }, 'No skills installed yet. Click "+ Install" for ready-made packs or "+ Create" to make your own.'));
      return;
    }
    for (const s of skills) {
      list.appendChild(el('div', { class: 'card' },
        el('div', { class: 'card-avatar' }, '🧩'),
        el('div', {},
          el('div', { class: 'card-title' }, s.name),
          s.description ? el('div', { class: 'card-sub' }, s.description) : null,
          el('div', { class: 'card-meta' },
            `scope: ${s.scope}` +
            (s.hasScripts ? ' · scripts' : '') +
            (s.hasReferences ? ' · references' : '')
          ),
        ),
        el('div', { class: 'card-actions' },
          el('button', { onclick: () => openSkillDrawer(s.name) }, 'View'),
          el('button', { class: 'danger', onclick: () => removeSkillConfirm(s.name) }, 'Remove'),
        ),
      ));
    }
  } catch (e) { toast(e.message, 'error'); }
}
q('#skills-refresh').addEventListener('click', loadSkills);

async function openSkillDrawer(name) {
  try {
    const { name: n, body } = await api('GET', `/api/skills/show/${encodeURIComponent(name)}`);
    q('#skill-drawer-title').textContent = n;
    q('#skill-drawer-sub').textContent = `skill · ${body.length} bytes`;
    q('#skill-drawer-body').textContent = body;
    q('#skill-drawer').hidden = false;
  } catch (e) { toast(e.message, 'error'); }
}
q('#skill-drawer-close').addEventListener('click', () => { q('#skill-drawer').hidden = true; });

async function removeSkillConfirm(name) {
  if (!confirm(`Remove skill "${name}"?`)) return;
  try { await api('DELETE', `/api/skills/${encodeURIComponent(name)}`); loadSkills(); toast('removed', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}

q('#skills-install').addEventListener('click', () => {
  const form = el('div', {},
    el('label', {}, 'Bundle (all-in-one pack)',
      el('select', { id: 'sk-bundle' },
        el('option', { value: '' }, '— skip —'),
        ...SKILL_BUNDLE_PRESETS.map(b => el('option', { value: b.slug }, b.label)),
      ),
    ),
    el('label', {}, 'Or single category repo',
      el('select', { id: 'sk-repo' },
        el('option', { value: '' }, '— skip —'),
        ...SKILL_REPO_PRESETS.map(r => el('option', { value: r.src }, `${r.src} — ${r.label}`)),
      ),
    ),
    el('label', {}, 'Or custom source (owner/repo, URL, or bare name)',
      el('input', { id: 'sk-custom', placeholder: 'e.g. vercel-labs/agent-skills' }),
    ),
    el('div', { class: 'card-meta' }, 'Installs use npx skills-il · first run may take ~30s.'),
  );
  const actions = el('div', { class: 'modal-actions' },
    el('button', { onclick: closeModal }, 'Cancel'),
    el('button', { class: 'primary', onclick: async () => {
      const bundle = q('#sk-bundle').value;
      const repo   = q('#sk-repo').value;
      const custom = q('#sk-custom').value.trim();
      if (!bundle && !repo && !custom) { toast('pick one option', 'error'); return; }
      closeModal();
      toast('installing… (this can take ~30s)', 'info', 4000);
      try {
        if (bundle) await api('POST', '/api/skills/install-bundle', { slug: bundle });
        else        await api('POST', '/api/skills/add', { source: repo || custom });
        toast('installed', 'success');
        loadSkills();
      } catch (e) { toast(`install failed: ${e.message}`, 'error', 8000); }
    } }, 'Install'),
  );
  openModal('Install skills', form, actions);
});

q('#skills-create').addEventListener('click', () => {
  const form = el('div', {},
    el('label', {}, 'What should this skill do?',
      el('textarea', { id: 'sc-intent', rows: '3', placeholder: 'e.g. "Generate a compliant Israeli VAT invoice from a list of line items"' }),
    ),
    el('label', {}, 'Short name (kebab-case, optional)',
      el('input', { id: 'sc-name', placeholder: 'vat-invoice' }),
    ),
    el('label', {}, 'Example user phrases (| separated, optional)',
      el('input', { id: 'sc-triggers', placeholder: 'חשבונית מס | generate invoice | send VAT receipt' }),
    ),
    el('label', {}, 'Expected output',
      el('input', { id: 'sc-outputs', placeholder: 'e.g. "markdown table + PDF link"' }),
    ),
    el('label', {}, 'Scope',
      el('select', { id: 'sc-scope' },
        el('option', { value: 'global' }, 'global (all workspaces)'),
        el('option', { value: 'project' }, 'project (./.geoclaw/skills)'),
      ),
    ),
    el('div', { class: 'card-meta' }, ME && ME.hasKey ? 'The LLM will draft the SKILL.md for you.' : 'No API key — falling back to template. Set GEOCLAW_MODEL_API_KEY for LLM-drafted skills.'),
  );
  const actions = el('div', { class: 'modal-actions' },
    el('button', { onclick: closeModal }, 'Cancel'),
    el('button', { class: 'primary', onclick: async () => {
      const intent = q('#sc-intent').value.trim();
      if (!intent) { toast('intent is required', 'error'); return; }
      const body = {
        intent,
        name: q('#sc-name').value.trim() || undefined,
        description: intent,
        triggers: q('#sc-triggers').value.split('|').map(s => s.trim()).filter(Boolean),
        outputs: q('#sc-outputs').value.trim(),
        scope: q('#sc-scope').value,
        useLLM: !!(ME && ME.hasKey),
      };
      closeModal();
      toast('drafting skill…', 'info', 3000);
      try {
        const r = await api('POST', '/api/skills/create', body);
        toast(r.draftedByLLM ? 'skill drafted by LLM ✓' : 'skill created from template', 'success');
        loadSkills();
        setTimeout(() => openSkillDrawer(r.skill.name), 200);
      } catch (e) { toast(e.message, 'error', 8000); }
    } }, 'Create'),
  );
  openModal('Create a skill', form, actions);
});

// ── Settings ─────────────────────────────────────────────────────────────────

const KNOWN_PROVIDERS = [
  { id: 'deepseek',   name: 'DeepSeek',    url: 'https://platform.deepseek.com',   models: ['deepseek-chat', 'deepseek-reasoner'],                       note: 'Cheap, fast, strong reasoning' },
  { id: 'openai',     name: 'OpenAI',      url: 'https://platform.openai.com',     models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],                         note: 'Best general-purpose' },
  { id: 'anthropic',  name: 'Anthropic',   url: 'https://console.anthropic.com',   models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'], note: 'Excellent reasoning & code' },
  { id: 'groq',       name: 'Groq',        url: 'https://console.groq.com',        models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],            note: 'Ultra-fast inference, free tier' },
  { id: 'openrouter', name: 'OpenRouter',  url: 'https://openrouter.ai/keys',      models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash', 'meta-llama/llama-3.3-70b-instruct'], note: '100+ models via one key' },
  { id: 'moonshot',   name: 'Moonshot AI', url: 'https://platform.moonshot.cn',    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],   note: 'Kimi — long-context, multilingual' },
  { id: 'google',     name: 'Google',      url: 'https://aistudio.google.com',     models: ['gemini-2.0-flash', 'gemini-1.5-pro'],                       note: 'Gemini family' },
  { id: 'ollama',     name: 'Ollama',      url: 'https://ollama.com',              models: ['llama3.2', 'mistral', 'qwen2.5'],                           note: 'Local models — free & private' },
];

async function loadSettings() {
  if (!ME) await loadMe();
  if (!ME) return;
  q('#s-provider').textContent  = ME.provider;
  q('#s-model').textContent     = ME.model;
  q('#s-workspace').textContent = ME.workspace;
  q('#s-cwd').textContent       = ME.cwd;
  q('#s-version').textContent   = ME.version;
  q('#s-haskey').textContent    = ME.hasKey ? 'yes' : 'no — set GEOCLAW_MODEL_API_KEY';

  const tbl = q('#provider-table');
  if (tbl) {
    tbl.innerHTML = '';
    for (const p of KNOWN_PROVIDERS) {
      const row = document.createElement('div');
      row.className = 'provider-row' + (p.id === ME.provider ? ' provider-row--active' : '');
      row.innerHTML = `
        <div class="provider-row-name">${p.name}${p.id === ME.provider ? ' <span class="provider-badge">active</span>' : ''}</div>
        <div class="provider-row-models">${p.models.map(m => `<code>${m}</code>`).join(' ')}</div>
        <div class="provider-row-note">${p.note}</div>
        <a class="provider-row-link" href="${p.url}" target="_blank" rel="noopener">Get key ↗</a>
      `;
      tbl.appendChild(row);
    }
  }

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

// ── i18n (English / Hebrew) ──────────────────────────────────────────────────

const I18N = {
  en: {
    'nav.capabilities': 'Capabilities',
    'nav.chat': 'Chat',
    'nav.browser': 'Browser',
    'nav.inbox': 'Inbox',
    'nav.agents': 'Agents',
    'nav.autopilots': 'Autopilots',
    'nav.files': 'Files',
    'nav.skills': 'Skills',
    'nav.design': 'Design',
    'nav.settings': 'Settings',
    'cap.title': 'What Geoclaw can do',
    'cap.subtitle': 'A universal agent for Israeli organizations — chat, autonomous agents, web browsing, skills, and more, all local and private.',
    'cap.chat.title': 'Smart chat',
    'cap.chat.desc': 'Talk to your LLM with knowledge-base memory and real tools (Monday, Telegram, design-system).',
    'cap.agents.title': 'Autonomous agents',
    'cap.agents.desc': 'Give a goal — the agent plans, calls tools, spawns sub-agents, and reports back.',
    'cap.browser.title': 'Web browser',
    'cap.browser.desc': 'Fetch any URL and extract readable markdown with typed refs (link, button, input).',
    'cap.skills.title': 'Israeli skills',
    'cap.skills.desc': 'Install tax-season, legal, accounting, and government bundles from skills-il — Geoclaw sees them automatically.',
    'cap.autopilots.title': 'Autopilots',
    'cap.autopilots.desc': 'Schedule agents to run on cron (@hourly, @daily) — Geoclaw keeps working while you sleep.',
    'cap.files.title': 'Document ingest',
    'cap.files.desc': 'Upload PDFs, Word, Excel, Markdown — Geoclaw indexes them into your knowledge base.',
    'cap.design.title': 'Design system',
    'cap.design.desc': 'Scaffold a DESIGN.md — Geoclaw themes the UI and generates on-brand components.',
    'cap.inbox.title': 'Activity inbox',
    'cap.inbox.desc': 'Every agent run, skill install, and file ingest lands here — a human-readable audit log.',
    'browser.title': 'Browser',
    'browser.hint': 'Fetch any URL. Geoclaw extracts the readable content as markdown with typed refs ([link 7], [button 9], [input text 12]) the agent can quote or describe.',
    'browser.go': 'Fetch',
    'browser.empty': 'Enter a URL to fetch and extract readable markdown.',
    'browser.refs': 'Refs',
    'browser.fetching': 'Fetching…',
    'browser.error': 'Fetch failed',
    'browser.search': 'Search',
    'settings.setkey': 'Update API key',
    'settings.setkey.hint': 'Changes take effect immediately (saved to .env). Restart is not required.',
    'settings.save': 'Save',
  },
  he: {
    'nav.capabilities': 'יכולות',
    'nav.chat': 'צ׳אט',
    'nav.browser': 'דפדפן',
    'nav.inbox': 'התראות',
    'nav.agents': 'סוכנים',
    'nav.autopilots': 'טייס אוטומטי',
    'nav.files': 'קבצים',
    'nav.skills': 'מיומנויות',
    'nav.design': 'עיצוב',
    'nav.settings': 'הגדרות',
    'cap.title': 'מה Geoclaw יודע לעשות',
    'cap.subtitle': 'סוכן אוניברסלי לארגונים ישראליים — צ׳אט, סוכנים אוטונומיים, גלישה, מיומנויות ועוד, הכל מקומי ופרטי.',
    'cap.chat.title': 'צ׳אט חכם',
    'cap.chat.desc': 'שוחחו עם ה-LLM עם זיכרון מבסיס-הידע וכלים אמיתיים (Monday, טלגרם, מערכת עיצוב).',
    'cap.agents.title': 'סוכנים אוטונומיים',
    'cap.agents.desc': 'תנו מטרה — הסוכן מתכנן, קורא לכלים, מפצל למשנה-סוכנים ומדווח בחזרה.',
    'cap.browser.title': 'דפדפן',
    'cap.browser.desc': 'הביאו כל URL וחלצו טקסט קריא כ-Markdown עם סימוני רכיבים (קישור, כפתור, שדה).',
    'cap.skills.title': 'מיומנויות ישראליות',
    'cap.skills.desc': 'התקינו חבילות עונת מיסים, משפט, ראיית חשבון וממשלה מ-skills-il — Geoclaw רואה אותן אוטומטית.',
    'cap.autopilots.title': 'טייס אוטומטי',
    'cap.autopilots.desc': 'תזמנו סוכנים ב-cron (@hourly, @daily) — Geoclaw ממשיך לעבוד בזמן שאתם ישנים.',
    'cap.files.title': 'הזנת מסמכים',
    'cap.files.desc': 'העלו PDF, וורד, אקסל, Markdown — Geoclaw מאנדקס אותם לבסיס-הידע שלכם.',
    'cap.design.title': 'מערכת עיצוב',
    'cap.design.desc': 'יצרו DESIGN.md — Geoclaw מעצב את הממשק ומייצר רכיבים לפי המותג.',
    'cap.inbox.title': 'תיבת פעילות',
    'cap.inbox.desc': 'כל ריצת סוכן, התקנת מיומנות והזנת קובץ נרשמים כאן — יומן ביקורת קריא.',
    'browser.title': 'דפדפן',
    'browser.hint': 'הביאו כל URL. Geoclaw מחלץ את התוכן הקריא כ-Markdown עם סימוני רכיבים ([link 7], [button 9], [input text 12]) שהסוכן יכול לצטט או לתאר.',
    'browser.go': 'הבא',
    'browser.empty': 'הזינו URL כדי להביא ולחלץ Markdown קריא.',
    'browser.refs': 'רכיבים',
    'browser.fetching': 'מביא…',
    'browser.error': 'הבאה נכשלה',
    'browser.search': 'חפש',
    'settings.setkey': 'עדכון מפתח API',
    'settings.setkey.hint': 'השינויים נכנסים לתוקף מיד (נשמרים ל-.env). אין צורך להפעיל מחדש.',
    'settings.save': 'שמור',
  },
};

function currentLang() {
  return localStorage.getItem('geoclaw.lang') || 'en';
}

function t(key) {
  const lang = currentLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

function applyI18n() {
  const lang = currentLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === 'he') ? 'rtl' : 'ltr';
  qa('[data-i18n-text]').forEach(el => { el.textContent = t(el.dataset.i18nText); });
  qa('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
}

qa('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    localStorage.setItem('geoclaw.lang', btn.dataset.lang);
    applyI18n();
  });
});

// ── Capabilities cards ───────────────────────────────────────────────────────
qa('.cap-card').forEach(card => {
  card.addEventListener('click', () => showView(card.dataset.capView));
});

// ── Browser pane ─────────────────────────────────────────────────────────────

const browserForm = q('#browser-form');
const browserContent = q('#browser-content');
const browserRefs = q('#browser-refs');
const browserRefsList = q('#browser-refs-list');

function renderBrowserContent(res) {
  browserContent.innerHTML = '';
  if (!res || !res.ok) {
    const err = document.createElement('div');
    err.className = 'empty';
    err.textContent = `${t('browser.error')}: ${(res && res.error) || 'unknown'}`;
    browserContent.appendChild(err);
    browserRefs.hidden = true;
    return;
  }
  if (res.title) {
    const h = document.createElement('h2');
    h.className = 'browser-page-title';
    h.textContent = res.title;
    browserContent.appendChild(h);
  }
  const meta = document.createElement('div');
  meta.className = 'browser-meta';
  meta.textContent = `${res.url} · ${res.bytes || 0} bytes` + (res.lang ? ` · ${res.lang}` : '');
  browserContent.appendChild(meta);
  const pre = document.createElement('pre');
  pre.className = 'browser-markdown';
  pre.textContent = res.markdown || '';
  browserContent.appendChild(pre);

  const refs = res.refs || {};
  const ids = Object.keys(refs);
  if (ids.length) {
    browserRefs.hidden = false;
    browserRefsList.innerHTML = '';
    for (const id of ids) {
      const r = refs[id];
      const row = document.createElement('div');
      row.className = 'browser-ref';
      const label = (r.label || r.alt || r.placeholder || r.href || r.src || '').toString().slice(0, 80);
      row.innerHTML = `<span class="ref-id">[${r.type} ${id}]</span> <span class="ref-label"></span>`;
      row.querySelector('.ref-label').textContent = label;
      if (r.href) {
        row.addEventListener('click', () => {
          q('#browser-url').value = r.href;
          browserForm.dispatchEvent(new Event('submit'));
        });
        row.classList.add('clickable');
      }
      browserRefsList.appendChild(row);
    }
  } else {
    browserRefs.hidden = true;
  }
}

if (browserForm) {
  browserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = q('#browser-url').value.trim();
    if (!url) return;
    const useJina = q('#browser-jina')?.checked || false;
    browserContent.innerHTML = `<div class="empty">${t('browser.fetching')}</div>`;
    browserRefs.hidden = true;
    try {
      const res = await api('POST', '/api/browse', { url, useJina });
      renderBrowserContent(res);
    } catch (err) {
      renderBrowserContent({ ok: false, error: err.message });
    }
  });
}

const browserSearchForm = q('#browser-search-form');
if (browserSearchForm) {
  browserSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = q('#browser-search-input').value.trim();
    if (!query) return;
    browserContent.innerHTML = `<div class="empty">${t('browser.fetching')}</div>`;
    browserRefs.hidden = true;
    try {
      const res = await api('POST', '/api/search', { query });
      if (!res.ok || !res.results?.length) {
        browserContent.innerHTML = `<div class="empty">${t('browser.error')}: ${res.error || 'no results'}</div>`;
        return;
      }
      browserContent.innerHTML = '';
      const h = document.createElement('h2');
      h.className = 'browser-page-title';
      h.textContent = `Search: ${query}`;
      browserContent.appendChild(h);
      const meta = document.createElement('div');
      meta.className = 'browser-meta';
      meta.textContent = `${res.results.length} results via ${res.source}`;
      browserContent.appendChild(meta);
      const list = document.createElement('div');
      list.className = 'search-results';
      for (const r of res.results) {
        const item = document.createElement('div');
        item.className = 'search-result';
        item.innerHTML = `
          <div class="sr-title"></div>
          <div class="sr-url"></div>
          <div class="sr-snippet"></div>
        `;
        item.querySelector('.sr-title').textContent = r.title;
        item.querySelector('.sr-url').textContent   = r.url;
        item.querySelector('.sr-snippet').textContent = r.snippet;
        if (r.url) {
          item.style.cursor = 'pointer';
          item.addEventListener('click', () => {
            q('#browser-url').value = r.url;
            browserForm.dispatchEvent(new Event('submit'));
          });
        }
        list.appendChild(item);
      }
      browserContent.appendChild(list);
    } catch (err) {
      browserContent.innerHTML = `<div class="empty">${t('browser.error')}: ${err.message}</div>`;
    }
  });
}

// ── Settings: API key editor ──────────────────────────────────────────────────

const keySaveBtn = q('#key-save-btn');
if (keySaveBtn) {
  keySaveBtn.addEventListener('click', async () => {
    const key   = q('#key-provider-select').value;
    const value = q('#key-value-input').value.trim();
    if (!value) return toast('Enter a key value', 'error');
    try {
      await api('POST', '/api/settings/set-env', { key, value });
      q('#key-value-input').value = '';
      toast(`${key} saved`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  applyI18n();
  await loadMe();
  const initial = location.hash.replace('#','') || 'capabilities';
  showView(VIEWS.includes(initial) ? initial : 'capabilities');
  loadInbox();  // so badge reflects backlog
})();
