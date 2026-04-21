#!/usr/bin/env bash
# Geoclaw v3.0 - Complete Setup Wizard
# Interactive setup for ALL Geoclaw components
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# Colors
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
  echo "║              Geoclaw v3.0 - Complete Setup Wizard            ║"
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

ask_yes_no() {
  local prompt="$1"
  local default="${2:-yes}"
  
  while true; do
    read -p "$prompt [Y/n]: " -r
    case "${REPLY:-$default}" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo]) return 1 ;;
      *) echo "Please answer yes or no." ;;
    esac
  done
}

ask_input() {
  local prompt="$1"
  local default="$2"
  local env_var="$3"
  
  read -p "$prompt [$default]: " -r
  local value="${REPLY:-$default}"
  
  if [[ -n "$env_var" ]]; then
    sed -i "s/${env_var}=.*/${env_var}=${value}/" "$ENV_FILE" 2>/dev/null || echo "${env_var}=${value}" >> "$ENV_FILE"
  fi
  
  echo "$value"
}

check_dependency() {
  local cmd="$1"
  local name="$2"
  
  if command -v "$cmd" &> /dev/null; then
    return 0
  else
    print_warning "$name not found: $cmd"
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
  sed -i "s/GEOCLAW_PROJECT_NAME=.*/GEOCLAW_PROJECT_NAME=\"$PROJECT_NAME\"/" "$ENV_FILE"
  
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
    sed -i "s/GEOCLAW_MEMORY_ENABLED=.*/GEOCLAW_MEMORY_ENABLED=true/" "$ENV_FILE"
    sed -i "s/GEOCLAW_MEMORY_PROVIDER=.*/GEOCLAW_MEMORY_PROVIDER=central-intelligence/" "$ENV_FILE"
    
    print_success "Memory system enabled"
    print_info "Commands: @geoclaw remember, @geoclaw recall, @geoclaw memory search"
  else
    sed -i "s/GEOCLAW_MEMORY_ENABLED=.*/GEOCLAW_MEMORY_ENABLED=false/" "$ENV_FILE"
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
    sed -i "s/GEOCLAW_SKILLS_GITHUB_ENABLED=.*/GEOCLAW_SKILLS_GITHUB_ENABLED=true/" "$ENV_FILE"
    sed -i "s/GEOCLAW_SKILLS_SYNC_ENABLED=.*/GEOCLAW_SKILLS_SYNC_ENABLED=true/" "$ENV_FILE"
    
    print_success "Skill ecosystem enabled"
    print_info "Commands: @geoclaw skills list, @geoclaw skills install, @geoclaw skills sync"
  else
    sed -i "s/GEOCLAW_SKILLS_GITHUB_ENABLED=.*/GEOCLAW_SKILLS_GITHUB_ENABLED=false/" "$ENV_FILE"
    sed -i "s/GEOCLAW_SKILLS_SYNC_ENABLED=.*/GEOCLAW_SKILLS_SYNC_ENABLED=false/" "$ENV_FILE"
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
    if check_dependency "npx" "npx (Node.js)"; then
      print_info "npx found - Vibe Kanban can be run via npx"
    fi
    
    # Enable in .env
    sed -i "s/GEOCLAW_VIBE_KANBAN_ENABLED=.*/GEOCLAW_VIBE_KANBAN_ENABLED=true/" "$ENV_FILE"
    
    # Ask for Vibe Kanban URL
    VIBE_KANBAN_URL=$(ask_input "Vibe Kanban URL" "http://localhost:3003" "GEOCLAW_VIBE_KANBAN_URL")
    
    print_success "Vibe Kanban enabled"
    print_info "Commands: @geoclaw create task, @geoclaw show board, @geoclaw start workspace"
    print_info "Access Vibe Kanban at: $VIBE_KANBAN_URL"
  else
    sed -i "s/GEOCLAW_VIBE_KANBAN_ENABLED=.*/GEOCLAW_VIBE_KANBAN_ENABLED=false/" "$ENV_FILE"
    print_info "Vibe Kanban disabled"
  fi
}

setup_n8n_integration() {
  print_section "5. n8n Workflow Automation"
  
  print_info "n8n provides 200+ integrations out of the box."
  print_info "Visual workflow editor for creating automation pipelines."
  print_info "Trigger workflows from Geoclaw, process data, integrate with APIs."
  
  if ask_yes_no "Enable n8n workflow automation?"; then
    print_info "Configuring n8n integration..."
    
    # Check if n8n is installed
    if check_dependency "n8n" "n8n CLI"; then
      print_info "n8n CLI found"
    else
      print_warning "Install n8n: npm install -g n8n"
      print_info "You can install it later and rerun setup"
    fi
    
    # Enable in .env
    sed -i "s/GEOCLAW_N8N_ENABLED=.*/GEOCLAW_N8N_ENABLED=true/" "$ENV_FILE"
    
    # Ask for n8n URL
    N8N_URL=$(ask_input "n8n URL" "http://localhost:5678" "GEOCLAW_N8N_URL")
    
    # Ask for webhook URL
    N8N_WEBHOOK_URL=$(ask_input "n8n webhook URL" "$N8N_URL/webhook-test" "GEOCLAW_N8N_WEBHOOK_URL")
    
    print_success "n8n integration enabled"
    print_info "Commands: @geoclaw n8n execute, @geoclaw n8n create workflow"
    print_info "Access n8n at: $N8N_URL"
  else
    sed -i "s/GEOCLAW_N8N_ENABLED=.*/GEOCLAW_N8N_ENABLED=false/" "$ENV_FILE"
    print_info "n8n integration disabled"
  fi
}

setup_geospatial_tools() {
  print_section "6. QGIS/PostGIS Geospatial Analysis"
  
  print_info "QGIS and PostGIS provide professional geospatial tools."
  print_info "Spatial queries, mapping, GIS data processing, visualization."
  print_info "Import shapefiles, analyze locations, create maps from data."
  
  if ask_yes_no "Enable geospatial analysis with QGIS/PostGIS?"; then
    print_info "Configuring geospatial tools..."
    
    # Check for PostgreSQL/PostGIS
    if check_dependency "psql" "PostgreSQL CLI"; then
      print_info "PostgreSQL found"
      
      # Ask for database connection
      POSTGRES_HOST=$(ask_input "PostgreSQL host" "localhost" "GEOCLAW_POSTGRES_HOST")
      POSTGRES_PORT=$(ask_input "PostgreSQL port" "5432" "GEOCLAW_POSTGRES_PORT")
      POSTGRES_DB=$(ask_input "PostgreSQL database" "geoclaw" "GEOCLAW_POSTGRES_DB")
      POSTGRES_USER=$(ask_input "PostgreSQL user" "postgres" "GEOCLAW_POSTGRES_USER")
      
      # Password will be asked at runtime or in .env
      print_warning "Set PostgreSQL password in .env as GEOCLAW_POSTGRES_PASSWORD"
    else
      print_warning "Install PostgreSQL with PostGIS extension"
    fi
    
    # Check for QGIS (optional)
    if check_dependency "qgis" "QGIS"; then
      print_success "QGIS found"
    else
      print_info "QGIS not found (optional for desktop GIS)"
    fi
    
    # Enable in .env
    sed -i "s/GEOCLAW_GEOSPATIAL_ENABLED=.*/GEOCLAW_GEOSPATIAL_ENABLED=true/" "$ENV_FILE"
    
    print_success "Geospatial tools enabled"
    print_info "Commands: @geoclaw spatial query, @geoclaw create map, @geoclaw analyze locations"
  else
    sed -i "s/GEOCLAW_GEOSPATIAL_ENABLED=.*/GEOCLAW_GEOSPATIAL_ENABLED=false/" "$ENV_FILE"
    print_info "Geospatial tools disabled"
  fi
}

setup_web_scraping() {
  print_section "7. Web Scraping & Navigation"
  
  print_info "Web scraping with JavaScript rendering and multi-page navigation."
  print_info "Extract structured data, fill forms, automate browser interactions."
  print_info "Uses Puppeteer (headless Chrome) for reliable scraping."
  
  if ask_yes_no "Enable web scraping capabilities?"; then
    print_info "Configuring web scraping..."
    
    # Check for Puppeteer dependencies
    print_info "Puppeteer will install Chromium automatically"
    
    # Enable in .env
    sed -i "s/GEOCLAW_WEB_SCRAPING_ENABLED=.*/GEOCLAW_WEB_SCRAPING_ENABLED=true/" "$ENV_FILE"
    
    # Ask about rate limiting
    if ask_yes_no "Enable rate limiting for ethical scraping?"; then
      sed -i "s/GEOCLAW_RATE_LIMIT_ENABLED=.*/GEOCLAW_RATE_LIMIT_ENABLED=true/" "$ENV_FILE"
      REQUESTS_PER_SECOND=$(ask_input "Requests per second" "2" "GEOCLAW_REQUESTS_PER_SECOND")
    fi
    
    print_success "Web scraping enabled"
    print_info "Commands: @geoclaw scrape, @geoclaw navigate, @geoclaw extract data"
  else
    sed -i "s/GEOCLAW_WEB_SCRAPING_ENABLED=.*/GEOCLAW_WEB_SCRAPING_ENABLED=false/" "$ENV_FILE"
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
    sed -i "s/GEOCLAW_WORKFLOW_ENABLED=.*/GEOCLAW_WORKFLOW_ENABLED=true/" "$ENV_FILE"
    
    print_success "Workflow orchestration enabled"
    print_info "Commands: @geoclaw workflow execute, @geoclaw workflow create"
    print_info "Pre-built workflows: Data pipelines, monitoring systems, business intelligence"
  else
    sed -i "s/GEOCLAW_WORKFLOW_ENABLED=.*/GEOCLAW_WORKFLOW_ENABLED=false/" "$ENV_FILE"
    print_info "Workflow orchestration disabled"
  fi
}

setup_mcporter_integration() {
  print_section "9. MCPorter Integration (MCP Server Discovery)"
  
  print_info "MCPorter discovers MCP servers from your editors (Cursor, Claude, VS Code)."
  print_info "Zero-config access to 100+ MCP tools without manual setup."
  print_info "Educational exploration of available tools with transparent attribution."
  
  if ask_yes_no "Enable MCPorter for MCP server discovery?"; then
    print_info "Configuring MCPorter..."
    
    # Check if MCPorter is installed
    if check_dependency "mcporter" "MCPorter CLI"; then
      print_success "MCPorter found"
    else
      print_warning "MCPorter will be installed as a dependency"
    fi
    
    # Enable in .env
    sed -i "s/GEOCLAW_MCPORTER_ENABLED=.*/GEOCLAW_MCPORTER_ENABLED=true/" "$ENV_FILE"
    
    print_success "MCPorter integration enabled"
    print_info "Commands: @geoclaw mcp list, @geoclaw mcp explore, @geoclaw mcp call"
    print_info "Transparent tool attribution in every operation"
  else
    sed -i "s/GEOCLAW_MCPORTER_ENABLED=.*/GEOCLAW_MCPORTER_ENABLED=false/" "$ENV_FILE"
    print_info "MCPorter integration disabled"
  fi
}

main() {
  print_header
  
  echo "🤖 Geoclaw Complete Setup Wizard"
  echo ""
  echo "I'll help you configure ALL components for magic workflows:"
  echo ""
  echo "1. 🧠 Memory System - Persistent memory across sessions"
  echo "2. 🛠️  Skill Ecosystem - GitHub CLI Skills marketplace"
  echo "3. 📋 Vibe Kanban - Visual task management"
  echo "4. 🔄 n8