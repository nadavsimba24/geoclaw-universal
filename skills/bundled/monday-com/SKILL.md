---
name: monday-com
description: 'Full Monday.com integration — create, update, read boards/items/subitems, manage columns, set statuses, post updates, search across boards. Use when the user asks to manage projects, track tasks, update Monday boards, create items, change statuses, or link work items to Monday. Works with any Monday.com workspace via API key.'
metadata:
  {
    "openclaw":
      {
        "emoji": "📋",
        "requires": { "env": ["MONDAY_API_KEY"] },
        "install": [],
      },
    "antonclaw":
      {
        "integration": "monday-com",
        "module": "scripts/components/monday-integration.js",
      },
  }
---

# Monday.com Integration

Full read/write access to Monday.com boards, items, subitems, columns, and updates via the Monday.com GraphQL API.

## Setup

Set your Monday.com API key:
```bash
antonclaw setup  # or set MONDAY_API_KEY in .env
```

Get your API key from: Monday.com → Profile → Admin → API → Personal API Token

## Available Operations

### Boards
```
monday_list_boards          — list all boards in the workspace
monday_get_board            — get board structure, columns, items
```

### Items
```
monday_create_item          — create a new item on a board
monday_update_item          — update item column values
monday_delete_item          — delete an item
monday_search_items         — search for items by name/value
monday_move_item_to_group   — move item to a different group
```

### Subitems
```
monday_create_subitem       — create a subitem under an item
monday_list_subitems        — list subitems for an item
```

### Updates (comments)
```
monday_post_update          — post a comment/update on an item
monday_list_updates         — list recent updates on an item
```

## Column Types

| Type | Notes |
|------|-------|
| status | Use the label string (e.g. "Done", "In Progress") |
| date | ISO format: "2026-04-24" |
| text | Plain string |
| numbers | Numeric string: "42" |
| people | User ID or email |
| dropdown | Option label string |
| checkbox | "true" / "false" |
| timeline | `{"from":"2026-01-01","to":"2026-03-31"}` |

## Common Patterns

### Create a task and set status
```
Create item "Deploy backend" on board "Sprint 12", set status to "In Progress"
```

### Daily standup update
```
List all items assigned to me that are "In Progress" on the Development board
```

### Move completed items
```
Find all items with status "Done" in board "Q2 Projects" and move them to the Archive group
```

### Bulk update
```
Set all items in the "Blocked" group to status "Needs Review" and post an update saying "Reviewed by Anton"
```

## Rules

1. Always confirm board/item names before destructive operations (delete, status change)
2. When creating items, ask for the board and group if not specified
3. Use `monday_get_board` first to discover column IDs before updating column values
4. Rate limit: Monday.com allows ~10,000 requests/minute — no special throttling needed for normal use
