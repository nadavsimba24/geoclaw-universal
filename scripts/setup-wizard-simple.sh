#!/usr/bin/env bash
# Geoclaw v3.0 - Comprehensive Setup Wizard
# Guides the user through configuring every component.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
TEMPLATE_FILE="$PROJECT_DIR/.env.template"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# Cross-platform in-place sed
_sedi() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

print_header() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║            Geoclaw v3.0 - Complete Setup Wizard              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_section() {
  echo ""
  echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_skip() { echo -e "  ${YELLOW}→ skipped${NC}"; }

ask_yes_no() {
  local prompt="$1"
  local default="${2:-n}"
  local hint="[y/N]"
  [[ "$default" == "y" ]] && hint="[Y/n]"

  while true; do
    read -p "$(echo -e "${BLUE}?${NC} $prompt $hint: ")" -r
    local ans="${REPLY:-$default}"
    case "$ans" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo]) return 1 ;;
      *) echo "  Please answer y or n." ;;
    esac
  done
}

# Strip carriage returns, newlines, tabs, and surrounding whitespace.
# Uses printf|tr|sed instead of bash pattern expansion, because the previous
# ${s##[[:space:]]*} / ${s%%[[:space:]]*} idioms used glob semantics (where
# `*` means "any chars", not "zero or more whitespace") and blew away whole
# values on any input with stray whitespace. Now we also reject any bytes
# outside printable ASCII so a bad paste can't inject control chars into
# HTTP Authorization headers.
_clean() {
  local s="$1"
  # Remove all CR, LF, NUL, and TAB chars from anywhere in the string.
  s=$(printf '%s' "$s" | tr -d '\r\n\t\0')
  # Trim leading and trailing whitespace (portable sed form, not bash glob).
  s=$(printf '%s' "$s" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  printf '%s' "$s"
}

# Validate that a value is safe to use in an HTTP header (printable ASCII only).
# Returns 0 if OK, 1 if the value contains characters that would break
# Node's http header validator (codes < 0x20 or > 0x7E except tab).
_is_header_safe() {
  local s="$1"
  # LC_ALL=C guarantees single-byte matching regardless of locale.
  LC_ALL=C printf '%s' "$s" | LC_ALL=C grep -qP '[^\x20-\x7E]' && return 1
  return 0
}

ask_input() {
  local prompt="$1"
  local default="${2:-}"
  local hint=""
  [[ -n "$default" ]] && hint=" [$default]"
  read -p "$(echo -e "${BLUE}?${NC} $prompt$hint: ")" -r
  _clean "${REPLY:-$default}"
}

ask_secret() {
  local prompt="$1"
  read -s -p "$(echo -e "${BLUE}?${NC} $prompt (hidden): ")" -r
  echo ""
  _clean "$REPLY"
}

# Set or update an env variable. No sed involved — write a fresh file from scratch,
# which is bulletproof against special characters in the value.
#
# We only keep lines that are comments, blank, or recognizable KEY=... assignments.
# "Loose" text lines from an earlier broken setup (e.g. a raw secret sitting on
# its own line because _clean wiped the real assignment) get dropped here, so a
# second run of setup always produces a clean file.
set_env() {
  local var="$1"
  local value="$2"

  # Defensive: strip any CR/LF/TAB that sneaked past _clean, then refuse to
  # write a value that would produce an invalid HTTP header later.
  value=$(printf '%s' "$value" | tr -d '\r\n\t\0')
  if ! _is_header_safe "$value"; then
    print_warning "$var contains non-printable characters — refusing to save. Re-enter it without special chars."
    return 1
  fi

  local tmp
  tmp=$(mktemp)

  if [[ -f "$ENV_FILE" ]]; then
    # Keep: comments, blank lines, and KEY=... assignments (for any var except the one we're setting).
    # Drop: loose text lines (e.g. stray secrets pasted without a key=) so they can't pollute the file.
    awk -v var="$var" '
      /^[[:space:]]*#/      { print; next }            # comment
      /^[[:space:]]*$/      { print; next }            # blank
      /^[A-Za-z_][A-Za-z0-9_]*=/ {
        if ($0 !~ "^" var "=") print                   # other assignment
        next
      }
      { next }                                         # everything else: drop
    ' "$ENV_FILE" > "$tmp"
  fi

  # Append the new assignment (double-quoted, with any " in value escaped).
  local escaped="${value//\"/\\\"}"
  printf '%s="%s"\n' "$var" "$escaped" >> "$tmp"

  mv "$tmp" "$ENV_FILE"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$TEMPLATE_FILE" ]]; then
      cp "$TEMPLATE_FILE" "$ENV_FILE"
      print_success "Created .env from template"
    else
      echo "# Geoclaw v3.0 Configuration" > "$ENV_FILE"
      print_success "Created empty .env"
    fi
  else
    print_info "Using existing .env"
  fi
}

# ─── Wizard sections ─────────────────────────────────────────────────────────

setup_project() {
  print_section "1/10  Project Identity"
  local name
  name=$(ask_input "Project name" "$(basename "$PROJECT_DIR")")
  set_env "GEOCLAW_PROJECT_NAME" "$name"

  local runtime
  runtime=$(ask_input "Runtime mode (cli / docker)" "cli")
  set_env "GEOCLAW_RUNTIME_MODE" "$runtime"
  print_success "Project configured"
}

setup_model() {
  print_section "2/10  LLM Model (REQUIRED — the AI brain)"
  echo "Which model provider do you want Geoclaw to use?"
  echo "  1) DeepSeek      (cheap, fast, strong reasoning)"
  echo "  2) OpenAI        (gpt-4o, gpt-4o-mini)"
  echo "  3) Anthropic     (claude-sonnet-4, claude-opus-4)"
  echo "  4) Google        (gemini-2.0-flash, gemini-pro)"
  echo "  5) Groq          (llama3, mixtral — ultra-fast inference)"
  echo "  6) OpenRouter    (100+ models via one API key)"
  echo "  7) Moonshot AI   (kimi — long-context, multilingual)"
  echo "  8) Ollama        (local models — free, private)"
  echo "  9) Custom        (any OpenAI-compatible API)"
  echo " 10) Skip          (configure later in .env)"

  local choice
  choice=$(ask_input "Choice" "1")

  case "$choice" in
    1) set_env GEOCLAW_MODEL_PROVIDER "deepseek"
       local model; model=$(ask_input "Model name" "deepseek-chat")
       set_env GEOCLAW_MODEL_NAME "$model"
       local key; key=$(ask_secret "DeepSeek API key (platform.deepseek.com)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    2) set_env GEOCLAW_MODEL_PROVIDER "openai"
       local model; model=$(ask_input "Model name" "gpt-4o-mini")
       set_env GEOCLAW_MODEL_NAME "$model"
       local key; key=$(ask_secret "OpenAI API key (platform.openai.com)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    3) set_env GEOCLAW_MODEL_PROVIDER "anthropic"
       local model; model=$(ask_input "Model name" "claude-sonnet-4-5")
       set_env GEOCLAW_MODEL_NAME "$model"
       local key; key=$(ask_secret "Anthropic API key (console.anthropic.com)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    4) set_env GEOCLAW_MODEL_PROVIDER "google"
       local model; model=$(ask_input "Model name" "gemini-2.0-flash")
       set_env GEOCLAW_MODEL_NAME "$model"
       local key; key=$(ask_secret "Google API key (aistudio.google.com)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    5) set_env GEOCLAW_MODEL_PROVIDER "groq"
       local model; model=$(ask_input "Model name" "llama-3.3-70b-versatile")
       set_env GEOCLAW_MODEL_NAME "$model"
       set_env GEOCLAW_MODEL_BASE_URL "https://api.groq.com/openai/v1"
       local key; key=$(ask_secret "Groq API key (console.groq.com)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    6) set_env GEOCLAW_MODEL_PROVIDER "openrouter"
       echo "  Popular models: openai/gpt-4o, anthropic/claude-3.5-sonnet, google/gemini-2.0-flash, meta-llama/llama-3.3-70b-instruct"
       local model; model=$(ask_input "Model name" "openai/gpt-4o-mini")
       set_env GEOCLAW_MODEL_NAME "$model"
       set_env GEOCLAW_MODEL_BASE_URL "https://openrouter.ai/api/v1"
       local key; key=$(ask_secret "OpenRouter API key (openrouter.ai/keys)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    7) set_env GEOCLAW_MODEL_PROVIDER "moonshot"
       echo "  Models: moonshot-v1-8k  moonshot-v1-32k  moonshot-v1-128k"
       local model; model=$(ask_input "Model name" "moonshot-v1-32k")
       set_env GEOCLAW_MODEL_NAME "$model"
       set_env GEOCLAW_MODEL_BASE_URL "https://api.moonshot.cn/v1"
       local key; key=$(ask_secret "Moonshot API key (platform.moonshot.cn)")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    8) set_env GEOCLAW_MODEL_PROVIDER "ollama"
       local model; model=$(ask_input "Model name" "llama3.2")
       set_env GEOCLAW_MODEL_NAME "$model"
       local url; url=$(ask_input "Ollama URL" "http://localhost:11434")
       set_env GEOCLAW_MODEL_BASE_URL "$url" ;;
    9) local prov; prov=$(ask_input "Provider ID (e.g. mistral, together)" "custom")
       set_env GEOCLAW_MODEL_PROVIDER "$prov"
       local model; model=$(ask_input "Model name" "")
       set_env GEOCLAW_MODEL_NAME "$model"
       local url; url=$(ask_input "Base URL" "")
       set_env GEOCLAW_MODEL_BASE_URL "$url"
       local key; key=$(ask_secret "API key")
       [[ -n "$key" ]] && set_env GEOCLAW_MODEL_API_KEY "$key" ;;
    *) print_skip ;;
  esac
}

setup_memory() {
  print_section "3/10  Central Intelligence (persistent memory)"
  echo "Gives Geoclaw memory across sessions — remembers conversations, preferences, facts."

  if ask_yes_no "Enable persistent memory?" "y"; then
    set_env GEOCLAW_MEMORY_ENABLED true
    set_env GEOCLAW_MEMORY_PROVIDER "central-intelligence"
    local key; key=$(ask_secret "Central Intelligence API key (blank = use local fallback)")
    [[ -n "$key" ]] && set_env GEOCLAW_CI_API_KEY "$key"
    print_success "Memory enabled"
  else
    set_env GEOCLAW_MEMORY_ENABLED false
    print_skip
  fi
}

setup_mcp() {
  print_section "4/10  MCP (Model Context Protocol)"
  echo "MCPorter auto-discovers MCP servers from Cursor/Claude/VS Code (100+ tools)."
  echo "MCP Server exposes Geoclaw's tools to other AI agents."

  if ask_yes_no "Enable MCPorter (discover external MCP tools)?" "y"; then
    set_env GEOCLAW_MCPORTER_ENABLED true
    print_success "MCPorter enabled"
  else
    set_env GEOCLAW_MCPORTER_ENABLED false
  fi

  if ask_yes_no "Enable Geoclaw MCP server (expose tools to other agents)?" "n"; then
    set_env GEOCLAW_MCP_SERVER_ENABLED true
    print_success "MCP server enabled"
  else
    set_env GEOCLAW_MCP_SERVER_ENABLED false
  fi
}

setup_messaging() {
  print_section "5/10  Messaging Platforms"
  echo "Chat with Geoclaw through Telegram, Slack, WhatsApp, or Signal."

  # Telegram
  if ask_yes_no "Enable Telegram?" "n"; then
    set_env GEOCLAW_TELEGRAM_ENABLED true
    echo "  Get a bot token from @BotFather on Telegram"
    local tok; tok=$(ask_secret "Telegram bot token")
    [[ -n "$tok" ]] && set_env GEOCLAW_TELEGRAM_BOT_TOKEN "$tok"
    print_success "Telegram enabled"
  else
    set_env GEOCLAW_TELEGRAM_ENABLED false
  fi

  # Slack
  if ask_yes_no "Enable Slack?" "n"; then
    set_env GEOCLAW_SLACK_ENABLED true
    echo "  Create a Slack app at https://api.slack.com/apps"
    local bot; bot=$(ask_secret "Slack bot token (xoxb-...)")
    [[ -n "$bot" ]] && set_env GEOCLAW_SLACK_BOT_TOKEN "$bot"
    local app; app=$(ask_secret "Slack app token (xapp-...)")
    [[ -n "$app" ]] && set_env GEOCLAW_SLACK_APP_TOKEN "$app"
    print_success "Slack enabled"
  else
    set_env GEOCLAW_SLACK_ENABLED false
  fi

  # WhatsApp
  if ask_yes_no "Enable WhatsApp (Meta Cloud API)?" "n"; then
    set_env GEOCLAW_WHATSAPP_ENABLED true
    local pid; pid=$(ask_input "WhatsApp phone number ID" "")
    [[ -n "$pid" ]] && set_env GEOCLAW_WHATSAPP_PHONE_NUMBER_ID "$pid"
    local tok; tok=$(ask_secret "WhatsApp Cloud API token")
    [[ -n "$tok" ]] && set_env GEOCLAW_WHATSAPP_CLOUD_TOKEN "$tok"
    print_success "WhatsApp enabled"
  else
    set_env GEOCLAW_WHATSAPP_ENABLED false
  fi

  # Signal
  if ask_yes_no "Enable Signal (requires signal-cli)?" "n"; then
    set_env GEOCLAW_SIGNAL_ENABLED true
    local acct; acct=$(ask_input "Signal account (+1234567890)" "")
    [[ -n "$acct" ]] && set_env GEOCLAW_SIGNAL_ACCOUNT "$acct"
    print_success "Signal enabled"
  else
    set_env GEOCLAW_SIGNAL_ENABLED false
  fi
}

setup_enterprise() {
  print_section "6/10  Enterprise Integrations"

  # Monday
  if ask_yes_no "Enable Monday.com?" "n"; then
    set_env GEOCLAW_MONDAY_ENABLED true
    echo "  Get API token: Monday.com → Profile → Admin → API"
    local tok; tok=$(ask_secret "Monday API token")
    [[ -n "$tok" ]] && set_env GEOCLAW_MONDAY_API_TOKEN "$tok"
    local board; board=$(ask_input "Default board ID (optional)" "")
    [[ -n "$board" ]] && set_env GEOCLAW_MONDAY_DEFAULT_BOARD_ID "$board"
    print_success "Monday.com enabled"
  else
    set_env GEOCLAW_MONDAY_ENABLED false
  fi

  # Salesforce
  if ask_yes_no "Enable Salesforce?" "n"; then
    set_env GEOCLAW_SALESFORCE_ENABLED true
    local user; user=$(ask_input "Salesforce username" "")
    [[ -n "$user" ]] && set_env GEOCLAW_SALESFORCE_USERNAME "$user"
    local ckey; ckey=$(ask_secret "Consumer key (OAuth)")
    [[ -n "$ckey" ]] && set_env GEOCLAW_SALESFORCE_CONSUMER_KEY "$ckey"
    local csec; csec=$(ask_secret "Consumer secret")
    [[ -n "$csec" ]] && set_env GEOCLAW_SALESFORCE_CONSUMER_SECRET "$csec"
    local stok; stok=$(ask_secret "Security token")
    [[ -n "$stok" ]] && set_env GEOCLAW_SALESFORCE_SECURITY_TOKEN "$stok"
    print_success "Salesforce enabled"
  else
    set_env GEOCLAW_SALESFORCE_ENABLED false
  fi
}

setup_automation() {
  print_section "7/10  Automation (n8n, Web Scraping, Workflows)"

  if ask_yes_no "Enable n8n workflow automation?" "n"; then
    set_env GEOCLAW_N8N_ENABLED true
    local url; url=$(ask_input "n8n URL" "http://localhost:5678")
    set_env GEOCLAW_N8N_URL "$url"
    local key; key=$(ask_secret "n8n API key (optional)")
    [[ -n "$key" ]] && set_env GEOCLAW_N8N_API_KEY "$key"
    print_success "n8n enabled"
  else
    set_env GEOCLAW_N8N_ENABLED false
  fi

  if ask_yes_no "Enable web scraping (Puppeteer)?" "n"; then
    set_env GEOCLAW_WEB_SCRAPING_ENABLED true
    local headless; headless=$(ask_input "Run headless?" "true")
    set_env GEOCLAW_PUPPETEER_HEADLESS "$headless"
    print_success "Web scraping enabled"
  else
    set_env GEOCLAW_WEB_SCRAPING_ENABLED false
  fi

  if ask_yes_no "Enable workflow orchestration?" "y"; then
    set_env GEOCLAW_WORKFLOW_ENABLED true
    print_success "Workflow orchestration enabled"
  else
    set_env GEOCLAW_WORKFLOW_ENABLED false
  fi
}

setup_geospatial() {
  print_section "8/10  Geospatial (QGIS / PostGIS)"

  if ask_yes_no "Enable geospatial analysis?" "n"; then
    set_env GEOCLAW_GEOSPATIAL_ENABLED true
    set_env GEOCLAW_QGIS_ENABLED true
    local host; host=$(ask_input "Postgres host" "localhost")
    set_env GEOCLAW_POSTGRES_HOST "$host"
    local db; db=$(ask_input "Database name" "geoclaw")
    set_env GEOCLAW_POSTGRES_DB "$db"
    local user; user=$(ask_input "Postgres user" "postgres")
    set_env GEOCLAW_POSTGRES_USER "$user"
    local pw; pw=$(ask_secret "Postgres password")
    [[ -n "$pw" ]] && set_env GEOCLAW_POSTGRES_PASSWORD "$pw"
    print_success "Geospatial enabled"
  else
    set_env GEOCLAW_GEOSPATIAL_ENABLED false
    set_env GEOCLAW_QGIS_ENABLED false
  fi
}

setup_skills_tasks() {
  print_section "9/10  Skills Ecosystem & Task Management"

  if ask_yes_no "Enable GitHub CLI Skills (skill marketplace)?" "n"; then
    set_env GEOCLAW_SKILLS_GITHUB_ENABLED true
    set_env GEOCLAW_SKILLS_SYNC_ENABLED true
    print_success "Skills ecosystem enabled"
  else
    set_env GEOCLAW_SKILLS_GITHUB_ENABLED false
    set_env GEOCLAW_SKILLS_SYNC_ENABLED false
  fi

  # skills-il: curated SKILL.md packs for the Israeli market (tax, accounting, gov, legal, Hebrew)
  echo ""
  echo "Geoclaw integrates with skills-il (github.com/skills-il): curated skill"
  echo "packs for Israeli tax, invoicing, accounting, government APIs, Hebrew/RTL,"
  echo "legal tech, and more. Packs install into ~/.geoclaw/skills/ and are"
  echo "auto-loaded by chat and agent runs."
  if ask_yes_no "Install a skills-il bundle now (recommended for accounting/legal/gov workflows)?" "n"; then
    echo ""
    echo "  Available bundles:"
    echo "    1) freelancer-accountant   (tax + invoicing + VAT — best for accounting firms)"
    echo "    2) small-law-firm          (legal docs + compliance)"
    echo "    3) restaurant-owner        (food + suppliers + staff)"
    echo "    4) startup-founder         (growth + legal + finance)"
    echo "    5) skip — I'll pick later with: geoclaw skills bundles"
    printf "  Pick [1-5]: "
    read bundle_choice
    case "$bundle_choice" in
      1) bundle_slug="freelancer-accountant" ;;
      2) bundle_slug="small-law-firm" ;;
      3) bundle_slug="restaurant-owner" ;;
      4) bundle_slug="startup-founder" ;;
      *) bundle_slug="" ;;
    esac
    if [ -n "$bundle_slug" ]; then
      echo "  Installing $bundle_slug via npx skills-il (first run may take ~30s)..."
      if npx -y skills-il add-bundle "$bundle_slug" -g -y 2>&1 | tail -20; then
        print_success "Bundle $bundle_slug installed"
      else
        echo "  ⚠  Bundle install failed — you can retry with: geoclaw skills install-bundle $bundle_slug"
      fi
    fi
  fi

  if ask_yes_no "Enable Vibe Kanban (visual task management)?" "n"; then
    set_env GEOCLAW_VIBE_KANBAN_ENABLED true
    print_success "Vibe Kanban enabled"
  else
    set_env GEOCLAW_VIBE_KANBAN_ENABLED false
  fi
}

setup_firecrawl() {
  print_section "10/11  Firecrawl (advanced web scraping)"
  echo "Firecrawl handles JavaScript-rendered sites, anti-bot pages, and whole-site crawling."
  echo "Two options:"
  echo "  1) Self-hosted (free, private) — needs Docker"
  echo "     docker run -p 3002:3002 mendableai/firecrawl"
  echo "  2) Firecrawl Cloud — needs an API key (firecrawl.dev)"
  echo ""

  if ask_yes_no "Enable Firecrawl?" "n"; then
    local choice
    choice=$(ask_input "Self-hosted (1) or Cloud (2)?" "1")
    if [[ "$choice" == "2" ]]; then
      local key; key=$(ask_secret "Firecrawl API key (FC-...)")
      [[ -n "$key" ]] && set_env GEOCLAW_FIRECRAWL_API_KEY "$key"
      set_env GEOCLAW_FIRECRAWL_BASE_URL "https://api.firecrawl.dev"
      print_success "Firecrawl Cloud configured"
    else
      local url; url=$(ask_input "Firecrawl URL" "http://localhost:3002")
      set_env GEOCLAW_FIRECRAWL_BASE_URL "$url"
      print_success "Firecrawl self-hosted configured at $url"
      print_info "Start Firecrawl with: docker run -p 3002:3002 mendableai/firecrawl"
    fi
  else
    print_skip
  fi
}

setup_security() {
  print_section "11/11  Security (OneCLI Vault)"

  if ask_yes_no "Enable OneCLI Vault (credential encryption)?" "n"; then
    set_env GEOCLAW_ONECLI_ENABLED true
    print_success "OneCLI Vault enabled"
  else
    set_env GEOCLAW_ONECLI_ENABLED false
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  print_header
  echo "This wizard will configure all 11 Geoclaw component groups."
  echo "Press Enter to accept the default for any prompt."
  echo ""
  echo -e "${CYAN}📖 Need help deciding? Read the setup guide:${NC}"
  echo "   https://github.com/nadavsimba24/geoclaw-universal/blob/main/SETUP-GUIDE.md"
  echo ""

  ensure_env_file

  setup_project
  setup_model
  setup_memory
  setup_mcp
  setup_messaging
  setup_enterprise
  setup_automation
  setup_geospatial
  setup_skills_tasks
  setup_firecrawl
  setup_security

  echo ""
  echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}✅ Setup complete!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Config saved to: $ENV_FILE"
  echo ""
  echo "Next steps:"
  echo "  geoclaw doctor    # verify everything is ready"
  echo "  geoclaw start     # launch the platform"
  echo "  geoclaw status    # see what's enabled"
  echo ""
  echo "Edit .env anytime to tweak settings. Rerun 'geoclaw setup' to reconfigure."
}

main "$@"
