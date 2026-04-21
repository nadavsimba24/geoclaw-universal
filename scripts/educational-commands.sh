#!/usr/bin/env bash
# Educational Commands for Geoclaw
# Helps users understand each integrated component
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
  echo "║                    Geoclaw v3.0 - Education                  ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_component() {
  echo -e "${YELLOW}🛠  $1${NC} - $2"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

show_capabilities() {
  print_header
  echo "Geoclaw v3.0 integrates these components:"
  echo ""
  
  print_component "Central Intelligence" "Persistent memory system"
  echo "  • Remembers across sessions"
  echo "  • Semantic search"
  echo "  • Fact extraction"
  echo "  • Commands: @geoclaw remember, @geoclaw recall"
  echo ""
  
  print_component "GitHub CLI Skills" "Skill marketplace"
  echo "  • Discover skills from GitHub"
  echo "  • Version control"
  echo "  • Security scanning"
  echo "  • Commands: @geoclaw skills list, @geoclaw skills install"
  echo ""
  
  print_component "Skills CLI" "Cross-tool skill sync"
  echo "  • Sync skills across Claude Code, Cursor, Gemini, etc."
  echo "  • Single source of truth"
  echo "  • Git integration"
  echo "  • Commands: @geoclaw skills sync"
  echo ""
  
  print_component "Vibe Kanban" "Visual task management"
  echo "  • Kanban board for tasks"
  echo "  • Multi-agent orchestration"
  echo "  • Workspace management"
  echo "  • Code review"
  echo "  • Commands: @geoclaw create task, @geoclaw show board"
  echo ""
  
  print_component "Monday.com" "Project management"
  echo "  • Task tracking"
  echo "  • Workflow automation"
  echo "  • Team collaboration"
  echo "  • Commands: @geoclaw monday create, @geoclaw monday board"
  echo ""
  
  print_component "Salesforce" "CRM automation"
  echo "  • Sales pipeline"
  echo "  • Customer support"
  echo "  • Reporting"
  echo "  • Commands: @geoclaw salesforce query, @geoclaw salesforce pipeline"
  echo ""
  
  print_component "Messaging Platforms" "Multi-channel communication"
  echo "  • Slack: Team collaboration"
  echo "  • Telegram: Public communities"
  echo "  • WhatsApp: Customer support"
  echo "  • Signal: Secure communications"
  echo "  • Commands: Platform-specific"
  echo ""
  
  print_component "OneCLI Vault" "Credential security"
  echo "  • Runtime credential injection"
  echo "  • No secrets in containers"
  echo "  • Automatic rotation"
  echo "  • Commands: @geoclaw security status"
  echo ""
  
  print_component "MCP Server" "Ecosystem integration"
  echo "  • Expose Geoclaw as MCP server"
  echo "  • Connect to other MCP servers"
  echo "  • Standardized tool interface"
  echo "  • Commands: @geoclaw mcp status"
  echo ""
  
  print_component "MCPorter" "MCP server discovery & calling"
  echo "  • Discover MCP servers from editors (Cursor, Claude, etc.)"
  echo "  • Call any MCP tool with typed arguments"
  echo "  • Generate TypeScript clients and standalone CLIs"
  echo "  • Educational exploration of available tools"
  echo "  • Commands: @geoclaw mcp list, @geoclaw mcp explore"
  echo ""
  
  echo "Type: @geoclaw learn <component> for detailed information"
  echo "Type: @geoclaw status to see what's enabled"
}

learn_component() {
  local component="$1"
  
  print_header
  echo "Learning about: $component"
  echo ""
  
  case "$component" in
    central-intelligence|memory)
      print_component "Central Intelligence" "Persistent memory system"
      echo ""
      echo "**What it does:**"
      echo "  Solves the 'agent amnesia' problem - AI agents forget everything between sessions."
      echo "  Central Intelligence provides persistent memory that works across sessions."
      echo ""
      echo "**Key features:**"
      echo "  • Cross-session memory: Remembers conversations, preferences, facts"
      echo "  • Semantic search: Find relevant memories using meaning, not just keywords"
      echo "  • Fact extraction: Automatically extracts and stores facts from conversations"
      echo "  • Entity graph: Builds relationships between people, projects, topics"
      echo ""
      echo "**How it works with Geoclaw:**"
      echo "  1. You tell Geoclaw: 'Remember I prefer dark mode'"
      echo "  2. Central Intelligence stores this memory"
      echo "  3. Later, you ask: 'What are my preferences?'"
      echo "  4. Geoclaw queries Central Intelligence and recalls: 'You prefer dark mode'"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw remember \"I prefer dark mode\""
      echo "  • @geoclaw recall \"What are my preferences?\""
      echo "  • @geoclaw memory status"
      echo "  • @geoclaw memory search \"preferences\""
      echo ""
      echo "**Integration:** Works with Claude Code, Cursor, Gemini, and other agents."
      ;;
    
    skills|skill-ecosystem)
      print_component "Skill Ecosystem" "GitHub CLI Skills + Skills CLI"
      echo ""
      echo "**What it does:**"
      echo "  Manages reusable skills that teach Geoclaw how to perform tasks."
      echo "  Skills are like 'apps' or 'plugins' for AI agents."
      echo ""
      echo "**Two components:**"
      echo "  1. GitHub CLI Skills: Discover and install skills from GitHub"
      echo "  2. Skills CLI: Sync skills across all your agent tools"
      echo ""
      echo "**Example skills:**"
      echo "  • Code review: Teaches Geoclaw how to review code"
      echo "  • API documentation: Teaches how to write API docs"
      echo "  • Data analysis: Teaches how to analyze data"
      echo "  • Customer support: Teaches how to handle support tickets"
      echo ""
      echo "**Workflow:**"
      echo "  1. Discover skills: @geoclaw skills list"
      echo "  2. Install skill: @geoclaw skills install code-review"
      echo "  3. Use skill: @geoclaw review this code"
      echo "  4. Sync to other tools: @geoclaw skills sync"
      echo ""
      echo "**Benefits:**"
      echo "  • Reusable: Write once, use everywhere"
      echo "  • Versioned: Skills have versions like software"
      echo "  • Secure: Skills from trusted sources"
      echo "  • Portable: Works across Claude Code, Cursor, Gemini, etc."
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw skills list"
      echo "  • @geoclaw skills install <skill>"
      echo "  • @geoclaw skills sync"
      echo "  • @geoclaw skills status"
      ;;
    
    vibe-kanban|task-management)
      print_component "Vibe Kanban" "Visual task management & multi-agent orchestration"
      echo ""
      echo "**What it does:**"
      echo "  Provides a visual kanban board for managing tasks and orchestrating AI agents."
      echo "  Think of it as 'Jira for AI agents' with built-in execution environments."
      echo ""
      echo "**Key features:**"
      echo "  • Kanban board: Visual task tracking (To Do, In Progress, Done)"
      echo "  • Multi-agent orchestration: Coordinate Claude Code, Gemini, Codex, etc."
      echo "  • Workspace management: Isolated environments with Git branches"
      echo "  • Code review: Built-in diff viewer and comment system"
      echo "  • MCP server: 30+ tools for programmatic control"
      echo ""
      echo "**Workflow example:**"
      echo "  1. Create task: @geoclaw create task \"Fix login bug\""
      echo "  2. View board: @geoclaw show board"
      echo "  3. Start work: @geoclaw start workspace for task 123"
      echo "  4. Assign agent: Uses Claude Code in isolated workspace"
      echo "  5. Review code: Built-in code review in Vibe Kanban UI"
      echo "  6. Create PR: Automatic PR with AI-generated description"
      echo ""
      echo "**Integration with Geoclaw:**"
      echo "  • Tasks created in Geoclaw appear on Vibe Kanban board"
      echo "  • Geoclaw can orchestrate agents through Vibe Kanban"
      echo "  • Workspace results feed back to Geoclaw"
      echo "  • MCP connection for bidirectional communication"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw create task \"Title\""
      echo "  • @geoclaw show board"
      echo "  • @geoclaw start workspace for task <id>"
      echo "  • @geoclaw connect to vibe-kanban"
      echo "  • @geoclaw vibe-kanban status"
      ;;
    
    monday|monday.com)
      print_component "Monday.com" "Project management integration"
      echo ""
      echo "**What it does:**"
      echo "  Connects Geoclaw to Monday.com for enterprise project management."
      echo "  Syncs tasks, updates, and workflows between Geoclaw and Monday.com."
      echo ""
      echo "**Use cases:**"
      echo "  • Business teams create tasks in Monday.com"
      echo "  • Geoclaw picks up tasks and works on them"
      echo "  • Updates sync back to Monday.com"
      echo "  • Notifications sent to Slack/Teams"
      echo ""
      echo "**Features:**"
      echo "  • Board management: Create, read, update boards"
      echo "  • Item operations: Manage tasks with custom fields"
      echo "  • Updates & comments: Post updates from Geoclaw"
      echo "  • Webhooks: Receive notifications from Monday.com"
      echo "  • Workflow automation: Trigger automations"
      echo ""
      echo "**Integration with Vibe Kanban:**"
      echo "  • Tasks can sync between Monday.com and Vibe Kanban"
      echo "  • Business teams use Monday.com, developers use Vibe Kanban"
      echo "  • Geoclaw bridges the gap"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw monday boards list"
      echo "  • @geoclaw monday create item \"Task\""
      echo "  • @geoclaw monday update item <id> status \"Done\""
      echo "  • @geoclaw monday sync with vibe-kanban"
      ;;
    
    salesforce)
      print_component "Salesforce" "CRM automation"
      echo ""
      echo "**What it does:**"
      echo "  Connects Geoclaw to Salesforce for CRM operations."
      echo "  Automates sales, support, and customer relationship tasks."
      echo ""
      echo "**Use cases:**"
      echo "  • Sales pipeline updates from chat"
      echo "  • Customer support case management"
      echo "  • Account/contact updates"
      echo "  • Reporting and analytics"
      echo ""
      echo "**Features:**"
      echo "  • CRM operations: Create, read, update, delete records"
      echo "  • SOQL queries: Execute Salesforce Object Query Language"
      echo "  • Reports & dashboards: Access Salesforce analytics"
      echo "  • Workflow automation: Trigger Salesforce flows"
      echo "  • Chatter integration: Post to Chatter feeds"
      echo ""
      echo "**Example workflows:**"
      echo "  1. Sales rep: '@geoclaw update opportunity 123 to \"Closed Won\"'"
      echo "  2. Support: '@geoclaw create case for customer about login issue'"
      echo "  3. Manager: '@geoclaw show sales pipeline for Q2'"
      echo "  4. Executive: '@geoclaw generate weekly sales report'"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw salesforce query \"SELECT Name FROM Account\""
      echo "  • @geoclaw salesforce pipeline"
      echo "  • @geoclaw salesforce create opportunity \"Deal\" 50000"
      echo "  • @geoclaw salesforce cases --status \"New\""
      ;;
    
    mcp|model-context-protocol)
      print_component "MCP" "Model Context Protocol"
      echo ""
      echo "**What it is:**"
      echo "  A standardized protocol for connecting LLMs to external tools and data."
      echo "  Think of it as 'USB-C for AI agents' - one connector for everything."
      echo ""
      echo "**How it works with Geoclaw:**"
      echo "  1. Geoclaw exposes its capabilities as MCP tools"
      echo "  2. Other MCP clients (Claude Desktop, Raycast) can use Geoclaw tools"
      echo "  3. Geoclaw can connect to other MCP servers (Vibe Kanban, Central Intelligence)"
      echo "  4. Everything communicates via standard protocol"
      echo ""
      echo "**Geoclaw as MCP server:**"
      echo "  Exposes these tools to other applications:"
      echo "  • geoclaw_tasks: Task management"
      echo "  • geoclaw_memory: Memory operations"
      echo "  • geoclaw_integrations: Monday.com, Salesforce, etc."
      echo "  • geoclaw_orchestration: Agent coordination"
      echo ""
      echo "**Geoclaw as MCP client:**"
      echo "  Connects to these servers:"
      echo "  • Vibe Kanban: Task management tools"
      echo "  • Central Intelligence: Memory tools"
      echo "  • GitHub: Skill management tools"
      echo ""
      echo "**Benefits:**"
      echo "  • Ecosystem integration: Geoclaw works with the entire MCP ecosystem"
      echo "  • Standardization: One protocol for all tools"
      echo "  • Discoverability: Tools can be discovered dynamically"
      echo "  • Security: Standard security model"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw mcp status"
      echo "  • @geoclaw mcp tools list"
      echo "  • @geoclaw mcp connect to <server>"
      echo "  • @geoclaw mcp expose tools"
      ;;
    
    mcporter)
      print_component "MCPorter" "MCP server discovery & calling"
      echo ""
      echo "**What it does:**"
      echo "  Discovers MCP servers already configured on your system and lets you"
      echo "  call their tools directly from Geoclaw or the command line."
      echo ""
      echo "**Key features:**"
      echo "  • Auto-discovery: Finds MCP servers from Cursor, Claude Code, VS Code, etc."
      echo "  • Zero-config calling: Call any MCP tool without manual setup"
      echo "  • TypeScript generation: Create typed clients for MCP servers"
      echo "  • CLI generation: Turn MCP servers into standalone command-line tools"
      echo "  • OAuth automation: Handles browser-based authentication automatically"
      echo "  • Educational exploration: Discover what tools are available"
      echo ""
      echo "**How it works:**"
      echo "  1. MCPorter scans your system for MCP server configurations"
      echo "  2. Discovers servers from editors (Cursor, Claude, VS Code)"
      echo "  3. Exposes tools through a unified CLI interface"
      echo "  4. Geoclaw integrates with MCPorter to call tools transparently"
      echo ""
      echo "**Example workflow:**"
      echo "  @geoclaw mcp list"
      echo "  → Finds Linear, Vercel, GitHub, Chrome DevTools MCP servers"
      echo ""
      echo "  @geoclaw mcp explore linear"
      echo "  → Shows 23 Linear tools (create_issue, list_issues, etc.)"
      echo ""
      echo "  @geoclaw mcp call linear.create_issue title=\"Bug\""
      echo "  → Creates issue in Linear via MCP"
      echo ""
      echo "  @geoclaw mcp generate client github"
      echo "  → Creates TypeScript client for GitHub MCP"
      echo ""
      echo "**Benefits:**"
      echo "  • Access to 100+ MCP tools without configuration"
      echo "  • Transparent tool attribution in Geoclaw responses"
      echo "  • Educational discovery of available automation tools"
      echo "  • Programmatic access via generated TypeScript clients"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw mcp list - List discovered MCP servers"
      echo "  • @geoclaw mcp explore <server> - Explore server tools"
      echo "  • @geoclaw mcp call <server.tool> - Call MCP tool"
      echo "  • @geoclaw mcp generate client <server> - Generate TypeScript client"
      echo "  • @geoclaw mcp generate cli <server> - Generate standalone CLI"
      ;;
    
    onecli|security)
      print_component "OneCLI Vault" "Credential security"
      echo ""
      echo "**What it does:**"
      echo "  Securely manages credentials for Geoclaw and its integrations."
      echo "  Injects credentials at runtime, never stores them in containers."
      echo ""
      echo "**The problem it solves:**"
      echo "  Traditional approach: Credentials in environment variables or config files"
      echo "  Problems:"
      echo "    • Credentials in container images"
      echo "    • Hard to rotate"
      echo "    • No audit trail"
      echo "    • Risk of exposure"
      echo ""
      echo "**OneCLI solution:**"
      echo "  • Runtime injection: Credentials injected when needed"
      echo "  • No secrets in containers: Containers stay clean"
      echo "  • Automatic rotation: Credentials rotated regularly"
      echo "  • Audit trail: Every use logged"
      echo "  • Access control: Fine-grained permissions"
      echo ""
      echo "**How it works:**"
      echo "  1. Store credentials in OneCLI vault"
      echo "  2. Geoclaw requests credentials when needed"
      echo "  3. OneCLI injects credentials at runtime"
      echo "  4. Credentials never touch disk in container"
      echo ""
      echo "**Supported credentials:**"
      echo "  • API keys (OpenAI, Anthropic, Google, etc.)"
      echo "  • OAuth tokens"
      echo "  • Database passwords"
      echo "  • SSH keys"
      echo "  • Service account credentials"
      echo ""
      echo "**Commands:**"
      echo "  • @geoclaw security status"
      echo "  • @geoclaw security store <credential>"
      echo "  • @geoclaw security rotate <credential>"
      echo "  • @geoclaw security audit"
      ;;
    
    *)
      echo "Component '$component' not found."
      echo ""
      echo "Available components to learn about:"
      echo "  • central-intelligence (memory system)"
      echo "  • skills (skill ecosystem)"
      echo "  • vibe-kanban (task management)"
      echo "  • monday (project management)"
      echo "  • salesforce (CRM)"
      echo "  • mcp (Model Context Protocol)"
      echo "  • onecli (security)"
      echo "  • messaging (Slack/Telegram/WhatsApp/Signal)"
      return 1
      ;;
  esac
  
  echo ""
  echo "Type: @geoclaw status to see if this component is enabled"
  echo "Type: @geoclaw setup to configure this component"
}


show_status() {
  print_header
  echo "Geoclaw v3.0 Component Status"
  echo ""

  local env_file="$PROJECT_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "  ⚠  .env file not found. Run: geoclaw setup"
    return
  fi

  # shellcheck disable=SC1090
  source "$env_file"

  check_flag() {
    local var="$1"
    local label="$2"
    if [[ "${!var:-false}" == "true" ]]; then
      echo -e "  ${GREEN}✓  $label${NC} — enabled"
    else
      echo -e "  ⚪  $label — disabled"
    fi
  }

  check_flag GEOCLAW_MEMORY_ENABLED       "Central Intelligence (memory)"
  check_flag GEOCLAW_SKILLS_GITHUB_ENABLED "GitHub CLI Skills"
  check_flag GEOCLAW_SKILLS_SYNC_ENABLED   "Skills CLI sync"
  check_flag GEOCLAW_VIBE_KANBAN_ENABLED   "Vibe Kanban"
  check_flag GEOCLAW_MONDAY_ENABLED        "Monday.com"
  check_flag GEOCLAW_SALESFORCE_ENABLED    "Salesforce"
  check_flag GEOCLAW_SLACK_ENABLED         "Slack"
  check_flag GEOCLAW_TELEGRAM_ENABLED      "Telegram"
  check_flag GEOCLAW_WHATSAPP_ENABLED      "WhatsApp"
  check_flag GEOCLAW_SIGNAL_ENABLED        "Signal"
  check_flag GEOCLAW_ONECLI_ENABLED        "OneCLI Vault"
  check_flag GEOCLAW_MCP_SERVER_ENABLED    "MCP Server"
  check_flag GEOCLAW_N8N_ENABLED           "n8n workflows"
  check_flag GEOCLAW_GEOSPATIAL_ENABLED    "Geospatial (QGIS/PostGIS)"
  check_flag GEOCLAW_WEB_SCRAPING_ENABLED  "Web scraping"
  check_flag GEOCLAW_WORKFLOW_ENABLED      "Workflow orchestration"

  echo ""
  echo "Runtime mode: ${GEOCLAW_RUNTIME_MODE:-cli}"
  echo ""
  echo "Run 'geoclaw setup' to enable or configure components."
}

main() {
  local command="${1:-help}"
  local arg="${2:-}"

  case "$command" in
    learn)
      if [[ -z "$arg" ]]; then
        echo "Usage: geoclaw learn <component>"
        echo "Available: central-intelligence, skills, vibe-kanban, monday, salesforce,"
        echo "           mcp, mcporter, onecli, n8n, qgis, web-scraping, memory"
        exit 1
      fi
      learn_component "$arg"
      ;;
    status)
      show_status
      ;;
    capabilities|list)
      show_capabilities
      ;;
    *)
      echo "Usage: $0 <learn|status|capabilities> [component]"
      exit 1
      ;;
  esac
}

main "$@"
