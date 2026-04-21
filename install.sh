#!/usr/bin/env bash
# Geoclaw v3.0 - One-command installation
set -euo pipefail

echo "🚀 Installing Geoclaw v3.0 - Universal Agent Platform"
echo ""

# ── Check for Node.js ──────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required. Install it first:"
  echo "   Linux/WSL:  sudo apt install nodejs npm  OR  https://nodejs.org/"
  echo "   macOS:      brew install node             OR  https://nodejs.org/"
  echo "   Windows:    https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(parseInt(process.versions.node.split('.')[0]))")
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "❌ Node.js v20+ required (you have v$(node --version))"
  echo "   Update: https://nodejs.org/  or  nvm install 20 && nvm use 20"
  exit 1
fi
echo "✅ Node.js $(node --version)"

# ── Check for npm ──────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo "❌ npm not found. Install Node.js from https://nodejs.org/"
  exit 1
fi
echo "✅ npm $(npm --version)"
echo ""

# ── Install ────────────────────────────────────────────────────────────────
echo "📦 Installing from GitHub..."

# Detect if we need --prefix for non-root npm
if [[ ! -w "$(npm root -g 2>/dev/null)" ]] && [[ "$(uname -s)" != "Darwin" ]]; then
  # Try user-level install to avoid needing sudo
  NPM_PREFIX="${HOME}/.npm-global"
  mkdir -p "$NPM_PREFIX"
  npm config set prefix "$NPM_PREFIX" 2>/dev/null || true

  # Add to PATH if not already there
  if [[ ":$PATH:" != *":$NPM_PREFIX/bin:"* ]]; then
    SHELL_RC="${HOME}/.bashrc"
    [[ -f "${HOME}/.zshrc" ]] && SHELL_RC="${HOME}/.zshrc"
    echo "export PATH=\"$NPM_PREFIX/bin:\$PATH\"" >> "$SHELL_RC"
    export PATH="$NPM_PREFIX/bin:$PATH"
    echo "ℹ️  Added $NPM_PREFIX/bin to PATH in $SHELL_RC"
    echo "   Restart your terminal or run: source $SHELL_RC"
    echo ""
  fi
fi

npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"

echo ""
echo "✅ Geoclaw v3.0 installed!"
echo ""
echo "📋 Next steps:"
echo "   geoclaw doctor    # Check system requirements"
echo "   geoclaw setup     # Interactive setup wizard"
echo "   geoclaw start     # Start the platform"
echo ""
echo "🎭 Learn about components:"
echo "   geoclaw learn mcporter    # MCP server discovery"
echo "   geoclaw learn n8n         # Workflow automation"
echo "   geoclaw learn qgis        # Geospatial analysis"
echo ""
echo "📚 Documentation:"
echo "   https://github.com/nadavsimba24/geoclaw-universal"
echo ""
echo "🎉 Welcome to transparent agent automation!"
