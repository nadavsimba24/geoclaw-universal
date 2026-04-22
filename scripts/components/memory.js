#!/usr/bin/env node
// Geoclaw persistent memory — the knowledge base for all agents and sessions

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Storage ───────────────────────────────────────────────────────────────────
// Lives in the user's home so it survives geoclaw reinstalls.

const DATA_DIR = path.join(os.homedir(), '.geoclaw');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, '[]', 'utf8');
}

function load() {
  ensureStore();
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); }
  catch { return []; }
}

function save(memories) {
  ensureStore();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
}

// ── Core operations ───────────────────────────────────────────────────────────

function remember(text, meta = {}) {
  if (!text || !text.trim()) throw new Error('memory text is empty');
  const memories = load();
  const id = 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = {
    id,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    type: meta.type || 'fact',
    source: meta.source || null,
    tags: meta.tags || [],
  };
  memories.push(entry);
  save(memories);
  return entry;
}

function forget(id) {
  const memories = load();
  const before = memories.length;
  const filtered = memories.filter(m => m.id !== id);
  if (filtered.length === before) return false;
  save(filtered);
  return true;
}

function list(filter = {}) {
  const memories = load();
  return memories.filter(m => {
    if (filter.type && m.type !== filter.type) return false;
    if (filter.source && m.source !== filter.source) return false;
    if (filter.tag && !(m.tags || []).includes(filter.tag)) return false;
    return true;
  });
}

// ── Relevance scoring (token-overlap + substring, no embeddings needed) ───────

function tokenize(s) {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function scoreRelevance(query, text) {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return 0;
  const tTokens = tokenize(text);
  let overlap = 0;
  for (const w of tTokens) if (qTokens.has(w)) overlap++;
  // normalize by query length, then boost substring hits
  let score = overlap / qTokens.size;
  if (text.toLowerCase().includes(query.toLowerCase())) score += 1.0;
  return score;
}

function recall(query, limit = 5) {
  const memories = load();
  return memories
    .map(m => ({ ...m, score: scoreRelevance(query, m.text) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Get recent memories regardless of query (for context at chat start)
function recent(limit = 10, type = null) {
  const memories = load();
  const filtered = type ? memories.filter(m => m.type === type) : memories;
  return filtered.slice(-limit).reverse();
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

function main() {
  const [sub, ...args] = process.argv.slice(2);

  switch (sub) {
    case 'remember': {
      const text = args.join(' ').trim();
      if (!text) {
        console.error('Usage: geoclaw remember "your fact or note"');
        process.exit(1);
      }
      const entry = remember(text);
      console.log(`✓ remembered: ${entry.id}`);
      break;
    }

    case 'recall': {
      const query = args.join(' ').trim();
      if (!query) {
        console.error('Usage: geoclaw recall "what you want to find"');
        process.exit(1);
      }
      const hits = recall(query, 10);
      if (hits.length === 0) {
        console.log('(no memories found)');
        break;
      }
      console.log(`\n📚 Found ${hits.length} memory(ies):\n`);
      hits.forEach(printMem);
      break;
    }

    case 'list': {
      const memories = list();
      if (memories.length === 0) {
        console.log('(no memories yet — use: geoclaw remember "...")');
        break;
      }
      console.log(`\n📚 ${memories.length} memory(ies):\n`);
      memories.forEach(printMem);
      break;
    }

    case 'forget': {
      const id = args[0];
      if (!id) {
        console.error('Usage: geoclaw forget <memory-id>');
        process.exit(1);
      }
      if (forget(id)) console.log(`✓ forgotten ${id}`);
      else            console.log(`✗ no memory with id ${id}`);
      break;
    }

    case 'stats': {
      const memories = load();
      const byType = {};
      for (const m of memories) byType[m.type] = (byType[m.type] || 0) + 1;
      console.log(`\n📊 Memory stats\n`);
      console.log(`  Total:    ${memories.length}`);
      console.log(`  Storage:  ${MEMORY_FILE}`);
      console.log(`  By type:`);
      for (const [t, n] of Object.entries(byType)) console.log(`    ${t}: ${n}`);
      console.log('');
      break;
    }

    case 'export': {
      const out = args[0];
      if (!out) { console.error('Usage: geoclaw memory export <file>'); process.exit(1); }
      fs.copyFileSync(MEMORY_FILE, out);
      console.log(`✓ exported to ${out}`);
      break;
    }

    case 'clear': {
      if (!args.includes('--yes')) {
        console.log('This will delete ALL memories. Re-run with --yes to confirm:');
        console.log('  geoclaw memory clear --yes');
        break;
      }
      save([]);
      console.log('✓ all memories cleared');
      break;
    }

    default:
      console.log(`
Usage: geoclaw memory <subcommand>

Subcommands:
  remember "text"    Save a new memory
  recall "query"     Search memories by relevance
  list               Show all memories
  forget <id>        Delete a memory
  stats              Show memory statistics
  export <file>      Export memories to JSON file
  clear --yes        Delete ALL memories

Shortcut forms (top-level):
  geoclaw remember "text"
  geoclaw recall "query"
  geoclaw forget <id>

Storage: ${MEMORY_FILE}
`);
  }
}

module.exports = { remember, recall, forget, list, recent, load, save, MEMORY_FILE };

if (require.main === module) main();
