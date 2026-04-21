#!/usr/bin/env bash
# Geoclaw v3.0 - Simple Setup Wizard
# Fixed version without syntax errors
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

print_header() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║              Geoclaw v3.0 - Setup Wizard                     ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_section() {
  echo -e "\n${BLUE}▸ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
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

# Create .env file if it doesn't exist
if [[ ! -f "$ENV_FILE" ]]; then
  echo "# Geoclaw v3.0 Configuration" > "$ENV_FILE"
  echo "GEOCLAW_PROJECT_NAME=\"$(basename "$PROJECT_DIR")\"" >> "$ENV_FILE"
  print_success "Created .env file"
fi

# Function to set env variable
set_env() {
  local var="$1"
  local value="$2"
  
  if grep -q "^$var=" "$ENV_FILE"; then
    sed -i "s|^$var=.*|$var=$value|" "$ENV_FILE"
  else
    echo "$var=$value" >> "$ENV_FILE"
  fi
}

main() {
  print_header
  
  echo "Welcome to Geoclaw v3.0 setup!"
  echo "I'll help you configure the essential components."
  echo ""
  
  # MCPorter Integration (Core feature)
  print_section "1. MCPorter Integration"
  echo "MCPorter discovers MCP servers from your editors (Cursor, Claude, VS Code)"
  echo "Zero-config access to 100+ MCP tools with transparent attribution"
  echo ""
  
  if ask_yes_no "Enable MCPorter for MCP server discovery?"; then
    set_env "GEOCLAW_MCPORTER_ENABLED" "true"
    print_success "MCPorter enabled"
    echo "Commands: geoclaw mcp list, geoclaw mcp explore"
  else
    set_env "GEOCLAW_MCPORTER_ENABLED" "false"
    echo "MCPorter disabled"
  fi
  
  # n8n Workflow Automation
  print_section "2. n8n Workflow Automation"
  echo "n8n provides 200+ integrations for workflow automation"
  echo "Visual workflow editor, trigger workflows from Geoclaw"
  echo ""
  
  if ask_yes_no "Enable n8n workflow automation?"; then
    set_env "GEOCLAW_N8N_ENABLED" "true"
    read -p "n8n URL [http://localhost:5678]: " n8n_url
    set_env "GEOCLAW_N8N_URL" "${n8n_url:-http://localhost:5678}"
    print_success "n8n enabled"
    echo "Commands: geoclaw n8n execute, geoclaw n8n create"
  else
    set_env "GEOCLAW_N8N_ENABLED" "false"
    echo "n8n disabled"
  fi
  
  # Web Scraping
  print_section "3. Web Scraping"
  echo "Web scraping with JavaScript rendering and multi-page navigation"
  echo "Extract structured data, automate browser interactions"
  echo ""
  
  if ask_yes_no "Enable web scraping capabilities?"; then
    set_env "GEOCLAW_WEB_SCRAPING_ENABLED" "true"
    print_success "Web scraping enabled"
    echo "Commands: geoclaw scrape, geoclaw navigate"
  else
    set_env "GEOCLAW_WEB_SCRAPING_ENABLED" "false"
    echo "Web scraping disabled"
  fi
  
  # Workflow Orchestration
  print_section "4. Workflow Orchestration"
  echo "Connect all components into magic workflows"
  echo "Example: Scrape → Process in n8n → Store → Visualize"
  echo ""
  
  if ask_yes_no "Enable workflow orchestration?"; then
    set_env "GEOCLAW_WORKFLOW_ENABLED" "true"
    print_success "Workflow orchestration enabled"
    echo "Commands: geoclaw workflow execute, geoclaw workflow create"
  else
    set_env "GEOCLAW_WORKFLOW_ENABLED" "false"
    echo "Workflow orchestration disabled"
  fi
  
  # Educational System (Always enabled)
  print_section "5. Educational System"
  echo "Transparent tool attribution and learning commands"
  echo "Understand which tools are being used in every operation"
  echo ""
  set_env "GEOCLAW_EDUCATION_ENABLED" "true"
  print_success "Educational system enabled"
  echo "Commands: geoclaw learn <component>, geoclaw status"
  
  echo ""
  echo -e "${GREEN}✅ Setup complete!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Start Geoclaw: geoclaw start"
  echo "2. Learn about components: geoclaw learn mcporter"
  echo "3. Check status: geoclaw status"
  echo "4. Create magic workflow: geoclaw workflow create"
  echo ""
  echo "Documentation: https://github.com/nadavsimba24/geoclaw-universal"
}

# Run main function
main "$@"