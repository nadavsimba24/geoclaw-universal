#!/usr/bin/env node
// Geoclaw persistent memory — workspace-aware, concurrency-safe knowledge base.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Layout ────────────────────────────────────────────────────────────────────
//   ~/.geoclaw/
//     active-workspace            current workspace name (fallback: "default")
//     workspaces/
//       <name>/
//         memory.json             { version, entries: [...] }
//         memory.lock             lock file (only present during writes)

const DATA_DIR = path.join(os.homedir(), '.geoclaw');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');
const ACTIVE_FILE = path.join(DATA_DIR, 'active-workspace');
const LEGACY_FILE = path.join(DATA_DIR, 'memory.json');
const DEFAULT_WORKSPACE = 'default';

// ── Workspace resolution ──────────────────────────────────────────────────────

function validWorkspaceName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_\-]{0,63}$/.test(name);
}

function activeWorkspace() {
  const fromEnv = process.env.GEOCLAW_WORKSPACE;
  if (fromEnv && validWorkspaceName(fromEnv)) return fromEnv;
  try {
    const name = fs.readFileSync(ACTIVE_FILE, 'utf8').trim();
    if (validWorkspaceName(name)) return name;
  } catch {}
  return DEFAULT_WORKSPACE;
}

function workspaceDir(name = activeWorkspace()) {
  if (!validWorkspaceName(name)) throw new Error(`Invalid workspace name: ${name}`);
  return path.join(WORKSPACES_DIR, name);
}

function memoryFile(name = activeWorkspace()) {
  return path.join(workspaceDir(name), 'memory.json');
}

function lockFile(name = activeWorkspace()) {
  return path.join(workspaceDir(name), 'memory.lock');
}

// ── One-time migration from the flat pre-workspace layout ─────────────────────

let migrated = false;
function migrateIfNeeded() {
  if (migrated) return;
  migrated = true;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  const defaultDir = path.join(WORKSPACES_DIR, DEFAULT_WORKSPACE);
  if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
  const defaultMem = path.join(defaultDir, 'memory.json');
  if (fs.existsSync(LEGACY_FILE) && !fs.existsSync(defaultMem)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
      const entries = Array.isArray(legacy) ? legacy : (legacy.entries || []);
      fs.writeFileSync(defaultMem, JSON.stringify({ version: 2, entries }, null, 2), 'utf8');
      fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.migrated');
    } catch (e) {
      console.error(`⚠  Could not migrate legacy memory.json: ${e.message}`);
    }
  }
}

function ensureWorkspace(name = activeWorkspace()) {
  migrateIfNeeded();
  const dir = workspaceDir(name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = memoryFile(name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ version: 2, entries: [] }, null, 2), 'utf8');
}

// ── File locking (multi-process safe via O_EXCL lock file) ────────────────────

const LOCK_STALE_MS = 10_000;
const LOCK_MAX_WAIT_MS = 5_000;

function acquireLock(lockPath) {
  const start = Date.now();
  while (Date.now() - start < LOCK_MAX_WAIT_MS) {
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          try { fs.unlinkSync(lockPath); } catch {}
          continue;
        }
      } catch {}
      const until = Date.now() + 25 + Math.floor(Math.random() * 50);
      // Busy-wait briefly — keeps the hot path synchronous and predictable.
      while (Date.now() < until) {}
    }
  }
  throw new Error(`Could not acquire memory lock at ${lockPath} (held >${LOCK_MAX_WAIT_MS}ms)`);
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch {}
}

// ── Load / atomic save ────────────────────────────────────────────────────────

function loadRaw(name = activeWorkspace()) {
  ensureWorkspace(name);
  const file = memoryFile(name);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) return { version: 2, entries: parsed };
    if (!Array.isArray(parsed.entries)) return { version: 2, entries: [] };
    return parsed;
  } catch {
    return { version: 2, entries: [] };
  }
}

function load(name = activeWorkspace()) {
  return loadRaw(name).entries;
}

function saveAtomic(store, name = activeWorkspace()) {
  ensureWorkspace(name);
  const file = memoryFile(name);
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify({ version: 2, entries: store }, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function mutate(fn, name = activeWorkspace()) {
  ensureWorkspace(name);
  const lock = lockFile(name);
  acquireLock(lock);
  try {
    const entries = load(name);
    const result = fn(entries);
    saveAtomic(entries, name);
    return result;
  } finally {
    releaseLock(lock);
  }
}

// ── Core operations ───────────────────────────────────────────────────────────

function newId() {
  return 'mem_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function remember(text, meta = {}, opts = {}) {
  if (!text || !text.trim()) throw new Error('memory text is empty');
  const ws = opts.workspace || activeWorkspace();
  const trimmed = text.trim();
  const hash = contentHash(trimmed);
  return mutate((entries) => {
    if (opts.dedup) {
      const dup = entries.find(e => e.hash === hash && e.source === (meta.source || null));
      if (dup) return Object.assign({}, dup, { _deduped: true });
    }
    const entry = {
      id: newId(),
      text: trimmed,
      hash,
      timestamp: new Date().toISOString(),
      type: meta.type || 'fact',
      source: meta.source || null,
      tags: meta.tags || [],
      workspace: ws,
    };
    entries.push(entry);
    return entry;
  }, ws);
}

function forget(id, opts = {}) {
  const ws = opts.workspace || activeWorkspace();
  return mutate((entries) => {
    const i = entries.findIndex(e => e.id === id);
    if (i < 0) return false;
    entries.splice(i, 1);
    return true;
  }, ws);
}

function forgetBySource(source, opts = {}) {
  const ws = opts.workspace || activeWorkspace();
  return mutate((entries) => {
    const before = entries.length;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].source === source) entries.splice(i, 1);
    }
    return before - entries.length;
  }, ws);
}

function list(filter = {}, opts = {}) {
  const ws = opts.workspace || activeWorkspace();
  return load(ws).filter(m => {
    if (filter.type && m.type !== filter.type) return false;
    if (filter.source && m.source !== filter.source) return false;
    if (filter.tag && !(m.tags || []).includes(filter.tag)) return false;
    return true;
  });
}

// ── Relevance scoring (token-overlap + substring, no embeddings) ──────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
  'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its',
  'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'have', 'this',
  'from', 'they', 'will', 'your', 'what', 'when', 'there', 'which', 'their',
]);

function tokenize(s) {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

function scoreRelevance(query, text) {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return 0;
  const tTokens = tokenize(text);
  let overlap = 0;
  for (const w of tTokens) if (qTokens.has(w)) overlap++;
  let score = overlap / qTokens.size;
  if (text.toLowerCase().includes(query.toLowerCase())) score += 1.0;
  return score;
}

function recall(query, limit = 5, opts = {}) {
  const ws = opts.workspace || activeWorkspace();
  return load(ws)
    .map(m => ({ ...m, score: scoreRelevance(query, m.text) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function recent(limit = 10, type = null, opts = {}) {
  const ws = opts.workspace || activeWorkspace();
  const all = load(ws);
  const filtered = type ? all.filter(m => m.type === type) : all;
  return filtered.slice(-limit).reverse();
}

// ── Workspace management ──────────────────────────────────────────────────────

function listWorkspaces() {
  migrateIfNeeded();
  if (!fs.existsSync(WORKSPACES_DIR)) return [];
  return fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && validWorkspaceName(d.name))
    .map(d => d.name)
    .sort();
}

function createWorkspace(name) {
  if (!validWorkspaceName(name)) {
    throw new Error('Workspace names must be 1–64 chars: letters, digits, dash, underscore (must start alphanumeric).');
  }
  ensureWorkspace(name);
  return name;
}

function useWorkspace(name) {
  if (!validWorkspaceName(name)) throw new Error(`Invalid workspace name: ${name}`);
  ensureWorkspace(name);
  migrateIfNeeded();
  fs.writeFileSync(ACTIVE_FILE, name, 'utf8');
  return name;
}

function deleteWorkspace(name) {
  if (name === DEFAULT_WORKSPACE) throw new Error('Cannot delete the default workspace.');
  if (!validWorkspaceName(name)) throw new Error(`Invalid workspace name: ${name}`);
  const dir = workspaceDir(name);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  if (activeWorkspace() === name) {
    try { fs.unlinkSync(ACTIVE_FILE); } catch {}
  }
  return true;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function printMem(m) {
  const date = new Date(m.timestamp).toLocaleString();
  const tags = m.tags && m.tags.length ? `  [${m.tags.join(', ')}]` : '';
  const src  = m.source ? `  (source: ${m.source})` : '';
  console.log(`  ${m.id}  ${date}${tags}${src}`);
  console.log(`    ${m.text.replace(/\n/g, '\n    ')}`);
  if (m.score !== undefined) console.log(`    \x1b[90mscore: ${m.score.toFixed(2)}\x1b[0m`);
  console.log('');
}

function workspaceCLI(args) {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'list':
    case undefined: {
      const all = listWorkspaces();
      const active = activeWorkspace();
      if (all.length === 0) {
        console.log('(no workspaces — the default one will be created on first use)');
        return;
      }
      console.log('\n📁 Workspaces:\n');
      for (const w of all) {
        const marker = w === active ? '\x1b[32m●\x1b[0m' : ' ';
        const count = load(w).length;
        console.log(`  ${marker} ${w}  \x1b[90m(${count} memories)\x1b[0m`);
      }
      console.log(`\nActive: ${active}\n`);
      break;
    }
    case 'create': {
      const name = rest[0];
      if (!name) { console.error('Usage: geoclaw workspace create <name>'); process.exit(1); }
      createWorkspace(name);
      console.log(`✓ created workspace: ${name}`);
      break;
    }
    case 'use': {
      const name = rest[0];
      if (!name) { console.error('Usage: geoclaw workspace use <name>'); process.exit(1); }
      useWorkspace(name);
      console.log(`✓ active workspace: ${name}`);
      break;
    }
    case 'current': {
      console.log(activeWorkspace());
      break;
    }
    case 'delete': {
      const name = rest[0];
      if (!name) { console.error('Usage: geoclaw workspace delete <name>'); process.exit(1); }
      if (!rest.includes('--yes')) {
        console.log(`This will delete workspace "${name}" and ALL its memories.`);
        console.log(`Re-run with --yes to confirm:  geoclaw workspace delete ${name} --yes`);
        return;
      }
      const ok = deleteWorkspace(name);
      console.log(ok ? `✓ deleted workspace: ${name}` : `✗ no workspace named ${name}`);
      break;
    }
    default:
      console.log(`
Usage: geoclaw workspace <subcommand>

Subcommands:
  list                   Show all workspaces (default)
  create <name>          Create a new workspace
  use <name>             Make this workspace active
  current                Print the active workspace name
  delete <name> --yes    Delete a workspace and all its memories

Override per-command via:  GEOCLAW_WORKSPACE=<name> geoclaw <cmd>
`);
  }
}

function main() {
  const [sub, ...args] = process.argv.slice(2);

  switch (sub) {
    case 'workspace':
      workspaceCLI(args);
      break;

    case 'remember': {
      const text = args.join(' ').trim();
      if (!text) { console.error('Usage: geoclaw remember "your fact or note"'); process.exit(1); }
      const entry = remember(text);
      console.log(`✓ remembered: ${entry.id}  (workspace: ${activeWorkspace()})`);
      break;
    }

    case 'recall': {
      const query = args.join(' ').trim();
      if (!query) { console.error('Usage: geoclaw recall "what you want to find"'); process.exit(1); }
      const hits = recall(query, 10);
      if (hits.length === 0) { console.log('(no memories found)'); break; }
      console.log(`\n📚 Found ${hits.length} memory(ies) in workspace "${activeWorkspace()}":\n`);
      hits.forEach(printMem);
      break;
    }

    case 'list': {
      const memories = list();
      if (memories.length === 0) {
        console.log('(no memories yet — use: geoclaw remember "...")');
        break;
      }
      console.log(`\n📚 ${memories.length} memory(ies) in workspace "${activeWorkspace()}":\n`);
      memories.forEach(printMem);
      break;
    }

    case 'forget': {
      const id = args[0];
      if (!id) { console.error('Usage: geoclaw forget <memory-id>'); process.exit(1); }
      if (forget(id)) console.log(`✓ forgotten ${id}`);
      else            console.log(`✗ no memory with id ${id}`);
      break;
    }

    case 'stats': {
      const ws = activeWorkspace();
      const memories = load(ws);
      const byType = {};
      for (const m of memories) byType[m.type] = (byType[m.type] || 0) + 1;
      console.log(`\n📊 Memory stats (workspace: ${ws})\n`);
      console.log(`  Total:    ${memories.length}`);
      console.log(`  Storage:  ${memoryFile(ws)}`);
      console.log(`  By type:`);
      for (const [t, n] of Object.entries(byType)) console.log(`    ${t}: ${n}`);
      console.log('');
      break;
    }

    case 'export': {
      const out = args[0];
      if (!out) { console.error('Usage: geoclaw memory export <file>'); process.exit(1); }
      fs.copyFileSync(memoryFile(), out);
      console.log(`✓ exported workspace "${activeWorkspace()}" to ${out}`);
      break;
    }

    case 'clear': {
      if (!args.includes('--yes')) {
        console.log(`This will delete ALL memories in workspace "${activeWorkspace()}". Re-run with --yes to confirm:`);
        console.log('  geoclaw memory clear --yes');
        break;
      }
      mutate((entries) => { entries.length = 0; });
      console.log(`✓ all memories cleared in workspace "${activeWorkspace()}"`);
      break;
    }

    default:
      console.log(`
Usage: geoclaw memory <subcommand>

Memory subcommands:
  remember "text"        Save a new memory
  recall "query"         Search memories by relevance
  list                   Show all memories in the active workspace
  forget <id>            Delete a memory
  stats                  Show memory statistics
  export <file>          Export active workspace to a JSON file
  clear --yes            Delete ALL memories in the active workspace

Workspaces:
  geoclaw workspace list | create <n> | use <n> | current | delete <n> --yes

Shortcut forms (top-level):
  geoclaw remember "text"
  geoclaw recall "query"
  geoclaw forget <id>

Storage: ${WORKSPACES_DIR}
Active:  ${activeWorkspace()}
`);
  }
}

module.exports = {
  remember, recall, forget, forgetBySource, list, recent, load,
  activeWorkspace, listWorkspaces, createWorkspace, useWorkspace, deleteWorkspace,
  memoryFile, contentHash,
  MEMORY_FILE: memoryFile(),
  WORKSPACES_DIR,
};

if (require.main === module) main();
