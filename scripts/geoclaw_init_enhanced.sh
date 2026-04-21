#!/usr/bin/env bash
# geoclaw_init_enhanced.sh - bootstrap Geoclaw v2.0 with multi-channel support
set -euo pipefail

PROJECT_NAME="geoclaw-enhanced"
PROJECT_DIR=""
UPGRADE_MODE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: geoclaw_init_enhanced.sh [options]

Options:
  --name NAME        Project name (default: geoclaw-enhanced)
  --path PATH        Absolute path to create project (default: current dir)
  --upgrade          Upgrade existing v1.0 project to v2.0
  --help             Show this help

Creates an enhanced Geoclaw agent directory with:
  * geoclaw.config.yml with multi-channel support (Telegram, WhatsApp, Slack, Signal)
  * .env.template with all channel secrets
  * scripts/run.sh - CLI runtime helper
  * scripts/run-container.sh - Container runtime helper (optional)
  * scripts/setup-slack.sh - Slack setup wizard
  * scripts/setup-signal.sh - Signal setup assistant
  * scripts/org_intake.sh - Organization questionnaire

Requirements: openclaw CLI, python3, node16+, bash.
Optional: Docker/Apple Container for container mode, signal-cli for Signal.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      PROJECT_NAME="$2"; shift 2;;
    --path)
      PROJECT_DIR="$2"; shift 2;;
    --upgrade)
      UPGRADE_MODE=true; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$PWD/$PROJECT_NAME"
else
  PROJECT_DIR="$PROJECT_DIR/$PROJECT_NAME"
fi

command -v openclaw &>/dev/null || { echo "openclaw CLI not found in PATH" >&2; exit 1; }

if [[ "$UPGRADE_MODE" == true ]]; then
  echo "[geoclaw] Upgrading existing project to v2.0..."
  if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "Error: Project directory $PROJECT_DIR not found" >&2
    exit 1
  fi
  
  # Backup existing files
  BACKUP_DIR="$PROJECT_DIR/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  cp -f "$PROJECT_DIR/.env" "$BACKUP_DIR/.env" 2>/dev/null || true
  cp -f "$PROJECT_DIR/geoclaw.config.yml" "$BACKUP_DIR/geoclaw.config.yml" 2>/dev/null || true
  
  echo "Backup created at: $BACKUP_DIR"
else
  echo "[geoclaw] Creating new enhanced project at $PROJECT_DIR"
  mkdir -p "$PROJECT_DIR"
fi

# Create enhanced .env.template
cat >"$PROJECT_DIR/.env.template" <<'ENV'
# Geoclaw v2.0 Environment Template
# Copy to .env and fill real values

# ===== Core Configuration =====
GEOCLAW_AGENT_NAME=geoclaw-agent
GEOCLAW_RUNTIME_MODE=cli  # cli, docker, apple-container
GEOCLAW_LOG_LEVEL=info
GEOCLAW_HEARTBEAT_MINUTES=15

# ===== Model Configuration =====
GEOCLAW_MODEL_PROVIDER=custom-api-deepseek-com
GEOCLAW_MODEL_NAME=deepseek-chat
GEOCLAW_MODEL_API_KEY=sk-...

# ===== Telegram Configuration =====
GEOCLAW_TELEGRAM_ENABLED=false
GEOCLAW_TELEGRAM_BOT_TOKEN=

# ===== WhatsApp Configuration =====
GEOCLAW_WHATSAPP_ENABLED=false
GEOCLAW_WHATSAPP_PHONE_NUMBER_ID=
GEOCLAW_WHATSAPP_CLOUD_TOKEN=
GEOCLAW_WHATSAPP_VERIFY_TOKEN=

# ===== Slack Configuration =====
GEOCLAW_SLACK_ENABLED=false
GEOCLAW_SLACK_BOT_TOKEN=xoxb-...
GEOCLAW_SLACK_APP_TOKEN=xapp-...

# ===== Signal Configuration =====
GEOCLAW_SIGNAL_ENABLED=false
GEOCLAW_SIGNAL_ACCOUNT=+15551234567
GEOCLAW_SIGNAL_CLI_PATH=signal-cli

# ===== Monday.com Configuration =====
GEOCLAW_MONDAY_ENABLED=false
GEOCLAW_MONDAY_API_TOKEN=
GEOCLAW_MONDAY_API_VERSION=v2
GEOCLAW_MONDAY_DEFAULT_BOARD_ID=
GEOCLAW_MONDAY_WEBHOOK_SECRET=

# ===== Salesforce Configuration =====
GEOCLAW_SALESFORCE_ENABLED=false
GEOCLAW_SALESFORCE_AUTH_TYPE=oauth2  # oauth2 or username_password
GEOCLAW_SALESFORCE_CONSUMER_KEY=
GEOCLAW_SALESFORCE_CONSUMER_SECRET=
GEOCLAW_SALESFORCE_USERNAME=
GEOCLAW_SALESFORCE_PASSWORD=
GEOCLAW_SALESFORCE_SECURITY_TOKEN=
GEOCLAW_SALESFORCE_LOGIN_URL=https://login.salesforce.com
GEOCLAW_SALESFORCE_API_VERSION=v58.0
GEOCLAW_SALESFORCE_WEBHOOK_TOKEN=

# ===== Security Configuration =====
GEOCLAW_ONECLI_ENABLED=false
GEOCLAW_WORKSPACE_PATH=./workspace

# ===== Container Configuration (if using docker/apple-container) =====
GEOCLAW_DOCKER_IMAGE=geoclaw-agent:latest
GEOCLAW_CONTAINER_MEMORY_LIMIT=512m
GEOCLAW_CONTAINER_CPU_LIMIT=1.0
ENV

# Create enhanced config file
cat >"$PROJECT_DIR/geoclaw.config.yml" <<'YAML'
# Geoclaw v2.0 Configuration
# All values reference environment variables for security

agent:
  name: ${GEOCLAW_AGENT_NAME:-geoclaw-agent}
  model:
    provider: ${GEOCLAW_MODEL_PROVIDER:-custom-api-deepseek-com}
    name: ${GEOCLAW_MODEL_NAME:-deepseek-chat}
    apiKeyEnv: GEOCLAW_MODEL_API_KEY
  skills:
    # Install lightweight .skill bundles and list them here
    - gemini
    - weather
    - nano-pdf
    # Add more as needed: openai-whisper, github, etc.

runtime:
  mode: ${GEOCLAW_RUNTIME_MODE:-cli}  # cli, docker, apple-container
  heartbeatMinutes: ${GEOCLAW_HEARTBEAT_MINUTES:-15}
  
channels:
  telegram:
    enabled: ${GEOCLAW_TELEGRAM_ENABLED:-false}
    botTokenEnv: GEOCLAW_TELEGRAM_BOT_TOKEN
    
  whatsapp:
    enabled: ${GEOCLAW_WHATSAPP_ENABLED:-false}
    phoneNumberIdEnv: GEOCLAW_WHATSAPP_PHONE_NUMBER_ID
    cloudTokenEnv: GEOCLAW_WHATSAPP_CLOUD_TOKEN
    verifyTokenEnv: GEOCLAW_WHATSAPP_VERIFY_TOKEN
    
  slack:
    enabled: ${GEOCLAW_SLACK_ENABLED:-false}
    botTokenEnv: GEOCLAW_SLACK_BOT_TOKEN
    appTokenEnv: GEOCLAW_SLACK_APP_TOKEN
    trigger: "@${GEOCLAW_AGENT_NAME:-geoclaw}"
    
  signal:
    enabled: ${GEOCLAW_SIGNAL_ENABLED:-false}
    accountEnv: GEOCLAW_SIGNAL_ACCOUNT
    cliPath: ${GEOCLAW_SIGNAL_CLI_PATH:-signal-cli}
    dmPolicy: pairing  # pairing, allowlist, open, disabled
    autoStart: true

security:
  onecli:
    enabled: ${GEOCLAW_ONECLI_ENABLED:-false}
  mountAllowlist:
    - ${GEOCLAW_WORKSPACE_PATH:-./workspace}
    - ./data

logging:
  level: ${GEOCLAW_LOG_LEVEL:-info}
  file: ./logs/geoclaw.log
  maxSize: 10M
  maxFiles: 5
YAML

# Create scripts directory
mkdir -p "$PROJECT_DIR/scripts"

# Create enhanced run.sh
cat >"$PROJECT_DIR/scripts/run.sh" <<'RUN'
#!/usr/bin/env bash
# Geoclaw v2.0 CLI Runtime
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment
if [[ -f "$PROJECT_DIR/.env" ]]; then
  source "$PROJECT_DIR/.env"
else
  echo "Error: .env file not found at $PROJECT_DIR/.env" >&2
  echo "Copy .env.template to .env and fill in your secrets" >&2
  exit 1
fi

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Check runtime mode
RUNTIME_MODE="${GEOCLAW_RUNTIME_MODE:-cli}"
echo "[geoclaw] Starting in $RUNTIME_MODE mode..."

case "$RUNTIME_MODE" in
  cli)
    # CLI mode - direct execution
    exec openclaw agent run --config "$PROJECT_DIR/geoclaw.config.yml" --cli "$@"
    ;;
  docker)
    # Docker mode - requires docker
    if ! command -v docker &>/dev/null; then
      echo "Error: Docker not found. Install Docker or switch to cli mode." >&2
      exit 1
    fi
    exec "$SCRIPT_DIR/run-container.sh" "$@"
    ;;
  apple-container)
    # Apple Container mode - macOS only
    if [[ "$(uname)" != "Darwin" ]]; then
      echo "Error: Apple Container is only available on macOS" >&2
      exit 1
    fi
    if ! command -v container &>/dev/null; then
      echo "Error: Apple Container not found. Install with: brew install container" >&2
      exit 1
    fi
    exec "$SCRIPT_DIR/run-container.sh" "$@"
    ;;
  *)
    echo "Error: Unknown runtime mode: $RUNTIME_MODE" >&2
    echo "Valid modes: cli, docker, apple-container" >&2
    exit 1
    ;;
esac
RUN
chmod +x "$PROJECT_DIR/scripts/run.sh"

# Create container runner script
cat >"$PROJECT_DIR/scripts/run-container.sh" <<'CONTAINER'
#!/usr/bin/env bash
# Geoclaw Container Runtime
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment
source "$PROJECT_DIR/.env"

RUNTIME_MODE="${GEOCLAW_RUNTIME_MODE:-cli}"
CONTAINER_IMAGE="${GEOCLAW_DOCKER_IMAGE:-geoclaw-agent:latest}"

# Build container image if needed
build_docker_image() {
  echo "[geoclaw] Building Docker image: $CONTAINER_IMAGE"
  
  cat >"$PROJECT_DIR/Dockerfile" <<'DOCKERFILE'
FROM node:22-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
DOCKERFILE

  docker build -t "$CONTAINER_IMAGE" "$PROJECT_DIR"
}

run_docker_container() {
  echo "[geoclaw] Starting Docker container..."
  
  # Mount workspace and data directories
  MOUNTS=""
  if [[ -d "$PROJECT_DIR/workspace" ]]; then
    MOUNTS="$MOUNTS -v $PROJECT_DIR/workspace:/app/workspace"
  fi
  if [[ -d "$PROJECT_DIR/data" ]]; then
    MOUNTS="$MOUNTS -v $PROJECT_DIR/data:/app/data"
  fi
  
  # Set resource limits
  RESOURCE_LIMITS=""
  if [[ -n "${GEOCLAW_CONTAINER_MEMORY_LIMIT:-}" ]]; then
    RESOURCE_LIMITS="$RESOURCE_LIMITS --memory=${GEOCLAW_CONTAINER_MEMORY_LIMIT}"
  fi
  if [[ -n "${GEOCLAW_CONTAINER_CPU_LIMIT:-}" ]]; then
    RESOURCE_LIMITS="$RESOURCE_LIMITS --cpus=${GEOCLAW_CONTAINER_CPU_LIMIT}"
  fi
  
  # Run container
  docker run -d --rm \
    --name geoclaw-agent \
    $MOUNTS \
    $RESOURCE_LIMITS \
    --env-file "$PROJECT_DIR/.env" \
    -p 3000:3000 \
    "$CONTAINER_IMAGE"
    
  echo "[geoclaw] Container started. Logs: docker logs -f geoclaw-agent"
}

run_apple_container() {
  echo "[geoclaw] Starting Apple Container..."
  
  # Create container configuration
  cat >"$PROJECT_DIR/container.yaml" <<'CONFIG'
version: "1.0"
image:
  from: node:22-alpine
  entrypoint: ["node", "dist/index.js"]
mounts:
  - type: bind
    source: ./workspace
    target: /app/workspace
    readOnly: false
  - type: bind
    source: ./data
    target: /app/data
    readOnly: false
resources:
  memory: 512Mi
  cpu: 1
CONFIG
  
  container run --config "$PROJECT_DIR/container.yaml"
}

case "$RUNTIME_MODE" in
  docker)
    if ! docker image inspect "$CONTAINER_IMAGE" &>/dev/null; then
      build_docker_image
    fi
    run_docker_container
    ;;
  apple-container)
    run_apple_container
    ;;
  *)
    echo "Error: Container mode not supported for runtime: $RUNTIME_MODE" >&2
    exit 1
    ;;
esac
CONTAINER
chmod +x "$PROJECT_DIR/scripts/run-container.sh"

# Create Slack setup script
cat >"$PROJECT_DIR/scripts/setup-slack.sh" <<'SLACK'
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
if grep -q "GEOCLAW_SLACK_" "$PROJECT_DIR/.env"; then
  # Update existing values
  sed -i.bak "s|GEOCLAW_SLACK_BOT_TOKEN=.*|GEOC