# 🔗 GLTF Pipeline Skill - OpenClaw Integration Guide

## 🎯 Overview
This document explains how to integrate and use the GLTF Pipeline skill within OpenClaw as a sub-agent.

## 📦 Installation

### Option 1: Automatic Installation (Recommended)
```bash
# Navigate to the skill directory
cd ~/.hermes/node/lib/node_modules/openclaw/skills/gltf-pipeline

# Run the installation script
./scripts/install.sh
```

### Option 2: Manual Installation
```bash
# Install Python dependencies
pip install shapely pyproj trimesh numpy pyyaml pygltflib

# Optional: Install for better performance
pip install mapbox-earcut rasterio scipy pillow
```

### Option 3: Through OpenClaw
```
@claw install skill gltf-pipeline
# (If the skill supports auto-installation)
```

## 🚀 Quick Start

### Test the Installation:
```bash
cd ~/.hermes/node/lib/node_modules/openclaw/skills/gltf-pipeline
./scripts/test.sh
```

### Run an Example:
```bash
cd ~/.hermes/node/lib/node_modules/openclaw/skills/gltf-pipeline
python run_example.py
```

## 🤖 Using the Skill in OpenClaw

### Basic Commands:
```
@gltf help                    # Show help
@gltf convert site.geojson    # Convert GeoJSON to GLB
@gltf example                 # Run with example data
@gltf status                  # Show conversion status
```

### Complete Examples:
```
# Convert a site plan
@gltf convert urban_site.geojson --realism-tier=2 --local-origin

# Convert with custom output name
@gltf convert data.geojson output/my_model.glb

# Batch convert all GeoJSON in a folder
@gltf batch ./project_data/

# Validate a GeoJSON file
@gltf validate site.geojson

# Show file information
@gltf info site.geojson

# Generate QA report
@gltf qa site.geojson
```

### Configuration Management:
```
# Show current configuration
@gltf config show

# Set building height to 12 meters
@gltf config set building_height 12.0

# Set realism tier to 3 (presentation quality)
@gltf config set realism_tier 3

# Reset to defaults
@gltf config reset

# Save configuration as a profile
@gltf config save urban_planning
```

### Asset Management:
```
# List available assets
@gltf assets list

# Add a new tree asset
@gltf assets add trees ./my_tree.glb

# Remove an asset
@gltf assets remove tree_oak_large

# Preview an asset
@gltf assets preview bench_park
```

## 🔧 Integration Patterns

### As a Sub-Agent:
```javascript
// Spawn the GLTF agent as a sub-agent
const gltfAgent = await sessions_spawn({
  runtime: "subagent",
  label: "GLTF Pipeline",
  task: "Convert urban site plan to 3D",
  model: "deepseek/deepseek-chat"
});

// Send commands to the agent
await sessions_send({
  sessionKey: gltfAgent.sessionKey,
  message: "@gltf convert site.geojson --realism-tier=2"
});
```

### In Workflows:
```javascript
// Example workflow for automated processing
async function processUrbanPlan(geojsonFile) {
  // Step 1: Validate the data
  const validation = await skills.execute('gltf-pipeline', 'validate', {
    file: geojsonFile
  });
  
  if (!validation.valid) {
    throw new Error(`Invalid GeoJSON: ${validation.errors}`);
  }
  
  // Step 2: Convert to 3D
  const conversion = await skills.execute('gltf-pipeline', 'convert', {
    input: geojsonFile,
    output: 'output/model.glb',
    options: {
      realism_tier: 2,
      local_origin: true
    }
  });
  
  // Step 3: Generate QA report
  const qaReport = await skills.execute('gltf-pipeline', 'qa', {
    file: geojsonFile
  });
  
  return {
    model: conversion.output,
    statistics: conversion.statistics,
    qa: qaReport
  };
}
```

### With n8n Automation:
```yaml
# n8n workflow node configuration
- name: "Convert to 3D"
  type: "openclaw"
  position: [250, 300]
  parameters:
    skill: "gltf-pipeline"
    command: "convert"
    arguments:
      input: "={{ $json.geojsonFile }}"
      output: "={{ 'output/' + $json.projectName + '.glb' }}"
      options:
        realism_tier: 2
        local_origin: true
```

## 📁 File Structure for Integration

### Recommended Project Structure:
```
my_urban_project/
├── data/                    # GeoJSON source files
│   ├── buildings.geojson
│   ├── roads.geojson
│   ├── vegetation.geojson
│   └── site_boundary.geojson
├── config/                  # Custom configurations
│   ├── urban_config.yaml
│   └── mapping_rules.yaml
├── assets/                  # Custom 3D assets
│   ├── custom_trees/
│   ├── custom_benches/
│   └── custom_materials/
├── output/                  # Generated 3D models
│   ├── site_model.glb
│   ├── manifest.json
│   └── qa_report.json
└── scripts/                 # Automation scripts
    ├── process_all.sh
    └── update_assets.sh
```

### GeoJSON File Preparation:
```json
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": { "name": "EPSG:2039" }
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "class": "building",
        "height": 12.0,
        "levels": 3,
        "roof_type": "flat",
        "material": "concrete_light",
        "name": "Office Tower"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[...]]
      }
    }
  ]
}
```

## ⚙️ Configuration Management

### Custom Configuration File:
```yaml
# my_config.yaml
units: meters
source_crs: EPSG:4326
target_crs: EPSG:2039
realism_tier: 2

defaults:
  building_height: 12.0
  level_height: 3.5
  path_width: 2.0
  tree_canopy_diameter: 5.0

materials:
  building: modern_concrete
  roof: metal_roof
  path: stone_pavers
  road: asphalt_textured
```

### Using Custom Configuration:
```
@gltf convert site.geojson --config ./my_config.yaml
```

## 🔄 Automation Examples

### Daily Batch Processing:
```bash
#!/bin/bash
# process_daily.sh

# Process all new GeoJSON files
for file in ./data/new/*.geojson; do
  echo "Processing $file..."
  
  # Convert to 3D
  python -m geojson_to_gltf \
    --input "$file" \
    --output "./output/$(basename "$file" .geojson).glb" \
    --config ./config/daily_config.yaml \
    --local-origin
  
  # Move to processed folder
  mv "$file" ./data/processed/
done

# Generate daily report
python generate_report.py ./output/
```

### CI/CD Pipeline:
```yaml
# .github/workflows/process-models.yml
name: Process 3D Models

on:
  push:
    paths:
      - 'data/**/*.geojson'

jobs:
  convert:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.10'
    
    - name: Install dependencies
      run: |
        pip install shapely pyproj trimesh numpy pyyaml pygltflib
    
    - name: Convert GeoJSON to GLB
      run: |
        python -m geojson_to_gltf \
          --input "data/**/*.geojson" \
          --output "models/" \
          --config "config/ci_config.yaml"
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: 3d-models
        path: models/*.glb
```

## 📊 Monitoring and Logging

### View Conversion Logs:
```bash
# Tail the conversion log
tail -f ~/.openclaw/logs/gltf_pipeline.log

# View last conversion details
@gltf status

# Check QA report
cat output/qa_report.json | jq .
```

### Performance Monitoring:
```javascript
// Monitor conversion performance
const performance = {
  startTime: Date.now(),
  memoryUsage: process.memoryUsage(),
  
  trackConversion: async function(geojsonFile) {
    const result = await skills.execute('gltf-pipeline', 'convert', {
      input: geojsonFile
    });
    
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.result = result;
    
    return this.generateReport();
  },
  
  generateReport: function() {
    return {
      duration: this.duration,
      memory: process.memoryUsage(),
      features: this.result?.statistics?.features || 0,
      triangles: this.result?.statistics?.triangles || 0,
      fileSize: this.result?.statistics?.fileSize || 0
    };
  }
};
```

## 🚨 Troubleshooting

### Common Issues:

1. **"Module not found" errors**
   ```
   Solution: Run ./scripts/install.sh or install manually:
   pip install shapely pyproj trimesh numpy pyyaml pygltflib
   ```

2. **"Invalid GeoJSON" errors**
   ```
   Solution: Validate your GeoJSON:
   @gltf validate file.geojson
   Or use: https://geojson.io/
   ```

3. **"CRS not specified" warnings**
   ```
   Solution: Add CRS to GeoJSON or use:
   @gltf convert file.geojson --assume-crs=EPSG:4326
   ```

4. **Large file sizes**
   ```
   Solution: Reduce realism tier:
   @gltf convert file.geojson --realism-tier=1
   Or simplify geometry before conversion.
   ```

5. **Slow conversions**
   ```
   Solution: Split large files, use tier 1,
   or process in batches.
   ```

### Debug Mode:
```
# Enable verbose logging
export GLTF_DEBUG=true

# Run with debug output
@gltf convert file.geojson -vvv

# Check system resources
@gltf status --detailed
```

## 🔮 Advanced Usage

### Custom Asset Pipeline:
```javascript
// Process custom assets before conversion
async function processWithCustomAssets(geojsonFile, assetLibrary) {
  // 1. Validate and prepare GeoJSON
  const prepared = await prepareGeoJSON(geojsonFile, assetLibrary);
  
  // 2. Convert with custom configuration
  const result = await skills.execute('gltf-pipeline', 'convert', {
    input: prepared.file,
    output: 'output/custom_model.glb',
    options: {
      realism_tier: 3,
      assets: assetLibrary.path,
      materials: assetLibrary.materials
    }
  });
  
  // 3. Post-process the GLB
  const processed = await postProcessGLB(result.output, assetLibrary);
  
  return processed;
}
```

### Integration with Municipal AI:
```javascript
// Combine with municipal data
async function createUrbanVisualization(location) {
  // Get municipal data
  const municipalData = await skills.execute('municipal-ai', 'get-site-data', {
    location: location
  });
  
  // Convert to GeoJSON
  const geojson = convertToGeoJSON(municipalData);
  
  // Generate 3D model
  const model = await skills.execute('gltf-pipeline', 'convert', {
    input: geojson,
    output: `output/${location}_model.glb`,
    options: {
      realism_tier: 2,
      local_origin: true
    }
  });
  
  // Add context from vision search
  const context = await skills.execute('vision-search', 'find-context', {
    location: location
  });
  
  return {
    model: model.output,
    context: context,
    statistics: model.statistics
  };
}
```

### Real-time Processing:
```javascript
// WebSocket integration for real-time updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    
    if (data.type === 'convert') {
      // Start conversion
      const result = await skills.execute('gltf-pipeline', 'convert', {
        input: data.file,
        output: data.output
      });
      
      // Send progress updates
      ws.send(JSON.stringify({
        type: 'progress',
        progress: 50,
        message: 'Generating geometry...'
      }));
      
      // Send completion
      ws.send(JSON.stringify({
        type: 'complete',
        result: result
      }));
    }
  });
});
```

## 📚 Additional Resources

### Documentation:
- [GeoJSON Specification](https://geojson.org/)
- [GLTF Specification](https://www.khronos.org/gltf/)
- [OpenClaw Skills API](https://docs.openclaw.ai/skills)

### Tools:
- [QGIS](https://qgis.org/) - Desktop GIS for preparing GeoJSON
- [Blender](https://www.blender.org/) - 3D modeling and GLTF export
- [Three.js GLTF Viewer](https://gltf-viewer.donmccurdy.com/) - Web-based viewer

### Tutorials:
- "Preparing GeoJSON for 3D Conversion"
- "Creating Custom 3D Assets"
- "Optimizing GLB Files for Web"
- "Batch Processing Urban Data"

### Community:
- [OpenClaw Discord](https://discord.gg/clawd) - Get help and share projects
- [GitHub Issues](https://github.com/openclaw/openclaw/issues) - Report bugs
- [Skill Repository](https://github.com/openclaw/skills) - Contribute improvements

---

**Ready to transform your GIS data into immersive 3D visualizations with OpenClaw!** 🏙️✨

For additional help, use `@gltf help` or join the OpenClaw community.