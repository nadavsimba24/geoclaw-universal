# Geoclaw v3.0 - Universal Agent Platform 🎭

![Geoclaw Banner](https://img.shields.io/badge/Geoclaw-v3.0-8A2BE2)
![Platform](https://img.shields.io/badge/Platform-Universal-00BFFF)
![License](https://img.shields.io/badge/License-MIT-green)
![MCP](https://img.shields.io/badge/MCP-Integrated-FF6B6B)

**Geoclaw v3.0** is a **complete automation platform** that integrates with the entire AI agent ecosystem. Users **clearly understand and experience** each integrated component through transparent attribution and educational commands.

## 🎯 Why Geoclaw v3.0?

### **Transparent Integration**
- Users **see** which tools are being used
- Clear **attribution** in every response  
- **Educational** explanations for each component
- **Status dashboard** showing all active components

### **Magic Workflows**
- Connect **n8n, QGIS/PostGIS, web scraping, enterprise systems**
- Create **multi-system pipelines** with single commands
- **Orchestrate** AI agents across different platforms
- **Error handling** and automatic retries

### **MCP Ecosystem Integration**
- **MCPorter v0.9.0**: Discover and call MCP servers from editors
- **Auto-discovery**: Finds MCP servers from Cursor, Claude, VS Code
- **TypeScript generation**: Create typed clients for MCP tools
- **CLI generation**: Turn MCP servers into standalone tools

## 🚀 Quick Start

### **1. Create New Instance**
```bash
# Download and install
curl -L https://github.com/your-org/geoclaw-universal/releases/download/v3.0/install-geoclaw.sh | bash

# Or from source
git clone https://github.com/your-org/geoclaw-universal.git
cd geoclaw-universal
./scripts/geoclaw_init_universal.sh --name my-agent
```

### **2. Interactive Setup**
```bash
cd my-agent
./scripts/setup-wizard-complete.sh

🤖 Geoclaw Complete Setup Wizard

I'll help you configure ALL components for magic workflows:

1. 🧠 Memory System - Persistent memory across sessions
2. 🛠️ Skill Ecosystem - GitHub CLI Skills marketplace  
3. 📋 Vibe Kanban - Visual task management
4. 🔄 n8n - Workflow automation (200+ integrations)
5. 🗺️ QGIS/PostGIS - Geospatial analysis
6. 🌐 Web Scraping - Data collection & navigation
7. 📦 MCPorter - MCP server discovery & calling
8. 🎭 Workflow Orchestration - Connect everything
```

### **3. Start Geoclaw**
```bash
./scripts/run.sh

🚀 Starting Geoclaw v3.0 - Universal Agent Platform

✅ **Components ready:**
   • Memory System: Central Intelligence
   • Skill Ecosystem: 45 skills available
   • Vibe Kanban: http://localhost:3003
   • n8n: http://localhost:5678
   • MCPorter: 8 servers discovered (79 tools)
   • PostGIS: Connected to geoclaw database
   • Web Scraping: Puppeteer configured

🔧 **Ready for magic workflows!**
```

## 🔧 Complete Component Stack

### **Core AI Agent Platform**
- **OpenClaw integration**: CLI-first agent runtime
- **Multi-channel messaging**: Slack, Telegram, WhatsApp, Signal
- **Educational system**: `@geoclaw learn <component>`

### **MCP Ecosystem Integration** 📦
- **MCPorter v0.9.0**: Discover MCP servers from editors
- **Auto tool discovery**: Finds Linear, Vercel, GitHub, Chrome DevTools MCP
- **TypeScript clients**: Generate typed wrappers for MCP servers
- **Standalone CLIs**: Turn MCP servers into command-line tools

### **Workflow Automation** 🔄
- **n8n integration**: 200+ integrations, visual workflow editor
- **Vibe Kanban**: Visual task management & multi-agent orchestration
- **Workflow orchestrator**: Connect all components into magic workflows

### **Geospatial Analysis** 🗺️
- **QGIS/PostGIS**: Professional geospatial tools
- **Spatial queries**: Location analysis and mapping
- **GIS data processing**: Import, analyze, visualize

### **Data Collection** 🌐
- **Web scraping**: JavaScript rendering, multi-page navigation
- **Form automation**: Fill and submit web forms
- **Structured extraction**: Extract data with custom patterns

### **Enterprise Integration** 🏢
- **Monday.com**: Project management
- **Salesforce**: CRM automation
- **Security**: OneCLI vault for credential injection

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

### **Educational MCP Discovery**
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

### **Business Intelligence Flow**
```bash
@geoclaw Get sales pipeline status and create tasks

🎭 **Orchestrating Business Intelligence Flow**

📊 **Step 1: Salesforce Query**
   Querying closed opportunities...
   ✅ Found 42 opportunities worth $1.2M

📋 **Step 2: Monday.com Integration**
   Creating tasks in Sales board...
   ✅ 42 tasks created for follow-up

👥 **Step 3: Vibe Kanban Coordination**
   Creating development issues...
   ✅ Issues linked to sales tasks

💬 **Step 4: Slack Notifications**
   Notifying sales and dev teams...
   ✅ Notifications sent to 3 channels

🎯 **Complete**: Business intelligence flow executed!
```

## 📦 Package Structure

```
geoclaw-universal/
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

## 🎮 User Experience

### **Educational Commands**
```bash
@geoclaw capabilities          # Show all integrated components
@geoclaw learn mcporter       # Learn about MCPorter integration
@geoclaw learn n8n            # Learn about workflow automation
@geoclaw learn qgis           # Learn about geospatial analysis
@geoclaw status               # Check what's enabled
```

### **Transparent Tool Attribution**
```bash
@geoclaw Create Linear issue for bug report

🤖 **Orchestrating via MCP integration...**

📦 **MCPorter**: Calling linear.create_issue
   Server: linear (from Cursor config)
   Tool: create_issue
   Arguments: {title: "Bug report", description: "...", teamId: "ENG"}

✅ **Issue created**: LNR-123
🔗 **Tools used**: mcporter → linear MCP server
```

### **Status Dashboard**
```bash
@geoclaw status

📊 Geoclaw v3.0 - Complete Platform Status

✅ **Active Components:**
   • Memory System: Central Intelligence
   • Skill Ecosystem: 45 skills available
   • Vibe Kanban: http://localhost:3003
   • n8n: http://localhost:5678
   • MCPorter: 8 servers discovered (79 tools)
   • PostGIS: Connected to geoclaw database
   • QGIS: Ready (macOS)
   • Web Scraping: Puppeteer configured
   • Workflow Orchestration: 4 templates

🔧 **Ready for Magic Workflows!**
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
- **MCPorter Integration**: `scripts/components/mcporter-integration.js`

## 🚀 Getting Help

- **Educational Commands**: `@geoclaw learn <component>`
- **Status Dashboard**: `@geoclaw status`
- **Interactive Setup**: `./scripts/setup-wizard-complete.sh`
- **GitHub Issues**: [Report bugs or request features](https://github.com/your-org/geoclaw-universal/issues)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🎉 Welcome to the Future of Agent Automation!

Geoclaw v3.0 transforms AI agent interaction from a **black box** into a **transparent, educational experience** where users understand and control every component of their universal agent platform.

**Start creating magic workflows today!** 🎭

---

*Built with ❤️ by the Geoclaw Team*  
*MCPorter v0.9.0 integration by [steipete](https://github.com/steipete/mcporter)*  
*Part of the OpenClaw ecosystem*