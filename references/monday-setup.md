# Monday.com Integration Guide for Geoclaw

## Overview
Monday.com integration allows Geoclaw to interact with Monday.com boards, items, updates, and workflows. This enables automation of project management, task tracking, and team collaboration directly from chat interfaces.

## Features
- **Board Management**: Create, read, update, delete boards
- **Item Operations**: Manage items (tasks) with custom fields
- **Updates & Comments**: Post and read updates on items
- **Webhooks**: Receive notifications for board changes
- **Workflow Automation**: Trigger automations based on chat commands

## Prerequisites
- Monday.com account with admin access
- API token from Monday.com
- Board IDs you want to interact with

## API Authentication

### 1. Get API Token
1. Log in to Monday.com
2. Click your profile picture → **Admin**
3. Go to **API** section
4. Click **Generate new token**
5. Copy the token → `GEOCLAW_MONDAY_API_TOKEN`

### 2. Test API Access
```bash
curl -X POST https://api.monday.com/v2 \
  -H "Authorization: ${GEOCLAW_MONDAY_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { name email } }"}'
```

## Environment Variables
Add to `.env`:
```bash
# Monday.com Configuration
GEOCLAW_MONDAY_ENABLED=false
GEOCLAW_MONDAY_API_TOKEN=
GEOCLAW_MONDAY_API_VERSION=v2
GEOCLAW_MONDAY_DEFAULT_BOARD_ID=
GEOCLAW_MONDAY_WEBHOOK_SECRET=
```

## GraphQL API Basics

### Common Queries
```graphql
# Get user info
{ me { name email } }

# List boards
{ boards { id name } }

# Get board items
{ boards(ids: [1234567890]) { items { id name } } }

# Get item with columns
{ items(ids: [1234567891]) { name column_values { id text } } }
```

### Common Mutations
```graphql
# Create item
mutation {
  create_item(
    board_id: 1234567890,
    item_name: "New Task",
    column_values: "{\"status\": \"Working on it\"}"
  ) { id }
}

# Update item
mutation {
  change_column_value(
    board_id: 1234567890,
    item_id: 1234567891,
    column_id: "status",
    value: "{\"label\": \"Done\"}"
  ) { id }
}

# Create update
mutation {
  create_update(
    item_id: 1234567891,
    body: "Task completed via Geoclaw"
  ) { id }
}
```

## Skill Implementation

### 1. Monday.com Skill Structure
Create `skills/monday/` with:
```
skills/monday/
├── SKILL.md
├── monday-client.js
├── monday-commands.js
└── references/
    └── monday-api.md
```

### 2. Monday Client Class
```javascript
// monday-client.js
class MondayClient {
  constructor(apiToken, apiVersion = 'v2') {
    this.apiToken = apiToken;
    this.baseUrl = 'https://api.monday.com/v2';
    this.headers = {
      'Authorization': apiToken,
      'Content-Type': 'application/json'
    };
  }

  async query(gqlQuery, variables = {}) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        query: gqlQuery,
        variables
      })
    });
    
    const data = await response.json();
    if (data.errors) {
      throw new Error(`Monday.com API error: ${JSON.stringify(data.errors)}`);
    }
    
    return data.data;
  }

  // Helper methods
  async getBoards() {
    const query = `{ boards { id name } }`;
    return this.query(query);
  }

  async createItem(boardId, itemName, columnValues = {}) {
    const mutation = `
      mutation CreateItem($boardId: Int!, $itemName: String!, $columnValues: JSON) {
        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
          id
        }
      }
    `;
    
    return this.query(mutation, {
      boardId: parseInt(boardId),
      itemName,
      columnValues: JSON.stringify(columnValues)
    });
  }

  async postUpdate(itemId, body) {
    const mutation = `
      mutation CreateUpdate($itemId: Int!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
        }
      }
    `;
    
    return this.query(mutation, {
      itemId: parseInt(itemId),
      body
    });
  }
}
```

### 3. Command Handlers
```javascript
// monday-commands.js
const MondayCommands = {
  async listBoards(client) {
    const data = await client.getBoards();
    return data.boards.map(b => `- ${b.name} (ID: ${b.id})`).join('\n');
  },

  async createTask(client, boardId, taskName, assignee = null) {
    const columnValues = assignee ? {
      "person": { "personsAndTeams": [{ "id": assignee, "kind": "person" }] }
    } : {};
    
    const result = await client.createItem(boardId, taskName, columnValues);
    return `Task created with ID: ${result.create_item.id}`;
  },

  async getBoardItems(client, boardId) {
    const query = `
      query GetBoardItems($boardId: Int!) {
        boards(ids: [$boardId]) {
          items {
            id
            name
            column_values {
              id
              text
            }
          }
        }
      }
    `;
    
    const data = await client.query(query, { boardId: parseInt(boardId) });
    return data.boards[0].items;
  },

  async postComment(client, itemId, comment) {
    const result = await client.postUpdate(itemId, comment);
    return `Comment posted with ID: ${result.create_update.id}`;
  }
};
```

## Chat Commands Examples

### Natural Language Interface
```
@geoclaw Create a task "Design homepage" on Marketing board
@geoclaw What's on the Development board?
@geoclaw Add comment "Blocked by API issue" to task 12345
@geoclaw List all boards
@geoclaw Show tasks assigned to me
```

### Structured Commands
```
/monday boards list
/monday board 1234567890 items
/monday create task "Bug fix" --board 1234567890 --assignee 987654321
/monday comment 1234567891 "Status update: completed"
/monday search "urgent" --board 1234567890
```

## Webhook Integration

### 1. Create Webhook in Monday.com
1. Go to board → **Integrations** → **Webhooks**
2. Click **Add webhook**
3. Set URL: `https://your-geoclaw-server.com/webhooks/monday`
4. Choose events: Item created, Item updated, etc.
5. Copy webhook secret → `GEOCLAW_MONDAY_WEBHOOK_SECRET`

### 2. Webhook Handler
```javascript
// webhooks/monday.js
const crypto = require('crypto');

function verifyMondayWebhook(req, secret) {
  const signature = req.headers['x-monday-signature'];
  const payload = JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return signature === expectedSignature;
}

async function handleMondayWebhook(req, geoclaw) {
  const { event, boardId, itemId, userId } = req.body;
  
  switch (event.type) {
    case 'create_item':
      await geoclaw.sendMessage(
        `New item created on board ${boardId}: ${itemId}`,
        { channel: 'slack', target: '#notifications' }
      );
      break;
      
    case 'update_item':
      // Process item update
      break;
      
    case 'change_column_value':
      // Process column change
      break;
  }
}
```

## Configuration in geoclaw.config.yml
```yaml
integrations:
  monday:
    enabled: ${GEOCLAW_MONDAY_ENABLED:-false}
    apiTokenEnv: GEOCLAW_MONDAY_API_TOKEN
    apiVersion: ${GEOCLAW_MONDAY_API_VERSION:-v2}
    defaultBoardId: ${GEOCLAW_MONDAY_DEFAULT_BOARD_ID:-}
    webhookSecretEnv: GEOCLAW_MONDAY_WEBHOOK_SECRET
    
    # Board-specific configurations
    boards:
      marketing:
        id: 1234567890
        columns:
          status: "status"
          assignee: "person"
          due_date: "date"
          
      development:
        id: 1234567891
        columns:
          priority: "dropdown"
          estimate: "numbers"
          sprint: "text"
```

## Use Cases

### 1. Task Management from Chat
```bash
# Create task from Slack
User: @geoclaw Create task "Fix login bug" on Development board
Geoclaw: Task created: Fix login bug (ID: 12345)
          Assigned to: @developer
          Due: Friday

# Update status from Telegram
User: /monday update 12345 status "In progress"
Geoclaw: Updated task "Fix login bug" to "In progress"
```

### 2. Daily Standup Reports
```bash
# Generate standup report
User: @geoclaw Generate standup report for Development board
Geoclaw: Development Board Standup - 2024-01-15
          • In Progress (3): Fix login bug, API integration, Design review
          • Done (2): Documentation, Testing setup
          • Blocked (1): Deployment issue
```

### 3. Notification Pipeline
```bash
# GitHub → Monday.com → Slack
GitHub PR opened → Monday.com task created → Slack notification
# Customer support → Monday.com → Assign team
Support ticket → Monday.com item → Assign to support agent
```

## Security Considerations

### 1. API Token Security
- Store token in environment variables only
- Use token rotation (Monday.com supports multiple tokens)
- Limit token permissions to necessary scopes
- Monitor API usage for anomalies

### 2. Webhook Security
- Always verify webhook signatures
- Use HTTPS for webhook endpoints
- Validate incoming data structure
- Rate limit webhook processing

### 3. Data Privacy
- Don't log sensitive board data
- Anonymize user IDs in logs
- Comply with company data policies
- Use board permissions appropriately

## Troubleshooting

### Common Issues

#### API Rate Limiting
Monday.com has rate limits (typically 500 requests per 10 seconds per token).
```javascript
// Implement retry with exponential backoff
async function queryWithRetry(client, query, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.query(query);
    } catch (error) {
      if (error.message.includes('Rate limit')) {
        await sleep(Math.pow(2, i) * 1000); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

#### Board Permission Issues
Ensure the API token has access to the boards you're trying to access.
```bash
# Test board access
curl -X POST https://api.monday.com/v2 \
  -H "Authorization: $TOKEN" \
  -d '{"query": "{ boards(ids: [1234567890]) { id name } }"}'
```

#### Webhook Delivery Failures
1. Check webhook URL is accessible
2. Verify signature verification
3. Check Monday.com webhook status
4. Monitor webhook delivery logs

## Advanced Features

### 1. Board Templates
```yaml
monday:
  templates:
    bugReport:
      boardId: 1234567890
      columns:
        title: "name"
        description: "text"
        severity: "dropdown"
        reporter: "person"
        due_date: "date"
```

### 2. Automated Workflows
```javascript
// Automate task creation from emails
async function createTaskFromEmail(email, mondayClient) {
  const boardId = getBoardFromEmailType(email);
  const taskName = extractTaskName(email);
  const assignee = findAssignee(email);
  
  await mondayClient.createItem(boardId, taskName, {
    "description": email.body,
    "priority": "high",
    "assignee": assignee
  });
}
```

### 3. Analytics & Reporting
```javascript
// Generate weekly report
async function generateWeeklyReport(mondayClient, boardId) {
  const items = await mondayClient.getBoardItems(boardId);
  const completed = items.filter(i => i.column_values.status === "Done");
  const inProgress = items.filter(i => i.column_values.status === "Working on it");
  
  return {
    total: items.length,
    completed: completed.length,
    inProgress: inProgress.length,
    completionRate: (completed.length / items.length) * 100
  };
}
```

## Resources
- [Monday.com API Documentation](https://developer.monday.com/api-reference/docs)
- [GraphQL API Guide](https://developer.monday.com/api-reference/docs/graphql)
- [Webhooks Guide](https://developer.monday.com/api-reference/docs/webhooks)
- [API Playground](https://monday.com/developers/apps/playground)
- [Community Forum](https://community.monday.com/c/developers/31)
