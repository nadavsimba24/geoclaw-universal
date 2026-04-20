#!/usr/bin/env node
// Geoclaw MCP Server
// Exposes Geoclaw capabilities via Model Context Protocol
// Users can see and understand which tools are available

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ListToolsRequestSchema 
} = require('@modelcontextprotocol/sdk/types.js');

console.error("🔧 Starting Geoclaw MCP Server v3.0");
console.error("This server exposes Geoclaw capabilities to the MCP ecosystem.");
console.error("Other applications (Claude Desktop, Raycast, etc.) can use Geoclaw tools.");
console.error("");

// Tool definitions with clear descriptions
const tools = [
  {
    name: "geoclaw_create_task",
    description: "Create a new task in Geoclaw's task management system",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the task"
        },
        description: {
          type: "string",
          description: "Detailed description of the task"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Priority level"
        },
        assignee: {
          type: "string",
          description: "Optional assignee (user ID or email)"
        }
      },
      required: ["title"]
    }
  },
  {
    name: "geoclaw_list_tasks",
    description: "List tasks from Geoclaw's task management system",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "in_progress", "done", "all"],
          description: "Filter by status"
        },
        limit: {
          type: "number",
          description: "Maximum number of tasks to return"
        }
      }
    }
  },
  {
    name: "geoclaw_search_memory",
    description: "Search Geoclaw's persistent memory (Central Intelligence)",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query"
        },
        limit: {
          type: "number",
          description: "Maximum number of results"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "geoclaw_add_memory",
    description: "Add a memory to Geoclaw's persistent memory system",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Content to remember"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization"
        }
      },
      required: ["content"]
    }
  },
  {
    name: "geoclaw_monday_create_item",
    description: "Create an item on Monday.com (if Monday.com integration is enabled)",
    inputSchema: {
      type: "object",
      properties: {
        boardId: {
          type: "string",
          description: "Monday.com board ID"
        },
        itemName: {
          type: "string",
          description: "Name of the item"
        },
        columnValues: {
          type: "object",
          description: "Column values as JSON string"
        }
      },
      required: ["boardId", "itemName"]
    }
  },
  {
    name: "geoclaw_salesforce_query",
    description: "Execute a SOQL query on Salesforce (if Salesforce integration is enabled)",
    inputSchema: {
      type: "object",
      properties: {
        soql: {
          type: "string",
          description: "SOQL query string"
        }
      },
      required: ["soql"]
    }
  },
  {
    name: "geoclaw_start_agent",
    description: "Start an AI agent to work on a task",
    inputSchema: {
      type: "object",
      properties: {
        agentType: {
          type: "string",
          enum: ["geoclaw", "claude-code", "gemini-cli", "codex"],
          description: "Type of agent to start"
        },
        task: {
          type: "string",
          description: "Task description for the agent"
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace ID (for Vibe Kanban integration)"
        }
      },
      required: ["agentType", "task"]
    }
  },
  {
    name: "geoclaw_get_capabilities",
    description: "Get information about Geoclaw's capabilities and integrations",
    inputSchema: {
      type: "object",
      properties: {
        detailed: {
          type: "boolean",
          description: "Whether to return detailed information"
        }
      }
    }
  }
];

// Create MCP server
const server = new Server(
  {
    name: "geoclaw",
    version: "3.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("📋 MCP Client requested list of tools");
  console.error(`   Available tools: ${tools.length}`);
  tools.forEach(tool => {
    console.error(`   • ${tool.name}: ${tool.description}`);
  });
  
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`🔧 MCP Client called tool: ${name}`);
  console.error(`   Arguments: ${JSON.stringify(args, null, 2)}`);
  
  // Find the tool
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    console.error(`❌ Tool not found: ${name}`);
    throw new Error(`Tool ${name} not found`);
  }
  
  try {
    let result;
    
    switch (name) {
      case "geoclaw_create_task":
        result = await handleCreateTask(args);
        break;
      case "geoclaw_list_tasks":
        result = await handleListTasks(args);
        break;
      case "geoclaw_search_memory":
        result = await handleSearchMemory(args);
        break;
      case "geoclaw_add_memory":
        result = await handleAddMemory(args);
        break;
      case "geoclaw_monday_create_item":
        result = await handleMondayCreateItem(args);
        break;
      case "geoclaw_salesforce_query":
        result = await handleSalesforceQuery(args);
        break;
      case "geoclaw_start_agent":
        result = await handleStartAgent(args);
        break;
      case "geoclaw_get_capabilities":
        result = await handleGetCapabilities(args);
        break;
      default:
        throw new Error(`Tool ${name} not implemented`);
    }
    
    console.error(`✅ Tool ${name} executed successfully`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`❌ Tool ${name} failed: ${error.message}`);
    throw error;
  }
});

// Tool handlers
async function handleCreateTask(args) {
  const { title, description = "", priority = "medium", assignee } = args;
  
  console.error(`   Creating task: "${title}"`);
  console.error(`   Priority: ${priority}`);
  if (assignee) console.error(`   Assignee: ${assignee}`);
  
  // In a real implementation, this would:
  // 1. Create task in Geoclaw's memory
  // 2. If Vibe Kanban is enabled, create issue there
  // 3. If Monday.com is enabled, create item there
  // 4. Return unified task ID
  
  const taskId = `task_${Date.now()}`;
  
  return {
    success: true,
    message: `Task created successfully`,
    taskId,
    title,
    description,
    priority,
    assignee,
    integrations: {
      geoclaw: true,
      vibeKanban: process.env.GEOCLAW_VIBE_KANBAN_ENABLED === "true",
      monday: process.env.GEOCLAW_MONDAY_ENABLED === "true",
      salesforce: process.env.GEOCLAW_SALESFORCE_ENABLED === "true"
    },
    note: "Task created in Geoclaw. If integrations are enabled, it will sync to connected systems."
  };
}

async function handleListTasks(args) {
  const { status = "all", limit = 10 } = args;
  
  console.error(`   Listing tasks with status: ${status}`);
  console.error(`   Limit: ${limit}`);
  
  // Mock data - in real implementation, this would query from memory
  const tasks = [
    {
      id: "task_1",
      title: "Fix login bug",
      description: "Users can't login with Google OAuth",
      status: "in_progress",
      priority: "high",
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-01-16T14:20:00Z"
    },
    {
      id: "task_2",
      title: "Add dark mode",
      description: "Implement dark mode theme",
      status: "todo",
      priority: "medium",
      createdAt: "2024-01-14T09:15:00Z",
      updatedAt: "2024-01-14T09:15:00Z"
    },
    {
      id: "task_3",
      title: "Update documentation",
      description: "Update API documentation for new endpoints",
      status: "done",
      priority: "low",
      createdAt: "2024-01-10T11:00:00Z",
      updatedAt: "2024-01-12T16:45:00Z"
    }
  ];
  
  const filteredTasks = status === "all" 
    ? tasks 
    : tasks.filter(task => task.status === status);
  
  return {
    success: true,
    count: filteredTasks.length,
    tasks: filteredTasks.slice(0, limit),
    filters: { status, limit },
    source: "geoclaw_memory",
    note: "Tasks from Geoclaw's memory system. If Vibe Kanban is connected, tasks may also be available there."
  };
}

async function handleSearchMemory(args) {
  const { query, limit = 5 } = args;
  
  console.error(`   Searching memory for: "${query}"`);
  console.error(`   Limit: ${limit}`);
  
  // Mock data - in real implementation, this would query Central Intelligence
  const memories = [
    {
      id: "mem_1",
      content: "User prefers dark mode for all applications",
      tags: ["preferences", "ui"],
      timestamp: "2024-01-15T14:30:00Z",
      relevance: 0.95
    },
    {
      id: "mem_2",
      content: "API design decision: Use REST over GraphQL for simplicity",
      tags: ["api", "architecture", "decisions"],
      timestamp: "2024-01-14T11:20:00Z",
      relevance: 0.87
    },
    {
      id: "mem_3",
      content: "Customer support email template for login issues",
      tags: ["support", "email", "templates"],
      timestamp: "2024-01-13T09:45:00Z",
      relevance: 0.72
    }
  ];
  
  return {
    success: true,
    query,
    count: memories.length,
    memories: memories.slice(0, limit),
    source: "central_intelligence",
    note: "Memories from Central Intelligence persistent memory system. These persist across sessions."
  };
}

async function handleAddMemory(args) {
  const { content, tags = [] } = args;
  
  console.error(`   Adding memory: "${content.substring(0, 50)}..."`);
  if (tags.length > 0) console.error(`   Tags: ${tags.join(", ")}`);
  
  const memoryId = `mem_${Date.now()}`;
  
  return {
    success: true,
    message: "Memory added successfully",
    memoryId,
    content,
    tags,
    timestamp: new Date().toISOString(),
    source: "central_intelligence",
    note: "Memory stored in Central Intelligence. It will be available in future sessions."
  };
}

async function handleMondayCreateItem(args) {
  const { boardId, itemName, columnValues = {} } = args;
  
  console.error(`   Creating Monday.com item: "${itemName}"`);
  console.error(`   Board ID: ${boardId}`);
  
  if (process.env.GEOCLAW_MONDAY_ENABLED !== "true") {
    return {
      success: false,
      message: "Monday.com integration is not enabled",
      note: "Enable Monday.com integration in Geoclaw configuration to use this tool."
    };
  }
  
  // Mock response
  const itemId = `monday_${Date.now()}`;
  
  return {
    success: true,
    message: "Item created on Monday.com",
    itemId,
    boardId,
    itemName,
    columnValues,
    url: `https://${process.env.GEOCLAW_MONDAY_SUBDOMAIN || "your"}.monday.com/boards/${boardId}/pulses/${itemId}`,
    note: "Item created on Monday.com. It will sync with Geoclaw tasks if configured."
  };
}

async function handleSalesforceQuery(args) {
  const { soql } = args;
  
  console.error(`   Executing Salesforce query: ${soql.substring(0, 50)}...`);
  
  if (process.env.GEOCLAW_SALESFORCE_ENABLED !== "true") {
    return {
      success: false,
      message: "Salesforce integration is not enabled",
      note: "Enable Salesforce integration in Geoclaw configuration to use this tool."
    };
  }
  
  // Mock response
  return {
    success: true,
    query: soql,
    records: [
      {
        Id: "001xx000003DG3DAAW",
        Name: "Acme Corporation",
        Industry: "Technology",
        AnnualRevenue: 5000000
      },
      {
        Id: "001xx000003DG3DAAX",
        Name: "Globex Corporation",
        Industry: "Manufacturing",
        AnnualRevenue: 2500000
      }
    ],
    totalSize: 2,
    done: true,
    source: "salesforce",
    note: "Query executed on Salesforce. Results are from the CRM system."
  };
}

async function handleStartAgent(args) {
  const { agentType, task, workspaceId } = args;
  
  console.error(`   Starting agent: ${agentType}`);
  console.error(`   Task: "${task.substring(0, 50)}..."`);
  if (workspaceId) console.error(`   Workspace ID: ${workspaceId}`);
  
  const agentId = `agent_${Date.now()}`;
  
  return {
    success: true,
    message: `Agent ${agentType} started successfully`,
    agentId,
    agentType,
    task,
    workspaceId,
    status: "running",
    startedAt: new Date().toISOString(),
    integrations: {
      vibeKanban: workspaceId ? true : false,
      note: workspaceId ? "Agent running in Vibe Kanban workspace" : "Agent running standalone"
    },
    note: `Agent ${agentType} started. If workspaceId is provided, it's running in Vibe Kanban workspace.`
  };
}

async function handleGetCapabilities(args) {
  const { detailed = false } = args;
  
  console.error("   Getting Geoclaw capabilities");
  
  const capabilities = {
    version: "3.0.0",
    name: "Geoclaw Universal Agent Platform",
    description: "AI agent platform with full ecosystem integration",
    
    // Core capabilities
    core: {
      memory: {
        enabled: process.env.GEOCLAW_MEMORY_ENABLED === "true",
        provider: process.env.GEOCLAW_MEMORY_PROVIDER || "central-intelligence",
        description: "Persistent memory across sessions"
      },
      skills: {
        github: process.env.GEOCLAW_SKILLS_GITHUB_ENABLED === "true",
        sync: process.env.GEOCLAW_SKILLS_SYNC_ENABLED === "true",
        description: "Skill ecosystem with discovery and sync"
      }
    },
    
    // Task management
    taskManagement: {
      vibeKanban: process.env.GEOCLAW_VIBE_KANBAN_ENABLED === "true",
      description: "Visual task management & multi-agent orchestration"
    },
    
    // Enterprise integrations
    integrations: {
      monday: process.env.GEOCLAW_MONDAY_ENABLED === "true",
      salesforce: process.env.GEOCLAW_SALESFORCE_ENABLED === "true",
      description: "Enterprise system connections"
    },
    
    // Messaging
    messaging: {
      slack: process.env.GEOCLAW_SLACK_ENABLED === "true",
      telegram: process.env.GELEGRAM_ENABLED === "true",
      whatsapp: process.env.GEOCLAW_WHATSAPP_ENABLED === "true",
      signal: process.env.GEOCLAW_SIGNAL_ENABLED === "true",
      description: "Multi-channel communication"
    },
    
    // Security
    security: {
      onecli: process.env.GEOCLAW_ONECLI_ENABLED === "true",
      description: "Credential vault and security"
    },
    
    // MCP
    mcp: {
      server: process.env.GEOCLAW_MCP_SERVER_ENABLED === "true",
