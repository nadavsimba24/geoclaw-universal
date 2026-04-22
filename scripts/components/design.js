#!/usr/bin/env node
// Geoclaw design component — DESIGN.md lint/diff/export + tokens parsing.
// Thin wrapper over the @google/design.md CLI (spec: https://github.com/google-labs-code/design.md).
// Pure-JS front-matter parser covers the no-npm path; npx is used for lint/diff/export.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'references', 'design-templates');
const NPX_TIMEOUT_MS = parseInt(process.env.GEOCLAW_DESIGN_NPX_TIMEOUT_MS || '90000', 10);
const NPX_PACKAGE    = process.env.GEOCLAW_DESIGN_PACKAGE || '@google/design.md';

// ── Front-matter / YAML subset parser ─────────────────────────────────────────
// The DESIGN.md spec restricts front matter to maps of scalars and maps of
// maps, which is a tiny subset of YAML. Parsing it in-process avoids pulling
// js-yaml for a hot-path tool.

function stripQuotes(s) {
  if (s.length >= 2 && ((s[0] === '"' && s[s.length-1] === '"') ||
                        (s[0] === "'" && s[s.length-1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerceScalar(v) {
  const s = stripQuotes(v.trim());
  if (s === '') return '';
  if (s === 'true')  return true;
  if (s === 'false') return false;
  if (s === 'null')  return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

// Parse YAML front matter subset: nested maps by indent (2 or 4 spaces), scalars,
// comments with `#`, and blank lines. No arrays / flow style / anchors.
function parseYamlSubset(src) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  const lines = src.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const m = line.match(/^(\s*)([^:\s][^:]*?):(?:\s+(.*))?$/);
    if (!m) continue;
    const indent = m[1].length;
    const key = m[2].trim();
    const rest = (m[3] ?? '').trim();

    while (stack.length > 1 && stack[stack.length-1].indent >= indent) stack.pop();
    const parent = stack[stack.length-1].obj;

    if (rest === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = coerceScalar(rest);
    }
  }
  return root;
}

// Split a DESIGN.md into { frontMatter, body }. Returns null frontMatter if absent.
function splitFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontMatter: null, body: text };
  return { frontMatter: m[1], body: m[2] };
}

function parseTokens(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: `not found: ${abs}` };
  }
  const text = fs.readFileSync(abs, 'utf8');
  const { frontMatter, body } = splitFrontMatter(text);
  const tokens = frontMatter ? parseYamlSubset(frontMatter) : {};
  const sections = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map(x => x[1]);
  return { ok: true, file: abs, tokens, sections };
}

// ── Concise summary, for agents to reason about the palette ───────────────────

function summarize(filePath) {
  const parsed = parseTokens(filePath);
  if (!parsed.ok) return parsed;
  const t = parsed.tokens || {};
  const out = {
    ok: true,
    file: parsed.file,
    name: t.name || null,
    description: t.description || null,
    colors: t.colors ? Object.entries(t.colors).map(([k, v]) => ({ name: k, value: v })) : [],
    typography: t.typography ? Object.keys(t.typography) : [],
    spacing: t.spacing ? Object.keys(t.spacing) : [],
    rounded: t.rounded ? Object.keys(t.rounded) : [],
    components: t.components ? Object.keys(t.components) : [],
    sections: parsed.sections,
  };
  return out;
}

// ── npx @google/design.md wrapper ─────────────────────────────────────────────

function hasCommand(cmd) {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'command -v';
    require('child_process').execSync(`${probe} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function runNpx(args, { stdin } = {}) {
  return new Promise((resolve) => {
    if (!hasCommand('npx')) {
      return resolve({
        ok: false,
        error: 'npx not found — install Node.js/npm to use design_lint / design_diff / design_export.',
      });
    }
    const full = ['-y', NPX_PACKAGE, ...args];
    let out = '', err = '';
    const child = spawn('npx', full, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
    }, NPX_TIMEOUT_MS);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `spawn failed: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // The CLI prints JSON to stdout. On lint errors (warnings/info) it still
      // prints valid JSON but may exit non-zero — treat stdout-as-JSON as the
      // source of truth, and only fall back to stderr if stdout isn't JSON.
      const trimmed = (out || '').trim();
      if (trimmed) {
        try { return resolve({ ok: true, exitCode: code, data: JSON.parse(trimmed) }); }
        catch { /* fall through */ }
      }
      resolve({
        ok: false,
        exitCode: code,
        error: (err || trimmed || `npx ${NPX_PACKAGE} exited ${code}`).slice(0, 800),
      });
    });
    if (stdin) { child.stdin.end(stdin); }
    else       { child.stdin.end(); }
  });
}

async function lint(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return { ok: false, error: `not found: ${abs}` };
  return runNpx(['lint', abs]);
}

async function diff(aPath, bPath) {
  const a = path.resolve(aPath), b = path.resolve(bPath);
  if (!fs.existsSync(a)) return { ok: false, error: `not found: ${a}` };
  if (!fs.existsSync(b)) return { ok: false, error: `not found: ${b}` };
  return runNpx(['diff', a, b]);
}

async function exportFormat(filePath, format) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return { ok: false, error: `not found: ${abs}` };
  const fmt = String(format || '').toLowerCase();
  if (!['tailwind', 'dtcg'].includes(fmt)) {
    return { ok: false, error: `format must be "tailwind" or "dtcg" (got "${format}")` };
  }
  return runNpx(['export', abs, '--format', fmt]);
}

// ── Scaffolding new DESIGN.md files from built-in templates ───────────────────

function listTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

function init(outPath, { template = 'editorial', name } = {}) {
  const tpl = path.join(TEMPLATES_DIR, `${template}.md`);
  if (!fs.existsSync(tpl)) {
    return {
      ok: false,
      error: `template "${template}" not found. Available: ${listTemplates().join(', ') || '(none)'}`,
    };
  }
  const abs = path.resolve(outPath);
  if (fs.existsSync(abs)) {
    return { ok: false, error: `refusing to overwrite ${abs} — delete or pick a new path` };
  }
  let src = fs.readFileSync(tpl, 'utf8');
  if (name) {
    // Replace the `name:` field in the front matter with the user's brand name.
    src = src.replace(/^name:\s*.*$/m, `name: ${name}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, src);
  return { ok: true, file: abs, template, bytes: src.length };
}

// ── Component-snippet suggester (tokens → HTML/CSS/React) ─────────────────────
// Agents call this to get an on-brand snippet for a button, card, input, or
// heading without having to reason about tokens themselves.

function ref(tokens, pathStr) {
  const parts = pathStr.split('.');
  let v = tokens;
  for (const p of parts) { if (!v || typeof v !== 'object') return undefined; v = v[p]; }
  return v;
}

// Resolve "{colors.primary}" style references against the token tree.
function resolveRef(tokens, value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\{([^}]+)\}$/);
  return m ? (ref(tokens, m[1]) ?? value) : value;
}

function suggestSnippet(filePath, component) {
  const parsed = parseTokens(filePath);
  if (!parsed.ok) return parsed;
  const t = parsed.tokens || {};
  const colors = t.colors || {};
  const rounded = t.rounded || {};
  const typo = t.typography || {};

  const primary   = colors.primary   || '#111';
  const tertiary  = colors.tertiary  || colors.secondary || '#0a84ff';
  const neutral   = colors.neutral   || '#fafafa';
  const onPrimary = colors['on-primary'] || neutral;
  const radius    = rounded.md || rounded.sm || '8px';

  const c = String(component || '').toLowerCase();

  const snippets = {
    button: {
      html:
`<button class="btn-primary">Continue</button>

<style>
.btn-primary {
  background: ${tertiary};
  color: ${onPrimary};
  border: 0;
  padding: 12px 20px;
  border-radius: ${radius};
  font-family: ${typo['body-md']?.fontFamily || 'inherit'};
  font-size: 1rem;
  cursor: pointer;
  transition: filter 120ms ease;
}
.btn-primary:hover { filter: brightness(0.92); }
</style>`,
      react:
`export function PrimaryButton({ children, ...p }) {
  return (
    <button
      {...p}
      style={{
        background: '${tertiary}',
        color: '${onPrimary}',
        border: 0,
        padding: '12px 20px',
        borderRadius: '${radius}',
        fontSize: '1rem',
        cursor: 'pointer',
      }}
    >{children}</button>
  );
}`,
    },
    card: {
      html:
`<article class="card">
  <h3>Card title</h3>
  <p>Supporting copy goes here.</p>
</article>

<style>
.card {
  background: ${neutral};
  color: ${primary};
  padding: 24px;
  border-radius: ${radius};
  box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.06);
}
.card h3 { margin: 0 0 8px; font-size: 1.25rem; }
.card p  { margin: 0; opacity: .8; }
</style>`,
    },
    input: {
      html:
`<label class="field">
  <span>Email</span>
  <input type="email" placeholder="you@example.com" />
</label>

<style>
.field { display: grid; gap: 6px; font-size: 0.875rem; color: ${primary}; }
.field input {
  padding: 10px 12px;
  border: 1px solid ${colors.secondary || '#d0d4d8'};
  border-radius: ${radius};
  background: ${neutral};
  color: ${primary};
  font: inherit;
}
.field input:focus { outline: 2px solid ${tertiary}; outline-offset: 1px; }
</style>`,
    },
    heading: {
      html:
`<h1 class="display">${t.name || 'Heading'}</h1>

<style>
.display {
  font-family: ${typo.h1?.fontFamily || typo['headline-lg']?.fontFamily || 'inherit'};
  font-size: ${typo.h1?.fontSize || '3rem'};
  font-weight: ${typo.h1?.fontWeight || 600};
  color: ${primary};
  letter-spacing: ${typo.h1?.letterSpacing || '-0.02em'};
  line-height: ${typo.h1?.lineHeight || 1.1};
  margin: 0;
}
</style>`,
    },
  };

  const snippet = snippets[c];
  if (!snippet) {
    return {
      ok: false,
      error: `unknown component "${component}". Supported: ${Object.keys(snippets).join(', ')}`,
    };
  }
  return {
    ok: true,
    file: parsed.file,
    component: c,
    tokensUsed: { primary, tertiary, neutral, radius },
    snippet,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function usage() {
  console.log(`
Usage: geoclaw design <command> [args]

Commands:
  tokens <file>                 show parsed tokens + sections for a DESIGN.md
  summary <file>                concise summary of the design system
  lint <file>                   run @google/design.md lint (via npx)
  diff <a> <b>                  compare two DESIGN.md files (via npx)
  export <file> tailwind|dtcg   export tokens to a downstream format
  init <out> [template] [name]  scaffold a new DESIGN.md from a starter
  suggest <file> <component>    button | card | input | heading
  templates                     list built-in templates

Env:
  GEOCLAW_DESIGN_PACKAGE        default: @google/design.md
  GEOCLAW_DESIGN_NPX_TIMEOUT_MS default: 90000
`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();

  try {
    switch (cmd) {
      case 'tokens':   { console.log(JSON.stringify(parseTokens(rest[0]), null, 2)); return; }
      case 'summary':  { console.log(JSON.stringify(summarize(rest[0]), null, 2)); return; }
      case 'lint':     { console.log(JSON.stringify(await lint(rest[0]), null, 2)); return; }
      case 'diff':     { console.log(JSON.stringify(await diff(rest[0], rest[1]), null, 2)); return; }
      case 'export':   { console.log(JSON.stringify(await exportFormat(rest[0], rest[1]), null, 2)); return; }
      case 'init':     { console.log(JSON.stringify(init(rest[0], { template: rest[1], name: rest[2] }), null, 2)); return; }
      case 'suggest':  { console.log(JSON.stringify(suggestSnippet(rest[0], rest[1]), null, 2)); return; }
      case 'templates':{ console.log(JSON.stringify({ ok: true, templates: listTemplates() }, null, 2)); return; }
      default: usage(); process.exit(1);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseTokens,
  summarize,
  lint,
  diff,
  exportFormat,
  init,
  listTemplates,
  suggestSnippet,
};

if (require.main === module) main();
