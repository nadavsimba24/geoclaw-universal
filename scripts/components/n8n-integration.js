#!/usr/bin/env node
// n8n Integration for Geoclaw
// Connects Geoclaw to n8n for workflow automation
// Users can trigger, monitor, and create n8n workflows from Geoclaw

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class N8nIntegration {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.GEOCLAW_N8N_ENABLED === 'true',
      url: process.env.GEOCLAW_N8N_URL || 'http://localhost:5678',
      apiKey: process.env.GEOCLAW_N8N_API_KEY,
      webhookPath: process.env.GEOCLAW_N8N_WEBHOOK_PATH || '/webhook/geoclaw',
      ...config
    };
    
    this.connected = false;
    this.workflows = [];
    
    console.log("🔧 n8n Integration initialized");
    console.log(`   Enabled: ${this.config.enabled}`);
    if (this.config.enabled) {
      console.log(`   URL: ${this.config.url}`);
      console.log(`   Webhook: ${this.url}/webhook`);
    }
  }
  
  get url() {
    return this.config.url;
  }
  
  async start() {
    if (!this.config.enabled) {
      console.log("⚠️  n8n integration is disabled");
      console.log("   Enable it in .env: GEOCLAW_N8N_ENABLED=true");
      return false;
    }
    
    console.log("🚀 Starting n8n integration...");
    
    try {
      // Check if n8n is running
      await this.checkConnection();
      
      // Load workflows
      await this.loadWorkflows();
      
      this.connected = true;
      console.log("✅ n8n integration ready!");
      console.log(`   URL: ${this.url}`);
      console.log(`   Workflows loaded: ${this.workflows.length}`);
      console.log("   Commands available via Geoclaw");
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to connect to n8n: ${error.message}`);
      console.log("💡 Tip: Start n8n with: npx n8n start");
      return false;
    }
  }
  
  async checkConnection() {
    console.log("🔍 Checking n8n connection...");
    
    try {
      const response = await axios.get(`${this.url}/healthz`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        console.log("✅ n8n is running and healthy");
        return true;
      }
    } catch (error) {
      // Try alternative endpoint
      try {
        const response = await axios.get(`${this.url}/rest/health`, {
          timeout: 5000
        });
        
        if (response.status === 200) {
          console.log("✅ n8n is running (alternative endpoint)");
          return true;
        }
      } catch (error2) {
        throw new Error(`Cannot connect to n8n at ${this.url}. Is n8n running?`);
      }
    }
  }
  
  async loadWorkflows() {
    console.log("📋 Loading n8n workflows...");
    
    try {
      if (this.config.apiKey) {
        // Use API to get workflows
        const response = await axios.get(`${this.url}/api/v1/workflows`, {
          headers: {
            'X-N8N-API-KEY': this.config.apiKey
          },
          timeout: 10000
        });
        
        this.workflows = response.data.data || [];
        console.log(`✅ Loaded ${this.workflows.length} workflows via API`);
      } else {
        // Try to load from local files
        const n8nDir = path.join(process.env.HOME || process.env.USERPROFILE, '.n8n');
        const workflowsDir = path.join(n8nDir, 'workflows');
        
        if (fs.existsSync(workflowsDir)) {
          const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
          this.workflows = files.map(file => ({
            id: file.replace('.json', ''),
            name: file.replace('.json', '').replace(/-/g, ' '),
            file: path.join(workflowsDir, file)
          }));
          console.log(`✅ Found ${this.workflows.length} workflow files`);
        } else {
          console.log("⚠️  No workflows found. Create some in n8n UI first.");
          this.workflows = [];
        }
      }
    } catch (error) {
      console.log(`⚠️  Could not load workflows: ${error.message}`);
      this.workflows = [];
    }
  }
  
  async executeWorkflow(workflowId, data = {}) {
    if (!this.connected) {
      throw new Error('n8n not connected. Call start() first.');
    }
    
    console.log(`🚀 Executing n8n workflow: ${workflowId}`);
    console.log(`   Data: ${JSON.stringify(data, null, 2)}`);
    
    try {
      let result;
      
      if (this.config.apiKey) {
        // Execute via API
        const response = await axios.post(
          `${this.url}/api/v1/workflows/${workflowId}/execute`,
          data,
          {
            headers: {
              'X-N8N-API-KEY': this.config.apiKey,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        result = response.data;
      } else {
        // Trigger via webhook
        const webhookUrl = `${this.url}${this.config.webhookPath}/${workflowId}`;
        const response = await axios.post(webhookUrl, data, {
          timeout: 30000
        });
        
        result = response.data;
      }
      
      console.log("✅ Workflow execution started");
      
      return {
        success: true,
        workflowId,
        executionId: result.id || `exec_${Date.now()}`,
        status: 'started',
        data,
        note: 'Workflow execution started in n8n. Check n8n UI for progress.'
      };
    } catch (error) {
      console.error(`❌ Workflow execution failed: ${error.message}`);
      
      return {
        success: false,
        workflowId,
        error: error.message,
        note: 'Failed to execute workflow. Check n8n is running and workflow exists.'
      };
    }
  }
  
  async createWorkflow(name, nodes = [], connections = []) {
    if (!this.connected) {
      throw new Error('n8n not connected. Call start() first.');
    }
    
    console.log(`🛠️  Creating n8n workflow: ${name}`);
    
    const workflow = {
      name,
      nodes: nodes.length > 0 ? nodes : this.getDefaultNodes(),
      connections: connections.length > 0 ? connections : [],
      settings: {
        saveManualExecutions: true,
        executionTimeout: 3600
      }
    };
    
    try {
      if (this.config.apiKey) {
        // Create via API
        const response = await axios.post(
          `${this.url}/api/v1/workflows`,
          workflow,
          {
            headers: {
              'X-N8N-API-KEY': this.config.apiKey,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        const newWorkflow = response.data;
        this.workflows.push(newWorkflow);
        
        console.log(`✅ Workflow created: ${newWorkflow.id}`);
        
        return {
          success: true,
          workflow: newWorkflow,
          note: `Workflow "${name}" created. Access at: ${this.url}/workflow/${newWorkflow.id}`
        };
      } else {
        // Save to local file
        const workflowId = `geoclaw_${Date.now()}`;
        const n8nDir = path.join(process.env.HOME || process.env.USERPROFILE, '.n8n');
        const workflowsDir = path.join(n8nDir, 'workflows');
        
        // Ensure directory exists
        if (!fs.existsSync(workflowsDir)) {
          fs.mkdirSync(workflowsDir, { recursive: true });
        }
        
        const filePath = path.join(workflowsDir, `${workflowId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
        
        const localWorkflow = {
          id: workflowId,
          name,
          file: filePath
        };
        
        this.workflows.push(localWorkflow);
        
        console.log(`✅ Workflow saved to: ${filePath}`);
        
        return {
          success: true,
          workflow: localWorkflow,
          note: `Workflow "${name}" saved locally. Import it in n8n UI.`
        };
      }
    } catch (error) {
      console.error(`❌ Failed to create workflow: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        note: 'Failed to create workflow. Check n8n API key or permissions.'
      };
    }
  }
  
  getDefaultNodes() {
    return [
      {
        name: 'Geoclaw Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        position: [250, 300],
        parameters: {}
      },
      {
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        position: [450, 300],
        parameters: {
          url: '={{$json.url}}',
          method: 'GET',
          sendBody: true
        }
      },
      {
        name: 'Parse Data',
        type: 'n8n-nodes-base.function',
        position: [650, 300],
        parameters: {
          functionCode: `// Parse and transform data
const items = $input.all();
const result = [];

for (const item of items) {
  result.push({
    json: {
      parsed: true,
      data: item.json,
      timestamp: new Date().toISOString()
    }
  });
}

return result;`
        }
      }
    ];
  }
  
  async getWorkflowTemplates() {
    return [
      {
        id: 'web-scraping',
        name: 'Web Scraping Pipeline',
        description: 'Scrape website, extract data, save to database',
        nodes: [
          {
            name: 'Start',
            type: 'n8n-nodes-base.manualTrigger',
            parameters: {}
          },
          {
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            parameters: {
              url: '={{$json.url}}',
              method: 'GET'
            }
          },
          {
            name: 'HTML Extract',
            type: 'n8n-nodes-base.htmlExtract',
            parameters: {
              extractionValues: [
                {
                  key: 'title',
                  cssSelector: 'h1',
                  returnValue: 'text'
                },
                {
                  key: 'content',
                  cssSelector: 'article',
                  returnValue: 'text'
                }
              ]
            }
          },
          {
            name: 'PostgreSQL',
            type: 'n8n-nodes-base.postgres',
            parameters: {
              operation: 'insert',
              table: 'scraped_data',
              columns: 'title, content, url, scraped_at'
            }
          }
        ]
      },
      {
        id: 'data-processing',
        name: 'Data Processing Workflow',
        description: 'Process CSV, transform, send to API',
        nodes: [
          {
            name: 'Start',
            type: 'n8n-nodes-base.manualTrigger',
            parameters: {}
          },
          {
            name: 'Read CSV',
            type: 'n8n-nodes-base.readBinaryFile',
            parameters: {
              filePath: '={{$json.csvPath}}'
            }
          },
          {
            name: 'CSV Parse',
            type: 'n8n-nodes-base.csv',
            parameters: {
              delimiter: ',',
              fromLine: 1
            }
          },
          {
            name: 'Transform',
            type: 'n8n-nodes-base.function',
            parameters: {
              functionCode: `// Transform CSV data
const items = $input.all();
const result = [];

for (const item of items) {
  // Add processing logic here
  result.push({
    json: {
      ...item.json,
      processed: true,
      processed_at: new Date().toISOString()
    }
  });
}

return result;`
            }
          },
          {
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            parameters: {
              url: '={{$json.apiUrl}}',
              method: 'POST',
              sendBody: true,
              bodyParameters: {
                parameters: [
                  {
                    name: 'data',
                    value: '={{$json}}'
                  }
                ]
              }
            }
          }
        ]
      },
      {
        id: 'notification-system',
        name: 'Notification System',
        description: 'Monitor data, send alerts via multiple channels',
        nodes: [
          {
            name: 'Schedule Trigger',
            type: 'n8n-nodes-base.scheduleTrigger',
            parameters: {
              rule: {
                interval: [
                  {
                    field: 'minutes',
                    minutesInterval: 5
                  }
                ]
              }
            }
          },
          {
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            parameters: {
              url: '={{$json.monitorUrl}}',
              method: 'GET'
            }
          },
          {
            name: 'Condition',
            type: 'n8n-nodes-base.if',
            parameters: {
              conditions: {
                options: {
                  caseSensitive: true
                },
                conditions: [
                  {
                    leftValue: '={{$json.status}}',
                    rightValue: 'error',
                    operator: {
                      type: 'string',
                      operation: 'equals'
                    }
                  }
                ]
              }
            }
          },
          {
            name: 'Send Email',
            type: 'n8n-nodes-base.emailSend',
            parameters: {
              fromEmail: '={{$json.fromEmail}}',
              toEmail: '={{$json.toEmail}}',
              subject: 'Alert: System Error',
              text: '={{$json.message}}'
            }
          },
          {
            name: 'Slack',
            type: 'n8n-nodes-base.slack',
            parameters: {
              channel: '={{$json.slackChannel}}',
              text: '={{$json.message}}'
            }
          }
        ]
      }
    ];
  }
  
  async getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      url: this.url,
      workflows: this.workflows.length,
      templates: (await this.getWorkflowTemplates()).length,
      note: 'n8n provides visual workflow automation with 200+ integrations.'
    };
  }
  
  stop() {
    console.log("🛑 Stopping n8n integration...");
    this.connected = false;
    console.log("✅ n8n integration stopped");
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const n8n = new N8nIntegration();
  
  async function run() {
    switch (command) {
      case 'start':
        await n8n.start();
        break;
      case 'stop':
        n8n.stop();
        break;
      case 'status':
        const status = await n8n.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;
      case 'workflows':
        await n8n.start();
        console.log(JSON.stringify(n8n.workflows, null, 2));
        break;
      case 'execute':
        if (args.length < 2) {
          console.error('Usage: node n8n-integration.js execute <workflowId> [jsonData]');
          process.exit(1);
        }
        await n8n.start();
        const data = args[2] ? JSON.parse(args[2]) : {};
        const result = await n8n.executeWorkflow(args[1], data);
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'create':
        if (args.length < 2) {
          console.error('Usage: node n8n-integration.js create "Workflow Name"');
          process.exit(1);
        }
        await n8n.start();
        const createResult = await n8n.createWorkflow(args[1]);
        console.log(JSON.stringify(createResult, null, 2));
        break;
      case 'templates':
        const templates = await n8n.getWorkflowTemplates();
        console.log(JSON.stringify(templates, null, 2));
        break;
      default:
        console.log(`
n8n Integration for Geoclaw
===========================

n8n is a visual workflow automation tool with 200+ integrations.
Geoclaw can trigger, monitor, and create n8n workflows.

Commands:
  start      - Start n8n integration
  stop       - Stop n8n integration
  status     - Get integration status
  workflows  - List available workflows
  execute    - Execute a workflow
  create     - Create a new workflow
  templates  - Show workflow templates

Examples:
  node n8n-integration.js start
  node n8n-integration.js workflows
  node n8n-integration.js execute web-scraping '{"url":"https://example.com"}'
  node n8n-integration.js create "Data Processing Pipeline"
  node n8n-integration.js templates

Integration with Geoclaw:
  • Trigger n8n workflows from Geoclaw commands
  • Create workflows programmatically
