# Slack Setup Guide for Geoclaw

## Overview
Slack integration uses Socket Mode, which means no public URL is required. The bot connects to Slack via WebSocket, making it ideal for machines behind firewalls or NAT.

## Prerequisites
- Slack workspace where you have permission to install apps
- Admin access or ability to create Slack apps

## Step-by-Step Setup

### 1. Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Name your app (e.g., "Geoclaw Assistant")
5. Select your workspace
6. Click **"Create App"**

### 2. Enable Socket Mode
1. In left sidebar, click **"Socket Mode"**
2. Toggle **"Enable Socket Mode"** ON
3. Click **"Generate Token"** to create App-Level Token
4. Add token scope: `connections:write`
5. Copy the token (starts with `xapp-`) → `GEOCLAW_SLACK_APP_TOKEN`

### 3. Configure Bot Token Scopes
1. In left sidebar, click **"OAuth & Permissions"**
2. Under **"Bot Token Scopes"**, add these scopes:
   - `channels:history` (read channel history)
   - `channels:read` (view channels)
   - `chat:write` (send messages)
   - `groups:history` (read private channel history)
   - `groups:read` (view private channels)
   - `im:history` (read direct message history)
   - `im:read` (view direct messages)
   - `im:write` (start direct messages)
   - `users:read` (view users)

### 4. Subscribe to Bot Events
1. In left sidebar, click **"Event Subscriptions"**
2. Toggle **"Enable Events"** ON
3. Under **"Subscribe to bot events"**, add:
   - `message.channels` (messages in public channels)
   - `message.groups` (messages in private channels)
   - `message.im` (direct messages)

### 5. Install App to Workspace
1. In left sidebar, click **"Install App"**
2. Click **"Install to Workspace"**
3. Authorize the app
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`) → `GEOCLAW_SLACK_BOT_TOKEN`

## Environment Variables
Add to your `.env` file:
```bash
GEOCLAW_SLACK_ENABLED=true
GEOCLAW_SLACK_BOT_TOKEN=xoxb-your-bot-token-here
GEOCLAW_SLACK_APP_TOKEN=xapp-your-app-token-here
```

## Channel Registration

### Get Channel ID
1. Add the bot to a Slack channel:
   - Right-click channel → **View channel details** → **Integrations** → **Add apps**
2. Get channel ID:
   - Web URL: `https://app.slack.com/client/T.../C0123456789` → `C0123456789` is channel ID
   - Desktop: Right-click channel → **Copy link** → last segment is channel ID

### Register in Geoclaw
Geoclaw automatically detects Slack channels when:
1. Bot is added to channel
2. Environment variables are set
3. Gateway is restarted

For manual registration (if needed):
```bash
# Main channel (responds to all messages)
openclaw channels register slack --jid "slack:C0123456789" --name "general" --trigger "@geoclaw"

# Additional channels (trigger-only)
openclaw channels register slack --jid "slack:C0123456789" --name "random" --trigger "@geoclaw" --require-mention
```

## Testing
1. Restart Geoclaw: `./scripts/run.sh`
2. Send message in Slack:
   - For main channel: Any message
   - For non-main: `@geoclaw hello`
3. Check logs: `tail -f geoclaw.log`

## Troubleshooting

### Bot not responding
1. Verify tokens in `.env` are correct
2. Check Socket Mode is enabled
3. Verify bot is added to channel
4. Check required scopes are added
5. Restart Geoclaw after config changes

### "missing_scope" errors
1. Go to **OAuth & Permissions**
2. Add missing scope
3. **Reinstall app** (scope changes require reinstallation)
4. Update `GEOCLAW_SLACK_BOT_TOKEN` with new token
5. Restart Geoclaw

### Bot not seeing messages
1. Ensure bot is added to each channel
2. Verify `channels:history` and `groups:history` scopes
3. Check Event Subscriptions include needed events

### Connection issues
1. Check firewall allows outbound WebSocket connections
2. Verify machine has internet access
3. Check logs for WebSocket errors

## Advanced Configuration

### Multiple Workspaces
For multiple Slack workspaces, create separate apps and use:
```bash
GEOCLAW_SLACK_BOT_TOKEN_WORKSPACE1=xoxb-token1
GEOCLAW_SLACK_BOT_TOKEN_WORKSPACE2=xoxb-token2
GEOCLAW_SLACK_APP_TOKEN_WORKSPACE1=xapp-token1
GEOCLAW_SLACK_APP_TOKEN_WORKSPACE2=xapp-token2
```

### Custom Trigger Word
Change the trigger in `geoclaw.config.yml`:
```yaml
channels:
  slack:
    trigger: "@assistant"  # Change from "@geoclaw"
```

### Response Formatting
Slack supports rich formatting:
- **Bold**: `*text*`
- **Italic**: `_text_`
- **Code**: ``` `code` ``` or ``` ```code block```
- **Lists**: `• item` or `1. item`

## Security Notes
- Bot tokens have access to workspace data; keep them secure
- Use separate bot accounts for different security contexts
- Regularly review and rotate tokens
- Monitor bot activity in Slack audit logs

## Resources
- [Slack API Documentation](https://api.slack.com/)
- [Socket Mode Guide](https://api.slack.com/apis/connections/socket)
- [Bot Token Scopes](https://api.slack.com/scopes)
- [Troubleshooting Guide](https://api.slack.com/events-api#errors)
