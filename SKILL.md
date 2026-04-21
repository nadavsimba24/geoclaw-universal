---
name: geoclaw
description: Build and bootstrap Geoclaw — a complete automation platform that runs fully via CLI, accepts Telegram + WhatsApp + Slack + Signal chat, integrates with n8n, QGIS/PostGIS, Monday.com, Salesforce, and provides magic workflows that span multiple systems. Enhanced with features from nanoclaw and latest OpenClaw versions. Use when you need to create a universal agent platform with transparent integration and educational user experience.
---

# Geoclaw Skill Guide v3.0 - Universal Agent Platform

## Overview
Geoclaw v3.0 is a **complete automation platform** that integrates with the entire local developer/analyst stack. It provides **magic workflows** that span multiple systems (n8n, QGIS/PostGIS, web scraping, enterprise systems) with **transparent integration** and **educational user experience**. Users clearly understand and experience each component while enjoying seamless automation across their entire toolchain.

> **Key Philosophy**: Users **know** which tools are being used, **understand** what each tool does, **control** which integrations are active, and **experience** seamless workflows across systems.

> **Need the system diagram?** Skim `references/architecture.md` before diving into installs. For magic workflows, see `references/magic-workflows.md`.

## Quick Start Workflow
1. **Scope** the deployment: hardware limits, default model, target chat channels.
2. **Bootstrap** a project directory via `scripts/geoclaw_init.sh`.
3. **Run the org intake** (`scripts/org_intake.sh`) so the user shares goals/tasks.
4. **Fill secrets** in `.env` (model + channel tokens).
5. **Install skills** (optional) and point `geoclaw.config.yml` to them.
6. **Launch** with `./scripts/run.sh` (CLI mode) and send test pings from configured channels.

## New Features in v3.0 - Complete Automation Platform

### 1. **Magic Workflow Orchestration** 🎭
- **Multi-system pipelines**: Connect n8n, QGIS, web scraping, enterprise systems
- **Transparent execution**: Users see which tools are being used
- **Educational experience**: Learn about each component as you use it
- **Workflow templates**: Pre-built pipelines for common scenarios

### 2. **n8n Integration** 🔄
- **Visual workflow automation**: 200+ integrations out of the box
- **Programmatic control**: Trigger, monitor, and create workflows from Geoclaw
- **Workflow templates**: Data processing, notifications, API integrations
- **Seamless integration**: Connect to other Geoclaw components

### 3. **QGIS/PostGIS Integration** 🗺️
- **Professional geospatial analysis**: Spatial queries, mapping, GIS tools
- **Spatial data processing**: Import, analyze, and visualize geographic data
- **QGIS project creation**: Generate maps and visualizations programmatically
- **PostgreSQL/PostGIS**: Spatial database operations

### 4. **Web Scraping & Navigation** 🌐
- **Advanced data extraction**: JavaScript rendering, multi-page navigation
- **Form automation**: Fill and submit web forms
- **Structured data extraction**: Extract data with custom patterns
- **Rate limiting**: Polite scraping with configurable delays

### 5. **Container Isolation (Optional)**
- **Docker Sandbox**: Run agents in isolated Docker containers (like nanoclaw)
- **Apple Container**: macOS-native lightweight container runtime
- **CLI-only**: Traditional OpenClaw CLI mode (default, lowest footprint)

### 6. **Enhanced Security**
- **OneCLI Agent Vault**: Credential injection at runtime (no secrets in containers)
- **Mount allowlists**: Explicit filesystem access control
- **Sender allowlists**: Per-channel access control

### 7. **Multi-Channel Support**
- **Telegram**: Bot API via BotFather
- **WhatsApp**: Cloud API via Meta
- **Slack**: Socket Mode (no public URL needed)
- **Signal**: signal-cli integration with pairing

### 8. **Enterprise Integrations**
- **Monday.com**: Project management, task tracking, workflow automation
- **Salesforce**: CRM operations, sales pipeline, customer support, reporting

### 9. **Educational User Experience**
- **Transparent tool attribution**: See which components are being used
- **Learning commands**: `@geoclaw learn <component>` to understand each tool
- **Status dashboard**: Check what's enabled and working
- **Interactive setup**: Guided configuration with explanations

## 1. Scope & Requirements
- Confirm the machine has `openclaw` CLI + Python + Node (no dashboard required).
- Decide which model tier to default to (`gpt-4o-mini`, `claude-3-haiku`, `gemini-2.0-flash`, `deepseek-chat`). Keep heavier models opt-in so runtime stays under resource budgets.
- Determine container runtime preference: CLI-only (default), Docker, or Apple Container (macOS).
- Pick the starter skill list (recommend: `gemini`, `weather`, `nano-pdf`, `openai-whisper`).

## 2. Bootstrap the Project
From the target machine:
```bash
cd /path/where/you/want/geoclaw
skills/geoclaw/scripts/geoclaw_init.sh --name geoclaw-enhanced
cd geoclaw-enhanced
cp .env.template .env
```
Fill `.env` with API keys and tokens (see Section 4). The init script creates:
- `geoclaw.config.yml` referencing env vars only
- `.env.template` with required secrets for all channels
- `scripts/run.sh` wrapper that sources `.env` then runs the CLI runtime
- `scripts/run-container.sh` for containerized mode (optional)
- `scripts/setup-slack.sh` Slack setup helper
- `scripts/setup-signal.sh` Signal setup helper

## 3. Collect Organization Context
Before you finish the install, capture what the user wants this agent to do:
- Run `skills/geoclaw/scripts/org_intake.sh` (or copy it into the new project and run from there).
- The script prompts for org name, contact, goals, interesting tasks, systems, and chat surfaces, then writes `org-profile.yaml`.
- Share the prompts ahead of time using `references/org-intake.md` so stakeholders can prepare thoughtful answers.
- Keep the file alongside `geoclaw.config.yml` so you can revisit goals during upgrades.

## 4. Configure Channels & Integrations

### Messaging Channels

#### Telegram
- Use BotFather `/newbot`, copy token → `GEOCLAW_TELEGRAM_BOT_TOKEN`
- Add bot to channels/groups as needed

#### WhatsApp Cloud
- Gather phone number ID, cloud token, verify token → `GEOCLAW_WHATSAPP_*` env vars
- Ensure webhook URL points at the machine running `openclaw gateway` (or a tunnel)

#### Slack (New!)
**Socket Mode Setup (no public URL):**
1. Create Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Socket Mode, generate App-Level Token (`xapp-...`)
3. Subscribe to bot events: `message.channels`, `message.groups`, `message.im`
4. Add OAuth scopes: `chat:write`, `channels:history`, `groups:history`, `im:history`, `channels:read`, `groups:read`, `users:read`
5. Install to workspace, copy Bot Token (`xoxb-...`)
6. Set `GEOCLAW_SLACK_BOT_TOKEN` and `GEOCLAW_SLACK_APP_TOKEN` in `.env`

**Quick setup:**
```bash
./scripts/setup-slack.sh
```

#### Signal (New!)
**signal-cli Integration:**
1. Install `signal-cli` (native or JVM build)
2. Choose setup path:
   - **QR link**: `signal-cli link -n "Geoclaw"` and scan with Signal
   - **SMS register**: Register dedicated number with captcha + SMS
3. Set `GEOCLAW_SIGNAL_ACCOUNT` (E.164 number) in `.env`
4. Configure pairing for DMs

**Quick setup:**
```bash
./scripts/setup-signal.sh
```

### Enterprise Integrations

#### Monday.com (New!)
**Project Management Integration:**
1. Get API token from Monday.com Admin → API section
2. Set `GEOCLAW_MONDAY_API_TOKEN` in `.env`
3. Configure board IDs and column mappings

**Features:**
- Create/update tasks from chat
- Get board status reports
- Post updates to items
- Webhook notifications

**Quick setup:**
```bash
./scripts/setup-monday.sh
```

#### Salesforce (New!)
**CRM Integration:**
1. Create Connected App in Salesforce
2. Get Consumer Key and Consumer Secret
3. Set `GEOCLAW_SALESFORCE_*` variables in `.env`
4. Configure object mappings

**Features:**
- Query accounts, contacts, opportunities
- Create/update CRM records
- Sales pipeline reporting
- Case management
- Chatter integration

**Quick setup:**
```bash
./scripts/setup-salesforce.sh
```

## 5. Model + Skill Settings
`geoclaw.config.yml` supports enhanced configuration with enterprise integrations:

```yaml
agent:
  name: ${GEOCLAW_AGENT_NAME:-geoclaw-agent}
  model:
    provider: ${GEOCLAW_MODEL_PROVIDER:-custom-api-deepseek-com}
    name: ${GEOCLAW_MODEL_NAME:-deepseek-chat}
    apiKeyEnv: GEOCLAW_MODEL_API_KEY
  skills:
    - gemini
    - weather
    - nano-pdf
    - monday    # Monday.com integration
    - salesforce # Salesforce integration
    # Add more skills as needed

runtime:
  mode: ${GEOCLAW_RUNTIME_MODE:-cli}  # cli, docker, apple-container
  heartbeatMinutes: ${GEOCLAW_HEARTBEAT_MINUTES:-0}
  
channels:
  telegram:
    enabled: ${GEOCLAW_TELEGRAM_ENABLED:-false}
    botTokenEnv: GEOCLAW_TELEGRAM_BOT_TOKEN
  whatsapp:
    enabled: ${GEOCLAW_WHATSAPP_ENABLED:-false}
    phoneNumberIdEnv: GEOCLAW_WHATSAPP_PHONE_NUMBER_ID
    cloudTokenEnv: GEOCLAW_WHATSAPP_CLOUD_TOKEN
  slack:
    enabled: ${GEOCLAW_SLACK_ENABLED:-false}
    botTokenEnv: GEOCLAW_SLACK_BOT_TOKEN
    appTokenEnv: GEOCLAW_SLACK_APP_TOKEN
    trigger: "@${GEOCLAW_AGENT_NAME:-geoclaw}"
  signal:
    enabled: ${GEOCLAW_SIGNAL_ENABLED:-false}
    accountEnv: GEOCLAW_SIGNAL_ACCOUNT
    cliPath: ${GEOCLAW_SIGNAL_CLI_PATH:-signal-cli}
    dmPolicy: pairing  # pairing, allowlist, open, disabled
    autoStart: true

integrations:
  monday:
    enabled: ${GEOCLAW_MONDAY_ENABLED:-false}
    apiTokenEnv: GEOCLAW_MONDAY_API_TOKEN
    apiVersion: ${GEOCLAW_MONDAY_API_VERSION:-v2}
    defaultBoardId: ${GEOCLAW_MONDAY_DEFAULT_BOARD_ID:-}
    webhookSecretEnv: GEOCLAW_MONDAY_WEBHOOK_SECRET
    
  salesforce:
    enabled: ${GEOCLAW_SALESFORCE_ENABLED:-false}
    auth:
      type: ${GEOCLAW_SALESFORCE_AUTH_TYPE:-oauth2}
      consumerKeyEnv: GEOCLAW_SALESFORCE_CONSUMER_KEY
      consumerSecretEnv: GEOCLAW_SALESFORCE_CONSUMER_SECRET
      usernameEnv: GEOCLAW_SALESFORCE_USERNAME
      passwordEnv: GEOCLAW_SALESFORCE_PASSWORD
      securityTokenEnv: GEOCLAW_SALESFORCE_SECURITY_TOKEN
    apiVersion: ${GEOCLAW_SALESFORCE_API_VERSION:-v58.0}
    webhookTokenEnv: GEOCLAW_SALESFORCE_WEBHOOK_TOKEN

security:
  onecli:
    enabled: ${GEOCLAW_ONECLI_ENABLED:-false}
  mountAllowlist:
    - ${GEOCLAW_WORKSPACE_PATH:-./workspace}
    - ./data

logging:
  level: ${GEOCLAW_LOG_LEVEL:-info}
  file: ./logs/geoclaw.log
  maxSize: 10M
  maxFiles: 5
```

## 6. Run + Validate

### CLI Mode (Default)
```bash
./scripts/run.sh --log-level info
```

### Container Mode (Optional)
```bash
./scripts/run-container.sh --log-level info
```

### Validation Tests
1. **Telegram test**: Send `/ping` → expect `pong`
2. **WhatsApp test**: Use Meta sandbox "Send message" → confirm response
3. **Slack test**: Message in registered channel with `@geoclaw hello`
4. **Signal test**: Send DM to bot number, approve pairing code
5. **Monday.com test**: `@geoclaw list Monday.com boards` → see board list
6. **Salesforce test**: `@geoclaw Salesforce pipeline` → see sales report
7. Monitor RAM/CPU (`top`, `Activity Monitor`) to ensure target device stays within budget

## New Setup Scripts

### `scripts/setup-slack.sh`
Interactive Slack setup wizard that:
- Guides through app creation
- Collects tokens
- Registers channels
- Tests connection

### `scripts/setup-signal.sh`
Signal setup assistant that:
- Checks/installs signal-cli
- Guides through QR or SMS registration
- Configures pairing
- Tests DM functionality

### `scripts/setup-monday.sh`
Monday.com integration setup that:
- Guides through API token generation
- Tests API connectivity
- Configures board mappings
- Sets up webhooks

### `scripts/setup-salesforce.sh`
Salesforce integration setup that:
- Guides through Connected App creation
- Configures OAuth authentication
- Tests API access
- Sets up object mappings

### `scripts/run-container.sh`
Containerized runtime that:
- Builds agent Docker image (if using Docker)
- Runs with isolated filesystem
- Uses OneCLI vault for credentials
- Maintains CLI interface compatibility

## Resources
- `scripts/geoclaw_init_universal.sh` — universal bootstrapper with ALL components
- `scripts/setup-wizard-complete.sh` — interactive setup for all components
- `scripts/educational-commands.sh` — educational command system
- `scripts/geoclaw-education.js` — interactive learning system
- `scripts/components/` — integration components:
  - `mcp-server.js` — MCP server with tool attribution
  - `vibe-kanban-client.js` — Vibe Kanban integration
  - `n8n-integration.js` — n8n workflow automation
  - `qgis-postgis-integration.js` — geospatial analysis
  - `web-scraping-navigation.js` — web data extraction
  - `workflow-orchestrator.js` — magic workflow coordination
- `scripts/org_intake.sh` — guided questionnaire that writes `org-profile.yaml`
- `references/architecture.md` — system goals, component map, runtime checklist
- `references/magic-workflows.md` — complete automation platform guide
- `references/ecosystem-integration.md` — transparent integration architecture
- `references/bot-setup.md` — Channel setup walkthroughs and env var summary
- `references/org-intake.md` — shareable intake prompts to send customers ahead of time
- `references/container-guide.md` — Docker/Apple Container setup and security
- `references/slack-setup.md` — Detailed Slack app creation with screenshots
- `references/signal-setup.md` — signal-cli installation and registration guide
- `references/monday-setup.md` — Monday.com API integration guide
- `references/salesforce-setup.md` — Salesforce CRM integration guide

## Migration from v1.0
Existing Geoclaw deployments can upgrade by:
1. Backing up current `.env` and config
2. Running enhanced init script with `--upgrade` flag
3. Merging new environment variables
4. Testing new channels incrementally

Use these artifacts whenever you need to spin up another Geoclaw instance or document the installation steps for customers.
