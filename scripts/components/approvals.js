#!/usr/bin/env node
// Geoclaw exec approval system — controls which tools agents are allowed to run.
//
// Three policies:
//   open     — all tools allowed (default, best for personal use)
//   cautious — require approval for tools that affect the outside world
//   strict   — require approval for all tools except memory/recall
//
// Storage: ~/.geoclaw/approvals.json
// {
//   policy: 'open' | 'cautious' | 'strict',
//   overrides: { 'tool_name': 'allow' | 'deny' }   // per-tool overrides
// }

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_DIR    = path.join(os.homedir(), '.geoclaw');
const APPROVALS_FILE = path.join(CONFIG_DIR, 'approvals.json');

// Tools that affect the outside world — require approval in 'cautious' mode.
const EXTERNAL_TOOLS = new Set([
  'send_telegram',
  'monday_create_item',
  'firecrawl_crawl',
  'web_search',
  'browse',
  'firecrawl_scrape',
  'firecrawl_map',
]);

// Tools always considered safe — never blocked even in 'strict' mode.
const ALWAYS_SAFE = new Set([
  'remember', 'recall',
  'read_skill',
  'canvas_write',
  'design_tokens', 'design_lint', 'design_diff', 'design_export', 'design_init', 'design_suggest',
  'finish',
]);

// ── Config I/O ────────────────────────────────────────────────────────────────

function load() {
  try { return JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8')); }
  catch { return { policy: 'open', overrides: {} }; }
}

function save(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify(cfg, null, 2));
}

// ── Policy check ──────────────────────────────────────────────────────────────

function isAllowed(toolName) {
  const cfg = load();

  // Per-tool override takes precedence
  const override = cfg.overrides?.[toolName];
  if (override === 'allow') return { allowed: true, reason: 'override:allow' };
  if (override === 'deny')  return { allowed: false, reason: 'override:deny',
    message: `Tool "${toolName}" is blocked by your approval policy. Change in Settings → Approvals.` };

  if (cfg.policy === 'open') return { allowed: true, reason: 'policy:open' };

  if (ALWAYS_SAFE.has(toolName)) return { allowed: true, reason: 'always-safe' };

  if (cfg.policy === 'cautious') {
    if (EXTERNAL_TOOLS.has(toolName)) {
      return { allowed: false, reason: 'policy:cautious',
        message: `Tool "${toolName}" requires approval (cautious policy). Allow it in Settings → Approvals, or switch policy to "open".` };
    }
    return { allowed: true, reason: 'policy:cautious:safe' };
  }

  if (cfg.policy === 'strict') {
    return { allowed: false, reason: 'policy:strict',
      message: `Tool "${toolName}" requires approval (strict policy). Allow it in Settings → Approvals.` };
  }

  return { allowed: true, reason: 'fallback' };
}

// ── Setters ───────────────────────────────────────────────────────────────────

function setPolicy(policy) {
  if (!['open', 'cautious', 'strict'].includes(policy)) {
    throw new Error(`Unknown policy "${policy}". Use: open, cautious, strict`);
  }
  const cfg = load();
  cfg.policy = policy;
  save(cfg);
  return { ok: true, policy };
}

function setOverride(toolName, decision) {
  if (!['allow', 'deny', 'remove'].includes(decision)) {
    throw new Error(`Decision must be: allow, deny, remove`);
  }
  const cfg = load();
  if (!cfg.overrides) cfg.overrides = {};
  if (decision === 'remove') delete cfg.overrides[toolName];
  else cfg.overrides[toolName] = decision;
  save(cfg);
  return { ok: true, tool: toolName, decision };
}

function getConfig() {
  const cfg = load();
  return {
    policy:    cfg.policy || 'open',
    overrides: cfg.overrides || {},
    externalTools: [...EXTERNAL_TOOLS],
    alwaysSafe:    [...ALWAYS_SAFE],
  };
}

module.exports = { isAllowed, setPolicy, setOverride, getConfig, EXTERNAL_TOOLS, ALWAYS_SAFE };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const sub  = args[0];

  switch (sub) {
    case 'status': {
      const cfg = getConfig();
      console.log(`Policy:    ${cfg.policy}`);
      const ov = Object.entries(cfg.overrides);
      if (ov.length) {
        console.log('Overrides:');
        ov.forEach(([k, v]) => console.log(`  ${k}: ${v}`));
      }
      break;
    }
    case 'set-policy':
      try { const r = setPolicy(args[1]); console.log(`Policy set to: ${r.policy}`); }
      catch(e) { console.error(e.message); process.exit(1); }
      break;
    case 'allow':
      try { setOverride(args[1], 'allow'); console.log(`${args[1]}: allowed`); }
      catch(e) { console.error(e.message); process.exit(1); }
      break;
    case 'deny':
      try { setOverride(args[1], 'deny'); console.log(`${args[1]}: denied`); }
      catch(e) { console.error(e.message); process.exit(1); }
      break;
    case 'reset':
      try { setOverride(args[1], 'remove'); console.log(`${args[1]}: reset to policy default`); }
      catch(e) { console.error(e.message); process.exit(1); }
      break;
    default:
      console.log('Usage: geoclaw approvals <status|set-policy <open|cautious|strict>|allow <tool>|deny <tool>|reset <tool>>');
  }
}
