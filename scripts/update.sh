#!/bin/bash
# Geoclaw Update Script - Upgrades to the latest published version

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
  echo ""
  echo "🔄  Geoclaw Updater"
  echo "────────────────────────────────────────────"
  echo ""
}

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error()   { echo -e "${RED}❌ $1${NC}"; }
print_info()    { echo -e "${CYAN}ℹ️  $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_section() { echo -e "\n${BLUE}▶ $1${NC}"; }

PACKAGE_NAME="geoclaw-universal"

print_banner

# ── 1. Current version ─────────────────────────────────────────────────────

print_section "Checking current version"

CURRENT_VERSION=$(npm list -g --depth=0 --json 2>/dev/null \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); \
             const p=JSON.parse(d); \
             const dep=p.dependencies && p.dependencies['$PACKAGE_NAME']; \
             console.log(dep ? dep.version : 'unknown');" 2>/dev/null || echo "unknown")

print_info "Installed version: ${CURRENT_VERSION}"

# ── 2. Latest version on npm ────────────────────────────────────────────────

print_section "Checking latest version on npm"

LATEST_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "")

if [[ -z "$LATEST_VERSION" ]]; then
  print_error "Could not reach npm registry. Check your internet connection."
  exit 1
fi

print_info "Latest version:    ${LATEST_VERSION}"

if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
  print_success "Already up to date (v${LATEST_VERSION})"
  echo ""
  exit 0
fi

# ── 3. Back up .env if it exists ────────────────────────────────────────────

GEOCLAW_HOME="${GEOCLAW_DIR:-$(dirname "$(dirname "$0")")}"
ENV_FILE="$GEOCLAW_HOME/.env"
ENV_BACKUP=""

if [[ -f "$ENV_FILE" ]]; then
  print_section "Backing up configuration"
  ENV_BACKUP="${ENV_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$ENV_BACKUP"
  print_success "Config backed up to: $ENV_BACKUP"
fi

# ── 4. Run the update ───────────────────────────────────────────────────────

print_section "Updating ${PACKAGE_NAME} v${CURRENT_VERSION} → v${LATEST_VERSION}"

if npm install -g "${PACKAGE_NAME}@${LATEST_VERSION}" 2>&1; then
  print_success "Update complete!"
else
  print_error "npm install failed."
  if [[ -n "$ENV_BACKUP" ]]; then
    print_info "Your config backup is safe at: $ENV_BACKUP"
  fi
  exit 1
fi

# ── 5. Restore .env ─────────────────────────────────────────────────────────

if [[ -n "$ENV_BACKUP" ]] && [[ -f "$ENV_BACKUP" ]]; then
  NEW_ENV_FILE="$(npm root -g)/${PACKAGE_NAME}/.env"
  if [[ -d "$(dirname "$NEW_ENV_FILE")" ]]; then
    cp "$ENV_BACKUP" "$NEW_ENV_FILE"
    print_success "Configuration restored"
  else
    print_warning "Could not restore config automatically."
    print_info "Your backup is at: $ENV_BACKUP"
    print_info "Copy it manually to the new install directory if needed."
  fi
fi

# ── 6. Done ─────────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────────"
print_success "Geoclaw updated to v${LATEST_VERSION}"
echo ""
print_info "Run 'geoclaw start' to launch the platform."
print_info "Run 'geoclaw status' to verify all components."
echo ""
