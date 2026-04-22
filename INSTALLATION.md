# Geoclaw — Installation & Capabilities Guide

Geoclaw is a **Universal Agent Platform** you install once and use on the
terminal. It gives you a chat interface to any major LLM, a workspace-scoped
knowledge base, document ingestion (RAG), and an autonomous tool-calling agent
that can spawn subagents for complex goals.

This guide takes you from zero to a working install, then walks through every
capability in the order you're most likely to use them.

---

## 1. Requirements

| Requirement | Version | Why |
|---|---|---|
| Node.js     | ≥ 18    | Runtime |
| npm         | ≥ 8     | Install |
| OS          | macOS / Linux / Windows / WSL2 | Cross-platform |
| Git         | any recent | For the `npm install` from GitHub |

Optional, activated on first use:

| Optional dep | Activates | Install command |
|---|---|---|
| `pdf-parse`  | `.pdf` ingestion    | `npm install -g pdf-parse` |
| `mammoth`    | `.docx` ingestion   | `npm install -g mammoth` |
| `xlsx`       | `.xlsx` ingestion   | `npm install -g xlsx` |

---

## 2. Install

### One-line install (recommended, all platforms)

```bash
npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
```

### Windows (PowerShell, run as Administrator if you hit permission errors)

```powershell
npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
```

### From a local clone (contributors / air-gapped environments)

```bash
git clone https://github.com/nadavsimba24/geoclaw-universal.git
cd geoclaw-universal
npm install
npm link   # makes `geoclaw` available globally
```

### Verify

```bash
geoclaw --help
```

You should see the command list including `chat`, `agent`, `remember`,
`recall`, `ingest`, `workspace`, `memory`.

---

## 3. First-time setup

```bash
geoclaw setup
```

The wizard is a 10-section interactive flow. The two sections you **must**
complete to use the new capabilities:

1. **LLM Model** — pick a provider and paste an API key. Any OpenAI-compatible
   provider works for the agent (DeepSeek, OpenAI, custom). Chat also works
   with Anthropic, Google, and Ollama.
2. **Memory / Knowledge base** — confirms `~/.geoclaw/` is writable.

The other sections (Monday.com, Telegram, n8n, MCP, QGIS, etc.) are optional —
enable whatever you'll actually use.

Everything the wizard collects is stored in a `.env` file in the install
directory. You can re-run `geoclaw setup` any time to change it.

---

## 4. Core commands at a glance

| Command | What it does |
|---|---|
| `geoclaw chat`                  | Interactive LLM chat with knowledge-base context |
| `geoclaw chat "one-shot"`       | Single Q&A, prints the reply and exits |
| `geoclaw agent "<goal>"`        | Autonomous agent — plans, calls tools, finishes |
| `geoclaw remember "<text>"`     | Save a fact to the active workspace |
| `geoclaw recall "<query>"`      | Relevance-ranked search over the knowledge base |
| `geoclaw ingest <file>`         | Chunk a document into searchable memories (RAG) |
| `geoclaw workspace <sub>`       | Manage workspaces (list/create/use/delete) |
| `geoclaw memory <sub>`          | list / forget / stats / export / clear |
| `geoclaw monday <sub>`          | Monday.com boards, items, updates |
| `geoclaw mcp <sub>`             | MCP server discovery & calls |
| `geoclaw setup`                 | Re-run the setup wizard |
| `geoclaw doctor`                | Diagnose install issues |

---

## 5. Chat — talk to your configured LLM

```bash
geoclaw chat
```

What you get:
- A REPL prompt with `Provider`, `Model`, and active `Workspace` shown.
- Every turn, the top 5 most relevant memories from your active workspace are
  injected into the system prompt automatically (RAG on your own knowledge).
- Commands inside the chat: `/exit`, `/clear`, `/system`, `/help`.

One-shot mode:

```bash
geoclaw chat "what's our retention policy for financial records?"
```

---

## 6. Knowledge base — remember, recall, ingest

The knowledge base is a local JSON store at
`~/.geoclaw/workspaces/<workspace>/memory.json`. It survives reinstalls. All
writes are atomic and protected by a file lock — safe for concurrent use.

### Remember a fact

```bash
geoclaw remember "Anna is the compliance lead; escalate GDPR questions to her"
```

### Search by relevance

```bash
geoclaw recall "who handles GDPR?"
```

Scoring is token-overlap + substring match (no embeddings, no network calls).
Works well up to a few thousand entries.

### Ingest a document

```bash
geoclaw ingest policy.pdf
geoclaw ingest notes.md --tag work
geoclaw ingest data.xlsx --tag accounting --replace
```

Supported formats: `.txt`, `.md`, `.pdf`, `.docx`, `.xlsx`, `.csv`, `.json`,
`.html`, `.log`. PDF/DOCX/XLSX require the optional packages listed in §1.

Documents are chunked at paragraph boundaries (≈800 chars, 100-char overlap).
Each chunk is tagged with `file:<basename>` and `chunk:N/total`.

**Re-ingesting** the same file is a no-op unless the content changed —
content-hash dedup is on by default. Use `--replace` to force a refresh.

### Drop all chunks from a source

```bash
geoclaw ingest --remove old-policy.pdf
```

### Other knowledge-base ops

```bash
geoclaw memory list        # show every memory in the active workspace
geoclaw memory stats       # counts and storage location
geoclaw memory export backup.json
geoclaw forget <memory-id>
geoclaw memory clear --yes # wipe the active workspace
```

---

## 7. Workspaces — multi-tenant knowledge

Workspaces keep teams / departments / clients isolated. Each workspace has its
own memory file; nothing leaks between them.

```bash
geoclaw workspace list                      # show all, marks the active one
geoclaw workspace create legal              # make a new workspace
geoclaw workspace use legal                 # make it sticky (default for all commands)
geoclaw workspace current                   # print the active workspace name
geoclaw workspace delete acme-demo --yes    # delete a workspace
```

Use a workspace just for one command without changing the default:

```bash
GEOCLAW_WORKSPACE=accounting geoclaw recall "invoice format"
GEOCLAW_WORKSPACE=legal      geoclaw agent "summarize retention rules"
```

The `default` workspace is created automatically. Any legacy
`~/.geoclaw/memory.json` from earlier versions is migrated into `default` on
first run.

Typical business layout:

```
~/.geoclaw/workspaces/
├── default/        general-purpose notes
├── legal/          contracts, policies, regulations
├── accounting/     invoices, ledgers, tax guides
├── ops/            SOPs, runbooks
└── client-acme/    dedicated per-client KB
```

---

## 8. Agent — autonomous goal execution

```bash
geoclaw agent "summarize my Monday.com board 5095065110 and post it to Telegram"
```

What the agent does:

1. Reads the goal, plans its approach (visible in `content` field).
2. Calls tools — one or many per turn — to make progress.
3. Loops until it calls `finish`, hits the step limit, or you stop it.

### Available tools

| Tool | Purpose |
|---|---|
| `remember`          | Save to the active workspace |
| `recall`            | Search the workspace |
| `spawn_subagent`    | Delegate a sub-task to a child agent |
| `monday_list_boards`| List Monday.com boards |
| `monday_get_board`  | Read a board's columns and items |
| `monday_create_item`| Create an item on a board |
| `send_telegram`     | Send a chat message |
| `ask_user`          | Pause and ask (interactive mode only) |
| `finish`            | Declare the goal complete |

### Subagents (delegation)

A subagent is a child agent with its own goal, inheriting the parent's
workspace. Use them to decompose work:

> Parent: "Onboard Acme: build a client KB and draft a welcome email."
>
> → `spawn_subagent("ingest all contracts in ./acme/ into workspace client-acme")`
>
> → `spawn_subagent("draft a welcome email based on recall('onboarding checklist')")`

Nesting is capped (default depth 2) to prevent runaway recursion.

### Safety and reliability

| Setting | Default | What it does |
|---|---|---|
| `GEOCLAW_AGENT_MAX_STEPS`    | 12     | Step cap — kills infinite loops |
| `GEOCLAW_TOOL_TIMEOUT_MS`    | 30 000 | Per-tool timeout |
| `GEOCLAW_LLM_TIMEOUT_MS`     | 60 000 | LLM request timeout |
| `GEOCLAW_SUBAGENT_MAX_DEPTH` | 2      | Max subagent nesting |

Transient LLM errors (429, 5xx, connection resets) are retried with
exponential backoff — up to 3 retries. In non-interactive mode (`ask_user`
unavailable), the agent is told to make the best decision and proceed
instead of hanging.

### Provider compatibility

| Provider    | Chat | Agent (tool calls) |
|---|---|---|
| DeepSeek    | ✅  | ✅ |
| OpenAI      | ✅  | ✅ |
| Anthropic   | ✅  | ❌ (not yet) |
| Google      | ✅  | ❌ (not yet) |
| Ollama      | ✅  | ❌ (not yet) |
| Custom OpenAI-compatible (via `GEOCLAW_MODEL_BASE_URL`) | ✅ | ✅ |

Switch providers any time with `geoclaw setup`.

---

## 9. Voice (text-to-speech)

Geoclaw can read replies out loud. Two backends:

| Backend | Quality | Setup | Works offline |
|---|---|---|---|
| `system` (default) | basic | none — uses OS voices | ✅ |
| `openai`           | excellent | needs an OpenAI API key | ❌ |

### System voices (works out of the box)
- macOS: built-in `say`
- Windows: built-in PowerShell SAPI
- WSL2: routes through Windows SAPI automatically
- Linux: needs `espeak-ng` or `espeak` (or `festival`)
  ```bash
  sudo apt install espeak-ng
  ```

### Using it

```bash
geoclaw say "hello from geoclaw"           # one-off TTS
geoclaw chat --voice                       # chat with replies spoken
you › /voice on                            # toggle mid-conversation
```

The agent has a `speak` tool too, so goals like
`geoclaw agent "summarize the last invoice and announce it"` will narrate.

### Upgrading to high-quality voice

```bash
export GEOCLAW_TTS_PROVIDER=openai
export GEOCLAW_TTS_OPENAI_KEY=sk-...       # or reuse OPENAI_API_KEY
export GEOCLAW_TTS_VOICE=alloy             # alloy | echo | fable | onyx | nova | shimmer
export GEOCLAW_TTS_MODEL=tts-1             # or tts-1-hd
```

Requires an audio player on Linux (`mpg123`, `ffplay`, `paplay`, or `aplay`).
macOS and Windows use built-in players.

---

## 10. Uploading files — web UI and Telegram bot

CLI `geoclaw ingest` is great for admins. End users need easier paths.

### Web UI — `geoclaw upload`

```bash
geoclaw upload
# → http://127.0.0.1:7711
```

What it gives you:
- Drag-and-drop any supported file (multi-file OK).
- Workspace dropdown — switch or create workspaces inline.
- Add single facts, search the KB, list entries, forget individual memories,
  remove all chunks from a source file.
- Zero external dependencies; the whole UI is served from one Node file.

By default the server binds to `127.0.0.1` (localhost only). To expose it to a
small LAN team, set a passphrase and bind externally:

```bash
export GEOCLAW_WEB_HOST=0.0.0.0
export GEOCLAW_WEB_PASSPHRASE="pick-a-long-random-string"
export GEOCLAW_WEB_PORT=7711
geoclaw upload
```

⚠ If you bind to `0.0.0.0` without a passphrase you'll get a loud warning —
don't do that on a shared network.

### Telegram bot — `geoclaw bot`

Every end user's phone is already a capable upload client. The bot accepts
documents and text and writes them to a workspace that's pinned per chat.

Setup:

```bash
# 1. Create a bot via @BotFather on Telegram, copy the token.
# 2. Save it:
export GEOCLAW_TELEGRAM_BOT_TOKEN="123456:ABC..."
# 3. Lock it down to known users (STRONGLY recommended):
export GEOCLAW_TELEGRAM_ALLOWED_IDS="11111,22222,33333"
# 4. Optional: default workspace for new chats
export GEOCLAW_TELEGRAM_DEFAULT_WS="telegram"
# 5. Start it:
geoclaw bot
```

How end users interact:

| Action | What happens |
|---|---|
| Send `/start`           | Bot replies with help and the user's chat ID |
| Send any text           | Saved as a memory in that chat's workspace |
| Send a document         | Ingested (PDF, DOCX, XLSX, TXT, MD, CSV, …) |
| Send `/recall <q>`      | Top matches from their workspace |
| Send `/workspace <name>`| Switch this chat to a workspace |
| Send `/workspaces`      | List available workspaces |
| Send `/list`            | Recent memories |
| Send `/forget <id>`     | Delete a memory |

Per-chat workspace bindings live at `~/.geoclaw/telegram-bindings.json`.

Tip: to find a user's chat ID, have them DM the bot `/start` — the reply
includes it. Add it to `GEOCLAW_TELEGRAM_ALLOWED_IDS` and restart.

---

## 11. Business-deployment patterns

These are the shapes that work well for regulated / multi-department use.

### Municipal — one workspace per department

```bash
geoclaw workspace create parks
geoclaw workspace create planning
geoclaw workspace create finance
GEOCLAW_WORKSPACE=planning geoclaw ingest zoning-ordinance.pdf --tag policy
GEOCLAW_WORKSPACE=planning geoclaw agent "draft a citizen-facing FAQ on residential setbacks"
```

### Bank — strict isolation per business line

```bash
geoclaw workspace create retail
geoclaw workspace create private-banking
GEOCLAW_WORKSPACE=retail geoclaw ingest kyc-policy-v3.docx
GEOCLAW_WORKSPACE=retail geoclaw chat
you › what's the KYC refresh cadence for retail clients?
```

### Accounting firm — one workspace per client

```bash
geoclaw workspace create client-acme
geoclaw ingest acme-q1-ledger.xlsx --tag q1-2026
geoclaw ingest acme-tax-letters.pdf
geoclaw agent "draft a summary of Q1 material variances for the Acme file"
```

---

## 12. Troubleshooting

### `npm: command not found`
Install Node.js from https://nodejs.org/.

### Permission errors installing globally (Linux/macOS)

```bash
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Windows execution policy blocks the install script

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `GEOCLAW_MODEL_API_KEY not set — run: geoclaw setup`
You haven't completed the Model section of `geoclaw setup`, or you ran the
command from a shell that didn't load the `.env` file. Re-run `geoclaw setup`.

### `Agent mode requires an OpenAI-compatible provider`
You're on Anthropic / Google / Ollama, and the agent's tool-calling isn't
supported there yet. Run `geoclaw setup` and pick DeepSeek or OpenAI.

### PDF ingest fails with "pdf-parse not installed"

```bash
npm install -g pdf-parse    # for .pdf
npm install -g mammoth      # for .docx
npm install -g xlsx         # for .xlsx
```

### Agent seems stuck
Agents can take 30–60s per step when the LLM provider is slow. Check the
step counter — you'll see `─── step N/12 ───` printed each turn. If it's
truly stuck, Ctrl-C is safe; no data is ever half-written (atomic rename).

### Memory corruption / lock-file left behind
If a process is killed mid-write, a stale `memory.lock` is cleaned up after
10 seconds automatically. To force-clear immediately:

```bash
rm ~/.geoclaw/workspaces/<workspace>/memory.lock
```

### Diagnose the install

```bash
geoclaw doctor
```

---

## 13. Environment variables (reference)

| Variable | Purpose |
|---|---|
| `GEOCLAW_MODEL_PROVIDER`     | `deepseek` / `openai` / `anthropic` / `google` / `ollama` / `custom` |
| `GEOCLAW_MODEL_NAME`         | e.g. `deepseek-chat`, `gpt-4o`, `claude-opus-4-7` |
| `GEOCLAW_MODEL_API_KEY`      | API key for the provider |
| `GEOCLAW_MODEL_BASE_URL`     | For `custom` or self-hosted OpenAI-compatible endpoints |
| `GEOCLAW_WORKSPACE`          | Override the active workspace for one command |
| `GEOCLAW_AGENT_MAX_STEPS`    | Step cap for the agent loop |
| `GEOCLAW_TOOL_TIMEOUT_MS`    | Per-tool timeout (ms) |
| `GEOCLAW_LLM_TIMEOUT_MS`     | Per-LLM-request timeout (ms) |
| `GEOCLAW_SUBAGENT_MAX_DEPTH` | Subagent nesting cap |
| `GEOCLAW_MONDAY_API_TOKEN`   | Monday.com API token |
| `GEOCLAW_TELEGRAM_BOT_TOKEN` | Telegram bot token (for `geoclaw bot`) |
| `GEOCLAW_TELEGRAM_ALLOWED_IDS` | Comma-separated chat IDs allowed to use the bot |
| `GEOCLAW_TELEGRAM_DEFAULT_WS`  | Default workspace for new Telegram chats |
| `GEOCLAW_TELEGRAM_MAX_BYTES`   | Max upload size for bot ingest (default 20 MB) |
| `GEOCLAW_TTS_PROVIDER`       | `system` / `openai` / `off` |
| `GEOCLAW_TTS_OPENAI_KEY`     | API key for OpenAI TTS (falls back to `OPENAI_API_KEY`) |
| `GEOCLAW_TTS_MODEL`          | OpenAI TTS model (`tts-1`, `tts-1-hd`) |
| `GEOCLAW_TTS_VOICE`          | OpenAI TTS voice (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`) |
| `GEOCLAW_WEB_HOST`           | Bind host for `geoclaw upload` (default `127.0.0.1`) |
| `GEOCLAW_WEB_PORT`           | Bind port for `geoclaw upload` (default `7711`) |
| `GEOCLAW_WEB_PASSPHRASE`     | Required for auth when binding to non-localhost |
| `GEOCLAW_WEB_MAX_BYTES`      | Max upload size via web UI (default 100 MB) |
| `GEOCLAW_DIR`                | Override the install directory (usually auto-detected) |

These are set by `geoclaw setup` into a `.env` file. You can also set them
ad-hoc in your shell for a single command.

---

## 14. Where data lives

```
~/.geoclaw/
├── active-workspace                   current workspace name
├── workspaces/
│   ├── default/
│   │   ├── memory.json                the knowledge base
│   │   └── memory.lock                (transient, only during writes)
│   ├── legal/
│   ├── accounting/
│   └── ...
└── memory.json.migrated               (if migrated from pre-workspace install)
```

Back up `~/.geoclaw/workspaces/` to back up your entire knowledge base.

---

## 15. Uninstall

```bash
npm uninstall -g geoclaw-universal
# Optional: also delete your knowledge base
rm -rf ~/.geoclaw
```

---

## 16. Getting help

- **Built-in help**: `geoclaw --help`
- **Doctor**: `geoclaw doctor`
- **GitHub issues**: https://github.com/nadavsimba24/geoclaw-universal/issues

When filing an issue, include:
- Your OS and `node --version`
- The exact command that failed
- The full error output (set `DEBUG=1` for a stack trace)

---

Welcome to Geoclaw.
