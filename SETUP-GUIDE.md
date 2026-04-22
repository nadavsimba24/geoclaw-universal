# Geoclaw Setup Guide — What to Type at Every Question

This guide walks through every prompt in `geoclaw setup` and tells you **exactly what to type**, **why it matters**, and **where to get credentials**.

**Golden rule:** Press **Enter** at any prompt to accept the shown default. Skip anything you don't need — you can re-run `geoclaw setup` any time to change things.

---

## Section 1/10 — Project Identity

> **Project name** `[geoclaw-universal]`

A friendly label for this Geoclaw instance. Just press **Enter** unless you run multiple instances (e.g. one for personal, one for work).

> **Runtime mode (cli / docker)** `[cli]`

- **cli** (default): Runs directly on your machine. Fast, simple. Choose this.
- **docker**: Runs in an isolated container. Only pick this if you have Docker installed and want sandbox isolation.

**What to type:** `cli` (just press Enter).

---

## Section 2/10 — LLM Model (REQUIRED)

This is the AI brain. Geoclaw cannot think without it. Pick **one** provider.

> **Choice** `[1]`

### Option 1 — DeepSeek (recommended for cost)
- **Cheap**: ~$0.14 per million tokens (100× cheaper than GPT-4)
- **Fast**: Strong reasoning, good for agents
- **Get key**: https://platform.deepseek.com → API Keys → Create
- Model name to enter: `deepseek-chat` (the default)

### Option 2 — OpenAI (GPT-4o)
- **Balanced**: Great quality, moderate price
- **Get key**: https://platform.openai.com/api-keys
- Model name options: `gpt-4o-mini` (cheap), `gpt-4o` (premium), `gpt-4-turbo`

### Option 3 — Anthropic (Claude)
- **Best for code**: Claude Sonnet 4 is top-tier for programming
- **Get key**: https://console.anthropic.com/settings/keys
- Model name options: `claude-sonnet-4`, `claude-opus-4-7`, `claude-haiku-4-5`

### Option 4 — Google (Gemini)
- **Free tier available**, multimodal (images/video)
- **Get key**: https://aistudio.google.com/apikey
- Model name options: `gemini-2.0-flash` (fast), `gemini-pro` (balanced)

### Option 5 — Ollama (local, free)
- **No API key needed** — runs models on your own machine
- **Install first**: https://ollama.ai → `ollama pull llama3.2`
- **Private**: Nothing leaves your computer
- **Slower**: Depends on your hardware
- Ollama URL: `http://localhost:11434` (default, just press Enter)

### Option 6 — Custom
- Any OpenAI-compatible endpoint (Mistral, Groq, Together.ai, OpenRouter, LM Studio, etc.)
- You'll be asked for Provider ID, Model name, Base URL, API key

### Option 7 — Skip
Configure later by editing `.env` directly.

> **API key (hidden)**

Paste your key. Input is hidden — you won't see characters as you type. Press Enter when done.

**What to type:** **Choose 1 (DeepSeek)** if you want cheap + simple. Paste your key.

---

## Section 3/10 — Central Intelligence (Memory)

> **Enable persistent memory?** `[Y/n]`

Without this: Geoclaw forgets everything between sessions (like ChatGPT free tier).
With this: Geoclaw remembers conversations, your preferences, facts about your projects — across days, weeks, restarts.

**Recommended: Yes** (press Enter).

> **Central Intelligence API key (blank = use local fallback)**

- **If you have one**: Paste it for cloud sync across devices.
- **If you don't** (most users): **Just press Enter.** Geoclaw will use a local memory file on your machine, which works fine for a single device.

**What to type:** Press Enter twice (Y, then blank key).

---

## Section 4/10 — MCP (Model Context Protocol)

MCP is the standard protocol that lets AI tools talk to each other.

> **Enable MCPorter (discover external MCP tools)?** `[Y/n]`

MCPorter auto-finds MCP servers that are already configured in your other editors (Cursor, Claude Desktop, VS Code) and lets Geoclaw use **all** their tools without extra setup. Instant access to 100+ tools like GitHub, Linear, Vercel, Chrome DevTools.

**Recommended: Yes** (press Enter).

> **Enable Geoclaw MCP server (expose tools to other agents)?** `[y/N]`

Only enable if you want **other** AI tools (Claude Desktop, Raycast, Cursor) to be able to call Geoclaw's features. For most users this is **No**.

**What to type:** Yes, then No. (Or: Enter, Enter — the defaults are correct.)

---

## Section 5/10 — Messaging Platforms

These let you chat with Geoclaw through Telegram, Slack, WhatsApp, or Signal instead of the terminal. Each one is optional — answer No to any you don't use.

### Telegram

> **Enable Telegram?** `[y/N]`

Say Yes if you want to talk to Geoclaw from your phone via a Telegram bot.

> **Telegram bot token (hidden)**

**How to get it:**
1. Open Telegram → search `@BotFather` → start chat
2. Send `/newbot`
3. Give it a name and username (must end in `bot`)
4. BotFather replies with a token like `7382746:AAE-xxxxxx-yyyyy`
5. Paste that token here.

### Slack

> **Enable Slack?** `[y/N]`

Say Yes if you want Geoclaw in a Slack channel or DM.

> **Slack bot token (xoxb-...)** and **Slack app token (xapp-...)**

**How to get them:**
1. Go to https://api.slack.com/apps → **Create New App** → From scratch
2. Name it "Geoclaw", pick your workspace
3. **OAuth & Permissions** → add scopes: `chat:write`, `channels:read`, `im:history`
4. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-...`) → paste as bot token
5. **Basic Information** → App-Level Tokens → Generate Token with `connections:write` scope → copy (`xapp-...`) → paste as app token

### WhatsApp (Meta Cloud API)

> **Enable WhatsApp?** `[y/N]`

WhatsApp Business Cloud API only. **Requires Meta Developer account** (business verification).

> **Phone number ID** and **Cloud API token**

**How to get them:**
1. https://developers.facebook.com → create app → Add **WhatsApp** product
2. Getting Started page shows:
   - **Phone number ID** (a long digit string)
   - **Temporary access token** (paste as Cloud API token)
3. For production, generate a permanent System User token.

### Signal

> **Enable Signal?** `[y/N]`

Requires `signal-cli` installed separately. Most users skip this.

> **Signal account**

Your phone number with country code: `+14155551234`. Must be registered in `signal-cli` first.

**What to type for this whole section:** If you don't use messaging bots, press **N** four times (No to all).

---

## Section 6/10 — Enterprise Integrations

### Monday.com

> **Enable Monday.com?** `[y/N]`

For teams that manage projects in Monday.com.

> **Monday API token**

**How to get it:**
1. Monday.com → click your avatar → **Admin**
2. **API** section → copy your personal API token
3. Paste here.

> **Default board ID (optional)**

Open any board in Monday.com, look at the URL: `monday.com/boards/1234567890` — that number is the board ID. Press Enter to skip.

### Salesforce

> **Enable Salesforce?** `[y/N]`

For sales/support teams.

> **Username / Consumer key / Consumer secret / Security token**

**How to get them:**
1. Salesforce Setup → **App Manager** → New Connected App
2. Enable OAuth, add scopes: `api`, `refresh_token`
3. Copy **Consumer Key** and **Consumer Secret**
4. Your personal settings → **Reset My Security Token** → Salesforce emails it to you
5. Username is your Salesforce login email.

**What to type for this whole section:** Most users press **N** twice (No to both).

---

## Section 7/10 — Automation

### n8n Workflow Automation

> **Enable n8n workflow automation?** `[y/N]`

n8n is a visual workflow builder (like Zapier but self-hosted and free). Enable only if you have n8n running.

> **n8n URL** `[http://localhost:5678]`

Default is correct if n8n runs on your machine.

> **n8n API key (optional)**

From n8n: Settings → **API** → Create API Key. Paste here or press Enter to skip (works with URL-only setups).

### Web Scraping (Puppeteer)

> **Enable web scraping?** `[y/N]`

For extracting data from websites using a headless browser. Choose Yes if you want Geoclaw to browse websites.

> **Run headless?** `[true]`

- `true` = browser invisible, faster (recommended)
- `false` = browser window opens, good for debugging

### Workflow Orchestration

> **Enable workflow orchestration?** `[Y/n]`

Chains multiple Geoclaw components into automated pipelines (e.g. scrape website → store in DB → post to Slack). Low overhead, useful.

**Recommended: Yes** (press Enter).

---

## Section 8/10 — Geospatial (QGIS / PostGIS)

> **Enable geospatial analysis?** `[y/N]`

Only say Yes if you work with maps, GPS data, or GIS analysis. **Requires PostgreSQL with PostGIS extension installed.**

If Yes, you'll be asked:

> **Postgres host** `[localhost]` — press Enter if Postgres runs on your machine
> **Database name** `[geoclaw]` — or enter an existing database name
> **Postgres user** `[postgres]` — press Enter for the default user
> **Postgres password (hidden)** — type the password for that user

**Most users: press N.** You can always enable later.

---

## Section 9/10 — Skills & Task Management

### GitHub CLI Skills (skill marketplace)

> **Enable GitHub CLI Skills?** `[y/N]`

Lets Geoclaw share "skills" (reusable capability packages) across Claude Code, Cursor, Gemini, etc. Advanced feature.

### Vibe Kanban (visual task management)

> **Enable Vibe Kanban?** `[y/N]`

Visual kanban board for AI agent tasks — like Jira for AI. Runs a local web UI on port 3003.

**Most users: press N** to both. Enable later if you need them.

---

## Section 10/10 — Security (OneCLI Vault)

> **Enable OneCLI Vault?** `[y/N]`

Encrypts credentials at runtime so they never sit unencrypted in `.env`. Enterprise-grade security, adds complexity.

**Most users: press N.** The `.env` file is already `.gitignore`'d so credentials don't leak to GitHub.

---

## After Setup

```bash
geoclaw doctor    # check everything is ready
geoclaw start     # launch the platform
geoclaw status    # see what's enabled
```

### Changing settings later

Two ways:
1. **Re-run the wizard**: `geoclaw setup` — asks every question again (current values are shown as defaults).
2. **Edit the file directly**: open `~/.npm-global/lib/node_modules/geoclaw-universal/.env` (Linux/Mac) or `%APPDATA%\npm\node_modules\geoclaw-universal\.env` (Windows) and change values.

### If something breaks

```bash
geoclaw doctor             # diagnostic check
DEBUG=1 geoclaw start      # full error traces
```

---

## Minimum Viable Setup

If you just want to try Geoclaw with minimum fuss, answer the wizard like this:

| Section | Answer |
|---|---|
| 1. Project | Enter, Enter |
| 2. Model | `1` (DeepSeek) → paste key |
| 3. Memory | `Y` → Enter (local fallback) |
| 4. MCP | `Y`, `N` |
| 5. Messaging | `N`, `N`, `N`, `N` |
| 6. Enterprise | `N`, `N` |
| 7. Automation | `N`, `N`, `Y` |
| 8. Geospatial | `N` |
| 9. Skills | `N`, `N` |
| 10. Security | `N` |

That gives you a working Geoclaw with memory, MCP tool discovery, and workflow orchestration. Takes 90 seconds.
