#!/usr/bin/env node
// Geoclaw skills — manage SKILL.md-format skills.
// Compatible with skills-il (https://github.com/skills-il), vercel-labs/skills,
// and Anthropic's agent skill format (YAML front matter + Markdown body).
//
// Skills live in three places:
//   ~/.geoclaw/skills/<name>/SKILL.md   (global — available in every workspace)
//   ./.geoclaw/skills/<name>/SKILL.md   (project — committed with the repo)
//   ./skills/<name>/SKILL.md            (project, skills-il default layout)

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');
const { URL } = require('url');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch {}

const { env } = require('./env.js');

const GLOBAL_SKILLS  = path.join(os.homedir(), '.geoclaw', 'skills');
const PROJECT_SKILLS_A = path.join(process.cwd(), '.geoclaw', 'skills');
const PROJECT_SKILLS_B = path.join(process.cwd(), 'skills');
// Other agents' global skill dirs — skills-il and similar installers drop
// skills into these. We read them too so users don't need to manually mirror.
const FOREIGN_GLOBAL_ROOTS = [
  path.join(os.homedir(), '.agents',   'skills'),
  path.join(os.homedir(), '.claude',   'skills'),
  path.join(os.homedir(), '.codex',    'skills'),
  path.join(os.homedir(), '.cursor',   'skills'),
  path.join(os.homedir(), '.opencode', 'skills'),
  path.join(os.homedir(), '.openclaw', 'skills'),
];
const SKILLS_IL_PACKAGE = process.env.GEOCLAW_SKILLS_PACKAGE || 'skills-il';
const NPX_TIMEOUT_MS    = parseInt(process.env.GEOCLAW_SKILLS_NPX_TIMEOUT_MS || '120000', 10);

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

// ── YAML front-matter parser (minimal, same subset as design.js) ─────────────
// Skills only use scalar keys in front matter (name, description, license),
// so this stays small.

function splitFrontMatter(src) {
  if (!src.startsWith('---')) return { fm: null, body: src };
  const end = src.indexOf('\n---', 3);
  if (end < 0) return { fm: null, body: src };
  const fm = src.slice(4, end).trim();
  const body = src.slice(end + 4).replace(/^\r?\n/, '');
  return { fm, body };
}

function parseFrontMatter(fm) {
  const out = {};
  if (!fm) return out;
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

// ── Discovery ────────────────────────────────────────────────────────────────

function* walkSkillDirs(root, scope) {
  if (!fs.existsSync(root)) return;
  // Flat layout: root/<name>/SKILL.md
  // Nested layout (skills-il / openclaw): root/<category>/<name>/SKILL.md
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const direct = path.join(dir, 'SKILL.md');
    if (fs.existsSync(direct)) { yield { dir, file: direct, scope }; continue; }
    // One level deeper (category-grouped repos)
    const subEntries = fs.readdirSync(dir, { withFileTypes: true });
    for (const s of subEntries) {
      if (!s.isDirectory()) continue;
      const f = path.join(dir, s.name, 'SKILL.md');
      if (fs.existsSync(f)) yield { dir: path.join(dir, s.name), file: f, scope };
    }
  }
}

function listSkills({ includeGlobal = true, includeProject = true, includeForeign = true } = {}) {
  const roots = [];
  if (includeProject) {
    if (fs.existsSync(PROJECT_SKILLS_A)) roots.push([PROJECT_SKILLS_A, 'project']);
    if (fs.existsSync(PROJECT_SKILLS_B)) roots.push([PROJECT_SKILLS_B, 'project']);
  }
  if (includeGlobal) roots.push([GLOBAL_SKILLS, 'global']);
  if (includeForeign) {
    for (const r of FOREIGN_GLOBAL_ROOTS) {
      if (fs.existsSync(r)) roots.push([r, 'global']);
    }
  }

  const seen = new Set();
  const out = [];
  for (const [root, scope] of roots) {
    for (const { dir, file, scope: sc } of walkSkillDirs(root, scope)) {
      try {
        const src = fs.readFileSync(file, 'utf8');
        const { fm, body } = splitFrontMatter(src);
        const meta = parseFrontMatter(fm);
        const name = meta.name || path.basename(dir);
        if (seen.has(name)) continue;   // project overrides global
        seen.add(name);
        out.push({
          name,
          description: meta.description || '',
          license: meta.license || '',
          scope: sc,
          dir,
          file,
          hasScripts: fs.existsSync(path.join(dir, 'scripts')),
          hasReferences: fs.existsSync(path.join(dir, 'references')),
          bodyLength: body.length,
        });
      } catch {}
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function getSkill(name) {
  const all = listSkills({});
  return all.find(s => s.name === name) || null;
}

function readSkillBody(name) {
  const s = getSkill(name);
  if (!s) return null;
  return fs.readFileSync(s.file, 'utf8');
}

function removeSkill(name) {
  const s = getSkill(name);
  if (!s) throw new Error(`skill not found: ${name}`);
  // Only remove from its own dir, never reach above it.
  fs.rmSync(s.dir, { recursive: true, force: true });
  return { ok: true, removed: s.dir, name };
}

// ── System-prompt manifest (injected into agent / chat) ──────────────────────

function buildSkillsManifest({ max = 40 } = {}) {
  const skills = listSkills({}).slice(0, max);
  if (!skills.length) {
    return [
      '',
      'No domain-specific skills are installed. If the user asks about a specialized topic (Israeli taxes/VAT, Hebrew content, olim paperwork, small-business bookkeeping, legal compliance, etc.) tell them — in their language — that you can install relevant expertise via the `skills-il` registry. Suggest one of:',
      '- `geoclaw skills install-bundle israeli-tax-season`   (VAT, annual returns, withholding)',
      '- `geoclaw skills install-bundle freelancer-accountant` (invoicing, bookkeeping)',
      '- `geoclaw skills install-bundle small-business-starter` (invoicing, payroll, payment chasing)',
      '- `geoclaw skills install-bundle hebrew-first` (Hebrew writing, RTL, accessibility)',
      'Or in the web UI: Skills pane → + Install. Do NOT invent skill names — only suggest bundles from the list above.',
    ].join('\n');
  }
  const lines = skills.map(s => {
    const desc = (s.description || '').replace(/\s+/g, ' ').slice(0, 240);
    return `- ${s.name} [${s.scope}]: ${desc}`;
  });
  return [
    `\nAvailable skills (SKILL.md format). When a user request matches one of these, READ the skill body BEFORE responding — the body contains precise step-by-step instructions.`,
    `To read a skill, call read_skill({ name: "<skill-name>" }). When asked "what skills do you have", answer from this list — do NOT call recall or any other tool.`,
    ...lines,
  ].join('\n');
}

// ── npx skills-il wrapper ────────────────────────────────────────────────────

function runNpx(args, { cwd = process.cwd(), timeoutMs = NPX_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', SKILLS_IL_PACKAGE, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let out = '', err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout: out, stderr: err });
      else reject(new Error(`skills-il exited ${code}: ${err.slice(0, 400) || out.slice(0, 400)}`));
    });
  });
}

// Install a skill or bundle. Default scope is global (-g) so all workspaces see it.
async function addFromRegistry(source, { scope = 'global', agents = ['claude-code'], yes = true } = {}) {
  const args = ['add', source];
  if (scope === 'global') args.push('-g');
  for (const a of agents) args.push('-a', a);
  if (yes) args.push('-y');
  const result = await runNpx(args);
  // After installation we also mirror a copy into ~/.geoclaw/skills/ so Geoclaw's
  // agent sees it regardless of which agent dir skills-il chose.
  mirrorInstalledSkills({ scope });
  return result;
}

async function installBundle(slug, opts = {}) {
  const args = ['add-bundle', slug];
  if ((opts.scope || 'global') === 'global') args.push('-g');
  if (opts.yes !== false) args.push('-y');
  const result = await runNpx(args);
  mirrorInstalledSkills({ scope: opts.scope || 'global' });
  return result;
}

async function listBundles() {
  // skills-il bundles command returns a human-readable list; we capture it.
  try { return await runNpx(['bundles']); }
  catch (e) { return { ok: false, error: e.message }; }
}

// Mirror anything under common agent directories into ~/.geoclaw/skills/.
// skills-il installs to ./<agent>/skills or ~/<agent>/skills depending on scope,
// so we look in both places and symlink (or copy, if symlinks fail on Windows).
function mirrorInstalledSkills({ scope }) {
  const candidates = scope === 'global'
    ? [path.join(os.homedir(), '.claude', 'skills'),
       path.join(os.homedir(), '.codex', 'skills'),
       path.join(os.homedir(), '.cursor', 'skills'),
       path.join(os.homedir(), '.opencode', 'skills')]
    : [path.join(process.cwd(), '.claude', 'skills'),
       path.join(process.cwd(), '.codex', 'skills'),
       path.join(process.cwd(), 'skills')];

  ensureDir(GLOBAL_SKILLS);
  const targetRoot = scope === 'global' ? GLOBAL_SKILLS : PROJECT_SKILLS_A;
  ensureDir(targetRoot);

  let mirrored = 0;
  for (const src of candidates) {
    if (!fs.existsSync(src)) continue;
    for (const { dir, file } of walkSkillDirs(src, scope)) {
      try {
        const meta = parseFrontMatter(splitFrontMatter(fs.readFileSync(file, 'utf8')).fm);
        const name = meta.name || path.basename(dir);
        const dest = path.join(targetRoot, name);
        if (fs.existsSync(dest)) continue;
        try { fs.symlinkSync(dir, dest, 'dir'); }
        catch { copyDirRecursive(dir, dest); }
        mirrored++;
      } catch {}
    }
  }
  return { mirrored };
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Skill creation (template + LLM-guided) ───────────────────────────────────

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function skillTemplate({ name, description, triggers = [], outputs = '', steps = [] }) {
  const fm = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
  ].join('\n');
  const stepBlock = steps.length
    ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '1. Ask the user for any details you still need.\n2. Produce the output described below.';
  const triggerBlock = triggers.length
    ? triggers.map(t => `- ${t}`).join('\n')
    : '- (fill in representative user phrases that should trigger this skill)';
  return `${fm}# ${name}

${description}

## When to trigger

${triggerBlock}

## How to execute

${stepBlock}

## Output

${outputs || '(describe the expected output format — markdown, JSON, a file path, etc.)'}

## Notes

- Keep the core logic in SKILL.md. Put long references under \`references/\` and scripts under \`scripts/\`.
- Test with a handful of example prompts before shipping.
`;
}

async function createSkill({ name, description, scope = 'global', body = null, overwrite = false }) {
  if (!name) throw new Error('name is required');
  const slug = slugify(name);
  const root = scope === 'project' ? PROJECT_SKILLS_A : GLOBAL_SKILLS;
  ensureDir(root);
  const dir = path.join(root, slug);
  const file = path.join(dir, 'SKILL.md');
  if (fs.existsSync(file) && !overwrite) {
    throw new Error(`skill "${slug}" already exists at ${file} (pass overwrite:true to replace)`);
  }
  ensureDir(dir);
  const content = body || skillTemplate({ name: slug, description: description || 'TODO: describe when to trigger and what to do.' });
  fs.writeFileSync(file, content, 'utf8');
  return { ok: true, file, dir, name: slug, scope };
}

// ── LLM draft (uses whatever provider is configured) ─────────────────────────

function chatEndpoint() {
  const provider = (env('GEOCLAW_MODEL_PROVIDER', 'deepseek') || '').toLowerCase();
  const baseUrl  = env('GEOCLAW_MODEL_BASE_URL');
  if (provider === 'deepseek') return 'https://api.deepseek.com/chat/completions';
  if (provider === 'openai')   return 'https://api.openai.com/v1/chat/completions';
  if (baseUrl) return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return null;
}

function llmDraft({ intent, triggers = [], outputs = '', existingSkill = null, examples = [] }) {
  const endpoint = chatEndpoint();
  const apiKey = env('GEOCLAW_MODEL_API_KEY');
  const model  = env('GEOCLAW_MODEL_NAME', 'deepseek-chat');
  if (!endpoint || !apiKey) {
    return Promise.reject(new Error('no LLM configured (set GEOCLAW_MODEL_API_KEY)'));
  }
  const system = `You are a skill author, generating a SKILL.md in the open agent-skills format (YAML front matter + Markdown).

Output ONLY the raw contents of the SKILL.md file — no commentary, no backticks around the whole thing, no explanation before or after.

Required YAML keys: name (kebab-case), description.

Make the description "pushy" so the LLM triggers the skill reliably: describe what it does AND specific user phrases/contexts that should fire it. E.g. instead of "Generate a VAT invoice", write "Generate a compliant Israeli VAT invoice (חשבונית מס). Use whenever the user mentions invoicing, חשבונית, VAT, מע״מ, billing a client, or issuing receipts — even if they don't say 'invoice' explicitly."

After the front matter, include these sections in Markdown:
  # <Title>
  A one-paragraph summary.
  ## When to trigger  — bulleted user phrases / contexts.
  ## How to execute   — numbered steps. Be concrete and verifiable.
  ## Output           — describe the output format.
  ## Examples         — 1–3 example user inputs with the expected behavior.
  ## Notes            — edge cases, dependencies, references.

If the user writes in Hebrew, write the skill body in Hebrew but keep the YAML keys in English.`;

  const user = [
    `Intent: ${intent}`,
    triggers.length ? `Example user phrases that should trigger: ${triggers.join(' | ')}` : null,
    outputs ? `Expected output: ${outputs}` : null,
    examples.length ? `Examples: ${examples.join(' | ')}` : null,
    existingSkill ? `\n---\nExisting SKILL.md to improve:\n${existingSkill}` : null,
  ].filter(Boolean).join('\n');

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
    temperature: 0.3,
  });

  const u = new URL(endpoint);
  return new Promise((resolve, reject) => {
    const req = https.request(u, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 90_000,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
        try {
          const data = JSON.parse(chunks);
          let text = data.choices?.[0]?.message?.content || '';
          // Strip wrapping code-fence if the model ignored instructions.
          text = text.replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
          resolve(text.trim());
        } catch (e) { reject(new Error('bad json from model: ' + e.message)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('llm timed out')));
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// Quick validator so we never write junk to disk.
function validateSkill(md) {
  const { fm, body } = splitFrontMatter(md);
  if (!fm) return { ok: false, reason: 'no YAML front matter' };
  const meta = parseFrontMatter(fm);
  if (!meta.name)        return { ok: false, reason: 'missing name in front matter' };
  if (!meta.description) return { ok: false, reason: 'missing description in front matter' };
  if (body.trim().length < 40) return { ok: false, reason: 'body too short' };
  return { ok: true, meta };
}

// ── Interactive wizard (CLI) ─────────────────────────────────────────────────

async function createInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  console.log('\n✳  New skill wizard\n');
  const intent = await ask('What should this skill do? (one sentence)\n> ');
  if (!intent) { rl.close(); throw new Error('intent is required'); }
  const nameHint = await ask('Short name (kebab-case, e.g. "vat-invoice") — blank = auto:\n> ');
  const triggerRaw = await ask('Example user phrases that should trigger it (| separated, optional):\n> ');
  const outputs = await ask('What should it output? (markdown, a file, a number, etc.)\n> ');
  const scope = (await ask('Scope — [g]lobal (default) or [p]roject?\n> ')).toLowerCase().startsWith('p') ? 'project' : 'global';
  const useLLM = !!env('GEOCLAW_MODEL_API_KEY');
  const name = slugify(nameHint || intent.split(/\s+/).slice(0, 4).join(' '));
  rl.close();

  let md;
  if (useLLM) {
    console.log('\n🤖  Drafting with LLM...');
    try {
      md = await llmDraft({
        intent,
        triggers: triggerRaw ? triggerRaw.split('|').map(s => s.trim()).filter(Boolean) : [],
        outputs,
      });
    } catch (e) {
      console.log(`⚠  LLM draft failed (${e.message}) — falling back to template.`);
      md = null;
    }
  }
  if (!md) {
    md = skillTemplate({
      name,
      description: intent,
      triggers: triggerRaw ? triggerRaw.split('|').map(s => s.trim()).filter(Boolean) : [],
      outputs,
    });
  }

  const v = validateSkill(md);
  if (!v.ok) {
    console.log(`⚠  Draft failed validation (${v.reason}) — falling back to template.`);
    md = skillTemplate({ name, description: intent, outputs });
  }

  const result = await createSkill({ name, scope, body: md, overwrite: false });
  console.log(`\n✅  Skill created.\n   ${result.file}\n`);
  console.log('Next steps:');
  console.log('   geoclaw skills show ' + result.name);
  console.log('   open the file and refine the instructions as needed');
  console.log('   the skill is now visible to `geoclaw chat` and `geoclaw agent`');
  return result;
}

// ── CLI entry point ──────────────────────────────────────────────────────────

function printUsage() {
  console.log(`\nUsage: geoclaw skills <command>

Commands:
  list                     List installed skills
  show <name>              Print a skill's SKILL.md
  add <source>             Install from a GitHub owner/repo, URL, or bare name
  install-bundle <slug>    Install a skill bundle (e.g. freelancer-accountant)
  bundles                  List available bundles from the registry
  remove <name>            Remove an installed skill
  create                   Interactive wizard — describe it, get a SKILL.md
  new <name> [description] One-shot scaffold with the template
  manifest                 Print the system-prompt manifest (for debugging)

Flags for add / install-bundle:
  --project                Install into ./.geoclaw/skills instead of ~/.geoclaw/skills
  --agents <list>          Comma-sep list of agent targets (default: claude-code)

Examples:
  geoclaw skills bundles
  geoclaw skills install-bundle freelancer-accountant
  geoclaw skills add skills-il/tax-and-finance
  geoclaw skills create
  geoclaw skills list
`);
}

function parseFlags(argv) {
  const flags = { scope: 'global', agents: ['claude-code'] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') flags.scope = 'project';
    else if (a === '--global') flags.scope = 'global';
    else if (a === '--agents') { flags.agents = (argv[++i] || '').split(',').filter(Boolean); }
    else positional.push(a);
  }
  return { flags, positional };
}

async function main(argv) {
  const cmd = argv[0];
  const { flags, positional } = parseFlags(argv.slice(1));

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') return printUsage();

  if (cmd === 'list') {
    const skills = listSkills({});
    if (!skills.length) { console.log('No skills installed. Try:  geoclaw skills bundles'); return; }
    for (const s of skills) {
      const tags = [s.scope, s.hasScripts && 'scripts', s.hasReferences && 'refs'].filter(Boolean).join(', ');
      console.log(`  • ${s.name.padEnd(30)} [${tags}]`);
      if (s.description) console.log(`      ${s.description.slice(0, 110)}${s.description.length > 110 ? '…' : ''}`);
    }
    console.log(`\n${skills.length} skill(s) available.`);
    return;
  }

  if (cmd === 'show') {
    const name = positional[0];
    if (!name) { console.log('Usage: geoclaw skills show <name>'); return; }
    const body = readSkillBody(name);
    if (!body) { console.log(`No skill named "${name}". Try:  geoclaw skills list`); return; }
    console.log(body);
    return;
  }

  if (cmd === 'add') {
    const source = positional[0];
    if (!source) { console.log('Usage: geoclaw skills add <owner/repo | url | name>'); return; }
    console.log(`📦 Installing from ${source} (this may take a moment)...`);
    try { const r = await addFromRegistry(source, { scope: flags.scope, agents: flags.agents }); console.log(r.stdout); console.log('✅ Installed.'); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
    return;
  }

  if (cmd === 'install-bundle') {
    const slug = positional[0];
    if (!slug) { console.log('Usage: geoclaw skills install-bundle <slug>\n  See available bundles:  geoclaw skills bundles'); return; }
    console.log(`📦 Installing bundle "${slug}"...`);
    try { const r = await installBundle(slug, { scope: flags.scope }); console.log(r.stdout); console.log('✅ Bundle installed.'); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
    return;
  }

  if (cmd === 'bundles') {
    try { const r = await listBundles(); console.log(r.stdout || '(no output)'); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
    return;
  }

  if (cmd === 'remove') {
    const name = positional[0];
    if (!name) { console.log('Usage: geoclaw skills remove <name>'); return; }
    try { const r = removeSkill(name); console.log(`✅ Removed ${r.name}`); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
    return;
  }

  if (cmd === 'create') {
    try { await createInteractive(); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
    return;
  }

  if (cmd === 'new') {
    const name = positional[0];
    const description = positional.slice(1).join(' ') || 'TODO: describe the skill.';
    if (!name) { console.log('Usage: geoclaw skills new <name> [description]'); return; }
    try { const r = await createSkill({ name, description, scope: flags.scope }); console.log(`✅ Created ${r.file}`); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
    return;
  }

  if (cmd === 'manifest') {
    console.log(buildSkillsManifest());
    return;
  }

  console.log(`Unknown command: ${cmd}`);
  printUsage();
  process.exitCode = 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => {
    console.error('❌', e.message);
    process.exit(1);
  });
}

module.exports = {
  listSkills,
  getSkill,
  readSkillBody,
  removeSkill,
  addFromRegistry,
  installBundle,
  listBundles,
  createSkill,
  createInteractive,
  llmDraft,
  validateSkill,
  buildSkillsManifest,
  skillTemplate,
  slugify,
  PROJECT_SKILLS_A,
  PROJECT_SKILLS_B,
  GLOBAL_SKILLS,
};
