#!/usr/bin/env node
// Session memory — inspired by claude-mem (thedotmack/claude-mem).
// Records what the agent did each run (tools used, files touched, summary)
// and injects a compact "recent activity" block into future agent system prompts.
// Storage: ~/.geoclaw/sessions/YYYY-MM-DD.jsonl  capped at MAX_ENTRIES total.

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SESSIONS_DIR     = path.join(os.homedir(), '.geoclaw', 'sessions');
const MAX_ENTRIES      = 500;
const MAX_INJECT       = 8;
const MAX_INJECT_CHARS = 2000;

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function todayFile() {
  ensureDir(SESSIONS_DIR);
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return path.join(SESSIONS_DIR, `${ymd}.jsonl`);
}

function readAll() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();
  const entries = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')
      .split('\n').filter(Boolean);
    for (const l of lines.reverse()) {
      try { entries.push(JSON.parse(l)); } catch {}
    }
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries.slice(0, MAX_ENTRIES);
}

function write(entry = {}) {
  ensureDir(SESSIONS_DIR);
  const record = { ts: new Date().toISOString(), ...entry };
  fs.appendFileSync(todayFile(), JSON.stringify(record) + '\n', 'utf8');
  pruneOldFiles();
  return record;
}

function pruneOldFiles() {
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();
  let total = 0;
  for (const f of files) {
    const fp = path.join(SESSIONS_DIR, f);
    const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).length;
    total += lines;
    if (total > MAX_ENTRIES) fs.unlinkSync(fp);
  }
}

function list(n = 20) { return readAll().slice(0, n); }

function clear() {
  if (!fs.existsSync(SESSIONS_DIR)) return { ok: true, removed: 0 };
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
  files.forEach(f => fs.unlinkSync(path.join(SESSIONS_DIR, f)));
  return { ok: true, removed: files.length };
}

function buildContextSummary() {
  const recent = readAll().slice(0, MAX_INJECT);
  if (!recent.length) return '';
  const lines = recent.map(e => {
    const time = e.ts ? new Date(e.ts).toLocaleString() : '?';
    const parts = [];
    if (e.userMsg)             parts.push(`"${String(e.userMsg).slice(0, 80)}"`);
    if (e.toolsUsed?.length)   parts.push(`tools: ${e.toolsUsed.slice(0, 5).join(', ')}`);
    if (e.filesEdited?.length) parts.push(`edited: ${e.filesEdited.slice(0, 3).join(', ')}`);
    if (e.summary)             parts.push(e.summary.slice(0, 120));
    return `• [${time}] ${parts.join(' | ')}`;
  });
  const body = lines.join('\n');
  const truncated = body.length > MAX_INJECT_CHARS
    ? body.slice(0, MAX_INJECT_CHARS) + '\n… [older sessions omitted]'
    : body;
  return `\n## Recent session memory (last ${recent.length} sessions)\n${truncated}\n`;
}

function main(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === 'help') {
    console.log(`\nUsage: geoclaw memory <command>\n\nCommands:\n  list [n]   Show last n sessions (default: 20)\n  clear      Delete all session history\n  summary    Print the context injected into agents\n`);
    return;
  }
  if (cmd === 'list') {
    const n = parseInt(argv[1] || '20', 10);
    const entries = list(n);
    if (!entries.length) { console.log('No session history yet.'); return; }
    console.log(`\n📋 Last ${entries.length} sessions:\n`);
    for (const e of entries) {
      const time = e.ts ? new Date(e.ts).toLocaleString() : '?';
      console.log(`  [${time}]`);
      if (e.userMsg)             console.log(`    prompt:  ${String(e.userMsg).slice(0, 100)}`);
      if (e.toolsUsed?.length)   console.log(`    tools:   ${e.toolsUsed.join(', ')}`);
      if (e.filesEdited?.length) console.log(`    edited:  ${e.filesEdited.join(', ')}`);
      if (e.summary)             console.log(`    summary: ${e.summary.slice(0, 120)}`);
      console.log();
    }
    return;
  }
  if (cmd === 'clear') {
    const r = clear();
    console.log(`✅ Cleared ${r.removed} session file(s).`);
    return;
  }
  if (cmd === 'summary') {
    console.log(buildContextSummary() || '(no session history)');
    return;
  }
  console.log(`Unknown command: ${cmd}`);
  process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { write, list, clear, buildContextSummary };
