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

# Load environment — auto-create from template if missing
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  if [[ -f "$PROJECT_DIR/.env.template" ]]; then
    print_warning ".env not found — creating from template (all features disabled by default)"
    cp "$PROJECT_DIR/.env.template" "$PROJECT_DIR/.env"
    print_success ".env created. Run 'geoclaw setup' to enable features."
    echo ""
  else
    print_error ".env and .env.template both missing. Reinstall geoclaw."
    exit 1
  fi
fi
source "$PROJECT_DIR/.env"

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
    echo ""
    print_success "Geoclaw is ready."
    echo ""
    echo "Use these commands to interact with Geoclaw:"
    echo "  geoclaw status           - see what's enabled"
    echo "  geoclaw learn <topic>    - learn about a component"
    echo "  geoclaw mcp list         - discover MCP servers"
    echo "  geoclaw workflow create  - build a workflow"
    echo ""

    # If MCP server is enabled, run it in the FOREGROUND as the daemon
    if [[ "${GEOCLAW_MCP_SERVER_ENABLED:-false}" == "true" ]]; then
      print_status "Starting Geoclaw MCP server (Ctrl+C to stop)..."
      echo ""
      exec node "$PROJECT_DIR/scripts/components/mcp-server.js"
    fi

    # Nothing to keep running — exit cleanly.
    echo "No daemon services are enabled. Exiting."
    echo "Tip: enable MCP Server in 'geoclaw setup' to keep a persistent service running."
    exit 0
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
