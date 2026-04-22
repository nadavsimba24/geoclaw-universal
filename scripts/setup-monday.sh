#!/usr/bin/env bash
# Monday.com Setup Wizard for Geoclaw
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Cross-platform in-place sed
_sedi() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

echo "========================================"
echo "Geoclaw Monday.com Setup Wizard"
echo "========================================"
echo ""
echo "This wizard will help you set up Monday.com integration."
echo "Monday.com is a project management platform with API access."
echo ""

# Check if .env exists
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Error: .env file not found. Create it from .env.template first." >&2
  exit 1
fi

# Load existing values
source "$PROJECT_DIR/.env" 2>/dev/null || true

echo "Step 1: Get Monday.com API Token"
echo "--------------------------------"
echo "1. Log in to Monday.com"
echo "2. Click your profile picture → Admin"
echo "3. Go to the API section"
echo "4. Click 'Generate new token'"
echo "5. Copy the token"
echo ""
read -p "Enter your Monday.com API Token: " MONDAY_TOKEN

echo ""
echo "Step 2: Test API Access"
echo "-----------------------"
echo "Testing API connectivity..."
echo ""

# Test API access
TEST_RESPONSE=$(curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { name email } }"}')

if echo "$TEST_RESPONSE" | grep -q "error"; then
  echo "❌ API test failed. Please check your token and try again."
  echo "Response: $TEST_RESPONSE"
  exit 1
else
  echo "✅ API test successful!"
  USER_NAME=$(echo "$TEST_RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
  USER_EMAIL=$(echo "$TEST_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
  echo "   User: $USER_NAME ($USER_EMAIL)"
fi

echo ""
echo "Step 3: Get Board IDs"
echo "---------------------"
echo "Fetching your boards..."
echo ""

# Get boards
BOARDS_RESPONSE=$(curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ boards(limit: 10) { id name } }"}')

if echo "$BOARDS_RESPONSE" | grep -q '"boards":'; then
  echo "📋 Your boards:"
  echo "$BOARDS_RESPONSE" | grep -o '"id":[^,]*,"name":"[^"]*"' | while read -r board; do
    BOARD_ID=$(echo "$board" | grep -o '"id":[^,]*' | cut -d':' -f2)
    BOARD_NAME=$(echo "$board" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    echo "   • $BOARD_NAME (ID: $BOARD_ID)"
  done
else
  echo "No boards found or error fetching boards."
fi

echo ""
echo "Step 4: Set Default Board (Optional)"
echo "------------------------------------"
echo "You can set a default board for quick operations."
echo "Leave blank if you don't want a default board."
echo ""
read -p "Enter default board ID (or press Enter to skip): " DEFAULT_BOARD

echo ""
echo "Step 5: Configure Webhooks (Optional)"
echo "-------------------------------------"
echo "Webhooks allow Monday.com to notify Geoclaw of changes."
echo "You'll need a public URL for your Geoclaw instance."
echo ""
read -p "Set up webhooks? (y/N): " SETUP_WEBHOOKS

if [[ "$SETUP_WEBHOOKS" =~ ^[Yy]$ ]]; then
  echo ""
  echo "To set up webhooks:"
  echo "1. Go to a board → Integrations → Webhooks"
  echo "2. Click 'Add webhook'"
  echo "3. Set URL: https://your-geoclaw-server.com/webhooks/monday"
  echo "4. Choose events (item created, updated, etc.)"
  echo "5. Copy webhook secret"
  echo ""
  read -p "Enter webhook secret (or press Enter to skip): " WEBHOOK_SECRET
fi

echo ""
echo "Step 6: Update Configuration"
echo "----------------------------"

# Update .env file
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"

# Create backup
cp "$ENV_FILE" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Update or add Monday.com variables
update_env_var() {
  local var_name="$1"
  local var_value="$2"
  
  if grep -q "^$var_name=" "$ENV_FILE"; then
    # Update existing
    _sedi "s|^$var_name=.*|$var_name=$var_value|" "$ENV_FILE"
  else
    # Add new
    echo "$var_name=$var_value" >> "$ENV_FILE"
  fi
}

update_env_var "GEOCLAW_MONDAY_ENABLED" "true"
update_env_var "GEOCLAW_MONDAY_API_TOKEN" "$MONDAY_TOKEN"

if [[ -n "$DEFAULT_BOARD" ]]; then
  update_env_var "GEOCLAW_MONDAY_DEFAULT_BOARD_ID" "$DEFAULT_BOARD"
fi

if [[ -n "$WEBHOOK_SECRET" ]]; then
  update_env_var "GEOCLAW_MONDAY_WEBHOOK_SECRET" "$WEBHOOK_SECRET"
fi

# Clean up backup file

echo ""
echo "Configuration updated!"
echo ""

echo "Step 7: Test Integration"
echo "------------------------"
echo "1. Restart Geoclaw: ./scripts/run.sh"
echo "2. Test commands:"
echo "   - @geoclaw list Monday.com boards"
echo "   - @geoclaw show tasks from board [BOARD_ID]"
echo "   - @geoclaw create task 'Test task' on board [BOARD_ID]"
echo "3. Check logs: tail -f logs/geoclaw.log"
echo ""

echo "Common Monday.com Commands:"
echo "---------------------------"
echo "• List boards: @geoclaw Monday.com boards"
echo "• Create task: @geoclaw create task 'Task name' on board [ID]"
echo "• Get board items: @geoclaw show board [ID] items"
echo "• Post update: @geoclaw comment on item [ITEM_ID] 'Comment text'"
echo "• Search: @geoclaw search Monday.com for 'search term'"
echo ""

echo "Step 8: Advanced Configuration (Optional)"
echo "-----------------------------------------"
echo "For advanced configuration, edit geoclaw.config.yml:"
echo ""
echo "integrations:"
echo "  monday:"
echo "    boards:"
echo "      marketing:"
echo "        id: 1234567890"
echo "        columns:"
echo "          status: \"status\""
echo "          assignee: \"person\""
echo "          due_date: \"date\""
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Test basic operations"
echo "2. Configure board mappings if needed"
echo "3. Set up webhooks for real-time updates"
echo "4. Create custom workflows"
echo ""
echo "For troubleshooting, see:"
echo "- references/monday-setup.md"
echo "- Monday.com API docs: https://developer.monday.com/api-reference/docs"
echo "- GraphQL playground: https://monday.com/developers/apps/playground"
echo ""
