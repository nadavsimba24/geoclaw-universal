#!/usr/bin/env node
// Geoclaw autonomous agent — plans, calls tools, spawns subagents.

const https = require('https');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { URL } = require('url');

try {
  require('dotenv').config({
    path: path.join(process.env.GEOCLAW_DIR || path.join(__dirname, '..', '..'), '.env'),
  });
} catch { /* dotenv is optional — env vars from the shell still work */ }

const memory = require('./memory.js');
const tts    = require('./tts.js');
const { env } = require('./env.js');

const PROVIDER = env('GEOCLAW_MODEL_PROVIDER', 'deepseek').toLowerCase();
const MODEL    = env('GEOCLAW_MODEL_NAME', 'deepseek-chat');
const API_KEY  = env('GEOCLAW_MODEL_API_KEY');
const BASE_URL = env('GEOCLAW_MODEL_BASE_URL');
const MAX_STEPS = parseInt(process.env.GEOCLAW_AGENT_MAX_STEPS || '12', 10);
const TOOL_TIMEOUT_MS = parseInt(process.env.GEOCLAW_TOOL_TIMEOUT_MS || '30000', 10);
const LLM_TIMEOUT_MS  = parseInt(process.env.GEOCLAW_LLM_TIMEOUT_MS  || '60000', 10);
const MAX_SUBAGENT_DEPTH = parseInt(process.env.GEOCLAW_SUBAGENT_MAX_DEPTH || '2', 10);

// ── Tool catalog ──────────────────────────────────────────────────────────────

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save a fact to long-term memory (in the active workspace).',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: 'Search the workspace knowledge base. Call before answering factual questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description:
        'Delegate a narrower sub-task to a child agent. Use this to decompose complex goals. ' +
        'The child inherits the current workspace. Returns the child\'s final summary.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Clear, self-contained goal for the subagent.' },
          max_steps: { type: 'integer', description: 'Cap on child\'s tool-call steps (default 8).' },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monday_list_boards',
      description: 'List all Monday.com boards the user has access to.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monday_get_board',
      description: "Get a Monday.com board's columns and items.",
      parameters: {
        type: 'object',
        properties: { boardId: { type: 'string' } },
        required: ['boardId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monday_create_item',
      description: 'Create a new item on a Monday.com board.',
      parameters: {
        type: 'object',
        properties: {
          boardId:  { type: 'string' },
          itemName: { type: 'string' },
        },
        required: ['boardId', 'itemName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_telegram',
      description: 'Send a message to a Telegram chat via the configured bot.',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string' },
          text:   { type: 'string' },
        },
        required: ['chatId', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'speak',
      description: 'Narrate a short message out loud via text-to-speech. Use sparingly — for key updates, not every step.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Pause and ask the user a clarifying question. Only works in interactive mode.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'design_tokens',
      description:
        'Read a DESIGN.md file and return its parsed tokens (colors, typography, spacing, rounded, components) and section list. ' +
        'Call this before generating UI code so you style with the right palette. Defaults to ./DESIGN.md.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to a DESIGN.md file. Defaults to ./DESIGN.md.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'design_lint',
      description:
        'Lint a DESIGN.md via @google/design.md — reports broken token references, WCAG contrast issues, and structural errors.',
      parameters: {
        type: 'object',
        properties: { file: { type: 'string' } },
        required: ['file'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'design_diff',
      description: 'Compare two DESIGN.md files (token-level + prose regressions) via @google/design.md.',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'string', description: 'Path to the baseline DESIGN.md.' },
          b: { type: 'string', description: 'Path to the candidate DESIGN.md.' },
        },
        required: ['a', 'b'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'design_export',
      description: 'Export a DESIGN.md to another format — "tailwind" (tailwind theme config JSON) or "dtcg" (Design Tokens CG JSON).',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          format: { type: 'string', enum: ['tailwind', 'dtcg'] },
        },
        required: ['file', 'format'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'design_init',
      description:
        'Scaffold a new DESIGN.md from a built-in starter template. ' +
        'Templates: editorial (premium, serious), corporate (enterprise), playful (friendly), brutalist (raw mono).',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Output path (e.g. ./DESIGN.md).' },
          template: { type: 'string', enum: ['editorial', 'corporate', 'playful', 'brutalist'] },
          name: { type: 'string', description: 'Optional: brand name to write into the YAML front matter.' },
        },
        required: ['file'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'design_suggest',
      description:
        'Generate a ready-to-use on-brand component snippet (HTML+CSS, sometimes React) using the tokens of a DESIGN.md. ' +
        'Supported components: button, card, input, heading.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          component: { type: 'string', enum: ['button', 'card', 'input', 'heading'] },
        },
        required: ['file', 'component'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Declare the goal complete with a short summary for the user.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
    },
  },
];

// ── Tool-availability checks (fail fast, clear message) ───────────────────────

function preflight(name) {
  if (name === 'send_telegram' && !env('GEOCLAW_TELEGRAM_BOT_TOKEN')) {
    return { ok: false, error: 'send_telegram unavailable: GEOCLAW_TELEGRAM_BOT_TOKEN not set.' };
  }
  if (name.startsWith('monday_') && !env('GEOCLAW_MONDAY_API_TOKEN')) {
    return { ok: false, error: 'Monday tools unavailable: GEOCLAW_MONDAY_API_TOKEN not set.' };
  }
  return { ok: true };
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name, args, ctx) {
  const check = preflight(name);
  if (!check.ok) return check;

  const runner = async () => {
    switch (name) {
      case 'remember': {
        const entry = memory.remember(args.text, { tags: args.tags || [] }, { workspace: ctx.workspace });
        return { ok: true, id: entry.id };
      }
      case 'recall': {
        const hits = memory.recall(args.query, args.limit || 5, { workspace: ctx.workspace });
        return { ok: true, results: hits.map(h => ({ id: h.id, text: h.text, score: h.score, source: h.source })) };
      }
      case 'spawn_subagent': {
        if (ctx.depth >= MAX_SUBAGENT_DEPTH) {
          return { ok: false, error: `Subagent depth limit reached (${MAX_SUBAGENT_DEPTH}).` };
        }
        const childSteps = Math.min(args.max_steps || 8, MAX_STEPS);
        const child = await runAgent(args.goal, {
          workspace: ctx.workspace,
          depth: ctx.depth + 1,
          maxSteps: childSteps,
          rl: ctx.rl,
          interactive: ctx.interactive,
          label: `subagent@${ctx.depth + 1}`,
        });
        return { ok: child.done, summary: child.summary, steps_used: child.stepsUsed };
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
      case 'design_tokens': {
        const design = require('./design.js');
        return design.summarize(args.file || 'DESIGN.md');
      }
      case 'design_lint': {
        const design = require('./design.js');
        return design.lint(args.file);
      }
      case 'design_diff': {
        const design = require('./design.js');
        return design.diff(args.a, args.b);
      }
      case 'design_export': {
        const design = require('./design.js');
        return design.exportFormat(args.file, args.format);
      }
      case 'design_init': {
        const design = require('./design.js');
        return design.init(args.file || 'DESIGN.md', {
          template: args.template || 'editorial',
          name: args.name,
        });
      }
      case 'design_suggest': {
        const design = require('./design.js');
        return design.suggestSnippet(args.file || 'DESIGN.md', args.component);
      }
      case 'send_telegram': {
        const token = env('GEOCLAW_TELEGRAM_BOT_TOKEN');
        const data = await postJSON(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {},
          { chat_id: args.chatId, text: args.text },
        );
        return { ok: data.ok === true, result: data };
      }
      case 'speak': {
        await tts.speak(args.text, { silent: true });
        return { ok: true };
      }
      case 'ask_user': {
        if (!ctx.interactive) {
          return { ok: false, error: 'ask_user unavailable in non-interactive mode. Make a decision and proceed, or call finish.' };
        }
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
  };

  // ask_user waits for the human — no timeout, users take as long as they take.
  if (name === 'ask_user') {
    try { return await runner(); }
    catch (e) { return { ok: false, error: e.message }; }
  }

  try {
    return await withTimeout(runner(), TOOL_TIMEOUT_MS, `tool ${name}`);
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

function postJSON(urlStr, headers, body, timeoutMs = LLM_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 500)}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error(`Bad JSON: ${chunks.slice(0, 400)}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function retrying(fn, { retries = 3, baseDelayMs = 800, label = 'LLM call' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const retryable =
        e.statusCode === 429 ||
        (e.statusCode >= 500 && e.statusCode < 600) ||
        /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|timed out/i.test(e.message || '');
      if (!retryable || attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      console.error(`\x1b[33m⚠  ${label} failed (${e.statusCode || e.code || 'err'}), retry ${attempt + 1}/${retries} in ${delay}ms\x1b[0m`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function chatWithTools(messages) {
  if (!API_KEY) throw new Error('GEOCLAW_MODEL_API_KEY not set — run: geoclaw setup');

  const endpoint =
    PROVIDER === 'openai'   ? 'https://api.openai.com/v1/chat/completions' :
    PROVIDER === 'deepseek' ? 'https://api.deepseek.com/chat/completions'  :
    BASE_URL                ? `${BASE_URL.replace(/\/+$/, '')}/chat/completions` :
    null;

  if (!endpoint) {
    throw new Error(
      `Agent mode requires an OpenAI-compatible provider (deepseek, openai, or custom).\n` +
      `Your current provider is "${PROVIDER}". Tool-calling on ${PROVIDER} isn't supported yet.\n` +
      `Run: geoclaw setup — and pick DeepSeek (option 1) or OpenAI (option 2).`,
    );
  }

  const data = await retrying(() => postJSON(endpoint, {
    'Authorization': `Bearer ${API_KEY}`,
  }, {
    model: MODEL,
    messages,
    tools: toolDefinitions,
    tool_choice: 'auto',
  }), { label: 'LLM tool call' });

  if (!data.choices?.[0]) throw new Error('LLM returned no choices: ' + JSON.stringify(data).slice(0, 400));
  return data.choices[0].message;
}

// ── Context trimming — keep history within ~40 messages ───────────────────────

const MAX_HISTORY = 40;
function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY) return messages;
  // Always keep system + user goal; drop the oldest middle messages.
  const head = messages.slice(0, 2);
  const tail = messages.slice(-(MAX_HISTORY - 3));
  return [...head, { role: 'system', content: '[earlier turns trimmed to fit context]' }, ...tail];
}

// ── Agent loop ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Geoclaw agent. You are given a GOAL and must achieve it by calling tools.

Rules:
- Plan before acting: on your first turn, outline your approach in the 'content' field, then call tools.
- Use tools aggressively — you can call multiple per turn.
- Before answering factual questions, call 'recall' to check your workspace knowledge.
- When you learn something reusable, call 'remember' to save it.
- For complex multi-part goals, call 'spawn_subagent' with a narrower sub-goal.
- When the goal is complete, call 'finish' with a short summary for the user.
- If you need user input and are told ask_user is unavailable, make the most reasonable decision and proceed.
- Keep going until you call 'finish'. Don't give up quietly.

Language policy:
- Write 'content' fields and the final 'finish' summary in the SAME language the user used in the goal.
- Hebrew goal → Hebrew narration and summary (עברית). Arabic → Arabic. Etc.
- Tool arguments stay in the language that makes sense for the tool (e.g. workspace names, commands, URLs stay in their native form).`;

async function runAgent(goal, opts = {}) {
  const workspace = opts.workspace || memory.activeWorkspace();
  const depth = opts.depth || 0;
  const maxSteps = opts.maxSteps || MAX_STEPS;
  const label = opts.label || 'agent';

  const interactive = (opts.interactive !== undefined)
    ? opts.interactive
    : Boolean(process.stdin.isTTY);

  let rl = opts.rl;
  let ownedRl = false;
  if (!rl && interactive) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    ownedRl = true;
  }

  if (depth === 0) {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Geoclaw Agent                             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`Goal:      ${goal}`);
    console.log(`Model:     ${PROVIDER}/${MODEL}`);
    console.log(`Workspace: ${workspace}`);
    if (!interactive) console.log(`Mode:      non-interactive (ask_user disabled)`);
    console.log('');
  } else {
    console.log(`\x1b[35m┌── ${label} (depth ${depth}) ──\x1b[0m`);
    console.log(`\x1b[35m│ Goal: ${goal}\x1b[0m`);
  }

  const ctx = { rl, done: false, summary: null, workspace, depth, interactive };

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + `\n\nActive workspace: ${workspace}` },
    { role: 'user',   content: `Goal: ${goal}` },
  ];

  let stepsUsed = 0;
  try {
    for (let step = 1; step <= maxSteps; step++) {
      stepsUsed = step;
      const stepLabel = depth === 0 ? `step ${step}/${maxSteps}` : `${label} step ${step}/${maxSteps}`;
      console.log(`\x1b[90m─── ${stepLabel} ───\x1b[0m`);

      let assistantMsg;
      try {
        assistantMsg = await chatWithTools(trimHistory(messages));
      } catch (e) {
        console.error(`\x1b[31m❌ LLM error:\x1b[0m ${e.message}`);
        return { done: false, summary: `LLM error: ${e.message}`, stepsUsed };
      }

      messages.push(assistantMsg);

      if (assistantMsg.content) {
        console.log(`\x1b[32m${label} ›\x1b[0m ${assistantMsg.content}`);
      }

      const toolCalls = assistantMsg.tool_calls || [];
      if (toolCalls.length === 0) {
        if (!ctx.done) console.log(`\x1b[33m(${label} responded without calling tools — ending)\x1b[0m`);
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

    if (depth === 0) {
      console.log('');
      if (ctx.done) console.log(`\x1b[32m✅ Agent finished:\x1b[0m ${ctx.summary || '(no summary provided)'}`);
      else          console.log(`\x1b[33m⚠  Agent hit the step limit (${maxSteps}). Set GEOCLAW_AGENT_MAX_STEPS to increase.\x1b[0m`);
    } else {
      console.log(`\x1b[35m└── ${label} done: ${ctx.summary || '(no summary)'}\x1b[0m`);
    }

    return { done: ctx.done, summary: ctx.summary, stepsUsed };
  } finally {
    if (ownedRl) rl.close();
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const goal = process.argv.slice(2).join(' ').trim();
  if (!goal) {
    console.log(`
Usage: geoclaw agent "your goal in plain English"

The agent plans, uses tools, and executes your goal autonomously.

Tools available:
  remember / recall          — long-term memory (workspace-scoped)
  spawn_subagent             — delegate a sub-task to a child agent
  monday_list_boards         — list Monday.com boards
  monday_get_board           — read a board
  monday_create_item         — create item on a board
  send_telegram              — send a Telegram message
  design_tokens              — read a DESIGN.md's tokens + sections
  design_lint                — lint a DESIGN.md (contrast, token refs)
  design_diff                — compare two DESIGN.md files
  design_export              — export tokens to tailwind/dtcg JSON
  design_init                — scaffold a new DESIGN.md from a template
  design_suggest             — generate an on-brand component snippet
  ask_user                   — pause and ask (interactive mode only)
  finish                     — declare the goal complete

Active workspace: ${memory.activeWorkspace()}
Override with:    GEOCLAW_WORKSPACE=<name> geoclaw agent "..."

Env:
  GEOCLAW_AGENT_MAX_STEPS        step cap           (default 12)
  GEOCLAW_TOOL_TIMEOUT_MS        per-tool timeout   (default 30000)
  GEOCLAW_LLM_TIMEOUT_MS         LLM call timeout   (default 60000)
  GEOCLAW_SUBAGENT_MAX_DEPTH     nesting cap        (default 2)

Examples:
  geoclaw agent "summarize my Monday.com board 5095065110"
  geoclaw agent "check memory for Q1 goals and draft a Telegram update"
  GEOCLAW_WORKSPACE=legal geoclaw agent "summarize the retention policy"
`);
    process.exit(0);
  }
  runAgent(goal).catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}

module.exports = { runAgent, toolDefinitions, callTool };
