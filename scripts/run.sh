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
    # Start MCP server in background if enabled
    if [[ "${GEOCLAW_MCP_SERVER_ENABLED:-false}" == "true" ]]; then
      print_status "Starting Geoclaw MCP server..."
      node "$PROJECT_DIR/scripts/components/mcp-server.js" &
      MCP_PID=$!
      print_success "MCP server started (pid $MCP_PID)"
    fi
    exec node "$PROJECT_DIR/geoclaw.mjs" "$@"
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
