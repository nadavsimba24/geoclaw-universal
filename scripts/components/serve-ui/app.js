// Geoclaw Web UI — vanilla JS.
// Reads ?k=<token>, keeps it for all API calls. Switches view panes by data-view.
// Themes itself from /api/design (DESIGN.md tokens) when present.

const TOKEN = ''; // auth removed — server is loopback-only

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

const VIEWS = ['capabilities', 'chat', 'canvas', 'browser', 'inbox', 'agents', 'autopilots', 'files', 'skills', 'design', 'approvals', 'memory', 'settings'];
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
  if (name === 'skills')     { loadSkills(); loadRegistry(); }
  if (name === 'design')     loadDesign();
  if (name === 'canvas')     loadCanvas();
  if (name === 'approvals')  loadApprovals();
  if (name === 'memory')     loadMemory();
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

// ── Slash commands ────────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { cmd: '/help',       args: '',           desc: 'Show all available slash commands' },
  { cmd: '/model',      args: '<name>',     desc: 'Switch model — e.g. /model gpt-4o' },
  { cmd: '/provider',   args: '<name>',     desc: 'Switch provider — deepseek · openai · groq · openrouter · moonshot · ollama' },
  { cmd: '/key',        args: '<apikey>',   desc: 'Set API key for current provider' },
  { cmd: '/models',     args: '',           desc: 'List known models for current provider' },
  { cmd: '/clear',      args: '',           desc: 'Clear chat history' },
  { cmd: '/new',        args: '',           desc: 'Start a new conversation' },
  { cmd: '/workspace',  args: '<name>',     desc: 'Switch workspace' },
  { cmd: '/sys',        args: '<text>',     desc: 'Prepend a system instruction to the next message' },
  { cmd: '/agent',      args: '<goal>',     desc: 'Run an autonomous agent task' },
  { cmd: '/skills',     args: '',           desc: 'List installed skills' },
  { cmd: '/memory',     args: '',           desc: 'Show recent session memory' },
  { cmd: '/web',        args: '<query>',    desc: 'Web search directly from chat' },
  { cmd: '/browse',     args: '<url>',      desc: 'Browse a URL and show content' },
  { cmd: '/canvas',     args: '',           desc: 'Open the Canvas view' },
  { cmd: '/settings',   args: '',           desc: 'Open Settings' },
];

const KNOWN_MODELS = {
  deepseek:   ['deepseek-chat', 'deepseek-reasoner'],
  openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
  groq:       ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  openrouter: ['anthropic/claude-sonnet-4-6', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
  moonshot:   ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  ollama:     ['llama3.2:3b', 'qwen2.5:7b', 'mistral:7b', 'phi4:14b', 'gemma3:12b'],
};

const PROVIDER_KEY_NAMES = {
  deepseek:   'GEOCLAW_DEEPSEEK_API_KEY',
  openai:     'GEOCLAW_OPENAI_API_KEY',
  groq:       'GEOCLAW_GROQ_API_KEY',
  openrouter: 'GEOCLAW_OPENROUTER_API_KEY',
  moonshot:   'GEOCLAW_MOONSHOT_API_KEY',
};

let slashMenuIdx = -1;
let pendingSysMsg = null;

function buildSlashMenu(filter) {
  const menu = q('#slash-menu');
  const matches = filter === '/'
    ? SLASH_COMMANDS
    : SLASH_COMMANDS.filter(c => c.cmd.startsWith(filter.split(' ')[0]));
  if (!matches.length) { menu.hidden = true; return; }
  slashMenuIdx = -1;
  menu.innerHTML = '';
  matches.forEach((c, i) => {
    const row = el('div', { class: 'slash-row', 'data-idx': String(i) },
      el('span', { class: 'slash-cmd' }, c.cmd),
      c.args ? el('span', { class: 'slash-args' }, c.args) : null,
      el('span', { class: 'slash-desc' }, c.desc),
    );
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applySlashCompletion(c);
    });
    menu.appendChild(row);
  });
  menu.hidden = false;
}

function applySlashCompletion(c) {
  const inp = q('#chat-input');
  inp.value = c.args ? `${c.cmd} ` : c.cmd;
  q('#slash-menu').hidden = true;
  slashMenuIdx = -1;
  inp.focus();
}

function slashMenuNavigate(dir) {
  const rows = qa('.slash-row', q('#slash-menu'));
  if (!rows.length) return false;
  rows[slashMenuIdx]?.classList.remove('active');
  slashMenuIdx = Math.max(0, Math.min(rows.length - 1, slashMenuIdx + dir));
  rows[slashMenuIdx].classList.add('active');
  return true;
}

function closeSlashMenu() {
  q('#slash-menu').hidden = true;
  slashMenuIdx = -1;
}

// Returns true if message was a slash command (handled locally — don't send to LLM).
async function handleSlashCommand(text) {
  const parts = text.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const arg   = parts.slice(1).join(' ').trim();

  if (cmd === '/help') {
    const lines = SLASH_COMMANDS.map(c => `<b>${c.cmd}</b>${c.args ? ' <i>'+c.args+'</i>' : ''} — ${c.desc}`);
    renderMsg('assistant', '').querySelector('.msg-body').innerHTML =
      `<div class="slash-help">${lines.join('<br>')}</div>`;
    return true;
  }

  if (cmd === '/clear' || cmd === '/new') {
    chatHistory.length = 0;
    q('#chat-log').innerHTML = '';
    q('#chat-log').appendChild(el('div', { class: 'chat-empty', id: 'chat-empty' },
      el('div', { class: 'chat-empty-icon' }, '✳'),
      el('h2', {}, 'How can I help?'),
      el('p', {}, 'Ask anything, or type / for commands'),
    ));
    toast('Chat cleared', 'success');
    return true;
  }

  if (cmd === '/model') {
    if (!arg) {
      const cur = ME?.model || '?';
      const prov = ME?.provider || '?';
      const known = (KNOWN_MODELS[prov] || []).map(m => `<code>${m}</code>`).join(' · ');
      renderMsg('assistant', '').querySelector('.msg-body').innerHTML =
        `Current model: <b>${cur}</b> (${prov})<br>Known models: ${known || 'any'}`;
      return true;
    }
    await setEnv('GEOCLAW_MODEL_NAME', arg);
    if (ME) ME.model = arg;
    q('#provider-chip').textContent = `${ME?.provider || '?'} · ${arg}`;
    toast(`Model → ${arg}`, 'success');
    return true;
  }

  if (cmd === '/provider') {
    if (!arg) {
      renderMsg('assistant', '').querySelector('.msg-body').innerHTML =
        `Current provider: <b>${ME?.provider || '?'}</b><br>Available: deepseek · openai · groq · openrouter · moonshot · ollama`;
      return true;
    }
    await setEnv('GEOCLAW_MODEL_PROVIDER', arg.toLowerCase());
    if (ME) ME.provider = arg.toLowerCase();
    q('#provider-chip').textContent = `${arg.toLowerCase()} · ${ME?.model || '?'}`;
    toast(`Provider → ${arg}`, 'success');
    return true;
  }

  if (cmd === '/key') {
    if (!arg) { toast('Usage: /key <your-api-key>', 'error'); return true; }
    const prov = ME?.provider || 'deepseek';
    const envKey = PROVIDER_KEY_NAMES[prov] || 'GEOCLAW_MODEL_API_KEY';
    await setEnv(envKey, arg);
    await setEnv('GEOCLAW_MODEL_API_KEY', arg);
    toast(`API key saved for ${prov}`, 'success');
    return true;
  }

  if (cmd === '/models') {
    const prov = ME?.provider || 'deepseek';
    const known = KNOWN_MODELS[prov] || [];
    renderMsg('assistant', '').querySelector('.msg-body').innerHTML =
      known.length
        ? `Known models for <b>${prov}</b>:<br>${known.map(m => `<code>${m}</code>`).join('<br>')}`
        : `No preset models for <b>${prov}</b>. Use /model &lt;name&gt; to set any model name.`;
    return true;
  }

  if (cmd === '/workspace') {
    if (!arg) {
      renderMsg('assistant', '').querySelector('.msg-body').innerHTML =
        `Current workspace: <b>${ME?.workspace || 'default'}</b>`;
      return true;
    }
    await api('POST', '/api/workspaces/use', { name: arg });
    if (ME) ME.workspace = arg;
    q('#workspace-chip').textContent = `workspace: ${arg}`;
    toast(`Workspace → ${arg}`, 'success');
    return true;
  }

  if (cmd === '/sys') {
    if (!arg) { toast('Usage: /sys <instruction>', 'error'); return true; }
    pendingSysMsg = arg;
    toast(`System instruction set for next message: "${arg.slice(0, 60)}"`, 'info', 4000);
    return true;
  }

  if (cmd === '/agent') {
    if (!arg) { toast('Usage: /agent <goal>', 'error'); return true; }
    const node = renderMsg('assistant', '');
    node.querySelector('.msg-body').textContent = `🤖 Running agent: "${arg}"…`;
    try {
      const r = await api('POST', '/api/agents/run', { goal: arg });
      node.querySelector('.msg-body').textContent = r.summary || 'Agent finished.';
    } catch (e) { node.querySelector('.msg-body').textContent = `Agent error: ${e.message}`; }
    return true;
  }

  if (cmd === '/skills') {
    showView('skills');
    return true;
  }

  if (cmd === '/memory') {
    showView('memory');
    return true;
  }

  if (cmd === '/canvas') {
    showView('canvas');
    return true;
  }

  if (cmd === '/settings') {
    showView('settings');
    return true;
  }

  if (cmd === '/web') {
    if (!arg) { toast('Usage: /web <query>', 'error'); return true; }
    const node = renderMsg('assistant', '');
    node.querySelector('.msg-body').textContent = `🔍 Searching "${arg}"…`;
    try {
      const r = await api('POST', '/api/search', { query: arg, limit: 5 });
      const results = r.results || [];
      node.querySelector('.msg-body').innerHTML = results.length
        ? results.map(x => `<b><a href="${x.url}" target="_blank" rel="noopener">${x.title}</a></b><br><small>${x.url}</small><br>${x.snippet || ''}`).join('<hr>')
        : 'No results.';
    } catch (e) { node.querySelector('.msg-body').textContent = `Search error: ${e.message}`; }
    return true;
  }

  if (cmd === '/browse') {
    if (!arg) { toast('Usage: /browse <url>', 'error'); return true; }
    const node = renderMsg('assistant', '');
    node.querySelector('.msg-body').textContent = `🌐 Fetching ${arg}…`;
    try {
      const r = await api('POST', '/api/browse', { url: arg });
      node.querySelector('.msg-body').textContent = (r.markdown || r.text || 'No content.').slice(0, 3000);
    } catch (e) { node.querySelector('.msg-body').textContent = `Browse error: ${e.message}`; }
    return true;
  }

  return false; // not a slash command we handle — let it go to the LLM
}

async function setEnv(key, value) {
  await api('POST', '/api/settings/set-env', { key, value });
}

// Wire slash menu to the chat input
q('#chat-input').addEventListener('input', () => {
  const ta  = q('#chat-input');
  const val = ta.value;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  if (val.startsWith('/')) buildSlashMenu(val);
  else closeSlashMenu();
});

q('#chat-input').addEventListener('keydown', (e) => {
  const menu = q('#slash-menu');
  if (!menu.hidden) {
    if (e.key === 'ArrowDown') { e.preventDefault(); slashMenuNavigate(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); slashMenuNavigate(-1); return; }
    if (e.key === 'Tab' || e.key === 'Enter') {
      const active = q('.slash-row.active', menu);
      if (active) {
        e.preventDefault();
        const idx = parseInt(active.dataset.idx);
        applySlashCompletion(SLASH_COMMANDS.find((c, i) => i === idx) || SLASH_COMMANDS[idx]);
        return;
      }
    }
    if (e.key === 'Escape') { closeSlashMenu(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    q('#chat-composer').requestSubmit();
  }
});

q('#chat-input').addEventListener('blur', () => {
  setTimeout(() => closeSlashMenu(), 150);
});

q('#chat-composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = q('#chat-input').value.trim();
  if (!text) return;

  // Handle slash commands first — they work even without an API key
  if (text.startsWith('/')) {
    q('#chat-input').value = '';
    q('#chat-input').style.height = 'auto';
    closeSlashMenu();
    const handled = await handleSlashCommand(text);
    if (handled) return;
  }

  // Guard: no API key → explain instead of silent failure.
  if (ME && !ME.hasKey) {
    toast('No API key set. Use /key <your-key> or run geoclaw setup.', 'error', 8000);
    return;
  }

  q('#chat-input').value = '';
  q('#chat-input').style.height = 'auto';
  closeSlashMenu();

  // Inject pending system instruction if set via /sys
  const messages = [...chatHistory];
  if (pendingSysMsg) {
    messages.push({ role: 'system', content: pendingSysMsg });
    pendingSysMsg = null;
  }

  chatHistory.push({ role: 'user', content: text });
  renderMsg('user', text);
  const assistantNode = renderMsg('assistant', '');
  q('#chat-send').disabled = true;

  const source = apiEventSource('/api/chat', { messages });
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

// ── Registry browser ─────────────────────────────────────────────────────────

async function loadRegistry(query = '') {
  const grid = q('#registry-grid');
  grid.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    const { skills: entries = [] } = await api('GET', `/api/skills/registry${qs}`);
    grid.innerHTML = '';
    if (!entries.length) {
      grid.appendChild(el('div', { class: 'empty' }, query ? `No results for "${query}".` : 'Registry is empty.'));
      return;
    }
    for (const s of entries) {
      const isBuiltin = !!s.builtin;
      const card = el('div', { class: 'reg-card' },
        el('div', { class: 'reg-card-icon' }, s.icon || '📦'),
        el('div', { class: 'reg-card-body' },
          el('div', { class: 'reg-card-name' }, s.name_en || s.slug),
          s.name_he ? el('div', { class: 'reg-card-name-he' }, s.name_he) : null,
          el('div', { class: 'reg-card-desc' }, s.description_en || ''),
          el('div', { class: 'reg-card-tags' },
            ...(s.tags || []).map(t => el('span', { class: 'reg-tag' }, t)),
            s.bundle ? el('span', { class: 'reg-tag reg-tag--bundle' }, `bundle: ${s.bundle}`) : null,
          ),
        ),
        el('div', { class: 'reg-card-actions' },
          isBuiltin
            ? el('span', { class: 'reg-builtin-badge' }, 'Built-in')
            : el('button', { class: 'primary', onclick: () => installFromRegistryUI(s.slug) }, 'Install'),
        ),
      );
      grid.appendChild(card);
    }
  } catch (e) { grid.innerHTML = `<div class="empty">Error: ${e.message}</div>`; }
}

async function installFromRegistryUI(slug) {
  toast(`Installing "${slug}"…`, 'info', 4000);
  try {
    const r = await api('POST', '/api/skills/install-registry', { slug });
    if (r.builtin) { toast(r.message, 'info'); return; }
    toast(`"${slug}" installed!`, 'success');
    loadSkills();
  } catch (e) { toast(`Install failed: ${e.message}`, 'error', 8000); }
}

q('#registry-search-btn').addEventListener('click', () => {
  loadRegistry(q('#registry-q').value.trim());
});
q('#registry-q').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadRegistry(q('#registry-q').value.trim());
});

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

  // Firecrawl status
  const fcDiv = q('#firecrawl-status');
  if (fcDiv) {
    fcDiv.innerHTML = '<div class="fc-status fc-status--checking">Checking Firecrawl…</div>';
    api('GET', '/api/firecrawl/ping').then(r => {
      fcDiv.innerHTML = r.ok
        ? `<div class="fc-status fc-status--ok">✓ Firecrawl reachable at ${r.base}</div>`
        : `<div class="fc-status fc-status--off">✗ Firecrawl not running · <a href="https://github.com/mendableai/firecrawl" target="_blank" rel="noopener">Setup guide</a> · Start: <code>docker run -p 3002:3002 mendableai/firecrawl</code></div>`;
    }).catch(() => {
      fcDiv.innerHTML = '<div class="fc-status fc-status--off">✗ Firecrawl not running</div>';
    });
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

// ── Approvals ─────────────────────────────────────────────────────────────────

const ALL_TOOLS = [
  'remember','recall','web_search','browse','firecrawl_scrape','firecrawl_crawl','firecrawl_map',
  'send_telegram','monday_list_boards','monday_get_board','monday_create_item',
  'canvas_write','read_skill','spawn_subagent','ask_user','speak',
  'design_tokens','design_lint','design_diff','design_export','design_init','design_suggest',
];
const EXTERNAL_TOOLS = new Set(['send_telegram','monday_create_item','firecrawl_crawl','web_search','browse','firecrawl_scrape','firecrawl_map']);

async function loadApprovals() {
  try {
    const r = await api('GET', '/api/approvals');
    const policy = r.policy || 'open';
    qa('.policy-btn').forEach(b => b.classList.toggle('active', b.dataset.policy === policy));
    const container = q('#approvals-tools');
    if (!container) return;
    container.innerHTML = '';
    for (const tool of ALL_TOOLS) {
      const override = r.overrides?.[tool];
      const isExternal = EXTERNAL_TOOLS.has(tool);
      const row = document.createElement('div');
      row.className = 'approval-row';
      row.innerHTML = `
        <span class="approval-tool">${tool}</span>
        <span class="approval-tag ${isExternal ? 'approval-tag--ext' : 'approval-tag--safe'}">${isExternal ? 'external' : 'safe'}</span>
        <div class="approval-btns">
          <button class="approval-btn ${override==='allow'?'active-allow':''}" data-tool="${tool}" data-decision="allow">Allow</button>
          <button class="approval-btn ${override==='deny'?'active-deny':''}" data-tool="${tool}" data-decision="deny">Deny</button>
          <button class="approval-btn ${!override?'active-default':''}" data-tool="${tool}" data-decision="remove">Default</button>
        </div>
      `;
      container.appendChild(row);
    }
    qa('.approval-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api('POST', '/api/approvals/override', { tool: btn.dataset.tool, decision: btn.dataset.decision });
        loadApprovals();
      });
    });
  } catch(e) { /* approvals unavailable */ }
}

qa('.policy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    await api('POST', '/api/approvals/policy', { policy: btn.dataset.policy });
    toast(`Policy set to ${btn.dataset.policy}`, 'success');
    loadApprovals();
  });
});
q('#approvals-refresh')?.addEventListener('click', loadApprovals);

// ── Session Memory ────────────────────────────────────────────────────────────

async function loadMemory() {
  const list = q('#memory-list');
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const { sessions = [] } = await api('GET', '/api/memory?n=50');
    list.innerHTML = '';
    if (!sessions.length) {
      list.appendChild(el('div', { class: 'empty' }, 'No session history yet. Run an agent task to start building memory.'));
      return;
    }
    for (const s of sessions) {
      const time = s.ts ? new Date(s.ts).toLocaleString() : '?';
      const card = el('div', { class: 'card' },
        el('div', { class: 'card-avatar' }, '🧠'),
        el('div', {},
          el('div', { class: 'card-title' }, s.userMsg ? String(s.userMsg).slice(0, 100) : '(no prompt)'),
          s.summary ? el('div', { class: 'card-sub' }, s.summary.slice(0, 120)) : null,
          el('div', { class: 'card-meta' },
            time +
            (s.toolsUsed?.length ? ` · tools: ${s.toolsUsed.slice(0,4).join(', ')}` : '') +
            (s.filesEdited?.length ? ` · edited: ${s.filesEdited.slice(0,2).join(', ')}` : '') +
            (s.workspace ? ` · workspace: ${s.workspace}` : '')
          ),
        ),
      );
      list.appendChild(card);
    }
  } catch (e) { list.innerHTML = `<div class="empty">Error: ${e.message}</div>`; }
}

q('#memory-refresh')?.addEventListener('click', loadMemory);
q('#memory-clear')?.addEventListener('click', async () => {
  if (!confirm('Clear all session memory?')) return;
  try { await api('DELETE', '/api/memory'); toast('Session memory cleared', 'success'); loadMemory(); }
  catch (e) { toast(e.message, 'error'); }
});

// ── Canvas ────────────────────────────────────────────────────────────────────

let canvasItems = [];
let canvasPollTimer = null;

function renderCanvasItem(item) {
  const card = document.createElement('div');
  card.className = `canvas-card canvas-card--${item.type}`;
  card.dataset.id = item.id;

  const hdr = document.createElement('div');
  hdr.className = 'canvas-card-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'canvas-card-title';
  titleEl.textContent = item.title || item.type;

  const meta = document.createElement('span');
  meta.className = 'canvas-card-meta';
  meta.textContent = `${item.agent} · ${item.ts ? item.ts.slice(0, 16).replace('T',' ') : ''}`;

  const del = document.createElement('button');
  del.className = 'canvas-card-del ghost';
  del.textContent = '×';
  del.addEventListener('click', async () => {
    await api('DELETE', `/api/canvas/${item.id}`);
    card.remove();
  });

  hdr.appendChild(titleEl);
  hdr.appendChild(meta);
  hdr.appendChild(del);
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'canvas-card-body';

  if (item.type === 'html') {
    const shadow = document.createElement('div');
    shadow.innerHTML = item.content;
    body.appendChild(shadow);
  } else if (item.type === 'code') {
    const pre = document.createElement('pre');
    pre.className = 'canvas-code';
    pre.textContent = item.content;
    body.appendChild(pre);
  } else {
    body.innerHTML = mdRender(item.content);
  }

  card.appendChild(body);
  return card;
}

async function loadCanvas() {
  const grid = q('#canvas-grid');
  if (!grid) return;
  try {
    const r = await api('GET', '/api/canvas?limit=50');
    canvasItems = r.items || [];
    grid.innerHTML = '';
    if (!canvasItems.length) {
      grid.innerHTML = `<div class="empty">${t('canvas.empty')}</div>`;
      q('#canvas-badge') && (q('#canvas-badge').hidden = true);
      return;
    }
    for (const item of canvasItems) grid.appendChild(renderCanvasItem(item));
    const badge = q('#canvas-badge');
    if (badge) { badge.textContent = canvasItems.length; badge.hidden = false; }
  } catch(e) { /* ignore */ }
}

// Poll canvas every 5s when visible
function startCanvasPoll() {
  stopCanvasPoll();
  canvasPollTimer = setInterval(() => {
    if (q('.view[data-view="canvas"]')?.hidden === false) loadCanvas();
  }, 5000);
}
function stopCanvasPoll() {
  if (canvasPollTimer) { clearInterval(canvasPollTimer); canvasPollTimer = null; }
}

q('#canvas-refresh')?.addEventListener('click', loadCanvas);
q('#canvas-clear')?.addEventListener('click', async () => {
  if (!confirm('Clear all canvas items?')) return;
  await api('POST', '/api/canvas/clear');
  await loadCanvas();
  toast('Canvas cleared', 'success');
});

// ── i18n (English / Hebrew) ──────────────────────────────────────────────────

const I18N = {
  en: {
    'nav.capabilities': 'Capabilities',
    'nav.approvals': 'אישורים',
    'approvals.title': 'אישורים',
    'approvals.hint': 'שלטו באילו כלים מותר לסוכנים להפעיל. פתוח: הכל מותר. זהיר: כלים חיצוניים דורשים אישור. מחמיר: הכל דורש אישור.',
    'approvals.policy': 'מדיניות',
    'approvals.tools': 'עקיפות לכלים',
    'nav.canvas': 'לוח',
    'canvas.title': 'לוח',
    'canvas.hint': 'סוכנים דוחפים תוצאות, טבלאות ופלט עשיר לכאן. הכרטיסים נשמרים בין סשנים.',
    'canvas.empty': 'הלוח ריק. בקשו מסוכן לסכם משהו או לדחוף דוח.',
    'cap.canvas.title': 'לוח',
    'cap.canvas.desc': 'סוכנים דוחפים תוצאות, סיכומים, טבלאות ופלט עשיר ללוח ויזואלי חי.',
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
    'nav.approvals': 'Approvals',
    'approvals.title': 'Approvals',
    'approvals.hint': 'Control which tools agents are allowed to run. Open: all tools allowed. Cautious: external tools need approval. Strict: everything needs approval.',
    'approvals.policy': 'Policy',
    'approvals.tools': 'Tool overrides',
    'nav.canvas': 'Canvas',
    'canvas.title': 'Canvas',
    'canvas.hint': 'Agents push results, tables, and rich output here. Cards persist across sessions.',
    'canvas.empty': 'No canvas items yet. Ask an agent to summarize something or push a report.',
    'cap.canvas.title': 'Canvas',
    'cap.canvas.desc': 'Agents push results, summaries, tables, and rich output to a live visual board.',
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
    'cap.firecrawl.title': 'Firecrawl scraper',
    'cap.firecrawl.desc': 'Scrape JS-heavy pages, crawl whole sites, or map all URLs — handles anti-bot and SPA pages.',
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
    'cap.firecrawl.title': 'גריד Firecrawl',
    'cap.firecrawl.desc': 'גרדו דפים כבדי JavaScript, סרקו אתרים שלמים, או מפו את כל ה-URLs — מתמודד עם הגנות אנטי-בוט.',
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
  loadInbox();
  loadCanvas();
  startCanvasPoll();
})();
