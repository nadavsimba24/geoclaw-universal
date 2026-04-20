#!/usr/bin/env bash
# geoclaw_init.sh - bootstrap a lightweight OpenClaw agent with Telegram + WhatsApp connectors
set -euo pipefail

PROJECT_NAME="geoclaw-instance"
PROJECT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: geoclaw_init.sh [--name project-name] [--path /absolute/path]

Creates a minimal Geoclaw agent directory with:
  * geoclaw.config.yml referencing env vars only
  * .env.template listing required secrets
  * scripts/run.sh helper to launch the CLI runtime
  * scripts/org_intake.sh questionnaire for org goals/tasks

Requirements: openclaw CLI, python3, node16+, bash.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      PROJECT_NAME="$2"; shift 2;;
    --path)
      PROJECT_DIR="$2"; shift 2;;
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
mkdir -p "$PROJECT_DIR"

cat >"$PROJECT_DIR/.env.template" <<'ENV'
# Copy to .env and fill real values
GEOCLAW_MODEL_PROVIDER=openai
GEOCLAW_MODEL_NAME=gpt-4o-mini
GEOCLAW_MODEL_API_KEY=sk-...
GEOCLAW_TELEGRAM_BOT_TOKEN=
GEOCLAW_WHATSAPP_PHONE_ID=
GEOCLAW_WHATSAPP_CLOUD_TOKEN=
GEOCLAW_WHATSAPP_VERIFY_TOKEN=
ENV

cat >"$PROJECT_DIR/geoclaw.config.yml" <<'YAML'
agent:
  name: geoclaw
  model:
    provider: ${GEOCLAW_MODEL_PROVIDER}
    name: ${GEOCLAW_MODEL_NAME}
    apiKeyEnv: GEOCLAW_MODEL_API_KEY
  skills:
    # install lightweight .skill bundles and list them here
    - gemini
    - weather
    - nano-pdf
runtime:
  mode: cli
  heartbeatMinutes: 15
channels:
  telegram:
    enabled: true
    botTokenEnv: GEOCLAW_TELEGRAM_BOT_TOKEN
  whatsapp:
    enabled: true
    phoneNumberIdEnv: GEOCLAW_WHATSAPP_PHONE_ID
    cloudTokenEnv: GEOCLAW_WHATSAPP_CLOUD_TOKEN
    verifyTokenEnv: GEOCLAW_WHATSAPP_VERIFY_TOKEN
logging:
  level: info
YAML

mkdir -p "$PROJECT_DIR/scripts"
cat >"$PROJECT_DIR/scripts/run.sh" <<'RUN'
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../.env"
openclaw agent run --config geoclaw.config.yml --cli "$@"
RUN
chmod +x "$PROJECT_DIR/scripts/run.sh"

if [[ -f "$SCRIPT_DIR/org_intake.sh" ]]; then
  cp "$SCRIPT_DIR/org_intake.sh" "$PROJECT_DIR/scripts/org_intake.sh"
  chmod +x "$PROJECT_DIR/scripts/org_intake.sh"
fi

cat <<EOF
[geoclaw] Created project at $PROJECT_DIR
Next steps:
1. cp $PROJECT_DIR/.env.template $PROJECT_DIR/.env && fill secrets.
2. ./scripts/org_intake.sh to capture the org goals/tasks -> org-profile.yaml.
3. (Optional) openclaw skills install <bundle>.skill && list them under agent.skills.
4. ./scripts/run.sh to launch the micro agent.
EOF
