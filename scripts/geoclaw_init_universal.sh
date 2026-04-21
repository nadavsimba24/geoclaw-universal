#!/usr/bin/env bash
# geoclaw_init_universal.sh - Bootstrap Geoclaw v3.0 with full ecosystem integration
set -euo pipefail

PROJECT_NAME="geoclaw-universal"
PROJECT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEOCLAW_VERSION="3.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                    Geoclaw v${GEOCLAW_VERSION} - Universal Agent Platform   ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_section() {
  echo -e "\n${CYAN}▸ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_tool() {
  echo -e "${YELLOW}🛠  $1${NC} - $2"
}

usage() {
  cat <<'EOF'
Usage: geoclaw_init_universal.sh [options]

Options:
  --name NAME        Project name (default: geoclaw-universal)
  --path PATH        Absolute path to create project
  --minimal          Minimal setup (skip some optional components)
  --full             Full setup with all components (default)
  --help             Show this help

Creates a Geoclaw v3.0 instance with full ecosystem integration:
  🧠 Central Intelligence - Persistent memory system
  🛠️  GitHub CLI Skills - Skill marketplace
  🔄 Skills CLI - Cross-tool skill sync
  📋 Vibe Kanban - Visual task management & multi-agent orchestration
  🏢 Monday.com - Project management integration
  📊 Salesforce - CRM automation
  💬 Slack/Telegram/WhatsApp/Signal - Multi-channel messaging
  🔒 OneCLI Vault - Credential security
  🐳 Docker/Apple Container - Runtime isolation

Users will clearly understand and experience each component.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      PROJECT_NAME="$2"; shift 2;;
    --path)
      PROJECT_DIR="$2"; shift 2;;
    --minimal)
      SETUP_MODE="minimal"; shift;;
    --full)
      SETUP_MODE="full"; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

SETUP_MODE=${SETUP_MODE:-"full"}

if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$PWD/$PROJECT_NAME"
else
  PROJECT_DIR="$PROJECT_DIR/$PROJECT_NAME"
fi

command -v openclaw &>/dev/null || { print_error "openclaw CLI not found in PATH"; exit 1; }

print_header

echo "Welcome to Geoclaw v${GEOCLAW_VERSION} - Your Universal Agent Platform!"
echo ""
echo "This setup will create a Geoclaw instance that integrates with the"
echo "entire AI agent ecosystem. You'll experience and understand each component."
echo ""

print_section "1. Project Creation"
echo "Creating project at: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

print_success "Project directory created"

print_section "2. Ecosystem Overview"
echo "Geoclaw v${GEOCLAW_VERSION} integrates these components:"
echo ""
print_tool "Central Intelligence" "Persistent memory across sessions"
print_tool "GitHub CLI Skills" "Skill discovery & version control"
print_tool "Skills CLI" "Sync skills across all your tools"
print_tool "Vibe Kanban" "Visual task management & multi-agent orchestration"
print_tool "Monday.com" "Project management integration"
print_tool "Salesforce" "CRM automation"
print_tool "Slack/Telegram/WhatsApp/Signal" "Multi-channel messaging"
print_tool "OneCLI Vault" "Credential security"
print_tool "Docker/Apple Container" "Runtime isolation"
echo ""

print_section "3. Creating Configuration Files"

# Create enhanced .env.template with explanations
cat >"$PROJECT_DIR/.env.template" <<'ENV'
# ============================================
# Geoclaw v3.0 - Universal Agent Platform
# ============================================
# This file contains ALL configuration for the integrated ecosystem.
# Each section is clearly labeled and explained.
# ============================================

# ===== CORE CONFIGURATION =====
# Basic Geoclaw settings
GEOCLAW_AGENT_NAME=geoclaw-universal
GEOCLAW_LOG_LEVEL=info
GEOCLAW_HEARTBEAT_MINUTES=15

# ===== MEMORY SYSTEM (Central Intelligence) =====
# Enables persistent memory across sessions
# Learn: @geoclaw learn central-intelligence
GEOCLAW_MEMORY_ENABLED=true
GEOCLAW_MEMORY_PROVIDER=central-intelligence
# GEOCLAW_CI_API_KEY=                    # Get from Central Intelligence

# ===== SKILL ECOSYSTEM =====
# GitHub CLI Skills: Discover/manage skills
# Skills CLI: Sync skills across tools
# Learn: @geoclaw learn skill-ecosystem
GEOCLAW_SKILLS_GITHUB_ENABLED=true
GEOCLAW_SKILLS_SYNC_ENABLED=true
GEOCLAW_SKILLS_SYNC_TARGETS=cursor,claude-code,gemini

# ===== TASK MANAGEMENT (Vibe Kanban) =====
# Visual kanban board & multi-agent orchestration
# Learn: @geoclaw learn vibe-kanban
GEOCLAW_VIBE_KANBAN_ENABLED=true
GEOCLAW_VIBE_KANBAN_PROJECT_ID=
GEOCLAW_VIBE_KANBAN_UI_PORT=3003
GEOCLAW_VIBE_KANBAN_MCP_PORT=3004

# ===== ENTERPRISE INTEGRATIONS =====
# Monday.com: Project management
# Learn: @geoclaw learn monday
GEOCLAW_MONDAY_ENABLED=false
GEOCLAW_MONDAY_API_TOKEN=
GEOCLAW_MONDAY_DEFAULT_BOARD_ID=

# Salesforce: CRM automation
# Learn: @geoclaw learn salesforce
GEOCLAW_SALESFORCE_ENABLED=false
GEOCLAW_SALESFORCE_CONSUMER_KEY=
GEOCLAW_SALESFORCE_CONSUMER_SECRET=
GEOCLAW_SALESFORCE_USERNAME=
GEOCLAW_SALESFORCE_SECURITY_TOKEN=

# ===== MESSAGING PLATFORMS =====
# Connect to your preferred chat platforms
GEOCLAW_SLACK_ENABLED=false
GEOCLAW_SLACK_BOT_TOKEN=
GEOCLAW_SLACK_APP_TOKEN=

GEOCLAW_TELEGRAM_ENABLED=false
GEOCLAW_TELEGRAM_BOT_TOKEN=

GEOCLAW_WHATSAPP_ENABLED=false
GEOCLAW_WHATSAPP_PHONE_NUMBER_ID=
GEOCLAW_WHATSAPP_CLOUD_TOKEN=

GEOCLAW_SIGNAL_ENABLED=false
GEOCLAW_SIGNAL_ACCOUNT=

# ===== SECURITY =====
# OneCLI Vault: Secure credential injection
# Learn: @geoclaw learn onecli
GEOCLAW_ONECLI_ENABLED=false

# ===== RUNTIME =====
# Choose your execution environment
GEOCLAW_RUNTIME_MODE=cli  # cli, docker, apple-container
GEOCLAW_DOCKER_IMAGE=geoclaw-universal:latest
GEOCLAW_CONTAINER_MEMORY_LIMIT=512m

# ===== MCP (Model Context Protocol) =====
# Expose Geoclaw as MCP server for ecosystem integration
GEOCLAW_MCP_SERVER_ENABLED=true
GEOCLAW_MCP_SERVER_PORT=3002

# MCPorter integration: Discover and call MCP servers
# Learn: @geoclaw learn mcporter
GEOCLAW_MCPORTER_ENABLED=true
GEOCLAW_MCPORTER_CONFIG_PATH=./config/mcporter.json
ENV

print_success "Created .env.template with component explanations"

# Create enhanced config file with clear sections
cat >"$PROJECT_DIR/geoclaw.config.yml" <<'YAML'
# ============================================
# Geoclaw v3.0 Configuration
# Universal Agent Platform
# ============================================
# Each section corresponds to an integrated component
# Users can clearly see and understand each integration
# ============================================

# Core agent configuration
agent:
  name: ${GEOCLAW_AGENT_NAME:-geoclaw-universal}
  version: "3.0"
  
  # Model settings
  model:
    provider: ${GEOCLAW_MODEL_PROVIDER:-custom-api-deepseek-com}
    name: ${GEOCLAW_MODEL_NAME:-deepseek-chat}
    apiKeyEnv: GEOCLAW_MODEL_API_KEY

# ===== MEMORY SYSTEM =====
# Central Intelligence integration
# Purpose: Persistent memory across sessions
# Commands: @geoclaw remember, @geoclaw recall
memory:
  enabled: ${GEOCLAW_MEMORY_ENABLED:-true}
  provider: ${GEOCLAW_MEMORY_PROVIDER:-central-intelligence}
  apiKeyEnv: GEOCLAW_CI_API_KEY
  
  features:
    crossSession: true
    semanticSearch: true
    factExtraction: true
    entityGraph: true

# ===== SKILL ECOSYSTEM =====
# GitHub CLI Skills + Skills CLI integration
# Purpose: Skill discovery and cross-tool sync
# Commands: @geoclaw skills list, @geoclaw skills sync
skills:
  github:
    enabled: ${GEOCLAW_SKILLS_GITHUB_ENABLED:-true}
    registry: github
    autoUpdate: true
    versionPinning: true
    
  sync:
    enabled: ${GEOCLAW_SKILLS_SYNC_ENABLED:-true}
    targets: ${GEOCLAW_SKILLS_SYNC_TARGETS:-cursor,claude-code,gemini}
    autoSync: false
    
  # Pre-installed skills
  installed:
    - gemini
    - weather
    - nano-pdf
    - monday
    - salesforce
    - vibe-kanban

# ===== TASK MANAGEMENT =====
# Vibe Kanban integration
# Purpose: Visual task management & multi-agent orchestration
# Commands: @geoclaw create task, @geoclaw show board
taskManagement:
  provider: ${GEOCLAW_TASK_MANAGEMENT_PROVIDER:-vibe-kanban}
  
  vibeKanban:
    enabled: ${GEOCLAW_VIBE_KANBAN_ENABLED:-true}
    projectId: ${GEOCLAW_VIBE_KANBAN_PROJECT_ID:-}
    uiPort: ${GEOCLAW_VIBE_KANBAN_UI_PORT:-3003}
    mcpPort: ${GEOCLAW_VIBE_KANBAN_MCP_PORT:-3004}
    
    # Supported agents for orchestration
    supportedAgents:
      - geoclaw
      - claude-code
      - gemini-cli
      - codex
      - amp
      - cursor-agent

# ===== ENTERPRISE INTEGRATIONS =====
integrations:
  # Monday.com - Project management
  # Commands: @geoclaw monday create, @geoclaw monday board
  monday:
    enabled: ${GEOCLAW_MONDAY_ENABLED:-false}
    apiTokenEnv: GEOCLAW_MONDAY_API_TOKEN
    defaultBoardId: ${GEOCLAW_MONDAY_DEFAULT_BOARD_ID:-}
    
  # Salesforce - CRM automation
  # Commands: @geoclaw salesforce query, @geoclaw salesforce pipeline
  salesforce:
    enabled: ${GEOCLAW_SALESFORCE_ENABLED:-false}
    auth:
      type: ${GEOCLAW_SALESFORCE_AUTH_TYPE:-oauth2}
      consumerKeyEnv: GEOCLAW_SALESFORCE_CONSUMER_KEY
      consumerSecretEnv: GEOCLAW_SALESFORCE_CONSUMER_SECRET
    apiVersion: ${GEOCLAW_SALESFORCE_API_VERSION:-v58.0}

# ===== MESSAGING PLATFORMS =====
channels:
  # Slack - Team collaboration
  slack:
    enabled: ${GEOCLAW_SLACK_ENABLED:-false}
    botTokenEnv: GEOCLAW_SLACK_BOT_TOKEN
    appTokenEnv: GEOCLAW_SLACK_APP_TOKEN
    
  # Telegram - Public communities
  telegram:
    enabled: ${GEOCLAW_TELEGRAM_ENABLED:-false}
    botTokenEnv: GEOCLAW_TELEGRAM_BOT_TOKEN
    
  # WhatsApp - Customer support
  whatsapp:
    enabled: ${GEOCLAW_WHATSAPP_ENABLED:-false}
    phoneNumberIdEnv: GEOCLAW_WHATSAPP_PHONE_NUMBER_ID
    cloudTokenEnv: GEOCLAW_WHATSAPP_CLOUD_TOKEN
    
  # Signal - Secure communications
  signal:
    enabled: ${GEOCLAW_SIGNAL_ENABLED:-false}
    accountEnv: GEOCLAW_SIGNAL_ACCOUNT
    cliPath: ${GEOCLAW_SIGNAL_CLI_PATH:-signal-cli}

# ===== SECURITY =====
security:
  # OneCLI Vault - Credential injection
  # Purpose: Secure credential management
  vault:
    enabled: ${GEOCLAW_ONECLI_ENABLED:-false}
    provider: onecli
    injectionMode: runtime
    
  # Container isolation
  container:
    enabled: ${GEOCLAW_RUNTIME_MODE:-cli} != "cli"
    type: ${GEOCLAW_RUNTIME_MODE:-cli}

# ===== MCP SERVER =====
# Expose Geoclaw as MCP server
# Purpose: Ecosystem integration
mcp:
  server:
    enabled: ${GEOCLAW_MCP_SERVER_ENABLED:-true}
    port: ${GEOCLAW_MCP_SERVER_PORT:-3002}
    
    # Tools exposed via MCP
    tools:
      - geoclaw_tasks
      - geoclaw_memory
      - geoclaw_integrations
      - geoclaw_orchestration
      
  client:
    enabled: true
    connectTo:
      - vibe-kanban
      - central-intelligence
      - github
      
  # MCPorter integration
  mcporter:
    enabled: ${GEOCLAW_MCPORTER_ENABLED:-true}
    configPath: ${GEOCLAW_MCPORTER_CONFIG_PATH:-./config/mcporter.json}
    
    features:
      autoDiscovery: true
      toolFiltering: true
      cliGeneration: true
      typeGeneration: true

# ===== RUNTIME =====
runtime:
  mode: ${GEOCLAW_RUNTIME_MODE:-cli}
  heartbeatMinutes: ${GEOCLAW_HEARTBEAT_MINUTES:-15}
  
  # Container settings (if using docker/apple-container)
  container:
    image: ${GEOCLAW_DOCKER_IMAGE:-geoclaw-universal:latest}
    memory: ${GEOCLAW_CONTAINER_MEMORY_LIMIT:-512m}
    cpu: ${GEOCLAW_CONTAINER_CPU_LIMIT:-1.0}

# ===== LOGGING =====
logging:
  level: ${GEOCLAW_LOG_LEVEL:-info}
  file: ./logs/geoclaw.log
  maxSize: 10M
  maxFiles: 5
  
  # Component-specific logging
  components:
    memory: info
    skills: info
    taskManagement: info
    integrations: info
    channels: info
    security: warn
    mcp: info
YAML

print_success "Created geoclaw.config.yml with clear component sections"

print_section "4. Creating Scripts Directory"
mkdir -p "$PROJECT_DIR/scripts"

# Create enhanced run.sh with component explanations

# Copy scripts from installed geoclaw package
if [[ -n "${GEOCLAW_DIR:-}" ]] && [[ -d "$GEOCLAW_DIR/scripts" ]]; then
  cp -r "$GEOCLAW_DIR/scripts/." "$PROJECT_DIR/scripts/"
  print_success "Copied scripts from geoclaw package"
else
  print_warning "GEOCLAW_DIR not set — scripts not copied."
  print_info "This is normal when running from source. Run 'geoclaw start' to initialize."
fi

print_section "5. Final Steps"

echo ""
print_success "Geoclaw v${GEOCLAW_VERSION} project initialized at: $PROJECT_DIR"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_DIR"
echo "  2. geoclaw setup     # Configure components"
echo "  3. geoclaw doctor    # Verify installation"
echo "  4. geoclaw start     # Launch the platform"
echo ""
print_info "Learn about components: geoclaw learn <component>"
print_info "Check status: geoclaw status"
