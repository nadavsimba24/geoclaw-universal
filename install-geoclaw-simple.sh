#!/usr/bin/env bash
# Geoclaw v3.0 - One-command installation like OpenClaw
set -euo pipefail

echo "🚀 Installing Geoclaw v3.0 - Universal Agent Platform"
echo ""

# Check for npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm is required. Install Node.js first: https://nodejs.org/"
  exit 1
fi

# Install globally like OpenClaw
echo "📦 Installing Geoclaw globally..."
npm install -g https://github.com/nadavsimba24/geoclaw-universal/releases/download/v3.0.0/geoclaw-universal-v3.0.tar.gz

# Create global command
echo "🔗 Creating global command 'geoclaw'..."
cat > /tmp/geoclaw-wrapper << 'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEOCLAW_DIR="$(npm root -g)/geoclaw-universal"
"$GEOCLAW_DIR/scripts/run.sh" "$@"
EOF

chmod +x /tmp/geoclaw-wrapper
sudo mv /tmp/geoclaw-wrapper /usr/local/bin/geoclaw 2>/dev/null || mv /tmp/geoclaw-wrapper ~/.local/bin/geoclaw

# Create quick-start script
echo "📝 Creating quick-start script..."
cat > ~/geoclaw-quick-start.sh << 'EOF'
#!/usr/bin/env bash
# Geoclaw Quick Start
echo "🎭 Geoclaw v3.0 Quick Start"
echo ""
echo "1. Start Geoclaw:"
echo "   geoclaw start"
echo ""
echo "2. Interactive setup:"
echo "   geoclaw setup"
echo ""
echo "3. Learn about components:"
echo "   geoclaw learn mcporter"
echo "   geoclaw learn n8n"
echo "   geoclaw learn qgis"
echo ""
echo "4. Create magic workflow:"
echo "   geoclaw workflow create"
echo ""
echo "📚 Documentation: https://github.com/nadavsimba24/geoclaw-universal"
EOF

chmod +x ~/geoclaw-quick-start.sh

echo ""
echo "✅ Geoclaw v3.0 installed successfully!"
echo ""
echo "📋 Quick commands:"
echo "   geoclaw start      - Start the agent platform"
echo "   geoclaw setup      - Interactive setup wizard"
echo "   geoclaw learn      - Learn about components"
echo "   geoclaw status     - Check platform status"
echo ""
echo "📚 Run for full guide:"
echo "   ~/geoclaw-quick-start.sh"
echo ""
echo "🎭 Welcome to transparent agent automation!"