#!/usr/bin/env bash
# Geoclaw v3.0 Universal Platform Runner
# Clearly shows which components are being used
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

print_component() {
  echo -e "${YELLOW}🛠  $1${NC} - $2"
}

print_status() {
  echo -e "${BLUE}▸ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${CYAN}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_header() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                    Geoclaw v3.0 - Starting                   ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Load environment
if [[ -f "$PROJECT_DIR/.env" ]]; then
  source "$PROJECT_DIR/.env"
else
  echo "Error: .env file not found at $PROJECT_DIR/.env"
  echo ""
  echo "Please copy .env.template to .env and configure your components:"
  echo "  cp .env.template .env"
  echo ""
  echo "The .env file configures these integrated components:"
  print_component "Central Intelligence" "Persistent memory system"
  print_component "GitHub CLI Skills" "Skill marketplace"
  print_component "Skills CLI" "Cross-tool skill sync"
  print_component "Vibe Kanban" "Visual task management"
  print_component "Monday.com" "Project management"
  print_component "Salesforce" "CRM automation"
  print_component "Messaging" "Slack/Telegram/WhatsApp/Signal"
  print_component "OneCLI Vault" "Credential security"
  echo ""
  echo "After configuring, run: ./scripts/run.sh"
  exit 1
fi

print_header

echo "Starting Geoclaw v3.0 with these integrated components:"
echo ""

# Check and display each component
check_component() {
  local var_name="$1"
  local component_name="$2"
  local description="$3"
  
  if [[ "${!var_name:-}" == "true" ]]; then
    print_success "$component_name - $description"
  else
    print_warning "$component_name - Not enabled"
  fi
}

# Memory system
check_component "GEOCLAW_MEMORY_ENABLED" "Central Intelligence" "Persistent memory across sessions"

# Skill ecosystem
check_component "GEOCLAW_SKILLS_GITHUB_ENABLED" "GitHub CLI Skills" "Skill discovery & management"
check_component "GEOCLAW_SKILLS_SYNC_ENABLED" "Skills CLI" "Cross-tool skill sync"

# Task management
check_component "GEOCLAW_VIBE_KANBAN_ENABLED" "Vibe Kanban" "Visual task management"

# Enterprise integrations
check_component "GEOCLAW_MONDAY_ENABLED" "Monday.com" "Project management"
check_component "GEOCLAW_SALESFORCE_ENABLED" "Salesforce" "CRM automation"

# Messaging platforms
check_component "GEOCLAW_SLACK_ENABLED" "Slack" "Team collaboration"
check_component "GEOCLAW_TELEGRAM_ENABLED" "Telegram" "Public communities"
check_component "GEOCLAW_WHATSAPP_ENABLED" "WhatsApp" "Customer support"
check_component "GEOCLAW_SIGNAL_ENABLED" "Signal" "Secure communications"

# Security
check_component "GEOCLAW_ONECLI_ENABLED" "OneCLI Vault" "Credential security"

# MCP server
check_component "GEOCLAW_MCP_SERVER_ENABLED" "MCP Server" "Ecosystem integration"

echo ""
print_status "Runtime mode: ${GEOCLAW_RUNTIME_MODE:-cli}"
print_status "Log level: ${GEOCLAW_LOG_LEVEL:-info}"

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

echo ""
print_status "Starting Geoclaw..."

# Check runtime mode
RUNTIME_MODE="${GEOCLAW_RUNTIME_MODE:-cli}"

case "$RUNTIME_MODE" in
  cli)
    print_status "Running in CLI mode (lightweight, direct execution)"
    exec openclaw agent run --config "$PROJECT_DIR/geoclaw.config.yml" --cli "$@"
    ;;
  docker)
    print_status "Running in Docker container (isolated, secure)"
    if ! command -v docker &>/dev/null; then
      print_error "Docker not found. Install Docker or switch to cli mode."
      exit 1
    fi
    exec "$SCRIPT_DIR/run-container.sh" "$@"
    ;;
  apple-container)
    print_status "Running in Apple Container (macOS-native)"
    if [[ "$(uname)" != "Darwin" ]]; then
      print_error "Apple Container is only available on macOS"
      exit 1
    fi
    if ! command -v container &>/dev/null; then
      print_error "Apple Container not found. Install with: brew install container"
      exit 1
    fi
    exec "$SCRIPT_DIR/run-container.sh" "$@"
    ;;
  *)
    print_error "Unknown runtime mode: $RUNTIME_MODE"
    echo "Valid modes: cli, docker, apple-container"
    exit 1
    ;;
esac
RUN

chmod +x "$PROJECT_DIR/scripts/run.sh"

# Create component setup scripts
mkdir -p "$PROJECT_DIR/scripts/components"

# Create setup wizard
cat >"$PROJECT_DIR/scripts/setup-wizard.sh" <<'WIZARD'
#!/usr/bin/env bash
# Geoclaw Setup Wizard
# Interactive setup that explains each component
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║              Geoclaw v3.0 - Setup Wizard                     ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_section() {
  echo -e "\n${CYAN}▸ $1${NC}"
}

print_question() {
  echo -e "${YELLOW}? $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

print_component() {
  echo -e "${YELLOW}🛠  $1${NC} - $2"
}

ask_yes_no() {
  local question="$1"
  local default="${2:-Y}"
  local choices="[Y/n]"
  
  if [[ "$default" == "N" ]]; then
    choices="[y/N]"
  fi
  
  while true; do
    echo -e "${YELLOW}? $question $choices${NC}"
    read -r response
    
    if [[ -z "$response" ]]; then
      response="$default"
    fi
    
    case "$response" in
      [Yy]* ) return 0;;
      [Nn]* ) return 1;;
      * ) echo "Please answer yes or no.";;
    esac
  done
}

update_env() {
  local var_name="$1"
  local value="$2"
  local env_file="$PROJECT_DIR/.env"
  
  if [[ ! -f "$env_file" ]]; then
    cp "$PROJECT_DIR/.env.template" "$env_file"
  fi
  
  if grep -q "^$var_name=" "$env_file"; then
    sed -i.bak "s|^$var_name=.*|$var_name=$value|" "$env_file"
  else
    echo "$var_name=$value" >> "$env_file"
  fi
}

print_header

echo "Welcome to the Geoclaw v3.0 Setup Wizard!"
echo ""
echo "I'll help you configure each integrated component."
echo "You'll understand what each component does and how to use it."
echo ""

if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  cp "$PROJECT_DIR/.env.template" "$PROJECT_DIR/.env"
  print_success "Created .env file from template"
fi

print_section "1. Memory System (Central Intelligence)"
print_component "Central Intelligence" "Persistent memory across sessions"
print_info "This allows Geoclaw to remember conversations, preferences, and facts across sessions."
print_info "Without it, Geoclaw starts fresh each time."

if ask_yes_no "Enable Central Intelligence memory system?" "Y"; then
  print_info "You'll need a Central Intelligence API key."
  print_info "Get one from: https://central-intelligence.ai"
  echo ""
  read -p "Enter your Central Intelligence API key: " ci_api_key
  update_env "GEOCLAW_MEMORY_ENABLED" "true"
  update_env "GEOCLAW_CI_API_KEY" "$ci_api_key"
  print_success "Central Intelligence enabled!"
else
  update_env "GEOCLAW_MEMORY_ENABLED" "false"
  print_info "Memory system disabled. Geoclaw will not remember across sessions."
fi

print_section "2. Skill Ecosystem"
print_component "GitHub CLI Skills" "Skill discovery & management"
print_component "Skills CLI" "Sync skills across all your tools"
print_info "Skills are reusable instructions that teach Geoclaw how to perform tasks."
print_info "With GitHub CLI Skills, you can discover and install skills from GitHub."
print_info "With Skills CLI, skills sync across Claude Code, Cursor, Gemini, etc."

if ask_yes_no "Enable skill ecosystem?" "Y"; then
  update_env "GEOCLAW_SKILLS_GITHUB_ENABLED" "true"
  update_env "GEOCLAW_SKILLS_SYNC_ENABLED" "true"
  print_success "Skill ecosystem enabled!"
  print_info "Commands: @geoclaw skills list, @geoclaw skills sync"
else
  update_env "GEOCLAW_SKILLS_GITHUB_ENABLED" "false"
  update_env "GEOCLAW_SKILLS_SYNC_ENABLED" "false"
  print_info "Skill ecosystem disabled."
fi

print_section "3. Task Management (Vibe Kanban)"
print_component "Vibe Kanban" "Visual task management & multi-agent orchestration"
print_info "Vibe Kanban gives you a visual board to track tasks."
print_info "It can orchestrate multiple AI agents (Claude Code, Gemini, etc.)."
print_info "Includes workspace management, code review, and Git integration."

if ask_yes_no "Enable Vibe Kanban task management?" "Y"; then
  update_env "GEOCLAW_VIBE_KANBAN_ENABLED" "true"
  print_success "Vibe Kanban enabled!"
  print_info "Kanban UI will be available at: http://localhost:3003"
  print_info "Commands: @geoclaw create task, @geoclaw show board"
  
  # Check if Vibe Kanban is installed
  if ! command -v npx &>/dev/null || ! npx vibe-kanban --version &>/dev/null; then
    print_info "Vibe Kanban not found. Installing..."
    npx vibe-kanban --version
    print_success "Vibe Kanban installed!"
  fi
else
  update_env "GEOCLAW_VIBE_KANBAN_ENABLED" "false"
  print_info "Vibe Kanban disabled. Using basic task management."
fi

print_section "4. Enterprise Integrations"
print_component "Monday.com" "Project management"
print_component "Salesforce" "CRM automation"
print_info "Connect Geoclaw to your business systems for automation."

echo ""
print_question "Which enterprise integrations would you like to enable?"
echo "1. Monday.com (Project management)"
echo "2. Salesforce (CRM)"
echo "3. Both"
echo "4. None"
read -p "Choice [1-4]: " enterprise_choice

case "$enterprise_choice" in
  1)
    update_env "GEOCLAW_MONDAY_ENABLED" "true"
    print_info "You'll need a Monday.com API token."
    print_info "Get one from: Monday.com → Admin → API"
    read -p "Enter Monday.com API token: " monday_token
    update_env "GEOCLAW_MONDAY_API_TOKEN" "$monday_token"
    print_success "Monday.com enabled!"
    ;;
  2)
    update_env "GEOCLAW_SALESFORCE_ENABLED" "true"
    print_info "You'll need Salesforce Connected App credentials."
    print_info "Create at: Salesforce Setup → App Manager → New Connected App"
    read -p "Enter Salesforce Consumer Key: " sf_consumer_key
    read -p "Enter Salesforce Consumer Secret: " sf_consumer_secret
    update_env "GEOCLAW_SALESFORCE_CONSUMER_KEY" "$sf_consumer_key"
    update_env "GEOCLAW_SALESFORCE_CONSUMER_SECRET" "$sf_consumer_secret"
    print_success "Salesforce enabled!"
    ;;
  3)
    update_env "GEOCLAW_MONDAY_ENABLED" "true"
    update_env "GEOCLAW_SALESFORCE_ENABLED" "true"
    print_info "Configuring both Monday.com and Salesforce..."
    read -p "Enter Monday.com API token: " monday_token
    read -p "Enter Salesforce Consumer Key: " sf_consumer_key
    read -p "Enter Salesforce Consumer Secret: " sf_consumer_secret
    update_env "GEOCLAW_MONDAY_API_TOKEN" "$monday_token"
    update_env "GEOCLAW_SALESFORCE_CONSUMER_KEY" "$sf_consumer_key"
    update_env "GEOCLAW_SALESFORCE_CONSUMER_SECRET" "$sf_consumer_secret"
    print_success "Both integrations enabled!"
    ;;
  *)
    update_env "GEOCLAW_MONDAY_ENABLED" "false"
    update_env "GEOCLAW_SALESFORCE_ENABLED" "false"
    print_info "Enterprise integrations disabled."
    ;;
esac

print_section "5. Messaging Platforms"
print_component "Slack" "Team collaboration"
print_component "Telegram" "Public communities"
print_component "WhatsApp" "Customer support"
print_component "Signal" "Secure communications"
print_info "Connect Geoclaw to your preferred chat platforms."

echo ""
print_question "Which messaging platforms would you like to enable?"
echo "1. Slack (Team collaboration)"
echo "2. Telegram (Public communities)"
echo "3. WhatsApp (Customer support)"
echo "4. Signal (Secure communications)"
echo "5. All of the above"
echo "6. None"
read -p "Choice [1-6]: " messaging_choice

case "$messaging_choice" in
  1)
    update_env "GEOCLAW_SLACK_ENABLED" "true"
    print_info "You'll need Slack Bot Token and App Token."
    print_info "Create at: api.slack.com/apps"
    read -p "Enter Slack Bot Token (xoxb-...): " slack_bot_token
    read -p "Enter Slack App Token (xapp-...): " slack_app_token
    update_env "GEOCLAW_SLACK_BOT_TOKEN" "$slack_bot_token"
    update_env "GEOCLAW_SLACK_APP_TOKEN" "$slack_app_token"
    print_success "Slack enabled!"
    ;;
  2)
    update_env "GEOCLAW_TELEGRAM_ENABLED" "true"
    print_info "You'll need a Telegram Bot Token from BotFather."
    read -p "Enter Telegram Bot Token: " telegram_token
    update_env "GEOCLAW_TELEGRAM_BOT_TOKEN" "$telegram_token"
    print_success "Telegram enabled!"
    ;;
  3)
    update_env "GEOCLAW_WHATSAPP_ENABLED" "true"
    print_info "You'll need WhatsApp Cloud API credentials."
    print_info "Get from: developers.facebook.com"
    read -p "Enter WhatsApp Phone Number ID: " whatsapp_number_id
    read -p "Enter WhatsApp Cloud Token: " whatsapp_token
    update_env "GEOCLAW_WHATSAPP_PHONE_NUMBER_ID" "$whatsapp_number_id"
    update_env "GEOCLAW_WHATSAPP_CLOUD_TOKEN" "$whatsapp_token"
    print_success "WhatsApp enabled!"
    ;;
  4)
    update_env "GEOCLAW_SIGNAL_ENABLED" "true"
    print_info "You'll need signal-cli installed and a Signal account."
    print_info