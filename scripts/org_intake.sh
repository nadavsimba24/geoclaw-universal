#!/usr/bin/env bash
# org_intake.sh - collect organization goals/tasks for a Geoclaw deployment
set -euo pipefail

OUT_FILE="org-profile.yaml"
if [[ "${1:-}" == "--output" && -n "${2:-}" ]]; then
  OUT_FILE="$2"
  shift 2
fi

read -rp "Organization name: " ORG_NAME
read -rp "Industry / team size: " ORG_SIZE
read -rp "Primary contact (name/email/chat): " ORG_CONTACT
read -rp "Top 3 goals for this agent: " ORG_GOALS
read -rp "Interesting tasks to automate (comma-separated): " ORG_TASKS
read -rp "Systems or APIs involved (comma-separated): " ORG_SYSTEMS
read -rp "Constraints (security/compliance/perf): " ORG_CONSTRAINTS
read -rp "Preferred chat surfaces: " ORG_SURFACES

cat >"$OUT_FILE" <<YAML
organization:
  name: "${ORG_NAME}"
  summary: "${ORG_SIZE}"
  contact: "${ORG_CONTACT}"
agent_goals: |
  ${ORG_GOALS}
candidate_tasks:
  - ${ORG_TASKS//,/\n  - }
systems:
  - ${ORG_SYSTEMS//,/\n  - }
constraints: |
  ${ORG_CONSTRAINTS}
chat_surfaces:
  - ${ORG_SURFACES//,/\n  - }
YAML

echo "[geoclaw] Saved intake to $OUT_FILE"
