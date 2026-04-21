#!/usr/bin/env bash
# Signal Setup Assistant for Geoclaw
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Geoclaw Signal Setup Assistant"
echo "========================================"
echo ""
echo "This assistant will help you set up Signal integration."
echo "Signal uses signal-cli and requires pairing for security."
echo ""

# Check if .env exists
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Error: .env file not found. Create it from .env.template first." >&2
  exit 1
fi

# Check signal-cli installation
check_signal_cli() {
  if command -v signal-cli &>/dev/null; then
    echo "✓ signal-cli found: $(signal-cli --version 2>/dev/null || echo 'version unknown')"
    return 0
  else
    echo "✗ signal-cli not found in PATH"
    return 1
  fi
}

echo "Step 1: Check signal-cli Installation"
echo "-------------------------------------"
if ! check_signal_cli; then
  echo ""
  echo "Install signal-cli using one of these methods:"
  echo ""
  echo "Option A: Homebrew (macOS)"
  echo "  brew install signal-cli"
  echo ""
  echo "Option B: Native Linux"
  echo "  VERSION=\$(curl -Ls -o /dev/null -w %{url_effective} https://github.com/AsamK/signal-cli/releases/latest | sed -e 's/^.*\\/v//')"
  echo "  curl -L -O \"https://github.com/AsamK/signal-cli/releases/download/v\${VERSION}/signal-cli-\${VERSION}-Linux-native.tar.gz\""
  echo "  sudo tar xf \"signal-cli-\${VERSION}-Linux-native.tar.gz\" -C /opt"
  echo "  sudo ln -sf /opt/signal-cli-\${VERSION}/bin/signal-cli /usr/local/bin/"
  echo ""
  echo "Option C: JVM Build (cross-platform)"
  echo "  # Install Java first"
  echo "  VERSION=\$(curl -Ls -o /dev/null -w %{url_effective} https://github.com/AsamK/signal-cli/releases/latest | sed -e 's/^.*\\/v//')"
  echo "  curl -L -O \"https://github.com/AsamK/signal-cli/releases/download/v\${VERSION}/signal-cli-\${VERSION}.tar.gz\""
  echo "  sudo tar xf \"signal-cli-\${VERSION}.tar.gz\" -C /opt"
  echo "  sudo ln -sf /opt/signal-cli-\${VERSION}/bin/signal-cli /usr/local/bin/"
  echo ""
  read -p "Install signal-cli now? (y/N): " INSTALL_NOW
  if [[ "$INSTALL_NOW" =~ ^[Yy]$ ]]; then
    echo "Please install signal-cli using one of the methods above, then run this script again."
    exit 1
  else
    echo "Please install signal-cli manually and run this script again."
    exit 1
  fi
fi

echo ""
echo "Step 2: Choose Setup Method"
echo "---------------------------"
echo "Method 1: QR Link (Use existing Signal account)"
echo "  - Best if you want to use your personal Signal account"
echo "  - Doesn't interfere with phone app"
echo "  - No SMS verification needed"
echo ""
echo "Method 2: SMS Register (Dedicated bot number)"
echo "  - Best if you want a separate bot number"
echo "  - Requires phone number that can receive SMS"
echo "  - May require captcha"
echo ""
read -p "Choose method (1 or 2): " METHOD

case "$METHOD" in
  1)
    echo ""
    echo "Method 1: QR Link"
    echo "----------------"
    echo "1. Generate QR code with: signal-cli link -n \"Geoclaw\""
    echo "2. Open Signal on your phone"
    echo "3. Go to Settings → Linked Devices → Link New Device"
    echo "4. Scan the QR code"
    echo "5. The linked device appears as 'Geoclaw'"
    echo ""
    read -p "Generate QR code now? (y/N): " GENERATE_QR
    if [[ "$GENERATE_QR" =~ ^[Yy]$ ]]; then
      signal-cli link -n "Geoclaw"
    fi
    echo ""
    read -p "Enter the phone number for this Signal account (E.164 format, e.g., +15551234567): " SIGNAL_NUMBER
    ;;
  2)
    echo ""
    echo "Method 2: SMS Register"
    echo "---------------------"
    echo "⚠️  Important: Use a DEDICATED bot number, not your personal number."
    echo "Registering a phone number with signal-cli can de-authenticate the Signal app on your phone."
    echo ""
    read -p "Enter dedicated bot phone number (E.164 format, e.g., +15551234567): " SIGNAL_NUMBER
    
    echo ""
    echo "Registering number: $SIGNAL_NUMBER"
    echo "If captcha is required:"
    echo "1. Open https://signalcaptchas.org/registration/generate.html"
    echo "2. Complete captcha, copy signalcaptcha://... link"
    echo "3. Run: signal-cli -a $SIGNAL_NUMBER register --captcha 'signalcaptcha://...'"
    echo ""
    
    read -p "Ready to register? (y/N): " REGISTER_NOW
    if [[ "$REGISTER_NOW" =~ ^[Yy]$ ]]; then
      echo "Starting registration..."
      signal-cli -a "$SIGNAL_NUMBER" register
      
      echo ""
      echo "Check your SMS for verification code"
      read -p "Enter verification code: " VERIFICATION_CODE
      signal-cli -a "$SIGNAL_NUMBER" verify "$VERIFICATION_CODE"
      
      echo "Registration complete!"
    else
      echo "Please register manually with: signal-cli -a $SIGNAL_NUMBER register"
      echo "Then verify with: signal-cli -a $SIGNAL_NUMBER verify <CODE>"
    fi
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "Step 3: Update Configuration"
echo "----------------------------"

# Update .env file
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"

# Create backup
cp "$ENV_FILE" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Update or add Signal variables
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

update_env_var "GEOCLAW_SIGNAL_ENABLED" "true"
update_env_var "GEOCLAW_SIGNAL_ACCOUNT" "$SIGNAL_NUMBER"
update_env_var "GEOCLAW_SIGNAL_CLI_PATH" "signal-cli"

# Clean up backup file

echo ""
echo "Configuration updated!"
echo ""

echo "Step 4: Test Connection"
echo "-----------------------"
echo "1. Start Geoclaw: ./scripts/run.sh"
echo "2. From your phone, send a message to $SIGNAL_NUMBER"
echo "3. Check for pairing code: geoclaw pairing list signal"
echo "4. Approve pairing: geoclaw pairing approve signal <CODE>"
echo "5. Send another message - bot should respond"
echo ""

echo "Step 5: Pairing Management"
echo "--------------------------"
echo "To manage pairings:"
echo "- List pending: geoclaw pairing list signal"
echo "- Approve: geoclaw pairing approve signal <CODE>"
echo "- Remove: geoclaw pairing remove signal <NUMBER>"
echo ""
echo "For automatic approval of specific numbers, edit geoclaw.config.yml:"
echo "  channels:"
echo "    signal:"
echo "      dmPolicy: allowlist"
echo "      allowFrom:"
echo "        - +15557654321"
echo "        - +15558887766"
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Test Signal messaging"
echo "2. Configure group chats if needed"
echo "3. Set up backups for signal-cli data"
echo ""
echo "Important notes:"
echo "- signal-cli data is stored in ~/.local/share/signal-cli/data/"
echo "- Back up this directory before server migration"
echo "- Use dedicated bot numbers for production"
echo ""
echo "For troubleshooting, see:"
echo "- references/signal-setup.md"
echo "- signal-cli wiki: https://github.com/AsamK/signal-cli/wiki"
echo ""
