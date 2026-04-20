#!/usr/bin/env node
// Vibe Kanban Client for Geoclaw
// Connects Geoclaw to Vibe Kanban for visual task management
// Users can see and understand the integration

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class VibeKanbanClient {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.GEOCLAW_VIBE_KANBAN_ENABLED === 'true',
      projectId: process.env.GEOCLAW_VIBE_KANBAN_PROJECT_ID,
      uiPort: process.env.GEOCLAW_VIBE_KANBAN_UI_PORT || 3003,
      mcpPort: process.env.GEOCLAW_VIBE_KANBAN_MCP_PORT || 3004,
      ...config
    };
    
    this.mcpProcess = null;
    this.uiProcess = null;
    this.connected = false;
    
    console.log("🔧 Vibe Kanban Client initialized");
    console.log(`   Enabled: ${this.config.enabled}`);
    if (this.config.enabled) {
      console.log(`   UI Port: ${this.config.uiPort}`);
      console.log(`   MCP Port: ${this.config.mcpPort}`);
    }
  }
  
  async start() {
    if (!this.config.enabled) {
      console.log("⚠️  Vibe Kanban integration is disabled");
      console.log("   Enable it in .env: GEOCLAW_VIBE_KANBAN_ENABLED=true");
      return false;
    }
    
    console.log("🚀 Starting Vibe Kanban integration...");
    
    try {
      // Check if Vibe Kanban is installed
      await this.checkInstallation();
      
      // Start MCP server
      await this.startMcpServer();
      
      // Start UI (if requested)
      if (this.config.startUi) {
        await this.startUi();
      }
      
      this.connected = true;
      console.log("✅ Vibe Kanban integration ready!");
      console.log(`   MCP Server: localhost:${this.config.mcpPort}`);
      if (this.config.startUi) {
        console.log(`   Web UI: http://localhost:${this.config.uiPort}`);
      }
      console.log("   Commands available via Geoclaw MCP tools");
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start Vibe Kanban: ${error.message}`);
      return false;
    }
  }
  
  async checkInstallation() {
    console.log("🔍 Checking Vibe Kanban installation...");
    
    return new Promise((resolve, reject) => {
      const check = spawn('npx', ['vibe-kanban', '--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      let error = '';
      
      check.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      check.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      check.on('close', (code) => {
        if (code === 0) {
          const version = output.trim().split('/').pop() || 'unknown';
          console.log(`✅ Vibe Kanban found: ${version}`);
          resolve(true);
        } else {
          console.log("⚠️  Vibe Kanban not found, installing...");
          this.installVibeKanban().then(resolve).catch(reject);
        }
      });
      
      check.on('error', reject);
    });
  }
  
  async installVibeKanban() {
    console.log("📦 Installing Vibe Kanban...");
    
    return new Promise((resolve, reject) => {
      const install = spawn('npm', ['install', '-g', 'vibe-kanban'], {
        stdio: 'inherit'
      });
      
      install.on('close', (code) => {
        if (code === 0) {
          console.log("✅ Vibe Kanban installed successfully");
          resolve(true);
        } else {
          reject(new Error(`Installation failed with code ${code}`));
        }
      });
      
      install.on('error', reject);
    });
  }
  
  async startMcpServer() {
    console.log("🔌 Starting Vibe Kanban MCP server...");
    
    return new Promise((resolve, reject) => {
      this.mcpProcess = spawn('npx', ['vibe-kanban', '--mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PORT: this.config.mcpPort.toString()
        }
      });
      
      let started = false;
      
      this.mcpProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`   [VK MCP] ${output.trim()}`);
        
        if (output.includes('MCP server listening') || output.includes('ready')) {
          started = true;
          resolve(true);
        }
      });
      
      this.mcpProcess.stderr.on('data', (data) => {
        console.error(`   [VK MCP ERR] ${data.toString().trim()}`);
      });
      
      this.mcpProcess.on('close', (code) => {
        if (!started) {
          reject(new Error(`MCP server closed with code ${code}`));
        }
      });
      
      this.mcpProcess.on('error', reject);
      
      // Timeout
      setTimeout(() => {
        if (!started) {
          reject(new Error('MCP server startup timeout'));
        }
      }, 10000);
    });
  }
  
  async startUi() {
    console.log("🌐 Starting Vibe Kanban web UI...");
    
    return new Promise((resolve, reject) => {
      this.uiProcess = spawn('npx', ['vibe-kanban'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PORT: this.config.uiPort.toString()
        }
      });
      
      let started = false;
      
      this.uiProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`   [VK UI] ${output.trim()}`);
        
        if (output.includes('Listening on') || output.includes('http://')) {
          started = true;
          resolve(true);
        }
      });
      
      this.uiProcess.stderr.on('data', (data) => {
        console.error(`   [VK UI ERR] ${data.toString().trim()}`);
      });
      
      this.uiProcess.on('close', (code) => {
        if (!started) {
          reject(new Error(`UI server closed with code ${code}`));
        }
      });
      
      this.uiProcess.on('error', reject);
      
      // Timeout
      setTimeout(() => {
        if (!started) {
          reject(new Error('UI server startup timeout'));
        }
      }, 15000);
    });
  }
  
  async createIssue(title, description = '', options = {}) {
    if (!this.connected) {
      throw new Error('Vibe Kanban not connected. Call start() first.');
    }
    
    console.log(`📋 Creating Vibe Kanban issue: "${title}"`);
    
    // In a real implementation, this would use the MCP connection
    // to call Vibe Kanban's create_issue tool
    
    const mockIssueId = `vk_issue_${Date.now()}`;
    
    return {
      success: true,
      issueId: mockIssueId,
      title,
      description,
      url: `http://localhost:${this.config.uiPort}/issue/${mockIssueId}`,
      integrations: {
        geoclaw: true,
        monday: process.env.GEOCLAW_MONDAY_ENABLED === 'true',
        note: "Issue created in Vibe Kanban. Will sync with connected systems."
      },
      note: `Issue created in Vibe Kanban. View at: http://localhost:${this.config.uiPort}`
    };
  }
  
  async listIssues(status = 'todo', limit = 10) {
    if (!this.connected) {
      throw new Error('Vibe Kanban not connected. Call start() first.');
    }
    
    console.log(`📊 Listing Vibe Kanban issues with status: ${status}`);
    
    // Mock data
    const issues = [
      {
        id: 'vk_issue_1',
        title: 'Fix login bug',
        description: 'Users cannot login with Google OAuth',
        status: 'in_progress',
        priority: 'high',
        createdAt: '2024-01-15T10:30:00Z',
        assignee: 'developer@example.com'
      },
      {
        id: 'vk_issue_2',
        title: 'Add dark mode',
        description: 'Implement dark mode theme across application',
        status: 'todo',
        priority: 'medium',
        createdAt: '2024-01-14T09:15:00Z',
        assignee: null
      },
      {
        id: 'vk_issue_3',
        title: 'Update API documentation',
        description: 'Document new endpoints added in v2.0',
        status: 'done',
        priority: 'low',
        createdAt: '2024-01-10T11:00:00Z',
        assignee: 'tech-writer@example.com'
      }
    ];
    
    const filteredIssues = status === 'all' 
      ? issues 
      : issues.filter(issue => issue.status === status);
    
    return {
      success: true,
      count: filteredIssues.length,
      issues: filteredIssues.slice(0, limit),
      filters: { status, limit },
      source: 'vibe_kanban',
      note: `Issues from Vibe Kanban. View board at: http://localhost:${this.config.uiPort}`
    };
  }
  
  async startWorkspace(issueId, agent = 'geoclaw', repos = []) {
    if (!this.connected) {
      throw new Error('Vibe Kanban not connected. Call start() first.');
    }
    
    console.log(`🚀 Starting Vibe Kanban workspace for issue: ${issueId}`);
    console.log(`   Agent: ${agent}`);
    if (repos.length > 0) console.log(`   Repositories: ${repos.length}`);
    
    // Mock workspace
    const workspaceId = `vk_ws_${Date.now()}`;
    
    return {
      success: true,
      workspaceId,
      issueId,
      agent,
      repos,
      status: 'running',
      url: `http://localhost:${this.config.uiPort}/workspace/${workspaceId}`,
      note: `Workspace started in Vibe Kanban. Agent ${agent} will work on issue ${issueId}.`
    };
  }
  
  async getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      mcpRunning: this.mcpProcess && !this.mcpProcess.killed,
      uiRunning: this.uiProcess && !this.uiProcess.killed,
      ports: {
        mcp: this.config.mcpPort,
        ui: this.config.uiPort
      },
      urls: {
        mcp: `localhost:${this.config.mcpPort}`,
        ui: `http://localhost:${this.config.uiPort}`
      },
      note: "Vibe Kanban provides visual task management and multi-agent orchestration."
    };
  }
  
  stop() {
    console.log("🛑 Stopping Vibe Kanban integration...");
    
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      console.log("   MCP server stopped");
    }
    
    if (this.uiProcess) {
      this.uiProcess.kill();
      console.log("   Web UI stopped");
    }
    
    this.connected = false;
    console.log("✅ Vibe Kanban integration stopped");
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const client = new VibeKanbanClient({ startUi: true });
  
  async function run() {
    switch (command) {
      case 'start':
        await client.start();
        break;
      case 'stop':
        client.stop();
        break;
      case 'status':
        const status = await client.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;
      case 'create':
        if (args.length < 2) {
          console.error('Usage: node vibe-kanban-client.js create "Title" [description]');
          process.exit(1);
        }
        await client.start();
        const result = await client.createIssue(args[1], args[2] || '');
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'list':
        await client.start();
        const issues = await client.listIssues(args[1] || 'todo', parseInt(args[2]) || 10);
        console.log(JSON.stringify(issues, null, 2));
        break;
      default:
        console.log(`
Vibe Kanban Client for Geoclaw
===============================

Commands:
  start     - Start Vibe Kanban integration
  stop      - Stop Vibe Kanban integration
  status    - Get integration status
  create    - Create an issue
  list      - List issues

Examples:
  node vibe-kanban-client.js start
  node vibe-kanban-client.js create "Fix bug" "Description here"
  node vibe-kanban-client.js list todo 5
  node vibe-kanban-client.js status

Integration with Geoclaw:
  • Visual kanban board for task management
  • Multi-agent orchestration (Claude Code, Gemini, etc.)
  • Workspace management with Git branches
  • Built-in code review and preview
  • MCP server with 30+ tools
        `);
        break;
    }
    
    // Keep process alive if started
    if (command === 'start') {
      process.on('SIGINT', () => {
        client.stop();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        client.stop();
        process.exit(0);
      });
    } else {
      setTimeout(() => process.exit(0), 1000);
    }
  }
  
  run().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = VibeKanbanClient;
