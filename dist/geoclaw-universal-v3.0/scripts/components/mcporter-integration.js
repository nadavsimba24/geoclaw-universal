#!/usr/bin/env node
// MCPorter Integration for Geoclaw
// Discover and call MCP servers with transparent attribution
// Educational component that helps users understand MCP ecosystem

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

class McporterIntegration {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.GEOCLAW_MCPORTER_ENABLED === 'true',
      configPath: process.env.GEOCLAW_MCPORTER_CONFIG_PATH || './config/mcporter.json',
      autoDiscovery: process.env.GEOCLAW_MCPORTER_AUTO_DISCOVERY !== 'false',
      ...config
    };
    
    this.servers = [];
    this.tools = [];
    this.connected = false;
    
    console.log("📦 MCPorter Integration initialized");
    console.log(`   Enabled: ${this.config.enabled}`);
    if (this.config.enabled) {
      console.log(`   Config: ${this.config.configPath}`);
      console.log(`   Auto-discovery: ${this.config.autoDiscovery}`);
    }
  }
  
  async start() {
    if (!this.config.enabled) {
      console.log("⚠️  MCPorter integration is disabled");
      console.log("   Enable it in .env: GEOCLAW_MCPORTER_ENABLED=true");
      return false;
    }
    
    console.log("🚀 Starting MCPorter integration...");
    
    try {
      // Check if mcporter is installed
      await this.checkMcporter();
      
      // Discover MCP servers
      if (this.config.autoDiscovery) {
        await this.discoverServers();
      }
      
      this.connected = true;
      console.log("✅ MCPorter integration ready!");
      console.log(`   Servers discovered: ${this.servers.length}`);
      console.log(`   Total tools: ${this.tools.length}`);
      console.log("   Commands available via Geoclaw");
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start MCPorter integration: ${error.message}`);
      console.log("💡 Tip: Install mcporter with: npm install -g mcporter");
      return false;
    }
  }
  
  async checkMcporter() {
    console.log("🔍 Checking mcporter installation...");
    
    try {
      const version = execSync('mcporter --version', { encoding: 'utf8' }).trim();
      console.log(`✅ mcporter found: ${version}`);
      return true;
    } catch (error) {
      console.log("⚠️  mcporter not found, installing...");
      
      try {
        execSync('npm install -g mcporter@0.9.0', { stdio: 'inherit' });
        console.log("✅ mcporter installed successfully");
        return true;
      } catch (installError) {
        throw new Error(`Failed to install mcporter: ${installError.message}`);
      }
    }
  }
  
  async discoverServers() {
    console.log("🔍 Discovering MCP servers...");
    
    try {
      const result = await this.runMcporter(['list', '--json']);
      const data = JSON.parse(result);
      
      this.servers = data.servers || [];
      this.tools = this.extractTools(data);
      
      console.log(`✅ Discovered ${this.servers.length} MCP servers`);
      console.log(`   Total tools: ${this.tools.length}`);
      
      // Log server details
      this.servers.forEach(server => {
        console.log(`   • ${server.name}: ${server.tools?.length || 0} tools`);
      });
      
      return this.servers;
    } catch (error) {
      console.log(`⚠️  Could not discover MCP servers: ${error.message}`);
      this.servers = [];
      this.tools = [];
      return [];
    }
  }
  
  extractTools(data) {
    const tools = [];
    
    if (data.servers) {
      data.servers.forEach(server => {
        if (server.tools) {
          server.tools.forEach(tool => {
            tools.push({
              server: server.name,
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            });
          });
        }
      });
    }
    
    return tools;
  }
  
  async runMcporter(args, options = {}) {
    return new Promise((resolve, reject) => {
      const cmd = ['mcporter', ...args];
      
      if (options.env) {
        cmd.unshift('env', ...Object.entries(options.env).map(([k, v]) => `${k}=${v}`));
      }
      
      const child = spawn(cmd[0], cmd.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`mcporter failed: ${stderr || `exit code ${code}`}`));
        }
      });
      
      child.on('error', reject);
      
      // Timeout
      setTimeout(() => {
        child.kill();
        reject(new Error('mcporter timeout'));
      }, options.timeout || 30000);
    });
  }
  
  async callTool(serverName, toolName, args = {}) {
    if (!this.connected) {
      throw new Error('MCPorter not connected. Call start() first.');
    }
    
    console.log(`📦 Calling MCP tool: ${serverName}.${toolName}`);
    console.log(`   Arguments: ${JSON.stringify(args, null, 2)}`);
    
    try {
      // Build command arguments
      const cmdArgs = ['call', `${serverName}.${toolName}`];
      
      // Add arguments as key=value pairs
      Object.entries(args).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          cmdArgs.push(`${key}=${JSON.stringify(value)}`);
        }
      });
      
      // Add JSON output flag
      cmdArgs.push('--output', 'json');
      
      const result = await this.runMcporter(cmdArgs);
      const data = JSON.parse(result);
      
      console.log(`✅ Tool called successfully`);
      
      return {
        success: true,
        server: serverName,
        tool: toolName,
        arguments: args,
        result: data,
        note: `MCP tool called via mcporter: ${serverName}.${toolName}`
      };
    } catch (error) {
      console.error(`❌ Failed to call tool: ${error.message}`);
      
      return {
        success: false,
        server: serverName,
        tool: toolName,
        error: error.message,
        note: `Failed to call MCP tool. Check server availability and arguments.`
      };
    }
  }
  
  async getServerInfo(serverName) {
    if (!this.connected) {
      throw new Error('MCPorter not connected. Call start() first.');
    }
    
    console.log(`🔍 Getting server info: ${serverName}`);
    
    try {
      const result = await this.runMcporter(['list', serverName, '--schema', '--json']);
      const data = JSON.parse(result);
      
      const server = data.servers?.[0];
      
      if (!server) {
        throw new Error(`Server ${serverName} not found`);
      }
      
      console.log(`✅ Server info retrieved`);
      
      return {
        success: true,
        server: server,
        tools: server.tools || [],
        note: `Server information for ${serverName}`
      };
    } catch (error) {
      console.error(`❌ Failed to get server info: ${error.message}`);
      
      return {
        success: false,
        server: serverName,
        error: error.message,
        note: `Failed to get server information. Check server name and connectivity.`
      };
    }
  }
  
  async generateClient(serverName, options = {}) {
    if (!this.connected) {
      throw new Error('MCPorter not connected. Call start() first.');
    }
    
    console.log(`🛠️  Generating client for: ${serverName}`);
    
    try {
      const outputDir = options.outputDir || './generated';
      const mode = options.mode || 'client'; // 'client' or 'types'
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const cmdArgs = ['emit-ts', serverName, '--mode', mode];
      
      if (options.includeOptional) {
        cmdArgs.push('--include-optional');
      }
      
      cmdArgs.push('--out', path.join(outputDir, `${serverName}.ts`));
      cmdArgs.push('--json');
      
      const result = await this.runMcporter(cmdArgs);
      const data = JSON.parse(result);
      
      console.log(`✅ Client generated: ${data.output}`);
      
      return {
        success: true,
        server: serverName,
        mode: mode,
        output: data.output,
        files: data.files || [],
        note: `TypeScript client generated for ${serverName}`
      };
    } catch (error) {
      console.error(`❌ Failed to generate client: ${error.message}`);
      
      return {
        success: false,
        server: serverName,
        error: error.message,
        note: `Failed to generate client. Check server availability and permissions.`
      };
    }
  }
  
  async generateCli(serverName, options = {}) {
    if (!this.connected) {
      throw new Error('MCPorter not connected. Call start() first.');
    }
    
    console.log(`🛠️  Generating CLI for: ${serverName}`);
    
    try {
      const outputPath = options.outputPath || `./dist/${serverName}-cli.js`;
      const outputDir = path.dirname(outputPath);
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const cmdArgs = ['generate-cli', serverName, '--bundle', outputPath];
      
      if (options.compile) {
        cmdArgs.push('--compile');
      }
      
      if (options.name) {
        cmdArgs.push('--name', options.name);
      }
      
      if (options.description) {
        cmdArgs.push('--description', options.description);
      }
      
      const result = await this.runMcporter(cmdArgs);
      
      console.log(`✅ CLI generated: ${outputPath}`);
      
      return {
        success: true,
        server: serverName,
        output: outputPath,
        note: `CLI generated for ${serverName}. Run with: node ${outputPath}`
      };
    } catch (error) {
      console.error(`❌ Failed to generate CLI: ${error.message}`);
      
      return {
        success: false,
        server: serverName,
        error: error.message,
        note: `Failed to generate CLI. Check server availability and permissions.`
      };
    }
  }
  
  async exploreServer(serverName) {
    if (!this.connected) {
      throw new Error('MCPorter not connected. Call start() first.');
    }
    
    console.log(`🔍 Exploring server: ${serverName}`);
    
    try {
      const serverInfo = await this.getServerInfo(serverName);
      
      if (!serverInfo.success) {
        return serverInfo;
      }
      
      const server = serverInfo.server;
      const tools = server.tools || [];
      
      // Group tools by category
      const categories = {};
      
      tools.forEach(tool => {
        const category = this.guessCategory(tool.name) || 'other';
        
        if (!categories[category]) {
          categories[category] = [];
        }
        
        categories[category].push({
          name: tool.name,
          description: tool.description || 'No description',
          parameters: tool.parameters?.length || 0
        });
      });
      
      console.log(`✅ Server exploration complete`);
      
      return {
        success: true,
        server: serverName,
        description: server.description || 'No description',
        tools: tools.length,
        categories: Object.keys(categories).length,
        categoryDetails: categories,
        note: `Exploration of ${serverName} MCP server`
      };
    } catch (error) {
      console.error(`❌ Failed to explore server: ${error.message}`);
      
      return {
        success: false,
        server: serverName,
        error: error.message,
        note: `Failed to explore server. Check server name and connectivity.`
      };
    }
  }
  
  guessCategory(toolName) {
    const patterns = {
      create: 'creation',
      list: 'query',
      get: 'query',
      search: 'search',
      update: 'modification',
      delete: 'deletion',
      send: 'communication',
      post: 'communication',
      upload: 'file',
      download: 'file',
      execute: 'execution',
      run: 'execution'
    };
    
    for (const [pattern, category] of Object.entries(patterns)) {
      if (toolName.includes(pattern)) {
        return category;
      }
    }
    
    return 'other';
  }
  
  async getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      servers: this.servers.length,
      tools: this.tools.length,
      configPath: this.config.configPath,
      autoDiscovery: this.config.autoDiscovery,
      note: 'MCPorter discovers and calls MCP servers with transparent attribution.'
    };
  }
  
  async getEducationalInfo() {
    const status = await this.getStatus();
    
    return {
      title: '📦 MCPorter Integration',
      description: 'Discover and call MCP servers with transparent attribution',
      purpose: 'Access the MCP ecosystem through a unified CLI interface',
      
      features: [
        'Auto-discovery of MCP servers from editors (Cursor, Claude, etc.)',
        'Call any MCP tool with typed arguments',
        'Generate TypeScript clients for MCP servers',
        'Create standalone CLIs from MCP tools',
        'Educational exploration of available tools'
      ],
      
      commands: [
        '@geoclaw mcp list - List discovered MCP servers',
        '@geoclaw mcp explore <server> - Explore server tools',
        '@geoclaw mcp call <server.tool> - Call MCP tool',
        '@geoclaw mcp generate client <server> - Generate TypeScript client',
        '@geoclaw mcp generate cli <server> - Generate standalone CLI'
      ],
      
      examples: [
        '@geoclaw mcp list',
        '@geoclaw mcp explore linear',
        '@geoclaw mcp call linear.create_issue title="Bug"',
        '@geoclaw mcp generate client github',
        '@geoclaw mcp generate cli firecrawl --compile'
      ],
      
      status: status,
      
      learnMore: 'https://github.com/steipete/mcporter',
      note: 'MCPorter provides access to the entire MCP ecosystem through a standardized CLI interface.'
    };
  }
  
  stop() {
    console.log("🛑 Stopping MCPorter integration...");
    this.connected = false;
    console.log("✅ MCPorter integration stopped");
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const mcporter = new McporterIntegration();
  
  async function run() {
    switch (command) {
      case 'start':
        await mcporter.start();
        break;
      case 'stop':
        mcporter.stop();
        break;
      case 'status':
        const status = await mcporter.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;
      case 'discover':
        await mcporter.start();
        const servers = await mcporter.discoverServers();
        console.log(JSON.stringify(servers, null, 2));
        break;
      case 'call':
        if (args.length < 3) {
          console.error('Usage: node mcporter-integration.js call <server> <tool> [jsonArgs]');
          process.exit(1);
        }
        await mcporter.start();
        const callArgs = args[3] ? JSON.parse(args[3]) : {};
        const result = await mcporter.callTool(args[1], args[2], callArgs);
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'explore':
        if (args.length < 2) {
          console.error('Usage: node mcporter-integration.js explore <server>');
          process.exit(1);
        }
        await mcporter.start();
        const exploration = await mcporter.exploreServer(args[1]);
        console.log(JSON.stringify(exploration, null, 2));
        break;
      case 'generate-client':
        if (args.length < 2) {
          console.error('Usage: node mcporter-integration.js generate-client <server> [options]');
          process.exit(1);
        }
        await mcporter.start();
        const options = args[2] ? JSON.parse(args[2]) : {};
        const client = await mcporter.generateClient(args[1], options);
        console.log(JSON.stringify(client, null, 2));
        break;
      case 'generate-cli':
        if (args.length < 2) {
          console.error('Usage: node mcporter-integration.js generate-cli <server> [options]');
          process.exit(1);
        }
        await mcporter.start();
        const cliOptions = args[2] ? JSON.parse(args[2]) : {};
        const cli = await mcporter.generateCli(args[1], cliOptions);
        console.log(JSON.stringify(cli, null, 2));
        break;
      case 'education':
        const education = await mcporter.getEducationalInfo();
        console.log(JSON.stringify(education, null, 2));
        break;
      default:
        console.log(`
📦 MCPorter