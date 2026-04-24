# AI Edit QGIS Plugin - Open Source Edition

**AI-powered aerial image editing in QGIS** using Nano Banana 2 (Google Gemini).

Select a region on your map, describe the change with natural language, and get a georeferenced result.

## Requirements

- QGIS 3.0+
- [Nano Banana 2 CLI](https://github.com/kingbootoshi/nano-banana-2-skill) (`npm install -g nano-banana-2`)
- Google Gemini API key (`GEMINI_API_KEY`)

## Installation

### Option 1: Copy to QGIS plugins directory

```bash
# Clone and install
git clone https://github.com/nadavsimba24/geoclaw-universal
cp -r plugins/AI_Edit ~/Library/Application\ Support/QGIS/QGIS3/profiles/default/python/plugins/

# Enable in QGIS: Plugins → Manage and Install → AI Edit → Enable
```

### Option 2: Run the install script
```bash
bash install-qgis-plugin.sh
```

### Setup Nano Banana CLI:
```bash
npm install -g nano-banana-2
export GEMINI_API_KEY="your_key_here"
```

## Usage

1. Open QGIS
2. Click the **AI Edit** toolbar icon or go to **Plugins → AI Edit**
3. **Select an area** on your map using the rectangle tool
4. **Describe the change** (e.g., "Remove buildings", "Add trees", "Change terrain color")
5. Click **Generate AI Edit**
6. The result is added as a new layer (georeferenced)

## Features

- ✏️ Select any rectangular area on the map
- 💬 Natural language prompts (any language)
- 🗺️ Georeferenced output (keeps geographic position)
- 📐 Up to 4K resolution
- 🔄 Add result as a new QGIS layer automatically
- 🆓 Free to start (5 edits included by Nano Banana)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  QGIS UI    │────→│  AI Edit     │────→│  Nano Banana 2  │
│  (Plugin)   │     │  (Python)    │     │  CLI (TypeScript)│
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │  Google Gemini   │
                                         │  (API - Cloud)   │
                                         └─────────────────┘
```

## Free Tier vs Paid

| Feature | Free | Paid (€19/mo) |
|---------|------|---------------|
| Edits | 5 | ~150 |
| Resolution | 1K | Up to 4K |
| Georeferencing | ✅ | ✅ |
| API Key | Required | Required |

## License

MIT - Based on open-source Nano Banana 2 and TerraLab concepts.
