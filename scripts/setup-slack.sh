#!/usr/bin/env bash
# Slack Setup Wizard for Geoclaw
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Geoclaw Slack Setup Wizard"
echo "========================================"
echo ""
echo "This wizard will help you set up Slack integration."
echo "Slack uses Socket Mode (no public URL needed)."
echo ""

# Check if .env exists
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Error: .env file not found. Create it from .env.template first." >&2
  exit 1
fi

# Load existing values
source "$PROJECT_DIR/.env" 2>/dev/null || true

echo "Step 1: Create Slack App"
echo "-----------------------"
echo "1. Go to https://api.slack.com/apps"
echo "2. Click 'Create New App' → 'From scratch'"
echo "3. Name your app (e.g., 'Geoclaw Assistant')"
echo "4. Select your workspace"
echo "5. Click 'Create App'"
echo ""
read -p "Press Enter when you've created the app..."

echo ""
echo "Step 2: Enable Socket Mode"
echo "--------------------------"
echo "1. In left sidebar, click 'Socket Mode'"
echo "2. Toggle 'Enable Socket Mode' ON"
echo "3. Click 'Generate Token'"
echo "4. Add scope: connections:write"
echo "5. Copy the App-Level Token (starts with xapp-)"
echo ""
read -p "Enter your App-Level Token (xapp-...): " SLACK_APP_TOKEN

echo ""
echo "Step 3: Configure Bot Token Scopes"
echo "----------------------------------"
echo "1. In left sidebar, click 'OAuth & Permissions'"
echo "2. Under 'Bot Token Scopes', add these scopes:"
echo "   - channels:history"
echo "   - channels:read"
echo "   - chat:write"
echo "   - groups:history"
echo "   - groups:read"
echo "   - im:history"
echo "   - im:read"
echo "   - im:write"
echo "   - users:read"
echo ""
read -p "Press Enter when scopes are added..."

echo ""
echo "Step 4: Subscribe to Bot Events"
echo "-------------------------------"
echo "1. In left sidebar, click 'Event Subscriptions'"
echo "2. Toggle 'Enable Events' ON"
echo "3. Under 'Subscribe to bot events', add:"
echo "   - message.channels"
echo "   - message.groups"
echo "   - message.im"
echo ""
read -p "Press Enter when events are subscribed..."

echo ""
echo "Step 5: Install App to Workspace"
echo "--------------------------------"
echo "1. In left sidebar, click 'Install App'"
echo "2. Click 'Install to Workspace'"
echo "3. Authorize the app"
echo "4. Copy the Bot User OAuth Token (starts with xoxb-)"
echo ""
read -p "Enter your Bot Token (xoxb-...): " SLACK_BOT_TOKEN

echo ""
echo "Step 6: Update Configuration"
echo "----------------------------"

# Update .env file
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"

# Create backup
cp "$ENV_FILE" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Update or add Slack variables
update_env_var() {
  local var_name="$1"
  local var_value="$2"
  
  if grep -q "^$var_name=" "$ENV_FILE"; then
    # Update existing
    sed -i.bak "s|^$var_name=.*|$var_name=$var_value|" "$ENV_FILE"
  else
    # Add new
    echo "$var_name=$var_value" >> "$ENV_FILE"
  fi
}

update_env_var "GEOCLAW_SLACK_ENABLED" "true"
update_env_var "GEOCLAW_SLACK_BOT_TOKEN" "$SLACK_BOT_TOKEN"
update_env_var "GEOCLAW_SLACK_APP_TOKEN" "$SLACK_APP_TOKEN"

# Clean up backup file
rm -f "$ENV_FILE.bak"

echo ""
echo "Configuration updated!"
echo ""

echo "Step 7: Add Bot to Channels"
echo "---------------------------"
echo "1. In Slack, right-click a channel → 'View channel details'"
echo "2. Click 'Integrations' → 'Add apps'"
echo "3. Search for your app and add it"
echo "4. Repeat for each channel you want the bot in"
echo ""
echo "To get Channel ID:"
echo "- Web URL: https://app.slack.com/client/T.../C0123456789"
echo "  The 'C0123456789' part is the channel ID"
echo "- Desktop: Right-click channel → 'Copy link'"
echo "  Last segment is channel ID"
echo ""

echo "Step 8: Test Connection"
echo "-----------------------"
echo "1. Restart Geoclaw: ./scripts/run.sh"
echo "2. Send message in Slack channel:"
echo "   - For main channel: Any message"
echo "   - For non-main: @geoclaw hello"
echo "3. Check logs: tail -f logs/geoclaw.log"
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Review Slack app configuration"
echo "2. Test bot responses"
echo "3. Configure channel-specific settings if needed"
echo ""
echo "For troubleshooting, see:"
echo "- references/slack-setup.md"
echo "- Slack API logs at api.slack.com"
echo ""
