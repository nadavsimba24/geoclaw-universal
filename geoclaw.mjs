#!/usr/bin/env node
// Geoclaw v3.0 - Universal Agent Platform CLI
// Entry point for global installation

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, copyFileSync, readFileSync } from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── OS / Shell detection ────────────────────────────────────────────────────

function detectShell() {
  const platform = process.platform;

  if (platform === 'darwin' || platform === 'linux') {
    return { shell: 'bash', type: platform === 'darwin' ? 'macOS' : 'Linux' };
  }

  if (platform === 'win32') {
    // 1. WSL (preferred on Windows)
    try {
      execSync('wsl bash --version', { stdio: 'ignore' });
      return { shell: 'wsl', type: 'Windows/WSL', args: ['bash'] };
    } catch {}

    // 2. Git Bash (common Windows install)
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const p of gitBashPaths) {
      if (existsSync(p)) {
        return { shell: p, type: 'Windows/Git Bash' };
      }
    }

    // 3. bash from PATH (Cygwin, MSYS2, etc.)
    try {
      execSync('bash --version', { stdio: 'ignore' });
      return { shell: 'bash', type: 'Windows/Bash' };
    } catch {}

    return null; // no bash found
  }

  return { shell: 'bash', type: platform };
}

// ── Banner / Help ───────────────────────────────────────────────────────────

function printBanner() {
  console.log(`
🎭  Geoclaw v3.0 - Universal Agent Platform
────────────────────────────────────────────
Transparent automation with educational UX
`);
}

function printHelp() {
  console.log(`
Usage: geoclaw <command> [options]

Commands:
  chat            Talk to your configured LLM (interactive)
  start           Start Geoclaw agent platform
  setup           Interactive setup wizard
  doctor          Check system requirements & diagnose issues
  update          Update to the latest version
  learn <topic>   Learn about a component
  status          Show platform status
  workflow        Magic workflow commands
  mcp             MCP integration commands
  monday          Monday.com commands (boards, create, update, comment)
  help            Show this help

Examples:
  geoclaw start
  geoclaw setup
  geoclaw update
  geoclaw learn mcporter
  geoclaw learn n8n
  geoclaw status
  geoclaw workflow create
  geoclaw mcp list

Component topics:
  mcporter        MCP server discovery & calling
  n8n             Workflow automation
  qgis            Geospatial analysis
  web-scraping    Data collection
  vibe-kanban     Task management
  monday          Project management
  salesforce      CRM automation
  memory          Central Intelligence
  skills          GitHub CLI Skills

Learn more: https://github.com/nadavsimba24/geoclaw-universal
`);
}

// ── Script runner (bash scripts) ────────────────────────────────────────────

async function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, 'scripts', scriptName);

  if (!existsSync(scriptPath)) {
    console.error(`❌ Script not found: ${scriptPath}`);
    process.exit(1);
  }

  // JS/MJS files must be run with node, not bash
  const isNodeScript = scriptName.endsWith('.js') || scriptName.endsWith('.mjs');

  if (isNodeScript) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [scriptPath, ...args], {
        stdio: 'inherit',
        env: { ...process.env, GEOCLAW_DIR: __dirname },
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Script exited with code ${code}`));
      });
    });
  }

  const sh = detectShell();

  if (!sh) {
    console.error(`
❌ No compatible shell found on this system.

Geoclaw scripts require bash. Please install one of:
  • WSL (Windows Subsystem for Linux) — recommended for Windows
      https://learn.microsoft.com/en-us/windows/wsl/install
  • Git for Windows (includes Git Bash)
      https://git-scm.com/download/win
  • Cygwin or MSYS2
`);
    process.exit(1);
  }

  console.log(`ℹ️  Running on ${sh.type}`);

  let cmd, cmdArgs, scriptPathForShell = scriptPath, geoclawDirForShell = __dirname;
  if (sh.shell === 'wsl') {
    // Convert Windows paths (C:\foo\bar) to WSL paths (/mnt/c/foo/bar)
    // so bash can actually find the script inside WSL.
    try {
      scriptPathForShell = execSync(`wsl wslpath -u "${scriptPath.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
      geoclawDirForShell = execSync(`wsl wslpath -u "${__dirname.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    } catch (e) {
      console.error('❌ Failed to translate Windows path to WSL path:', e.message);
      console.error('   Try running from WSL directly, or install Git Bash.');
      process.exit(1);
    }
    cmd = 'wsl';
    cmdArgs = ['bash', scriptPathForShell, ...args];
  } else {
    cmd = sh.shell;
    cmdArgs = [scriptPath, ...args];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: 'inherit',
      env: { ...process.env, GEOCLAW_DIR: geoclawDirForShell },
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script exited with code ${code}`));
    });
  });
}

// ── Doctor command ──────────────────────────────────────────────────────────

async function runDoctor() {
  const { readFileSync } = await import('fs');
  const { join: pjoin } = await import('path');

  console.log('\n🩺  Geoclaw Doctor — System Check\n');

  const checks = [];

  // Node.js version
  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split('.')[0], 10);
  checks.push({
    label: `Node.js v${nodeVer}`,
    ok: nodeMajor >= 20,
    fix: 'Install Node.js v20+: https://nodejs.org/',
  });

  // npm
  try {
    const npmVer = execSync('npm --version', { encoding: 'utf8', timeout: 5000 }).trim();
    checks.push({ label: `npm v${npmVer}`, ok: true });
  } catch {
    checks.push({ label: 'npm', ok: false, fix: 'Install Node.js (includes npm): https://nodejs.org/' });
  }

  // bash
  const sh = detectShell();
  checks.push({
    label: `Shell: ${sh ? sh.type : 'none'}`,
    ok: !!sh,
    fix: 'Install bash / WSL: https://learn.microsoft.com/en-us/windows/wsl/install',
  });

  // .env file
  const envPath = join(__dirname, '.env');
  const envTemplatePath = join(__dirname, '.env.template');
  const hasEnv = existsSync(envPath);
  const hasTemplate = existsSync(envTemplatePath);
  checks.push({
    label: `.env file${hasEnv ? '' : ' (missing — run: geoclaw setup)'}`,
    ok: hasEnv,
    fix: hasTemplate
      ? 'Run: geoclaw setup   OR   cp .env.template .env'
      : 'Run: geoclaw setup',
  });

  // geoclaw.config.yml (optional)
  const hasConfig = existsSync(join(__dirname, 'geoclaw.config.yml'));
  checks.push({ label: `geoclaw.config.yml${hasConfig ? '' : ' (optional, not required)'}`, ok: true });

  // scripts directory
  const hasScripts = existsSync(join(__dirname, 'scripts'));
  checks.push({ label: 'scripts/ directory', ok: hasScripts, fix: 'Reinstall geoclaw' });

  // Optional tools
  console.log('Core requirements:');
  let allOk = true;
  for (const c of checks.slice(0, 4)) {
    const icon = c.ok ? '  ✅' : '  ❌';
    console.log(`${icon}  ${c.label}`);
    if (!c.ok) { console.log(`       → ${c.fix}`); allOk = false; }
  }

  console.log('\nOptional integrations:');
  const optionals = [
    { cmd: 'docker', label: 'Docker (for container mode)' },
    { cmd: 'psql', label: 'PostgreSQL/PostGIS (for geospatial)' },
    { cmd: 'signal-cli', label: 'signal-cli (for Signal messaging)' },
  ];
  for (const o of optionals) {
    try { execSync(`${o.cmd} --version`, { stdio: 'ignore', timeout: 3000 }); console.log(`  ✅  ${o.label}`); }
    catch { console.log(`  ⚪  ${o.label} — not installed (optional)`); }
  }

  console.log('');
  if (allOk) {
    console.log('✅  All core checks passed. Run: geoclaw setup');
  } else {
    console.log('❌  Some checks failed. Fix the issues above, then run: geoclaw setup');
  }
  console.log('');
}

// ── Update command (pure Node.js — works on all platforms) ──────────────────

async function runUpdate() {
  const PACKAGE = 'geoclaw-universal';

  console.log('🔍 Checking current version...');
  let currentVersion = 'unknown';
  try {
    const raw = execSync(`npm list -g --depth=0 --json`, { encoding: 'utf8', timeout: 15000 });
    const parsed = JSON.parse(raw);
    currentVersion = parsed?.dependencies?.[PACKAGE]?.version ?? 'unknown';
  } catch {}
  console.log(`   Installed : v${currentVersion}`);

  console.log('🌐 Checking latest version on npm...');
  let latestVersion;
  try {
    latestVersion = execSync(`npm view ${PACKAGE} version`, { encoding: 'utf8', timeout: 15000 }).trim();
  } catch {
    console.error('❌ Could not reach npm registry. Check your internet connection.');
    process.exit(1);
  }
  console.log(`   Latest    : v${latestVersion}`);

  if (currentVersion === latestVersion) {
    console.log(`\n✅ Already up to date (v${latestVersion})`);
    return;
  }

  // Backup .env
  const envFile = join(__dirname, '.env');
  let envBackup = null;
  if (existsSync(envFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    envBackup = `${envFile}.backup-${stamp}`;
    copyFileSync(envFile, envBackup);
    console.log(`\n💾 Config backed up → ${envBackup}`);
  }

  // Run the update
  console.log(`\n📦 Updating ${PACKAGE} v${currentVersion} → v${latestVersion}...`);
  try {
    execSync(`npm install -g ${PACKAGE}@${latestVersion}`, { stdio: 'inherit', timeout: 120000 });
  } catch {
    console.error('\n❌ npm install failed.');
    if (envBackup) console.log(`   Your config backup is safe at: ${envBackup}`);
    process.exit(1);
  }

  // Restore .env into newly installed location
  if (envBackup) {
    try {
      const newInstallDir = execSync(`npm root -g`, { encoding: 'utf8' }).trim();
      const newEnvPath = join(newInstallDir, PACKAGE, '.env');
      if (existsSync(dirname(newEnvPath))) {
        copyFileSync(envBackup, newEnvPath);
        console.log('✅ Configuration restored');
      }
    } catch {
      console.log(`⚠️  Could not auto-restore config. Copy manually from:\n   ${envBackup}`);
    }
  }

  console.log(`
────────────────────────────────────────────
✅ Geoclaw updated to v${latestVersion}

   geoclaw start   → launch the platform
   geoclaw status  → verify all components
`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printBanner();
    printHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'start':
      printBanner();
      await runScript('run.sh');
      break;

    case 'setup':
      printBanner();
      await runScript('setup-wizard-simple.sh');
      break;

    case 'update':
      printBanner();
      await runUpdate();
      break;

    case 'learn':
      if (args.length < 2) {
        console.log('Usage: geoclaw learn <topic>');
        console.log('Topics: mcporter, n8n, qgis, web-scraping, vibe-kanban, monday, salesforce, memory, skills');
        break;
      }
      await runScript('educational-commands-complete.sh', ['learn', args[1]]);
      break;

    case 'status':
      await runScript('educational-commands-complete.sh', ['status']);
      break;

    case 'workflow':
      if (args.length < 2) {
        console.log('Usage: geoclaw workflow <subcommand>');
        console.log('Subcommands: create, execute, list');
        break;
      }
      await runScript('components/workflow-orchestrator.js', args.slice(1));
      break;

    case 'mcp':
      if (args.length < 2) {
        console.log('Usage: geoclaw mcp <subcommand>');
        console.log('Subcommands: list, explore, call');
        break;
      }
      await runScript('components/mcporter-integration.js', args.slice(1));
      break;

    case 'monday':
      await runScript('components/monday-integration.js', args.slice(1));
      break;

    case 'chat':
      await runScript('components/chat.js', args.slice(1));
      break;

    case 'doctor':
      await runDoctor();
      break;

    case 'init':
      await runScript('geoclaw_init_universal.sh', args.slice(1));
      break;

    case 'help':
    case '--help':
    case '-h':
      printBanner();
      printHelp();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  if (process.env.DEBUG) console.error(error.stack);
  else console.error('   (set DEBUG=1 for full stack trace)');
  process.exit(1);
});
