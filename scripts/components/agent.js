#!/usr/bin/env node
// Geoclaw autonomous agent — give it a goal, it plans and executes using available tools

const https = require('https');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { URL } = require('url');

require('dotenv').config({
  path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
});

const memory = require('./memory.js');

const PROVIDER = (process.env.GEOCLAW_MODEL_PROVIDER || 'deepseek').toLowerCase();
const MODEL    = process.env.GEOCLAW_MODEL_NAME || 'deepseek-chat';
const API_KEY  = process.env.GEOCLAW_MODEL_API_KEY || '';
const BASE_URL = process.env.GEOCLAW_MODEL_BASE_URL || '';
const MAX_STEPS = parseInt(process.env.GEOCLAW_AGENT_MAX_STEPS || '12', 10);

// ── Tool catalog (what the agent can actually do) ─────────────────────────────

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save a fact or note to long-term memory. Use this when you learn something the user or future-you would want to remember.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The fact to remember.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: 'Search long-term memory for relevant facts. Use before answering factual questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for.' },
          limit: { type: 'integer', description: 'Max results (default 5).' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'monday_list_boards',
      description: 'List all Monday.com boards the user has access to.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'monday_get_board',
      description: 'Get a Monday.com board\'s columns and items.',
      parameters: {
        type: 'object',
        properties: { boardId: { type: 'string' } },
        required: ['boardId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'monday_create_item',
      description: 'Create a new item on a Monday.com board.',
      parameters: {
        type: 'object',
        properties: {
          boardId: { type: 'string' },
          itemName: { type: 'string' }
        },
        required: ['boardId', 'itemName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_telegram',
      description: 'Send a message to a Telegram chat via the configured bot.',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'Telegram chat ID or username.' },
          text:   { type: 'string' }
        },
        required: ['chatId', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Pause and ask the user a clarifying question. Use when you\'re stuck or need a decision.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Declare the goal complete. Call this when you\'re done. Summary goes to the user.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary']
      }
    }
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name, args, ctx) {
  try {
    switch (name) {
      case 'remember': {
        const entry = memory.remember(args.text, { tags: args.tags || [] });
        return { ok: true, id: entry.id };
      }
      case 'recall': {
        const hits = memory.recall(args.query, args.limit || 5);
        return { ok: true, results: hits.map(h => ({ id: h.id, text: h.text, score: h.score })) };
      }
      case 'monday_list_boards': {
        const monday = require('./monday-integration.js');
        const boards = await monday.listBoards();
        return { ok: true, boards };
      }
      case 'monday_get_board': {
        const monday = require('./monday-integration.js');
        const board = await monday.getBoard(args.boardId);
        return { ok: true, board };
      }
      case 'monday_create_item': {
        const monday = require('./monday-integration.js');
        const item = await monday.createItem(args.boardId, args.itemName);
        return { ok: true, item };
      }
      case 'send_telegram': {
        const token = process.env.GEOCLAW_TELEGRAM_BOT_TOKEN;
        if (!token) return { ok: false, error: 'GEOCLAW_TELEGRAM_BOT_TOKEN not set' };
        const data = await postJSON(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {},
          { chat_id: args.chatId, text: args.text }
        );
        return { ok: data.ok === true, result: data };
      }
      case 'ask_user': {
        const reply = await askUser(args.question, ctx.rl);
        return { ok: true, answer: reply };
      }
      case 'finish': {
        ctx.done = true;
        ctx.summary = args.summary;
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function askUser(question, rl) {
  return new Promise((resolve) => {
    rl.question(`\x1b[33m🤔 agent asks:\x1b[0m ${question}\n\x1b[36myou ›\x1b[0m `, (answer) => {
      resolve(answer.trim());
    });
  });
}

// ── LLM plumbing ──────────────────────────────────────────────────────────────

function postJSON(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let chunks = '';
      res.on('data', c => (chunks += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 500)}`));
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

// OpenAI-compatible tool-calling (DeepSeek, OpenAI, custom)
async function chatWithTools(messages) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY not set — run: geoclaw setup');

  const endpoint =
    PROVIDER === 'openai'    ? 'https://api.openai.com/v1/chat/completions' :
    PROVIDER === 'deepseek'  ? 'https://api.deepseek.com/chat/completions' :
    BASE_URL                 ? `${BASE_URL.replace(/\/+$/, '')}/chat/completions` :
    null;

  if (!endpoint) {
    throw new Error(
      `Agent mode requires an OpenAI-compatible provider (deepseek, openai, or custom).\n` +
      `Your current provider is "${PROVIDER}". Tool-calling on ${PROVIDER} isn't supported yet.\n` +
      `Run: geoclaw setup — and pick DeepSeek (option 1) or OpenAI (option 2).`
    );
  }

  const data = await postJSON(endpoint, {
    'Authorization': `Bearer ${API_KEY}`,
  }, {
    model: MODEL,
    messages,
    tools: toolDefinitions,
    tool_choice: 'auto',
  });

  if (!data.choices?.[0]) throw new Error('LLM returned no choices: ' + JSON.stringify(data).slice(0, 400));
  return data.choices[0].message;
}

// ── Agent loop ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Geoclaw agent. You are given a GOAL and must achieve it by calling tools.

Rules:
- Plan before acting: on your first turn, briefly outline your approach in the 'content' field, then call tools.
- Use tools aggressively — you can call multiple per turn.
- Before answering factual questions, call 'recall' to check your memory.
- When you learn something reusable, call 'remember' to save it.
- When the goal is complete, call 'finish' with a short summary for the user.
- If you're blocked or need a decision, call 'ask_user' — don't guess.
- Keep going until you call 'finish'. Don't give up quietly.`;

async function runAgent(goal) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Geoclaw Agent                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Goal: ${goal}`);
  console.log(`Model: ${PROVIDER}/${MODEL}`);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ctx = { rl, done: false, summary: null };

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Goal: ${goal}` },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\x1b[90m─── step ${step}/${MAX_STEPS} ───\x1b[0m`);
    let assistantMsg;
    try {
      assistantMsg = await chatWithTools(messages);
    } catch (e) {
      console.error(`\x1b[31m❌ LLM error:\x1b[0m ${e.message}`);
      rl.close();
      return;
    }

    messages.push(assistantMsg);

    if (assistantMsg.content) {
      console.log(`\x1b[32magent ›\x1b[0m ${assistantMsg.content}`);
    }

    const toolCalls = assistantMsg.tool_calls || [];
    if (toolCalls.length === 0) {
      // No tool calls and no explicit finish — treat content as final answer
      if (!ctx.done) {
        console.log(`\x1b[33m(agent responded without calling tools — ending)\x1b[0m`);
      }
      break;
    }

    for (const call of toolCalls) {
      let parsedArgs;
      try { parsedArgs = JSON.parse(call.function.arguments || '{}'); }
      catch { parsedArgs = {}; }

      console.log(`\x1b[34m  ⚙  ${call.function.name}(${JSON.stringify(parsedArgs).slice(0, 120)})\x1b[0m`);
      const result = await callTool(call.function.name, parsedArgs, ctx);
      const preview = JSON.stringify(result).slice(0, 160);
      console.log(`\x1b[90m     → ${preview}${preview.length >= 160 ? '...' : ''}\x1b[0m`);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });

      if (ctx.done) break;
    }

    if (ctx.done) break;
  }

  console.log('');
  if (ctx.done) {
    console.log(`\x1b[32m✅ Agent finished:\x1b[0m ${ctx.summary || '(no summary provided)'}`);
  } else {
    console.log(`\x1b[33m⚠  Agent hit the step limit (${MAX_STEPS}). Set GEOCLAW_AGENT_MAX_STEPS to increase.\x1b[0m`);
  }
  rl.close();
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const goal = process.argv.slice(2).join(' ').trim();
  if (!goal) {
    console.log(`
Usage: geoclaw agent "your goal in plain English"

The agent plans, uses tools, and executes your goal autonomously.

Available tools:
  remember / recall          — long-term memory
  monday_list_boards         — list Monday.com boards
  monday_get_board           — read a board
  monday_create_item         — create item on a board
  send_telegram              — send a Telegram message
  ask_user                   — pause and ask for clarification
  finish                     — declare the goal complete

Examples:
  geoclaw agent "summarize my Monday.com board 5095065110"
  geoclaw agent "remember that Anna's DB password is in the vault"
  geoclaw agent "check memory for our Q1 goals and draft a Telegram update"

Env:
  GEOCLAW_AGENT_MAX_STEPS    default 12 — safety limit on tool calls
`);
    process.exit(0);
  }
  runAgent(goal).catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}

module.exports = { runAgent, toolDefinitions };
