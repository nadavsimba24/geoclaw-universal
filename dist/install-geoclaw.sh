#!/usr/bin/env bash
# Geoclaw v3.0 Installation Script
set -euo pipefail

print_success() {
  echo -e "\033[0;32m✓ $1\033[0m"
}

print_info() {
  echo -e "\033[1;33mℹ $1\033[0m"
}

print_error() {
  echo -e "\033[0;31m✗ $1\033[0m"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Geoclaw v3.0 - Universal Agent Platform         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "This will install Geoclaw v3.0 with complete automation ecosystem."
echo ""

# Check dependencies
print_info "Checking dependencies..."

if ! command -v node &> /dev/null; then
  print_error "Node.js is required but not installed."
  echo "Install Node.js from: https://nodejs.org/"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  print_error "npm is required but not installed."
  exit 1
fi

print_success "Dependencies checked"

# Extract package
print_info "Extracting Geoclaw..."
TEMP_DIR=$(mktemp -d)
tar -xzf geoclaw-universal-v3.0.tar.gz -C "$TEMP_DIR"
cd "$TEMP_DIR/geoclaw-universal-v3.0"

# Install npm dependencies
print_info "Installing npm dependencies..."
npm install --production
print_success "Dependencies installed"

# Create new Geoclaw instance
print_info "Creating new Geoclaw instance..."
read -p "Enter project name [my-geoclaw]: " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-my-geoclaw}

# Run bootstrap
./scripts/geoclaw_init_universal.sh --name "$PROJECT_NAME"

print_success "Geoclaw v3.0 installed successfully!"
echo ""
echo "Next steps:"
echo "1. cd $PROJECT_NAME"
echo "2. ./scripts/setup-wizard-complete.sh"
echo "3. ./scripts/run.sh"
echo ""
echo "Learn more:"
echo "• ./scripts/educational-commands-complete.sh"
echo "• Read references/magic-workflows.md"
echo ""
echo "Welcome to the future of agent automation! 🎭"
