#!/usr/bin/env node
// Geoclaw Canvas — a persistent live output board for agent results.
// Agents push cards (markdown, html, table, image) here via canvas_write().
// The web UI polls /api/canvas and renders them in real time.
//
// Storage: ~/.geoclaw/canvas/items.json  (append-only, capped at MAX_ITEMS)

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CANVAS_DIR  = path.join(os.homedir(), '.geoclaw', 'canvas');
const ITEMS_FILE  = path.join(CANVAS_DIR, 'items.json');
const MAX_ITEMS   = 200;

// ── Storage ───────────────────────────────────────────────────────────────────

function ensureDir() { fs.mkdirSync(CANVAS_DIR, { recursive: true }); }

function loadItems() {
  try { return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8')); }
  catch { return []; }
}

function saveItems(items) {
  ensureDir();
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
}

// ── Public API ────────────────────────────────────────────────────────────────

function write({ content, title = '', type = 'markdown', agent = 'agent', tags = [] } = {}) {
  if (!content) throw new Error('canvas_write: content is required');
  const items = loadItems();
  const item = {
    id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,      // 'markdown' | 'html' | 'table' | 'image' | 'code'
    title,
    content,
    agent,
    tags,
    ts: new Date().toISOString(),
  };
  items.push(item);
  // Cap at MAX_ITEMS
  if (items.length > MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS);
  saveItems(items);
  return { ok: true, id: item.id };
}

function list({ limit = 50, tag = null, type = null, agent: agentFilter = null } = {}) {
  let items = loadItems();
  if (tag)          items = items.filter(i => i.tags && i.tags.includes(tag));
  if (type)         items = items.filter(i => i.type === type);
  if (agentFilter)  items = items.filter(i => i.agent === agentFilter);
  return items.slice(-limit).reverse();   // newest first
}

function clear() {
  ensureDir();
  fs.writeFileSync(ITEMS_FILE, '[]');
  return { ok: true };
}

function remove(id) {
  const items = loadItems().filter(i => i.id !== id);
  saveItems(items);
  return { ok: true };
}

module.exports = { write, list, clear, remove, ITEMS_FILE };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const sub  = args[0];

  switch (sub) {
    case 'list': {
      const items = list({ limit: parseInt(args[1] || '20', 10) });
      if (!items.length) { console.log('Canvas is empty.'); break; }
      for (const it of items) {
        console.log(`[${it.ts.slice(0, 19)}] ${it.type.padEnd(8)} ${it.title || '(untitled)'}`);
        console.log(`  ${it.content.slice(0, 120).replace(/\n/g, ' ')}`);
        console.log('');
      }
      break;
    }
    case 'clear':
      clear();
      console.log('Canvas cleared.');
      break;
    case 'write': {
      const content = args.slice(1).join(' ');
      if (!content) { console.log('Usage: geoclaw canvas write <text>'); break; }
      const r = write({ content, title: 'CLI note', type: 'markdown', agent: 'cli' });
      console.log(`Written: ${r.id}`);
      break;
    }
    default:
      console.log('Usage: geoclaw canvas <list [N]|clear|write <text>>');
  }
}
