#!/usr/bin/env node
// Geoclaw text-to-speech — cross-platform system voices + optional OpenAI TTS.

const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const lang = require('./lang.js');
const { env } = require('./env.js');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch {}

const PROVIDER  = env('GEOCLAW_TTS_PROVIDER', 'system').toLowerCase();
const OPENAI_KEY = env('GEOCLAW_TTS_OPENAI_KEY') || env('OPENAI_API_KEY') ||
                   (env('GEOCLAW_MODEL_PROVIDER') === 'openai' ? env('GEOCLAW_MODEL_API_KEY') : '');
const OPENAI_MODEL = env('GEOCLAW_TTS_MODEL', 'tts-1');
const OPENAI_VOICE = env('GEOCLAW_TTS_VOICE', 'alloy');

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function has(cmd) {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'command -v';
    execSync(`${probe} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// Sanitize text that's passed through a shell argument on Windows. Keep printable ASCII.
function safeForPS(text) {
  return String(text).replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"');
}

// ── System voices ─────────────────────────────────────────────────────────────

// Voice selection per platform for non-English text.
// macOS ships Hebrew voice "Carmit" and Arabic "Maged" on most installs.
function pickMacVoice(langCode) {
  switch (langCode) {
    case 'he': return 'Carmit';
    case 'ar': return 'Maged';
    case 'ru': return 'Milena';
    default:   return null;  // use system default
  }
}
function pickEspeakLang(langCode) {
  // espeak-ng language codes are mostly ISO-639 with some quirks.
  switch (langCode) {
    case 'he': return 'he';
    case 'ar': return 'ar';
    case 'ru': return 'ru';
    case 'zh': return 'zh';
    default:   return null;  // default English
  }
}

function speakSystem(text) {
  const platform = process.platform;
  const langCode = lang.detectLang(text);

  if (platform === 'darwin') {
    const voice = pickMacVoice(langCode);
    const args = voice ? ['-v', voice, text] : [text];
    return new Promise((resolve, reject) => {
      const child = spawn('say', args, { stdio: 'ignore' });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`say exited ${code}`)));
      child.on('error', reject);
    });
  }
  if (platform === 'win32') {
    // Windows SAPI will auto-pick a matching voice IF a Hebrew/Arabic voice
    // is installed (Settings > Time & Language > Language). If not, it falls
    // back to the default voice — which will still read the characters, just
    // with an English accent.
    const ps = `Add-Type -AssemblyName System.Speech; ` +
               `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
               `$s.Speak("${safeForPS(text)}")`;
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`powershell exited ${code}`)));
      child.on('error', reject);
    });
  }
  // Linux / WSL: prefer espeak-ng with language flag, then espeak, then festival.
  if (process.env.WSL_DISTRO_NAME || /microsoft/i.test(os.release())) {
    const ps = `Add-Type -AssemblyName System.Speech; ` +
               `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
               `$s.Speak("${safeForPS(text)}")`;
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`powershell.exe exited ${code}`)));
      child.on('error', reject);
    });
  }
  const bin = has('espeak-ng') ? 'espeak-ng' : (has('espeak') ? 'espeak' : null);
  if (bin) {
    const espeakLang = pickEspeakLang(langCode);
    const args = espeakLang ? ['-v', espeakLang, text] : [text];
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: 'ignore' });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`)));
      child.on('error', reject);
    });
  }
  if (has('festival')) {
    return new Promise((resolve, reject) => {
      const child = spawn('festival', ['--tts'], { stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`festival exited ${code}`)));
      child.on('error', reject);
      child.stdin.end(text);
    });
  }
  return Promise.reject(new Error(
    'No system TTS available. Install one of:\n' +
    '  sudo apt install espeak-ng     # Debian/Ubuntu (supports Hebrew via -v he)\n' +
    '  sudo dnf install espeak-ng     # Fedora\n' +
    '  brew install espeak            # macOS (already has `say`, so you should not need this)\n' +
    'Or run: geoclaw setup   and enable OpenAI TTS instead (best multilingual quality).'
  ));
}

// ── OpenAI TTS ────────────────────────────────────────────────────────────────

function openaiTTS(text) {
  if (!OPENAI_KEY) return Promise.reject(new Error(
    'OpenAI TTS requires an API key. Set GEOCLAW_TTS_OPENAI_KEY or use an OpenAI model provider.'
  ));

  const body = JSON.stringify({ model: OPENAI_MODEL, voice: OPENAI_VOICE, input: text, format: 'mp3' });
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60_000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`OpenAI TTS HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 300)}`));
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('timeout', () => req.destroy(new Error('OpenAI TTS timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function playAudio(buffer) {
  const tmp = path.join(os.tmpdir(), `geoclaw-tts-${process.pid}-${Date.now()}.mp3`);
  fs.writeFileSync(tmp, buffer);
  const cleanup = () => { try { fs.unlinkSync(tmp); } catch {} };

  return new Promise((resolve, reject) => {
    let player, args;
    if (process.platform === 'darwin') {
      player = 'afplay'; args = [tmp];
    } else if (process.platform === 'win32') {
      const ps = `(New-Object Media.SoundPlayer '${tmp}').PlaySync();`;
      player = 'powershell.exe'; args = ['-NoProfile', '-Command', ps];
    } else if (process.env.WSL_DISTRO_NAME || /microsoft/i.test(os.release())) {
      // WSL: play via Windows — convert tmp to a Windows path.
      let winPath = tmp;
      try { winPath = execSync(`wslpath -w "${tmp}"`, { encoding: 'utf8' }).trim(); } catch {}
      const ps = `(New-Object Media.SoundPlayer '${winPath.replace(/'/g, "''")}').PlaySync();`;
      // Windows SoundPlayer only plays WAV reliably — fall back to ffplay / mpg123 if present,
      // otherwise try powershell which may still handle mp3 via Windows Media components.
      if (has('mpg123')) { player = 'mpg123'; args = ['-q', tmp]; }
      else { player = 'powershell.exe'; args = ['-NoProfile', '-Command', ps]; }
    } else if (has('mpg123')) { player = 'mpg123'; args = ['-q', tmp]; }
    else if (has('ffplay'))   { player = 'ffplay'; args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', tmp]; }
    else if (has('paplay'))   { player = 'paplay'; args = [tmp]; }
    else if (has('aplay'))    { player = 'aplay'; args = ['-q', tmp]; }
    else {
      cleanup();
      return reject(new Error(
        'No audio player found. Install one of: mpg123, ffplay (ffmpeg), paplay (pulseaudio), aplay (alsa).'
      ));
    }

    const child = spawn(player, args, { stdio: 'ignore' });
    child.on('exit', (code) => { cleanup(); code === 0 ? resolve() : reject(new Error(`${player} exited ${code}`)); });
    child.on('error', (e) => { cleanup(); reject(e); });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function speak(text, opts = {}) {
  if (!text || !String(text).trim()) return;
  // Strip common markdown decorations so the voice sounds natural.
  const clean = String(text)
    .replace(/```[\s\S]*?```/g, ' ')          // code blocks
    .replace(/`([^`]*)`/g, '$1')              // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links — keep label
    .replace(/[*_#>]+/g, ' ')                 // markdown noise
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return;

  const provider = (opts.provider || PROVIDER).toLowerCase();
  if (provider === 'off') return;

  try {
    if (provider === 'openai') {
      const audio = await openaiTTS(clean);
      await playAudio(audio);
      return;
    }
    // system (default)
    await speakSystem(clean);
  } catch (e) {
    if (!opts.silent) console.error(`\x1b[33m[tts] ${e.message}\x1b[0m`);
  }
}

function isEnabled() {
  return PROVIDER !== 'off';
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: geoclaw say "text to speak" [--provider system|openai]

Provider is picked from GEOCLAW_TTS_PROVIDER (default: system).
  system — uses macOS say / Linux espeak-ng / Windows SAPI
  openai — uses api.openai.com/v1/audio/speech (needs GEOCLAW_TTS_OPENAI_KEY)
  off    — silences all speech

Env:
  GEOCLAW_TTS_PROVIDER    system | openai | off
  GEOCLAW_TTS_OPENAI_KEY  API key for OpenAI TTS (falls back to OPENAI_API_KEY)
  GEOCLAW_TTS_MODEL       OpenAI TTS model   (default: tts-1)
  GEOCLAW_TTS_VOICE       OpenAI TTS voice   (default: alloy)
`);
    process.exit(0);
  }
  let provider;
  const textParts = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) provider = args[++i];
    else textParts.push(args[i]);
  }
  const text = textParts.join(' ').trim();
  if (!text) { console.error('❌ nothing to say'); process.exit(1); }

  try {
    await speak(text, { provider });
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}

module.exports = { speak, isEnabled };

if (require.main === module) main();
