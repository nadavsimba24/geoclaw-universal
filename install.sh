#!/usr/bin/env bash
# Geoclaw v3.0 - One-command installation (OpenClaw style)
set -euo pipefail

echo "🚀 Installing Geoclaw v3.0 - Universal Agent Platform"
echo ""

# Check for npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm is required. Install Node.js first: https://nodejs.org/"
  exit 1
fi

# Install globally from GitHub
echo "📦 Installing from GitHub..."
npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"

echo ""
echo "✅ Geoclaw v3.0 installed successfully!"
echo ""
echo "📋 Quick start:"
echo "   1. geoclaw setup    # Interactive setup wizard"
echo "   2. geoclaw start    # Start the platform"
echo ""
echo "🎭 Learn about components:"
echo "   geoclaw learn mcporter    # MCP server discovery"
echo "   geoclaw learn n8n         # Workflow automation"
echo "   geoclaw learn qgis        # Geospatial analysis"
echo ""
echo "📚 Full documentation:"
echo "   https://github.com/nadavsimba24/geoclaw-universal"
echo ""
echo "🎉 Welcome to transparent agent automation!"