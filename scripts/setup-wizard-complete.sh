#!/usr/bin/env bash
# Complete Setup Wizard for Geoclaw v3.0
# Configures ALL components with clear explanations
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
CONFIG_FILE="$PROJECT_DIR/geoclaw.config.yml"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║              Geoclaw v3.0 - Complete Setup Wizard            ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_section() {
  echo -e "${CYAN}"
  echo "────────────────────────────────────────────────────────────────"
  echo " $1"
  echo "────────────────────────────────────────────────────────────────"
  echo -e "${NC}"
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

ask_yes_no() {
  local prompt="$1"
  local default="${2:-Y}"
  
  while true; do
    read -p "$prompt [Y/n]: " -r answer
    answer="${answer:-$default}"
    
    case "$answer" in
      [Yy]* ) return 0 ;;
      [Nn]* ) return 1 ;;
      * ) echo "Please answer yes or no." ;;
    esac
  done
}

ask_input() {
  local prompt="$1"
  local default="$2"
  local var_name="$3"
  
  read -p "$prompt [$default]: " -r input
  input="${input:-$default}"
  
  # Update environment variable
  if [[ -n "$var_name" ]]; then
    sed -i '' "/^$var_name=/d" "$ENV_FILE" 2>/dev/null || true
    echo "$var_name=\"$input\"" >> "$ENV_FILE"
  fi
  
  echo "$input"
}

check_dependency() {
  local cmd="$1"
  local name="$2"
  
  if command -v "$cmd" &> /dev/null; then
    print_success "$name is installed"
    return 0
  else
    print_warning "$name is NOT installed"
    return 1
  fi
}

setup_environment() {
  print_section "1. Environment Setup"
  
  if [[ ! -f "$ENV_FILE" ]]; then
    print_info "Creating .env file from template..."
    cp "$PROJECT_DIR/.env.template" "$ENV_FILE"
    print_success ".env file created"
  else
    print_info ".env file already exists"
  fi
  
  # Set project name
  PROJECT_NAME=$(basename "$PROJECT_DIR")
  sed -i '' "s/GEOCLAW_PROJECT_NAME=.*/GEOCLAW_PROJECT_NAME=\"$PROJECT_NAME\"/" "$ENV_FILE"
  
  print_success "Environment setup complete"
}

setup_memory_system() {
  print_section "2. Memory System (Central Intelligence)"
  
  print_info "Central Intelligence provides persistent memory across sessions."
  print_info "It remembers conversations, preferences, and facts."
  print_info "This solves 'agent amnesia' - AI agents forgetting between sessions."
  
  if ask_yes_no "Enable persistent memory with Central Intelligence?"; then
    print_info "Configuring Central Intelligence..."
    
    # Check if Central Intelligence CLI is installed
    if check_dependency "ci" "Central Intelligence CLI"; then
      print_info "Central Intelligence CLI found"
    else
      print_warning "Install Central Intelligence CLI: npm install -g @central-intelligence/cli"
      print_info "You can install it later and rerun setup"
    fi
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_MEMORY_ENABLED=.*/GEOCLAW_MEMORY_ENABLED=true/" "$ENV_FILE"
    sed -i '' "s/GEOCLAW_MEMORY_PROVIDER=.*/GEOCLAW_MEMORY_PROVIDER=central-intelligence/" "$ENV_FILE"
    
    print_success "Memory system enabled"
    print_info "Commands: @geoclaw remember, @geoclaw recall, @geoclaw memory search"
  else
    sed -i '' "s/GEOCLAW_MEMORY_ENABLED=.*/GEOCLAW_MEMORY_ENABLED=false/" "$ENV_FILE"
    print_info "Memory system disabled"
  fi
}

setup_skill_ecosystem() {
  print_section "3. Skill Ecosystem"
  
  print_info "GitHub CLI Skills + Skills CLI provide a skill marketplace."
  print_info "Skills are reusable modules that teach Geoclaw how to perform tasks."
  print_info "Skills work across Claude Code, Cursor, Gemini, and other agents."
  
  if ask_yes_no "Enable skill ecosystem?"; then
    print_info "Configuring skill ecosystem..."
    
    # Check for GitHub CLI
    if check_dependency "gh" "GitHub CLI"; then
      print_info "GitHub CLI found"
      
      # Check for gh skill extension
      if gh extension list | grep -q "skill"; then
        print_success "GitHub CLI Skills extension found"
      else
        print_warning "Install GitHub CLI Skills: gh extension install dhruvwill/skills-cli"
      fi
    else
      print_warning "Install GitHub CLI: brew install gh"
    fi
    
    # Check for Skills CLI
    if check_dependency "skills" "Skills CLI"; then
      print_success "Skills CLI found"
    else
      print_warning "Install Skills CLI: npm install -g skills-cli"
    fi
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_SKILLS_GITHUB_ENABLED=.*/GEOCLAW_SKILLS_GITHUB_ENABLED=true/" "$ENV_FILE"
    sed -i '' "s/GEOCLAW_SKILLS_SYNC_ENABLED=.*/GEOCLAW_SKILLS_SYNC_ENABLED=true/" "$ENV_FILE"
    
    print_success "Skill ecosystem enabled"
    print_info "Commands: @geoclaw skills list, @geoclaw skills install, @geoclaw skills sync"
  else
    sed -i '' "s/GEOCLAW_SKILLS_GITHUB_ENABLED=.*/GEOCLAW_SKILLS_GITHUB_ENABLED=false/" "$ENV_FILE"
    sed -i '' "s/GEOCLAW_SKILLS_SYNC_ENABLED=.*/GEOCLAW_SKILLS_SYNC_ENABLED=false/" "$ENV_FILE"
    print_info "Skill ecosystem disabled"
  fi
}

setup_vibe_kanban() {
  print_section "4. Vibe Kanban (Task Management)"
  
  print_info "Vibe Kanban provides visual task management and multi-agent orchestration."
  print_info "It's like 'Jira for AI agents' with built-in execution environments."
  print_info "Features: Kanban board, workspace management, code review, 30+ MCP tools."
  
  if ask_yes_no "Enable Vibe Kanban for task management?"; then
    print_info "Configuring Vibe Kanban..."
    
    # Check if Vibe Kanban is installed
    if check_dependency "npx" "npx"; then
      print_info "Checking Vibe Kanban installation..."
      if npx vibe-kanban --version &> /dev/null; then
        print_success "Vibe Kanban found"
      else
        print_warning "Vibe Kanban not installed. Will install when needed."
      fi
    fi
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_VIBE_KANBAN_ENABLED=.*/GEOCLAW_VIBE_KANBAN_ENABLED=true/" "$ENV_FILE"
    
    # Set ports
    VIBE_KANBAN_UI_PORT=$(ask_input "Vibe Kanban UI port" "3003" "GEOCLAW_VIBE_KANBAN_UI_PORT")
    VIBE_KANBAN_MCP_PORT=$(ask_input "Vibe Kanban MCP port" "3004" "GEOCLAW_VIBE_KANBAN_MCP_PORT")
    
    print_success "Vibe Kanban enabled"
    print_info "Commands: @geoclaw create task, @geoclaw show board, @geoclaw start workspace"
    print_info "Web UI: http://localhost:$VIBE_KANBAN_UI_PORT"
  else
    sed -i '' "s/GEOCLAW_VIBE_KANBAN_ENABLED=.*/GEOCLAW_VIBE_KANBAN_ENABLED=false/" "$ENV_FILE"
    print_info "Vibe Kanban disabled"
  fi
}

setup_n8n_integration() {
  print_section "5. n8n Workflow Automation"
  
  print_info "n8n is a visual workflow automation tool with 200+ integrations."
  print_info "Geoclaw can trigger, monitor, and create n8n workflows."
  print_info "Use for: Data pipelines, notifications, API integrations, automation."
  
  if ask_yes_no "Enable n8n integration?"; then
    print_info "Configuring n8n integration..."
    
    # Check if n8n is installed
    if check_dependency "n8n" "n8n CLI"; then
      print_success "n8n CLI found"
    else
      print_warning "n8n not installed. You can run it via npx: npx n8n start"
    fi
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_N8N_ENABLED=.*/GEOCLAW_N8N_ENABLED=true/" "$ENV_FILE"
    
    # Set URL
    N8N_URL=$(ask_input "n8n URL (leave empty for default)" "http://localhost:5678" "GEOCLAW_N8N_URL")
    
    # Ask for API key
    print_info "n8n API key (optional, for API access):"
    print_info "Get it from n8n settings → API"
    N8N_API_KEY=$(ask_input "n8n API key" "" "GEOCLAW_N8N_API_KEY")
    
    print_success "n8n integration enabled"
    print_info "Commands: @geoclaw n8n execute, @geoclaw n8n create workflow"
    print_info "Web UI: $N8N_URL"
  else
    sed -i '' "s/GEOCLAW_N8N_ENABLED=.*/GEOCLAW_N8N_ENABLED=false/" "$ENV_FILE"
    print_info "n8n integration disabled"
  fi
}

setup_geospatial() {
  print_section "6. Geospatial Analysis (QGIS/PostGIS)"
  
  print_info "QGIS and PostGIS provide professional geospatial analysis capabilities."
  print_info "Features: Spatial queries, mapping, GIS analysis, data visualization."
  print_info "Use for: Location analysis, mapping, spatial data processing."
  
  if ask_yes_no "Enable geospatial integration?"; then
    print_info "Configuring geospatial integration..."
    
    # Check for PostgreSQL
    if check_dependency "psql" "PostgreSQL CLI"; then
      print_success "PostgreSQL found"
    else
      print_warning "PostgreSQL not installed. Install via: brew install postgresql"
    fi
    
    # Check for QGIS
    if [[ -d "/Applications/QGIS.app" ]] || command -v qgis &> /dev/null; then
      print_success "QGIS found"
    else
      print_warning "QGIS not found. Download from: https://qgis.org"
    fi
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_GEOSPATIAL_ENABLED=.*/GEOCLAW_GEOSPATIAL_ENABLED=true/" "$ENV_FILE"
    sed -i '' "s/GEOCLAW_QGIS_ENABLED=.*/GEOCLAW_QGIS_ENABLED=true/" "$ENV_FILE"
    
    # PostgreSQL configuration
    print_info "PostgreSQL configuration:"
    POSTGRES_HOST=$(ask_input "PostgreSQL host" "localhost" "GEOCLAW_POSTGRES_HOST")
    POSTGRES_PORT=$(ask_input "PostgreSQL port" "5432" "GEOCLAW_POSTGRES_PORT")
    POSTGRES_DB=$(ask_input "PostgreSQL database" "geoclaw" "GEOCLAW_POSTGRES_DB")
    POSTGRES_USER=$(ask_input "PostgreSQL user" "postgres" "GEOCLAW_POSTGRES_USER")
    POSTGRES_PASSWORD=$(ask_input "PostgreSQL password" "" "GEOCLAW_POSTGRES_PASSWORD")
    
    # QGIS configuration
    if [[ -d "/Applications/QGIS.app" ]]; then
      QGIS_PATH="/Applications/QGIS.app/Contents/MacOS/QGIS"
      sed -i '' "s|GEOCLAW_QGIS_PATH=.*|GEOCLAW_QGIS_PATH=\"$QGIS_PATH\"|" "$ENV_FILE"
    fi
    
    print_success "Geospatial integration enabled"
    print_info "Commands: @geoclaw spatial query, @geoclaw create map, @geoclaw analyze locations"
  else
    sed -i '' "s/GEOCLAW_GEOSPATIAL_ENABLED=.*/GEOCLAW_GEOSPATIAL_ENABLED=false/" "$ENV_FILE"
    sed -i '' "s/GEOCLAW_QGIS_ENABLED=.*/GEOCLAW_QGIS_ENABLED=false/" "$ENV_FILE"
    print_info "Geospatial integration disabled"
  fi
}

setup_web_scraping() {
  print_section "7. Web Scraping & Navigation"
  
  print_info "Advanced web data extraction and browser automation."
  print_info "Features: Scrape websites, navigate pages, fill forms, extract data."
  print_info "Use for: Data collection, monitoring, automation, research."
  
  if ask_yes_no "Enable web scraping capabilities?"; then
    print_info "Configuring web scraping..."
    
    # Check for Node.js and npm
    if check_dependency "node" "Node.js"; then
      print_success "Node.js found"
    else
      print_warning "Node.js not installed. Install via: brew install node"
    fi
    
    # Check for Puppeteer dependencies
    print_info "Checking browser automation dependencies..."
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_WEB_SCRAPING_ENABLED=.*/GEOCLAW_WEB_SCRAPING_ENABLED=true/" "$ENV_FILE"
    
    # Configuration
    print_info "Web scraping configuration:"
    HEADLESS_MODE=$(ask_input "Run browser in headless mode? (yes/no)" "yes")
    if [[ "$HEADLESS_MODE" == "yes" ]]; then
      sed -i '' "s/GEOCLAW_PUPPETEER_HEADLESS=.*/GEOCLAW_PUPPETEER_HEADLESS=true/" "$ENV_FILE"
    else
      sed -i '' "s/GEOCLAW_PUPPETEER_HEADLESS=.*/GEOCLAW_PUPPETEER_HEADLESS=false/" "$ENV_FILE"
    fi
    
    # Rate limiting
    if ask_yes_no "Enable rate limiting for polite scraping?"; then
      sed -i '' "s/GEOCLAW_RATE_LIMIT_ENABLED=.*/GEOCLAW_RATE_LIMIT_ENABLED=true/" "$ENV_FILE"
      REQUESTS_PER_SECOND=$(ask_input "Requests per second" "2" "GEOCLAW_REQUESTS_PER_SECOND")
    fi
    
    print_success "Web scraping enabled"
    print_info "Commands: @geoclaw scrape, @geoclaw navigate, @geoclaw extract data"
  else
    sed -i '' "s/GEOCLAW_WEB_SCRAPING_ENABLED=.*/GEOCLAW_WEB_SCRAPING_ENABLED=false/" "$ENV_FILE"
    print_info "Web scraping disabled"
  fi
}

setup_workflow_orchestration() {
  print_section "8. Workflow Orchestration"
  
  print_info "Connects ALL Geoclaw components into magic workflows."
  print_info "Create pipelines that span multiple systems automatically."
  print_info "Example: Scrape data → Process in n8n → Store in PostGIS → Visualize in QGIS"
  
  if ask_yes_no "Enable workflow orchestration?"; then
    print_info "Configuring workflow orchestrator..."
    
    # Enable in .env
    sed -i '' "s/GEOCLAW_WORKFLOW_ENABLED=.*/GEOCLAW_WORKFLOW_ENABLED=true/" "$ENV_FILE"
    
    print_success "Workflow orchestration enabled"
    print_info "Commands: @geoclaw workflow execute, @geoclaw workflow create"
    print_info "Pre-built workflows: Data pipelines, monitoring systems, business intelligence"
  else
    sed -i '' "s/GEOCLAW_WORKFLOW_ENABLED=.*/GEOCLAW_WORKFLOW_ENABLED=false/" "$ENV_FILE"
    print_info "Workflow orchestration disabled"
  fi
}