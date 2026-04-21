#!/usr/bin/env bash
# Salesforce Setup Wizard for Geoclaw
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Geoclaw Salesforce Setup Wizard"
echo "========================================"
echo ""
echo "This wizard will help you set up Salesforce integration."
echo "Salesforce is a CRM platform with extensive API access."
echo ""

# Check if .env exists
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Error: .env file not found. Create it from .env.template first." >&2
  exit 1
fi

# Load existing values
source "$PROJECT_DIR/.env" 2>/dev/null || true

echo "Step 1: Choose Authentication Method"
echo "------------------------------------"
echo "1. OAuth 2.0 (Recommended for production)"
echo "   - Requires Connected App in Salesforce"
echo "   - More secure, supports refresh tokens"
echo ""
echo "2. Username-Password Flow (Development)"
echo "   - Simpler setup"
echo "   - Requires security token"
echo "   - Less secure for production"
echo ""
read -p "Choose method (1 or 2): " AUTH_METHOD

case "$AUTH_METHOD" in
  1)
    echo ""
    echo "OAuth 2.0 Setup"
    echo "---------------"
    echo "1. In Salesforce: Setup → App Manager → New Connected App"
    echo "2. Fill in:"
    echo "   - Connected App Name: Geoclaw Integration"
    echo "   - API Name: Geoclaw_Integration"
    echo "   - Contact Email: Your email"
    echo "3. Enable OAuth Settings:"
    echo "   - Callback URL: https://localhost:8080/oauth/callback"
    echo "   - Selected OAuth Scopes:"
    echo "     • Access and manage your data (api)"
    echo "     • Perform requests on your behalf at any time (refresh_token, offline_access)"
    echo "4. Save and copy Consumer Key and Consumer Secret"
    echo ""
    read -p "Enter Consumer Key: " CONSUMER_KEY
    read -p "Enter Consumer Secret: " CONSUMER_SECRET
    
    echo ""
    echo "For initial token, you'll need to:"
    echo "1. Construct authorization URL"
    echo "2. Authorize in browser"
    echo "3. Get authorization code"
    echo "4. Exchange for access/refresh tokens"
    echo ""
    echo "We'll use username-password flow for initial setup, then switch to OAuth."
    ;;
  2)
    echo ""
    echo "Username-Password Flow"
    echo "---------------------"
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "Step 2: Enter Salesforce Credentials"
echo "------------------------------------"
read -p "Salesforce Username: " SF_USERNAME
read -p "Salesforce Password: " SF_PASSWORD
echo ""
echo "Security Token:"
echo "- Get from: Email → Reset Security Token"
echo "- Or find in: Profile → Settings → Reset Security Token"
echo ""
read -p "Security Token: " SECURITY_TOKEN

echo ""
echo "Step 3: Test Authentication"
echo "---------------------------"
echo "Testing Salesforce API access..."
echo ""

# Test authentication
if [[ "$AUTH_METHOD" == "2" ]]; then
  # Username-password flow test
  TEST_RESPONSE=$(curl -s -X POST https://login.salesforce.com/services/oauth2/token \
    -d "grant_type=password" \
    -d "client_id=$CONSUMER_KEY" \
    -d "client_secret=$CONSUMER_SECRET" \
    -d "username=$SF_USERNAME" \
    -d "password=$SF_PASSWORD$SECURITY_TOKEN")
else
  # Try username-password for initial test
  TEST_RESPONSE=$(curl -s -X POST https://login.salesforce.com/services/oauth2/token \
    -d "grant_type=password" \
    -d "client_id=$CONSUMER_KEY" \
    -d "client_secret=$CONSUMER_SECRET" \
    -d "username=$SF_USERNAME" \
    -d "password=$SF_PASSWORD$SECURITY_TOKEN")
fi

if echo "$TEST_RESPONSE" | grep -q "access_token"; then
  echo "✅ Authentication successful!"
  ACCESS_TOKEN=$(echo "$TEST_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  INSTANCE_URL=$(echo "$TEST_RESPONSE" | grep -o '"instance_url":"[^"]*"' | cut -d'"' -f4)
  
  if [[ "$AUTH_METHOD" == "1" ]]; then
    REFRESH_TOKEN=$(echo "$TEST_RESPONSE" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)
    echo "   Refresh token obtained for OAuth"
  fi
  
  echo "   Instance URL: $INSTANCE_URL"
else
  echo "❌ Authentication failed."
  echo "Response: $TEST_RESPONSE"
  echo ""
  echo "Common issues:"
  echo "1. Wrong credentials"
  echo "2. Security token missing/incorrect"
  echo "3. IP not whitelisted"
  echo "4. Connected App not properly configured"
  exit 1
fi

echo ""
echo "Step 4: Test API Access"
echo "-----------------------"
echo "Testing Salesforce API..."
echo ""

# Test API call
API_TEST=$(curl -s -X GET "$INSTANCE_URL/services/data/v58.0/sobjects/Account/describe" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

if echo "$API_TEST" | grep -q '"name":"Account"'; then
  echo "✅ API access successful!"
  echo "   Can access Account object"
else
  echo "⚠️  API test had issues but continuing..."
fi

echo ""
echo "Step 5: Configure Webhooks (Optional)"
echo "-------------------------------------"
echo "Salesforce can send outbound messages for real-time updates."
echo "This requires configuring Workflow Rules in Salesforce."
echo ""
read -p "Set up webhooks? (y/N): " SETUP_WEBHOOKS

if [[ "$SETUP_WEBHOOKS" =~ ^[Yy]$ ]]; then
  echo ""
  echo "To set up webhooks:"
  echo "1. In Salesforce: Setup → Process Automation → Workflow Rules"
  echo "2. Create workflow rule on object (e.g., Case)"
  echo "3. Add Outbound Message action"
  echo "4. Set endpoint: https://your-geoclaw-server.com/webhooks/salesforce"
  echo "5. Select fields to send"
  echo "6. Set security token"
  echo ""
  read -p "Enter webhook security token: " WEBHOOK_TOKEN
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

# Update or add Salesforce variables
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

update_env_var "GEOCLAW_SALESFORCE_ENABLED" "true"
update_env_var "GEOCLAW_SALESFORCE_AUTH_TYPE" "$([ "$AUTH_METHOD" == "1" ] && echo "oauth2" || echo "username_password")"

if [[ -n "$CONSUMER_KEY" ]]; then
  update_env_var "GEOCLAW_SALESFORCE_CONSUMER_KEY" "$CONSUMER_KEY"
fi

if [[ -n "$CONSUMER_SECRET" ]]; then
  update_env_var "GEOCLAW_SALESFORCE_CONSUMER_SECRET" "$CONSUMER_SECRET"
fi

update_env_var "GEOCLAW_SALESFORCE_USERNAME" "$SF_USERNAME"
update_env_var "GEOCLAW_SALESFORCE_PASSWORD" "$SF_PASSWORD"
update_env_var "GEOCLAW_SALESFORCE_SECURITY_TOKEN" "$SECURITY_TOKEN"

if [[ -n "$INSTANCE_URL" ]]; then
  # Extract domain from instance URL
  DOMAIN=$(echo "$INSTANCE_URL" | sed 's|https://||')
  update_env_var "GEOCLAW_SALESFORCE_LOGIN_URL" "https://$DOMAIN"
fi

if [[ -n "$ACCESS_TOKEN" && "$AUTH_METHOD" == "2" ]]; then
  update_env_var "GEOCLAW_SALESFORCE_ACCESS_TOKEN" "$ACCESS_TOKEN"
fi

if [[ -n "$REFRESH_TOKEN" ]]; then
  update_env_var "GEOCLAW_SALESFORCE_REFRESH_TOKEN" "$REFRESH_TOKEN"
fi

if [[ -n "$WEBHOOK_TOKEN" ]]; then
  update_env_var "GEOCLAW_SALESFORCE_WEBHOOK_TOKEN" "$WEBHOOK_TOKEN"
fi

# Clean up backup file

echo ""
echo "Configuration updated!"
echo ""

echo "Step 7: Test Integration"
echo "------------------------"
echo "1. Restart Geoclaw: ./scripts/run.sh"
echo "2. Test commands:"
echo "   - @geoclaw Salesforce accounts"
echo "   - @geoclaw Salesforce pipeline"
echo "   - @geoclaw find contact John Doe"
echo "   - @geoclaw create opportunity 'New Deal' $50000"
echo "3. Check logs: tail -f logs/geoclaw.log"
echo ""

echo "Common Salesforce Commands:"
echo "---------------------------"
echo "• Query accounts: @geoclaw Salesforce accounts"
echo "• Sales pipeline: @geoclaw Salesforce pipeline"
echo "• Find contact: @geoclaw find contact [name/email]"
echo "• Create record: @geoclaw create contact John Doe john@example.com"
echo "• Case management: @geoclaw show cases --status New"
echo "• Chatter: @geoclaw post to chatter 'Message'"
echo ""

echo "Step 8: Object Mappings (Optional)"
echo "----------------------------------"
echo "For advanced configuration, edit geoclaw.config.yml:"
echo ""
echo "integrations:"
echo "  salesforce:"
echo "    objects:"
echo "      account:"
echo "        fields: [Id, Name, Phone, Industry, AnnualRevenue]"
echo "      opportunity:"
echo "        fields: [Id, Name, Amount, StageName, CloseDate]"
echo "      case:"
echo "        fields: [Id, CaseNumber, Subject, Status, Priority]"
echo ""

echo "Security Notes:"
echo "---------------"
echo "1. Store credentials securely (env vars, not code)"
echo "2. Use OAuth 2.0 with refresh tokens for production"
echo "3. Implement IP whitelisting in Salesforce"
echo "4. Regularly rotate credentials"
echo "5. Monitor API usage logs"
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Test basic CRM operations"
echo "2. Configure object mappings if needed"
echo "3. Set up webhooks for real-time updates"
echo "4. Create custom reports and dashboards"
echo "5. Implement error handling and retries"
echo ""
echo "For troubleshooting, see:"
echo "- references/salesforce-setup.md"
echo "- Salesforce API docs: https://developer.salesforce.com/docs"
echo "- Salesforce REST API Guide: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest"
echo "- Salesforce SOQL Guide: https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl"
echo ""
