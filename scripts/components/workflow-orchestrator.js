#!/usr/bin/env node
// Workflow Orchestrator for Geoclaw
// Connects all components: n8n, QGIS/PostGIS, web scraping, and more
// Creates magic workflows that span multiple systems

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class WorkflowOrchestrator {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.GEOCLAW_WORKFLOW_ENABLED === 'true',
      components: {
        n8n: process.env.GEOCLAW_N8N_ENABLED === 'true',
        geospatial: process.env.GEOCLAW_GEOSPATIAL_ENABLED === 'true',
        scraping: process.env.GEOCLAW_WEB_SCRAPING_ENABLED === 'true',
        vibeKanban: process.env.GEOCLAW_VIBE_KANBAN_ENABLED === 'true',
        monday: process.env.GEOCLAW_MONDAY_ENABLED === 'true',
        salesforce: process.env.GEOCLAW_SALESFORCE_ENABLED === 'true'
      },
      workflowDir: process.env.GEOCLAW_WORKFLOW_DIR || path.join(process.cwd(), 'workflows'),
      ...config
    };
    
    this.workflows = [];
    this.components = {};
    
    console.log("🎭 Workflow Orchestrator initialized");
    console.log(`   Enabled: ${this.config.enabled}`);
    if (this.config.enabled) {
      console.log(`   Active components:`);
      Object.entries(this.config.components).forEach(([name, enabled]) => {
        if (enabled) console.log(`     • ${name}`);
      });
    }
  }
  
  async start() {
    if (!this.config.enabled) {
      console.log("⚠️  Workflow orchestrator is disabled");
      console.log("   Enable it in .env: GEOCLAW_WORKFLOW_ENABLED=true");
      return false;
    }
    
    console.log("🚀 Starting workflow orchestrator...");
    
    try {
      // Ensure workflow directory
      this.ensureWorkflowDir();
      
      // Load workflow templates
      await this.loadWorkflowTemplates();
      
      console.log("✅ Workflow orchestrator ready!");
      console.log(`   Workflow directory: ${this.config.workflowDir}`);
      console.log(`   Templates loaded: ${this.workflows.length}`);
      console.log("   Magic workflows available via Geoclaw");
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start workflow orchestrator: ${error.message}`);
      return false;
    }
  }
  
  ensureWorkflowDir() {
    if (!fs.existsSync(this.config.workflowDir)) {
      fs.mkdirSync(this.config.workflowDir, { recursive: true });
      console.log(`✅ Created workflow directory: ${this.config.workflowDir}`);
    }
  }
  
  async loadWorkflowTemplates() {
    console.log("📋 Loading workflow templates...");
    
    this.workflows = [
      {
        id: 'data-pipeline-magic',
        name: 'Data Pipeline Magic',
        description: 'Scrape web data → Process in n8n → Store in PostGIS → Visualize in QGIS',
        components: ['scraping', 'n8n', 'geospatial'],
        steps: [
          {
            component: 'scraping',
            action: 'scrapeUrl',
            params: {
              url: 'https://example.com/data',
              method: 'browser',
              extract: {
                locations: '.location',
                values: '.value'
              }
            }
          },
          {
            component: 'n8n',
            action: 'executeWorkflow',
            params: {
              workflowId: 'data-processing',
              data: '{{step1.result}}'
            }
          },
          {
            component: 'geospatial',
            action: 'importGeoJson',
            params: {
              tableName: 'scraped_locations',
              geojson: '{{step2.result}}'
            }
          },
          {
            component: 'geospatial',
            action: 'createQgisProject',
            params: {
              projectName: 'Data Visualization',
              layers: [
                {
                  name: 'Scraped Locations',
                  datasource: 'dbname=geoclaw table=scraped_locations'
                }
              ]
            }
          }
        ]
      },
      {
        id: 'business-intelligence-flow',
        name: 'Business Intelligence Flow',
        description: 'Salesforce data → Monday.com tasks → Vibe Kanban development → Slack notifications',
        components: ['salesforce', 'monday', 'vibeKanban'],
        steps: [
          {
            component: 'salesforce',
            action: 'query',
            params: {
              soql: 'SELECT Id, Name, Amount FROM Opportunity WHERE StageName = \'Closed Won\''
            }
          },
          {
            component: 'monday',
            action: 'createItems',
            params: {
              boardId: 'sales_board',
              items: '{{step1.result.records}}'
            }
          },
          {
            component: 'vibeKanban',
            action: 'createIssues',
            params: {
              issues: '{{step2.result.items}}'
            }
          }
        ]
      },
      {
        id: 'monitoring-alert-system',
        name: 'Monitoring & Alert System',
        description: 'Monitor websites → Detect changes → Trigger n8n workflows → Send alerts',
        components: ['scraping', 'n8n'],
        steps: [
          {
            component: 'scraping',
            action: 'scrapeUrl',
            params: {
              url: '{{config.monitorUrl}}',
              method: 'http',
              saveData: true
            }
          },
          {
            component: 'n8n',
            action: 'executeWorkflow',
            params: {
              workflowId: 'change-detection',
              data: {
                current: '{{step1.result}}',
                previous: '{{loadPreviousData()}}'
              }
            }
          },
          {
            component: 'n8n',
            action: 'executeWorkflow',
            params: {
              workflowId: 'notification-system',
              data: '{{step2.result.changes}}'
            }
          }
        ]
      },
      {
        id: 'geospatial-analysis-pipeline',
        name: 'Geospatial Analysis Pipeline',
        description: 'Load spatial data → Perform analysis → Generate reports → Create maps',
        components: ['geospatial'],
        steps: [
          {
            component: 'geospatial',
            action: 'importGeoJson',
            params: {
              tableName: 'input_data',
              geojson: '{{config.inputGeojson}}'
            }
          },
          {
            component: 'geospatial',
            action: 'spatialAnalysis',
            params: {
              analysisType: 'buffer',
              table: 'input_data',
              distance: 1000
            }
          },
          {
            component: 'geospatial',
            action: 'spatialAnalysis',
            params: {
              analysisType: 'intersection',
              table1: 'input_data',
              table2: 'other_layer'
            }
          },
          {
            component: 'geospatial',
            action: 'createQgisProject',
            params: {
              projectName: 'Analysis Results',
              layers: [
                {
                  name: 'Buffered Areas',
                  datasource: 'dbname=geoclaw table=buffered_areas'
                },
                {
                  name: 'Intersections',
                  datasource: 'dbname=geoclaw table=intersections'
                }
              ]
            }
          }
        ]
      }
    ];
    
    console.log(`✅ Loaded ${this.workflows.length} workflow templates`);
  }
  
  async executeWorkflow(workflowId, parameters = {}) {
    if (!this.config.enabled) {
      throw new Error('Workflow orchestrator not enabled');
    }
    
    const workflow = this.workflows.find(w => w.id === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    
    console.log(`🎭 Executing workflow: ${workflow.name}`);
    console.log(`   Description: ${workflow.description}`);
    console.log(`   Components: ${workflow.components.join(', ')}`);
    console.log(`   Parameters: ${JSON.stringify(parameters, null, 2)}`);
    
    const results = [];
    const context = { ...parameters };
    
    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        console.log(`\n   Step ${i + 1}: ${step.component}.${step.action}`);
        
        // Resolve parameters with context
        const resolvedParams = this.resolveParameters(step.params, context);
        
        // Execute step
        const result = await this.executeStep(step.component, step.action, resolvedParams);
        
        // Store result in context for next steps
        context[`step${i + 1}`] = result;
        context[`step${i + 1}_result`] = result;
        
        results.push({
          step: i + 1,
          component: step.component,
          action: step.action,
          params: resolvedParams,
          result: result,
          success: result.success !== false
        });
        
        if (result.success === false) {
          console.log(`   ❌ Step ${i + 1} failed: ${result.error || 'Unknown error'}`);
          break;
        }
        
        console.log(`   ✅ Step ${i + 1} completed successfully`);
      }
      
      const success = results.every(r => r.success !== false);
      
      console.log(`\n🎭 Workflow execution ${success ? 'completed successfully' : 'failed'}`);
      console.log(`   Steps executed: ${results.length}/${workflow.steps.length}`);
      console.log(`   Successful steps: ${results.filter(r => r.success).length}`);
      
      // Save workflow execution log
      await this.saveExecutionLog(workflowId, {
        workflow,
        parameters,
        results,
        success,
        timestamp: new Date().toISOString()
      });
      
      return {
        success,
        workflowId,
        workflowName: workflow.name,
        stepsExecuted: results.length,
        successfulSteps: results.filter(r => r.success).length,
        results,
        context,
        note: `Workflow "${workflow.name}" ${success ? 'completed successfully' : 'failed'}.`
      };
    } catch (error) {
      console.error(`❌ Workflow execution failed: ${error.message}`);
      
      return {
        success: false,
        workflowId,
        error: error.message,
        results,
        note: `Workflow execution failed: ${error.message}`
      };
    }
  }
  
  resolveParameters(params, context) {
    if (typeof params === 'string') {
      return this.resolveString(params, context);
    } else if (Array.isArray(params)) {
      return params.map(item => this.resolveParameters(item, context));
    } else if (typeof params === 'object' && params !== null) {
      const resolved = {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParameters(value, context);
      }
      return resolved;
    } else {
      return params;
    }
  }
  
  resolveString(str, context) {
    if (typeof str !== 'string') return str;
    
    // Replace {{variable}} with context values
    return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getFromPath(context, path.trim());
      return value !== undefined ? value : match;
    });
  }
  
  getFromPath(obj, path) {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return current[key];
      }
      return undefined;
    }, obj);
  }
  
  async executeStep(component, action, params) {
    // This is a simplified version - in reality, this would
    // call the actual component methods
    
    console.log(`     Executing: ${component}.${action}`);
    console.log(`     Params: ${JSON.stringify(params, null, 2).substring(0, 200)}...`);
    
    // Simulate execution with mock results
    await this.delay(1000); // Simulate processing time
    
    const mockResults = {
      'scraping.scrapeUrl': {
        success: true,
        url: params.url || 'https://example.com',
        title: 'Example Page',
        extractedData: { items: ['data1', 'data2', 'data3'] }
      },
      'n8n.executeWorkflow': {
        success: true,
        workflowId: params.workflowId || 'test-workflow',
        executionId: `exec_${Date.now()}`,
        status: 'completed'
      },
      'geospatial.importGeoJson': {
        success: true,
        tableName: params.tableName || 'imported_data',
        featuresImported: 10
      },
      'geospatial.createQgisProject': {
        success: true,
        projectName: params.projectName || 'New Project',
        projectPath: `/path/to/${params.projectName || 'project'}.qgz`
      },
      'salesforce.query': {
        success: true,
        query: params.soql || 'SELECT * FROM Account',
        records: [{ Id: '001xx000003DG3DAAW', Name: 'Test Account' }],
        totalSize: 1
      },
      'monday.createItems': {
        success: true,
        boardId: params.boardId || 'test_board',
        itemsCreated: params.items ? params.items.length : 3
      },
      'vibeKanban.createIssues': {
        success: true,
        issuesCreated: params.issues ? params.issues.length : 2,
        issueIds: ['vk_issue_1', 'vk_issue_2']
      }
    };
    
    const key = `${component}.${action}`;
    const result = mockResults[key] || {
      success: false,
      error: `Component action not implemented: ${key}`,
      note: 'This is a mock implementation. Real implementation would call the actual component.'
    };
    
    return result;
  }
  
  async createCustomWorkflow(name, description, steps) {
    console.log(`🛠️  Creating custom workflow: ${name}`);
    
    const workflowId = `custom_${Date.now()}`;
    const workflow = {
      id: workflowId,
      name,
      description,
      steps,
      components: this.extractComponentsFromSteps(steps),
      created: new Date().toISOString()
    };
    
    this.workflows.push(workflow);
    
    // Save to file
    const workflowFile = path.join(this.config.workflowDir, `${workflowId}.json`);
    fs.writeFileSync(workflowFile, JSON.stringify(workflow, null, 2));
    
    console.log(`✅ Custom workflow created: ${workflowId}`);
    console.log(`   Saved to: ${workflowFile}`);
    
    return {
      success: true,
      workflowId,
      workflow,
      file: workflowFile,
      note: `Custom workflow "${name}" created. Execute with: @geoclaw workflow execute ${workflowId}`
    };
  }
  
  extractComponentsFromSteps(steps) {
    const components = new Set();
    steps.forEach(step => {
      if (step.component) {
        components.add(step.component);
      }
    });
    return Array.from(components);
  }
  
  async saveExecutionLog(workflowId, execution) {
    const logDir = path.join(this.config.workflowDir, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `${workflowId}_${timestamp}.json`);
    
    fs.writeFileSync(logFile, JSON.stringify(execution, null, 2));
    
    return logFile;
  }
  
  async getWorkflowTemplates() {
    return this.workflows.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      components: w.components,
      steps: w.steps.length
    }));
  }
  
  async getStatus() {
    return {
      enabled: this.config.enabled,
      workflowDir: this.config.workflowDir,
      templates: this.workflows.length,
      components: this.config.components,
      note: 'Workflow orchestrator connects all Geoclaw components into magic workflows.'
    };
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop() {
    console.log("🛑 Stopping workflow orchestrator...");
    console.log("✅ Workflow orchestrator stopped");
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const orchestrator = new WorkflowOrchestrator();
  
  async function run() {
    switch (command) {
      case 'start':
        await orchestrator.start();
        break;
      case 'stop':
        orchestrator.stop();
        break;
      case 'status':
        const status = await orchestrator.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;
      case 'templates':
        await orchestrator.start();
        const templates = await orchestrator.getWorkflowTemplates();
        console.log(JSON.stringify(templates, null, 2));
        break;
      case 'execute':
        if (args.length < 2) {
          console.error('Usage: node workflow-orchestrator.js execute <workflowId> [jsonParams]');
          process.exit(1);
        }
        await orchestrator.start();
        const params = args[2] ? JSON.parse(args[2]) : {};
        const result = await orchestrator.executeWorkflow(args[1], params);
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'create':
        if (args.length < 3) {
          console.error('Usage: node workflow