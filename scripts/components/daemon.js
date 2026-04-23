#!/usr/bin/env node
// Geoclaw daemon manager — keeps the web server running after the terminal closes.
// Cross-platform: Windows (detached process + optional Task Scheduler) and Linux/macOS (systemd user service).
//
// Usage:
//   geoclaw daemon start     Start the server in background
//   geoclaw daemon stop      Stop the background server
//   geoclaw daemon restart   Restart
//   geoclaw daemon status    Show running / stopped + URL
//   geoclaw daemon logs [N]  Tail last N lines of log (default 40)
//   geoclaw daemon install   Register as system startup service
//   geoclaw daemon uninstall Remove startup service

'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const cp    = require('child_process');
const { execSync, spawnSync } = require('child_process');

const STATE_DIR  = path.join(os.homedir(), '.geoclaw', 'daemon');
const PID_FILE   = path.join(STATE_DIR, 'geoclaw.pid');
const LOG_FILE   = path.join(STATE_DIR, 'geoclaw.log');
const URL_FILE   = path.join(STATE_DIR, 'geoclaw.url');
const SERVE_JS   = path.join(__dirname, 'serve.js');
const IS_WIN     = process.platform === 'win32';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10); } catch { return null; }
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readUrl() {
  try { return fs.readFileSync(URL_FILE, 'utf8').trim(); } catch { return null; }
}

function col(code, s) { return `\x1b[${code}m${s}\x1b[0m`; }
const green  = s => col('32', s);
const red    = s => col('31', s);
const yellow = s => col('33', s);
const cyan   = s => col('36', s);
const dim    = s => col('2',  s);

// ── start ─────────────────────────────────────────────────────────────────────

async function start() {
  ensureDir();

  const pid = readPid();
  if (pid && isAlive(pid)) {
    const url = readUrl() || '(URL unknown)';
    console.log(`${yellow('⚠')}  Geoclaw daemon is already running (PID ${pid})`);
    console.log(`   ${cyan(url)}`);
    return;
  }

  const logFd = fs.openSync(LOG_FILE, 'a');

  const env = { ...process.env };
  // If no port set, use 3737
  if (!env.GEOCLAW_SERVE_PORT) env.GEOCLAW_SERVE_PORT = '3737';

  const child = cp.spawn(process.execPath, [SERVE_JS], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env,
    windowsHide: true,
  });

  fs.closeSync(logFd);
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  // Wait up to 3s for the URL line to appear in the log
  const deadline = Date.now() + 3000;
  let url = null;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const log = fs.readFileSync(LOG_FILE, 'utf8');
      const m = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?k=[a-f0-9]+/);
      if (m) { url = m[0]; break; }
    } catch { /* keep waiting */ }
  }

  if (url) {
    fs.writeFileSync(URL_FILE, url);
    console.log(`${green('✓')}  Geoclaw daemon started (PID ${child.pid})`);
    console.log(`   ${cyan(url)}`);
    console.log(`   ${dim('Logs: ' + LOG_FILE)}`);
  } else {
    console.log(`${yellow('⚠')}  Daemon started (PID ${child.pid}) but URL not yet ready.`);
    console.log(`   Check logs: geoclaw daemon logs`);
  }
}

// ── stop ──────────────────────────────────────────────────────────────────────

function stop() {
  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    console.log(`${yellow('⚠')}  Geoclaw daemon is not running.`);
    try { fs.unlinkSync(PID_FILE); } catch { /* ok */ }
    return;
  }
  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'inherit' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    // Wait up to 2s for process to die
    let dead = false;
    for (let i = 0; i < 10; i++) {
      if (!isAlive(pid)) { dead = true; break; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
    if (!dead && !IS_WIN) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
    }
    try { fs.unlinkSync(PID_FILE); } catch { /* ok */ }
    try { fs.unlinkSync(URL_FILE); } catch { /* ok */ }
    console.log(`${green('✓')}  Geoclaw daemon stopped (was PID ${pid})`);
  } catch (e) {
    console.error(`${red('✗')}  Failed to stop PID ${pid}: ${e.message}`);
  }
}

// ── status ────────────────────────────────────────────────────────────────────

function status() {
  const pid = readPid();
  const alive = isAlive(pid);
  const url   = readUrl();

  if (alive) {
    console.log(`${green('●')}  Geoclaw daemon running  (PID ${pid})`);
    if (url) console.log(`   URL: ${cyan(url)}`);
    console.log(`   Log: ${dim(LOG_FILE)}`);
  } else {
    console.log(`${dim('○')}  Geoclaw daemon stopped`);
    if (pid) console.log(`   ${dim('(stale PID file: ' + pid + ')')}`);
  }

  // Show log tail
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    const tail  = lines.slice(-5);
    if (tail.length) {
      console.log(`\nRecent log:`);
      tail.forEach(l => console.log(`  ${dim(l)}`));
    }
  } catch { /* no log yet */ }
}

// ── logs ──────────────────────────────────────────────────────────────────────

function logs(n = 40) {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    // Strip ANSI for readability
    const lines = content.split('\n').filter(Boolean);
    lines.slice(-n).forEach(l => console.log(l));
  } catch {
    console.log(`${yellow('⚠')}  No log file yet. Start the daemon first: geoclaw daemon start`);
  }
}

// ── install (startup service) ─────────────────────────────────────────────────

function install() {
  const nodeBin  = process.execPath;
  const geoclawMjs = path.join(__dirname, '..', '..', 'geoclaw.mjs');

  if (IS_WIN) {
    // Windows Task Scheduler
    const taskName = 'GeoclawDaemon';
    const cmd = `schtasks /Create /TN "${taskName}" /TR "${nodeBin} ${geoclawMjs} daemon start" /SC ONLOGON /RL HIGHEST /F`;
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log(`${green('✓')}  Registered Task Scheduler task "${taskName}" — starts on login.`);
    } catch (e) {
      console.error(`${red('✗')}  Task Scheduler failed: ${e.message}`);
      console.log(`   Try running PowerShell as Administrator.`);
    }

  } else {
    // systemd user service
    const serviceDir  = path.join(os.homedir(), '.config', 'systemd', 'user');
    const servicePath = path.join(serviceDir, 'geoclaw.service');
    fs.mkdirSync(serviceDir, { recursive: true });
    const unit = `[Unit]
Description=Geoclaw Universal Agent Platform
After=network.target

[Service]
Type=simple
ExecStart=${nodeBin} ${geoclawMjs} serve
Restart=on-failure
RestartSec=5
Environment=GEOCLAW_SERVE_PORT=3737

[Install]
WantedBy=default.target
`;
    fs.writeFileSync(servicePath, unit);
    try {
      execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
      execSync('systemctl --user enable geoclaw.service', { stdio: 'inherit' });
      console.log(`${green('✓')}  systemd user service installed.`);
      console.log(`   Start now:   systemctl --user start geoclaw`);
      console.log(`   Check:       systemctl --user status geoclaw`);
    } catch {
      console.log(`${yellow('⚠')}  Service file written to: ${servicePath}`);
      console.log(`   Run manually: systemctl --user daemon-reload && systemctl --user enable --now geoclaw`);
    }
  }
}

// ── uninstall ─────────────────────────────────────────────────────────────────

function uninstall() {
  if (IS_WIN) {
    try {
      execSync('schtasks /Delete /TN "GeoclawDaemon" /F', { stdio: 'inherit' });
      console.log(`${green('✓')}  Task Scheduler task removed.`);
    } catch (e) {
      console.error(`${red('✗')}  ${e.message}`);
    }
  } else {
    try {
      execSync('systemctl --user disable --now geoclaw.service 2>/dev/null || true', { stdio: 'inherit' });
      const svc = path.join(os.homedir(), '.config', 'systemd', 'user', 'geoclaw.service');
      try { fs.unlinkSync(svc); } catch { /* ok */ }
      execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
      console.log(`${green('✓')}  systemd service removed.`);
    } catch (e) {
      console.error(`${red('✗')}  ${e.message}`);
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

module.exports = { start, stop, status, logs, install, uninstall, isAlive, readPid, readUrl, PID_FILE, LOG_FILE };

if (require.main === module) {
  const sub = process.argv[2];
  const n   = parseInt(process.argv[3] || '40', 10);

  (async () => {
    switch (sub) {
      case 'start':     await start(); break;
      case 'stop':      stop();        break;
      case 'restart':   stop(); await new Promise(r => setTimeout(r, 800)); await start(); break;
      case 'status':    status();      break;
      case 'logs':      logs(n);       break;
      case 'install':   install();     break;
      case 'uninstall': uninstall();   break;
      default:
        console.log('Usage: geoclaw daemon <start|stop|restart|status|logs [N]|install|uninstall>');
        console.log('');
        console.log('  start      Start the Geoclaw web server in the background');
        console.log('  stop       Stop the background server');
        console.log('  restart    Stop then start');
        console.log('  status     Show running state + URL');
        console.log('  logs [N]   Show last N log lines (default 40)');
        console.log('  install    Register as a startup service (systemd / Task Scheduler)');
        console.log('  uninstall  Remove startup service');
    }
  })();
}
