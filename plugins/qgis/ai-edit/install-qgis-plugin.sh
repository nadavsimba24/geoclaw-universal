#!/bin/bash
# Install AI Edit QGIS Plugin
echo "🚀 Installing AI Edit QGIS Plugin..."

# Detect QGIS plugins directory
if [[ "$OSTYPE" == "darwin"* ]]; then
    QGIS_DIR="$HOME/Library/Application Support/QGIS/QGIS3/profiles/default/python/plugins"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    QGIS_DIR="$HOME/.local/share/QGIS/QGIS3/profiles/default/python/plugins"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* ]]; then
    QGIS_DIR="$APPDATA/QGIS/QGIS3/profiles/default/python/plugins"
else
    echo "❌ Unknown OS. Please install manually."
    exit 1
fi

mkdir -p "$QGIS_DIR"

# Copy plugin files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp -r "$SCRIPT_DIR/AI_Edit" "$QGIS_DIR/"

# Verify installation
if [ -f "$QGIS_DIR/AI_Edit/metadata.txt" ]; then
    echo "✅ AI Edit plugin installed to: $QGIS_DIR/AI_Edit"
    echo "📋 Next steps:"
    echo "   1. Open QGIS"
    echo "   2. Go to Plugins → Manage and Install Plugins"
    echo "   3. Search for 'AI Edit' and enable it"
    echo "   4. Install Nano Banana CLI: npm install -g nano-banana-2"
    echo "   5. Set GEMINI_API_KEY environment variable"
else
    echo "❌ Installation failed"
    exit 1
fi
