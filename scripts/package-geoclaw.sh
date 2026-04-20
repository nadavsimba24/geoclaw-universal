#!/usr/bin/env bash
# Package Geoclaw v3.0 for distribution
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PACKAGE_DIR="$PROJECT_DIR/dist/geoclaw-universal-v3.0"
TARBALL="$PROJECT_DIR/dist/geoclaw-universal-v3.0.tar.gz"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_section() {
  echo -e "${BLUE}"
  echo "────────────────────────────────────────────────────────────────"
  echo " $1"
  echo "────────────────────────────────────────────────────────────────"
  echo -e "${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
  echo -e "${YELLOW}ℹ $1${NC}"
}

# Clean previous builds
print_section "1. Cleaning previous builds"
rm -rf "$PROJECT_DIR/dist"
mkdir -p "$PACKAGE_DIR"
print_success "Cleanup complete"

# Create package structure
print_section "2. Creating package structure"
mkdir -p "$PACKAGE_DIR/scripts"
mkdir -p "$PACKAGE_DIR/scripts/components"
mkdir -p "$PACKAGE_DIR/references"
print_success "Directory structure created"

# Copy core files
print_section "3. Copying core files"
cp "$PROJECT_DIR/README-UNIVERSAL.md" "$PACKAGE_DIR/README.md"
cp "$PROJECT_DIR/SKILL.md" "$PACKAGE_DIR/"
cp "$PROJECT_DIR/package.json" "$PACKAGE_DIR/"

# Copy scripts
cp "$PROJECT_DIR/scripts/geoclaw_init_universal.sh" "$PACKAGE_DIR/scripts/"
cp "$PROJECT_DIR/scripts/setup-wizard-complete.sh" "$PACKAGE_DIR/scripts/"
cp "$PROJECT_DIR/scripts/educational-commands-complete.sh" "$PACKAGE_DIR/scripts/"
cp "$PROJECT_DIR/scripts/run.sh" "$PACKAGE_DIR/scripts/"
cp "$PROJECT_DIR/scripts/package-geoclaw.sh" "$PACKAGE_DIR/scripts/"

# Copy components
cp "$PROJECT_DIR/scripts/components/mcp-server.js" "$PACKAGE_DIR/scripts/components/"
cp "$PROJECT_DIR/scripts/components/vibe-kanban-client.js" "$PACKAGE_DIR/scripts/components/"
cp "$PROJECT_DIR/scripts/components/n8n-integration.js" "$PACKAGE_DIR/scripts/components/"
cp "$PROJECT_DIR/scripts/components/qgis-postgis-integration.js" "$PACKAGE_DIR/scripts/components/"
cp "$PROJECT_DIR/scripts/components/web-scraping-navigation.js" "$PACKAGE_DIR/scripts/components/"
cp "$PROJECT_DIR/scripts/components/workflow-orchestrator.js" "$PACKAGE_DIR/scripts/components/"
cp "$PROJECT_DIR/scripts/components/mcporter-integration.js" "$PACKAGE_DIR/scripts/components/"

# Copy references
cp "$PROJECT_DIR/references/magic-workflows.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/ecosystem-integration.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/architecture.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/monday-setup.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/salesforce-setup.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/slack-setup.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/signal-setup.md" "$PACKAGE_DIR/references/"
cp "$PROJECT_DIR/references/container-guide.md" "$PACKAGE_DIR/references/"

print_success "Files copied"

# Make scripts executable
print_section "4. Setting permissions"
chmod +x "$PACKAGE_DIR/scripts/"*.sh
chmod +x "$PACKAGE_DIR/scripts/components/"*.js
print_success "Permissions set"

# Create tarball
print_section "5. Creating tarball"
cd "$PROJECT_DIR/dist"
tar -czf "geoclaw-universal-v3.0.tar.gz" "geoclaw-universal-v3.0"
print_success "Tarball created: $TARBALL"

# Create installation script
print_section "6. Creating installation script"
cat > "$PROJECT_DIR/dist/install-geoclaw.sh" << 'INSTALL'
#!/usr/bin/env bash
# Geoclaw v3.0 Installation Script
set -euo pipefail

print_success() {
  echo -e "\033[0;32m✓ $1\033[0m"
}

print_info() {
  echo -e "\033[1;33mℹ $1\033[0m"
}

print_error() {
  echo -e "\033[0;31m✗ $1\033[0m"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Geoclaw v3.0 - Universal Agent Platform         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "This will install Geoclaw v3.0 with complete automation ecosystem."
echo ""

# Check dependencies
print_info "Checking dependencies..."

if ! command -v node &> /dev/null; then
  print_error "Node.js is required but not installed."
  echo "Install Node.js from: https://nodejs.org/"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  print_error "npm is required but not installed."
  exit 1
fi

print_success "Dependencies checked"

# Extract package
print_info "Extracting Geoclaw..."
TEMP_DIR=$(mktemp -d)
tar -xzf geoclaw-universal-v3.0.tar.gz -C "$TEMP_DIR"
cd "$TEMP_DIR/geoclaw-universal-v3.0"

# Install npm dependencies
print_info "Installing npm dependencies..."
npm install --production
print_success "Dependencies installed"

# Create new Geoclaw instance
print_info "Creating new Geoclaw instance..."
read -p "Enter project name [my-geoclaw]: " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-my-geoclaw}

# Run bootstrap
./scripts/geoclaw_init_universal.sh --name "$PROJECT_NAME"

print_success "Geoclaw v3.0 installed successfully!"
echo ""
echo "Next steps:"
echo "1. cd $PROJECT_NAME"
echo "2. ./scripts/setup-wizard-complete.sh"
echo "3. ./scripts/run.sh"
echo ""
echo "Learn more:"
echo "• ./scripts/educational-commands-complete.sh"
echo "• Read references/magic-workflows.md"
echo ""
echo "Welcome to the future of agent automation! 🎭"
INSTALL

chmod +x "$PROJECT_DIR/dist/install-geoclaw.sh"
print_success "Installation script created"

# Create README for distribution
print_section "7. Creating distribution README"
cat > "$PROJECT_DIR/dist/README.md" << 'DISTREADME'
# Geoclaw v3.0 - Universal Agent Platform

## 🎯 Overview

Geoclaw v3.0 is a **complete automation platform** that integrates with the entire AI agent ecosystem. Users will **clearly understand and experience** each integrated component through transparent attribution and educational commands.

## 🔧 Complete Component Stack

### **Core AI Agent Platform**
- **OpenClaw integration**: CLI-first agent runtime
- **Multi-channel messaging**: Slack, Telegram, WhatsApp, Signal
- **Educational system**: Learn about each component as you use it

### **MCP Ecosystem Integration**
- **MCPorter v0.9.0**: Discover and call MCP servers from editors
- **MCP server**: Expose Geoclaw as MCP server
- **TypeScript generation**: Create typed clients for MCP tools

### **Workflow Automation**
- **n8n integration**: 200+ integrations, visual workflow editor
- **Vibe Kanban**: Visual task management & multi-agent orchestration
- **Workflow orchestrator**: Connect all components into magic workflows

### **Geospatial Analysis**
- **QGIS/PostGIS**: Professional geospatial tools
- **Spatial queries**: Location analysis and mapping
- **GIS data processing**: Import, analyze, visualize

### **Data Collection**
- **Web scraping**: JavaScript rendering, multi-page navigation
- **Form automation**: Fill and submit web forms
- **Structured extraction**: Extract data with custom patterns

### **Enterprise Integration**
- **Monday.com**: Project management
- **Salesforce**: CRM automation
- **Security**: OneCLI vault for credential injection

## 🚀 Quick Start

### **Option 1: Direct Installation**
```bash
# Download and extract
wget https://github.com/your-org/geoclaw-universal/releases/download/v3.0/geoclaw-universal-v3.0.tar.gz
tar -xzf geoclaw-universal-v3.0.tar.gz
cd geoclaw-universal-v3.0

# Install
./dist/install-geoclaw.sh
```

### **Option 2: From Source**
```bash
# Clone repository
git clone https://github.com/your-org/geoclaw-universal.git
cd geoclaw-universal

# Create new instance
./scripts/geoclaw_init_universal.sh --name my-agent

# Setup and run
cd my-agent
./scripts/setup-wizard-complete.sh
./scripts/run.sh
```

## 📦 Package Contents

```
geoclaw-universal-v3.0/
├── README.md                    # This file
├── SKILL.md                     # Geoclaw skill documentation
├── package.json                 # Node.js dependencies
├── scripts/
│   ├── geoclaw_init_universal.sh    # Bootstrap new instance
│   ├── setup-wizard-complete.sh     # Interactive setup
│   ├── educational-commands-complete.sh # Learning system
│   ├── run.sh                        # Main runner
│   └── components/                   # Integration components
│       ├── mcp-server.js             # MCP server
│       ├── mcporter-integration.js   # MCPorter integration
│       ├── n8n-integration.js        # n8n workflow automation
│       ├── qgis-postgis-integration.js # Geospatial tools
│       ├── web-scraping-navigation.js # Web scraping
│       ├── vibe-kanban-client.js     # Task management
│       └── workflow-orchestrator.js  # Magic workflows
└── references/
    ├── magic-workflows.md            # Complete automation guide
    ├── ecosystem-integration.md      # Transparent integration
    ├── architecture.md               # System architecture
    └── ...                           # Component-specific guides
```

## 🎭 Magic Workflow Examples

### **Complete Data Pipeline**
```bash
@geoclaw workflow execute data-pipeline-magic

🎭 **Executing: Data Pipeline Magic**

🌐 **Step 1: Web Scraping** (via firecrawl MCP)
   📦 MCPorter: firecrawl.scrape url=https://data.source.com

🔄 **Step 2: n8n Processing** (via n8n MCP)
   📦 MCPorter: n8n.execute_workflow workflowId=data-cleaning

🗺️ **Step 3: PostGIS Storage** (via postgres MCP)
   📦 MCPorter: postgres.execute_query query="INSERT..."

🎨 **Step 4: Linear Task Creation** (via linear MCP)
   📦 MCPorter: linear.create_issue title="Data processed"

✅ **Enhanced pipeline**: 4 MCP servers coordinated via mcporter
```

### **Educational Discovery**
```bash
@geoclaw mcp list

📦 **MCPorter discovery:**
   • Found 8 MCP servers from your editors
   • Total: 79 MCP tools available

🔍 **Servers discovered:**
   • linear - Project management (23 tools)
   • vercel - Deployment (12 tools)
   • chrome-devtools - Browser automation (5 tools)
   • context7 - Documentation (3 tools)
   • firecrawl - Web scraping (7 tools)
   • github - GitHub operations (15 tools)
   • postgres - Database (8 tools)
   • filesystem - File operations (6 tools)

✅ **Ready for transparent MCP integration!**
```

## 🔧 Technical Requirements

- **Node.js**: v18 or higher
- **npm**: v8 or higher
- **Operating System**: macOS, Linux, Windows (WSL)
- **Optional**: Docker for container isolation

## 📚 Documentation

- **Magic Workflows**: `references/magic-workflows.md`
- **Architecture**: `references/architecture.md`
- **Ecosystem Integration**: `references/ecosystem-integration.md`
- **Component Guides**: Individual reference files

## 🚀 Getting Help

- **Educational Commands**: `@geoclaw learn <component>`
- **Status Dashboard**: `@geoclaw status`
- **Interactive Setup**: `./scripts/setup-wizard-complete.sh`

## 📄 License

MIT License - See LICENSE file for details.

## 🎉 Welcome to the Future of Agent Automation!

Geoclaw v3.0 transforms AI agent interaction from a **black box** into a **transparent, educational experience** where users understand and control every component of their universal agent platform.
DISTREADME

print_success "Distribution README created"

print_section "8. Package Summary"
echo "Package created at: $PACKAGE_DIR"
echo "Tarball created at: $TARBALL"
echo "Installation script: $PROJECT_DIR/dist/install-geoclaw.sh"
echo ""
echo "Package size:"
du -sh "$PACKAGE_DIR"
du -sh "$TARBALL"
echo ""
print_success "Geoclaw v3.0 packaging complete! 🎉"