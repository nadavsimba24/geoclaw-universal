#!/usr/bin/env node
// Geoclaw Education System
// Helps users understand all integrated components
// Run with: node geoclaw-education.js <command>

const fs = require('fs');
const path = require('path');

class GeoclawEducation {
  constructor() {
    this.projectDir = process.cwd();
    this.envFile = path.join(this.projectDir, '.env');
    this.configFile = path.join(this.projectDir, 'geoclaw.config.yml');
    
    this.components = {
      'central-intelligence': {
        name: 'Central Intelligence',
        description: 'Persistent memory system',
        purpose: 'Remembers across sessions, enables learning',
        commands: [
          '@geoclaw remember "I prefer dark mode"',
          '@geoclaw recall "What are my preferences?"',
          '@geoclaw memory status',
          '@geoclaw memory search "preferences"'
        ],
        benefits: [
          'No more "agent amnesia"',
          'Learns your preferences over time',
          'Shares knowledge across sessions',
          'Semantic search of past conversations'
        ],
        learnMore: 'https://central-intelligence.ai'
      },
      'skill-ecosystem': {
        name: 'Skill Ecosystem',
        description: 'GitHub CLI Skills + Skills CLI',
        purpose: 'Skill discovery and cross-tool sync',
        commands: [
          '@geoclaw skills list',
          '@geoclaw skills install code-review',
          '@geoclaw skills sync',
          '@geoclaw skills status'
        ],
        benefits: [
          'Discover skills from GitHub',
          'Skills work across Claude Code, Cursor, Gemini, etc.',
          'Version control for skills',
          'Secure skill distribution'
        ],
        learnMore: 'https://github.com/dhruvwill/skills-cli'
      },
      'vibe-kanban': {
        name: 'Vibe Kanban',
        description: 'Visual task management & multi-agent orchestration',
        purpose: 'Kanban board for tasks, coordinates multiple AI agents',
        commands: [
          '@geoclaw create task "Fix login bug"',
          '@geoclaw show board',
          '@geoclaw start workspace for task 123',
          '@geoclaw connect to vibe-kanban'
        ],
        benefits: [
          'Visual kanban board',
          'Orchestrates Claude Code, Gemini, Codex, etc.',
          'Workspace management with Git',
          'Built-in code review',
          'MCP server with 30+ tools'
        ],
        learnMore: 'https://vibekanban.com'
      },
      'monday': {
        name: 'Monday.com',
        description: 'Project management integration',
        purpose: 'Connects Geoclaw to Monday.com for business task management',
        commands: [
          '@geoclaw monday boards list',
          '@geoclaw monday create item "Task"',
          '@geoclaw monday update item 123 status "Done"',
          '@geoclaw monday sync with vibe-kanban'
        ],
        benefits: [
          'Business task tracking',
          'Workflow automation',
          'Team collaboration',
          'Syncs with Vibe Kanban for developers'
        ],
        learnMore: 'https://developer.monday.com'
      },
      'salesforce': {
        name: 'Salesforce',
        description: 'CRM automation',
        purpose: 'Connects Geoclaw to Salesforce for sales and support',
        commands: [
          '@geoclaw salesforce query "SELECT Name FROM Account"',
          '@geoclaw salesforce pipeline',
          '@geoclaw salesforce create opportunity "Deal" 50000',
          '@geoclaw salesforce cases --status "New"'
        ],
        benefits: [
          'Sales pipeline management',
          'Customer support automation',
          'Account/contact updates',
          'Reporting and analytics'
        ],
        learnMore: 'https://developer.salesforce.com'
      },
      'mcp': {
        name: 'MCP (Model Context Protocol)',
        description: 'Ecosystem integration protocol',
        purpose: 'Standard protocol for connecting LLMs to tools and data',
        commands: [
          '@geoclaw mcp status',
          '@geoclaw mcp tools list',
          '@geoclaw mcp connect to vibe-kanban',
          '@geoclaw mcp expose tools'
        ],
        benefits: [
          'Geoclaw works with entire MCP ecosystem',
          'Exposes Geoclaw tools to other applications',
          'Connects to Vibe Kanban, Central Intelligence, etc.',
          'Standardized tool interface'
        ],
        learnMore: 'https://modelcontextprotocol.io'
      },
      'onecli': {
        name: 'OneCLI Vault',
        description: 'Credential security',
        purpose: 'Secure credential injection, no secrets in containers',
        commands: [
          '@geoclaw security status',
          '@geoclaw security store API_KEY',
          '@geoclaw security rotate credentials',
          '@geoclaw security audit'
        ],
        benefits: [
          'Runtime credential injection',
          'No secrets in container images',
          'Automatic credential rotation',
          'Audit trail for credential usage'
        ],
        learnMore: 'https://github.com/onecli/onecli'
      },
      'messaging': {
        name: 'Messaging Platforms',
        description: 'Multi-channel communication',
        purpose: 'Connect Geoclaw to your preferred chat platforms',
        commands: [
          '@geoclaw slack post #general "Hello team"',
          '@geoclaw telegram broadcast "Update available"',
          '@geoclaw whatsapp send +1234567890 "Your order is ready"',
          '@geoclaw signal message secure "Confidential info"'
        ],
        benefits: [
          'Slack: Team collaboration',
          'Telegram: Public communities',
          'WhatsApp: Customer support',
          'Signal: Secure communications'
        ],
        learnMore: 'See individual platform documentation'
      }
    };
  }
  
  showWelcome() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Geoclaw v3.0 - Universal Agent Platform   ║
╚══════════════════════════════════════════════════════════════╝

Welcome to Geoclaw v3.0! I integrate with the entire AI agent ecosystem.

🧠 **Memory & Learning**
  • Central Intelligence: Persistent memory across sessions
  • Semantic search: Find past conversations
  • Fact extraction: Learn your preferences

🛠️ **Skill Ecosystem**
  • GitHub CLI Skills: Discover/install skills
  • Skills CLI: Sync across Claude Code, Cursor, Gemini, etc.
  • Version control: Secure skill updates

📋 **Task Management**
  • Vibe Kanban: Visual kanban board
  • Multi-agent orchestration: Coordinate agents
  • Workspace management: Isolated environments

🏢 **Enterprise Integration**
  • Monday.com: Project/task tracking
  • Salesforce: CRM operations
  • Real-time sync between systems

💬 **Messaging**
  • 4 platforms: Slack, Telegram, WhatsApp, Signal
  • Secure communications
  • Cross-platform notifications

🔒 **Security**
  • OneCLI vault: Credential injection
  • Container isolation: Docker/Apple Container
  • Access controls

🔌 **Ecosystem**
  • MCP server: Expose Geoclaw to other tools
  • Standard protocol: Works with entire MCP ecosystem

Commands:
  • @geoclaw capabilities          - Show all capabilities
  • @geoclaw learn <component>     - Learn about a component
  • @geoclaw status                - Check component status
  • @geoclaw setup                 - Interactive setup wizard
  • @geoclaw help                  - Get help

Examples:
  • @geoclaw learn vibe-kanban
  • @geoclaw create task "Fix bug"
  • @geoclaw remember "I prefer dark mode"
  • @geoclaw skills list

Start by typing: @geoclaw capabilities
    `);
  }
  
  showCapabilities() {
    console.log(`
🎯 Geoclaw v3.0 Capabilities

I integrate these components:

1. 🧠 **Central Intelligence** - Persistent memory system
   • Remembers across sessions
   • Semantic search
   • Fact extraction
   • Commands: @geoclaw remember, @geoclaw recall

2. 🛠️ **GitHub CLI Skills** - Skill marketplace
   • Discover skills from GitHub
   • Version control
   • Security scanning
   • Commands: @geoclaw skills list, @geoclaw skills install

3. 🔄 **Skills CLI** - Cross-tool skill sync
   • Sync skills across Claude Code, Cursor, Gemini, etc.
   • Single source of truth
   • Git integration
   • Commands: @geoclaw skills sync

4. 📋 **Vibe Kanban** - Visual task management
   • Kanban board for tasks
   • Multi-agent orchestration
   • Workspace management
   • Code review
   • Commands: @geoclaw create task, @geoclaw show board

5. 🏢 **Monday.com** - Project management
   • Task tracking
   • Workflow automation
   • Team collaboration
   • Commands: @geoclaw monday create, @geoclaw monday board

6. 📊 **Salesforce** - CRM automation
   • Sales pipeline
   • Customer support
   • Reporting
   • Commands: @geoclaw salesforce query, @geoclaw salesforce pipeline

7. 💬 **Messaging Platforms** - Multi-channel
   • Slack: Team collaboration
   • Telegram: Public communities
   • WhatsApp: Customer support
   • Signal: Secure communications
   • Commands: Platform-specific

8. 🔒 **OneCLI Vault** - Credential security
   • Runtime credential injection
   • No secrets in containers
   • Automatic rotation
   • Commands: @geoclaw security status

9. 🔌 **MCP Server** - Ecosystem integration
   • Expose Geoclaw as MCP server
   • Connect to other MCP servers
   • Standardized tool interface
   • Commands: @geoclaw mcp status

Type: @geoclaw learn <component> for detailed information
Type: @geoclaw status to see what's enabled
Type: @geoclaw setup to configure integrations
    `);
  }
  
  learnComponent(componentName) {
    const component = this.components[componentName];
    
    if (!component) {
      console.log(`Component "${componentName}" not found.`);
      console.log(`Available components: ${Object.keys(this.components).join(', ')}`);
      return;
    }
    
    console.log(`
🛠️  Learning about: ${component.name}
${'─'.repeat(50)}

📝 **Description**: ${component.description}

🎯 **Purpose**: ${component.purpose}

🚀 **Benefits**:
${component.benefits.map(b => `  • ${b}`).join('\n')}

💻 **Commands**:
${component.commands.map(c => `  • ${c}`).join('\n')}

🔗 **Learn More**: ${component.learnMore}

📊 **Status**: ${this.checkComponentStatus(componentName)}

🔧 **Setup**: Type "@geoclaw setup" to configure this component
    `);
  }
  
  checkComponentStatus(componentName) {
    if (!fs.existsSync(this.envFile)) {
      return 'Not configured (no .env file)';
    }
    
    const envContent = fs.readFileSync(this.envFile, 'utf8');
    
    switch (componentName) {
      case 'central-intelligence':
        if (envContent.includes('GEOCLAW_MEMORY_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'skill-ecosystem':
        if (envContent.includes('GEOCLAW_SKILLS_GITHUB_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'vibe-kanban':
        if (envContent.includes('GEOCLAW_VIBE_KANBAN_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'monday':
        if (envContent.includes('GEOCLAW_MONDAY_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'salesforce':
        if (envContent.includes('GEOCLAW_SALESFORCE_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'mcp':
        if (envContent.includes('GEOCLAW_MCP_SERVER_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'onecli':
        if (envContent.includes('GEOCLAW_ONECLI_ENABLED=true')) {
          return '✅ Enabled';
        }
        return '❌ Disabled';
        
      case 'messaging':
        const platforms = ['SLACK', 'TELEGRAM', 'WHATSAPP', 'SIGNAL'];
        const enabled = platforms.some(p => 
          envContent.includes(`GEOCLAW_${p}_ENABLED=true`)
        );
        return enabled ? '✅ Some platforms enabled' : '❌ All disabled';
        
      default:
        return 'Unknown';
    }
  }
  
  showStatus() {
    if (!fs.existsSync(this.envFile)) {
      console.log(`
📊 Geoclaw Status
${'─'.repeat(50)}

❌ No configuration found

Please run the setup wizard:
  @geoclaw setup

Or create .env file from template:
  cp .env.template .env
  # Edit .env with your configuration
      `);
      return;
    }
    
    console.log(`
📊 Geoclaw v3.0 Component Status
${'─'.repeat(50)}

🧠 **Memory System**
  • Central Intelligence: ${this.checkComponentStatus('central-intelligence')}

🛠️ **Skill Ecosystem**
  • GitHub CLI Skills: ${this.checkComponentStatus('skill-ecosystem')}
  • Skills CLI: ${this.checkComponentStatus('skill-ecosystem')}

📋 **Task Management**
  • Vibe Kanban: ${this.checkComponentStatus('vibe-kanban')}

🏢 **Enterprise Integrations**
  • Monday.com: ${this.checkComponentStatus('monday')}
  • Salesforce: ${this.checkComponentStatus('salesforce')}

💬 **Messaging Platforms**
  • Overall: ${this.checkComponentStatus('messaging')}

🔒 **Security**
  • OneCLI Vault: ${this.checkComponentStatus('onecli')}

🔌 **Ecosystem**
  • MCP Server: ${this.checkComponentStatus('mcp')}

💡 **Next Steps**:
  • Type "@geoclaw learn <component>" for details
  • Type "@geoclaw setup" to configure components
  • Type "@geoclaw capabilities" to see all features
    `);
  }
  
  showWorkflowExample() {
    console.log(`
🚀 Geoclaw Workflow Example
${'─'.repeat(50)}

Here's how all components work together:

1. **Plan Feature** (Monday.com + Central Intelligence)
   • Business team creates task in Monday.com
   • Geoclaw picks up task via integration
   • Checks memory for similar past work

2. **Break Down** (Vibe Kanban + Skill Ecosystem)
   • Geoclaw creates subtasks in Vibe Kanban
   • Uses skills to understand task requirements
   • Assigns tasks to appropriate agents

3. **Execute** (Multi-agent + Workspaces)
   • Vibe Kanban starts workspaces for each task
   • Claude Code works on backend
   • Gemini CLI works on frontend
   • Geoclaw coordinates and monitors

4. **Review** (Code Review + Messaging)
   • Built-in code review in Vibe Kanban
   • Geoclaw sends updates to Slack
   • Team provides feedback via Telegram

5. **Deploy** (Git + Salesforce)
   • Automatic PR creation
   • Update Salesforce opportunity status
   • Notify stakeholders via Signal

6. **Learn** (Central Intelligence)
   • Store what was learned
   • Update skills based on experience
   • Improve future performance

**Complete Command Example**:
@geoclaw We need user authentication with:
- Email/password login
- Social login (Google, GitHub)
- Password reset
- Session management

**Geoclaw Response**:
1. 🧠 Check memory for auth patterns
2. 📋 Create tasks in Vibe Kanban
3. 🏢 Sync to Monday.com for business tracking
4. 👥 Start agents in workspaces
5. 💬 Notify team on Slack
6. 📊 Update Salesforce opportunity

Type "@geoclaw demo" to see a live demonstration
    `);
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];
  
  const education = new GeoclawEducation();
  
  switch (command) {
    case 'welcome':
      education.showWelcome();
      break;
    case 'capabilities':
      education.showCapabilities();
      break;
    case 'learn':
      if (!param) {
        console.log('Usage: node geoclaw-education.js learn <component>');
        console.log('Components:', Object.keys(education.components).join(', '));
      } else {
        education.learnComponent(param);
      }
      break;
    case 'status':
      education.showStatus();
      break;
    case 'workflow':
      education.showWorkflowExample();
      break;
    default:
      console.log(`
Geoclaw Education System
========================

Commands:
  welcome       - Show welcome message
  capabilities  - Show all capabilities
  learn <comp>  - Learn about a component
  status        - Show component status
  workflow      - Show workflow example

Examples:
  node geoclaw-education.js welcome
  node geoclaw-education.js learn vibe-kanban
  node geoclaw-education.js status

Components:
  •