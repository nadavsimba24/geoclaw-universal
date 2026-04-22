#!/usr/bin/env node
// Geoclaw interactive chat — uses whatever model is configured in .env

const https = require('https');
const http = require('http');
const readline = require('readline');
const path = require('path');
const { URL } = require('url');

require('dotenv').config({
  path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
});

const PROVIDER = (process.env.GEOCLAW_MODEL_PROVIDER || 'deepseek').toLowerCase();
const MODEL    = process.env.GEOCLAW_MODEL_NAME || 'deepseek-chat';
const API_KEY  = process.env.GEOCLAW_MODEL_API_KEY || '';
const BASE_URL = process.env.GEOCLAW_MODEL_BASE_URL || '';

const SYSTEM_PROMPT = `You are Geoclaw, a friendly and capable AI assistant.
You have access to integrations the user has enabled: Monday.com, n8n, Telegram, MCP tools, memory, and more.
If the user asks you to DO something that requires one of those integrations, tell them the exact command to run (e.g. 'geoclaw monday boards').
Otherwise, just help them normally — answer questions, explain, write code, think.`;

// ── Generic HTTP helpers ──────────────────────────────────────────────────────

function post(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 400)}`));
        }
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error(`Bad JSON: ${chunks.slice(0, 400)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Provider adapters ─────────────────────────────────────────────────────────
// Each returns { reply: string, usage: object|null }

async function chatOpenAICompatible(messages, endpoint) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const url = BASE_URL
    ? `${BASE_URL.replace(/\/+$/, '')}/chat/completions`
    : endpoint;
  const data = await post(url, {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }, { model: MODEL, messages, stream: false });
  return {
    reply: data.choices?.[0]?.message?.content ?? '[no content]',
    usage: data.usage ?? null,
  };
}

async function chatDeepSeek(messages)  { return chatOpenAICompatible(messages, 'https://api.deepseek.com/chat/completions'); }
async function chatOpenAI(messages)    { return chatOpenAICompatible(messages, 'https://api.openai.com/v1/chat/completions'); }
async function chatCustom(messages)    { return chatOpenAICompatible(messages, ''); }

async function chatAnthropic(messages) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const system = messages.find(m => m.role === 'system')?.content ?? '';
  const rest   = messages.filter(m => m.role !== 'system');
  const data = await post('https://api.anthropic.com/v1/messages', {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }, { model: MODEL, system, messages: rest, max_tokens: 4096 });
  return { reply: data.content?.[0]?.text ?? '[no content]', usage: data.usage ?? null };
}

async function chatGoogle(messages) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY is empty');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const system = messages.find(m => m.role === 'system')?.content;
  const body = { contents, ...(system && { systemInstruction: { parts: [{ text: system }] } }) };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const data = await post(url, { 'Content-Type': 'application/json' }, body);
  return {
    reply: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[no content]',
    usage: data.usageMetadata ?? null,
  };
}

async function chatOllama(messages) {
  const url = (BASE_URL || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';
  const data = await post(url, { 'Content-Type': 'application/json' }, {
    model: MODEL, messages, stream: false,
  });
  return { reply: data.message?.content ?? '[no content]', usage: null };
}

function dispatch(messages) {
  switch (PROVIDER) {
    case 'deepseek':  return chatDeepSeek(messages);
    case 'openai':    return chatOpenAI(messages);
    case 'anthropic': return chatAnthropic(messages);
    case 'google':    return chatGoogle(messages);
    case 'ollama':    return chatOllama(messages);
    default:          return chatCustom(messages);
  }
}

// ── Interactive REPL ──────────────────────────────────────────────────────────

function banner() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      Geoclaw Chat                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Provider: ${PROVIDER}  |  Model: ${MODEL}`);
  console.log('Type your message. Commands: /exit, /clear, /system, /help');
  console.log('');
}

async function repl() {
  banner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const history = [{ role: 'system', content: SYSTEM_PROMPT }];

  const ask = () => {
    rl.question('\x1b[36myou ›\x1b[0m ', async (line) => {
      const text = line.trim();
      if (!text) return ask();

      if (text === '/exit' || text === '/quit') {
        console.log('bye.');
        rl.close();
        return;
      }
      if (text === '/clear') {
        history.length = 1;
        console.log('(history cleared)');
        return ask();
      }
      if (text === '/help') {
        console.log('/exit    quit chat');
        console.log('/clear   reset conversation history');
        console.log('/system  show current system prompt');
        console.log('/help    show this help');
        return ask();
      }
      if (text === '/system') {
        console.log(history[0].content);
        return ask();
      }

      history.push({ role: 'user', content: text });
      process.stdout.write('\x1b[32mgeoclaw ›\x1b[0m thinking...\r');

      try {
        const { reply, usage } = await dispatch(history);
        process.stdout.write('\x1b[2K'); // clear the "thinking..." line
        console.log(`\x1b[32mgeoclaw ›\x1b[0m ${reply}`);
        if (usage) {
          const tokens = usage.total_tokens ?? (usage.input_tokens + usage.output_tokens) ?? '';
          if (tokens) console.log(`\x1b[90m(${tokens} tokens)\x1b[0m`);
        }
        history.push({ role: 'assistant', content: reply });
      } catch (err) {
        process.stdout.write('\x1b[2K');
        console.log(`\x1b[31merror:\x1b[0m ${err.message}`);
        history.pop(); // don't keep the failed user turn around
      }

      console.log('');
      ask();
    });
  };

  ask();
  rl.on('close', () => process.exit(0));
}

// ── One-shot mode: geoclaw chat "your question" ───────────────────────────────

async function oneShot(prompt) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
  const { reply } = await dispatch(messages);
  console.log(reply);
}

if (require.main === module) {
  const arg = process.argv.slice(2).join(' ').trim();
  if (arg) oneShot(arg).catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
  else     repl();
}
