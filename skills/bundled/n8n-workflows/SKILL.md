---
name: n8n-workflows
description: 'n8n workflow automation integration — list, trigger, create, and monitor n8n workflows. Use when the user wants to run automations, trigger workflows, check execution status, build new workflows, or connect external services through n8n. Supports both cloud (n8n.cloud) and self-hosted instances.'
metadata:
  {
    "openclaw":
      {
        "emoji": "⚡",
        "requires": { "env": ["N8N_BASE_URL", "N8N_API_KEY"] },
        "install": [],
      },
    "antonclaw":
      {
        "integration": "n8n",
        "module": "scripts/components/n8n-integration.js",
      },
  }
---

# n8n Workflow Automation

Connect to your n8n instance (self-hosted or cloud) to list, trigger, and manage automation workflows.

## Setup

```bash
# In .env:
N8N_BASE_URL=http://localhost:5678   # or https://your-instance.n8n.cloud
N8N_API_KEY=your-api-key
```

Get your API key from: n8n → Settings → API → Create API Key

## Available Operations

### Workflows
```
n8n_list_workflows          — list all workflows (active/inactive)
n8n_get_workflow            — get full workflow definition
n8n_activate_workflow       — enable a workflow
n8n_deactivate_workflow     — disable a workflow
n8n_trigger_workflow        — manually trigger a workflow (webhook or manual)
```

### Executions
```
n8n_list_executions         — list recent executions for a workflow
n8n_get_execution           — get execution details and output data
n8n_retry_execution         — retry a failed execution
n8n_delete_execution        — delete an execution record
```

### Credentials (read-only)
```
n8n_list_credentials        — list available credential types (names only, no secrets)
```

## Common Patterns

### Trigger a workflow and wait for result
```
Trigger the "Daily Report" workflow and show me the output
```

### Monitor failing workflows
```
List all executions from the last 24 hours that failed, and show the error messages
```

### Bulk re-run
```
Retry all failed executions from the "Invoice Processor" workflow this week
```

### Check what's running
```
List all active workflows and tell me which ones haven't run in the last 7 days
```

## Integration with Monday.com

A common pattern is chaining n8n + Monday:
```
Trigger the "Sync CRM to Monday" workflow, then list the new items it created on the Sales board
```

## Rules

1. Never expose credential values — only names/types are visible
2. Ask for confirmation before activating/deactivating workflows in production
3. When triggering webhooks, show the full response including output data
4. For long-running workflows, use `n8n_get_execution` to poll status
5. Self-hosted instances may need `--insecure` flag if using HTTP — check N8N_BASE_URL protocol
