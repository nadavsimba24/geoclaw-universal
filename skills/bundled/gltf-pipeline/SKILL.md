# 🏗️ GLTF Pipeline Skill

## 🎯 Description
Convert GeoJSON layers with semantic properties into navigable 3D GLTF/GLB models for GIS-adjacent visualization. Perfect for urban planning, site design, and GIS visualization workflows.

## 📋 Metadata
```yaml
name: gltf-pipeline
version: 1.0.0
author: OpenClaw AI
category: gis/3d/visualization
tags: [gis, 3d, gltf, geojson, urban, planning, visualization]
dependencies:
  - shapely
  - pyproj
  - trimesh
  - numpy
  - pyyaml
  - pygltflib
```

## 🚀 Quick Start

### Installation:
```bash
# The skill will check and install dependencies automatically
# Or manually:
pip install shapely pyproj trimesh numpy pyyaml pygltflib
```

### Basic Usage:
```
@gltf convert site.geojson to 3d
@gltf create model from urban data
@gltf help
```

## 🎮 Commands

### Conversion Commands:
- `@gltf convert <file>` - Convert GeoJSON to GLB
- `@gltf batch <folder>` - Convert all GeoJSON in folder
- `@gltf example` - Run with example data
- `@gltf status` - Show conversion status

### Configuration Commands:
- `@gltf config show` - Show current configuration
- `@gltf config set <key> <value>` - Set configuration value
- `@gltf config reset` - Reset to defaults
- `@gltf config save <name>` - Save configuration profile

### Asset Commands:
- `@gltf assets list` - List available assets
- `@gltf assets add <type> <file>` - Add new asset
- `@gltf assets remove <id>` - Remove asset
- `@gltf assets preview <id>` - Preview asset

### Utility Commands:
- `@gltf validate <file>` - Validate GeoJSON file
- `@gltf info <file>` - Show GeoJSON information
- `@gltf qa <file>` - Generate QA report
- `@gltf help` - Show this help

## 🔧 Configuration

### Default Configuration:
```yaml
# Global settings
units: meters
source_crs: EPSG:4326
target_crs: EPSG:2039
realism_tier: 2  # 0-3 (higher = more detail)
output_origin_mode: local_origin

# Default values
defaults:
  building_height: 4.0
  level_height: 3.2
  path_width: 1.5
  tree_canopy_diameter: 4.0

# Materials
materials:
  building: concrete_light
  roof: roof_gray
  path: pavers_beige
  road: asphalt_dark
  water: water_blue
  vegetation: vegetation_green
```

### Realism Tiers:
- **Tier 0**: Basic GIS block model (flat colors, no details)
- **Tier 1**: Stylized site model (materials, basic assets)
- **Tier 2**: Near-SketchUp conceptual (procedural details, asset library)
- **Tier 3**: Presentation model (custom assets, curated materials)

## 📁 File Structure

```
gltf-pipeline/
├── SKILL.md              # This file
├── gltf_agent.js         # Main skill implementation
├── configs/              # Configuration templates
│   ├── default.yaml      # Default configuration
│   ├── urban.yaml        # Urban planning profile
│   ├── residential.yaml  # Residential profile
│   └── park.yaml        # Park/garden profile
├── examples/             # Example data
│   ├── sample_site.geojson
│   ├── urban_block.geojson
│   └── park.geojson
├── assets/              # Asset library
│   ├── trees/          # Tree models
│   ├── benches/        # Bench models
│   ├── lights/         # Light models
│   └── materials/      # Material definitions
└── scripts/            # Utility scripts
    ├── install.sh      # Dependency installer
    └── test.sh        # Test script
```

## 🎨 Supported Feature Classes

### Buildings & Structures:
- `building` - Extruded with optional roof
- `roof` - Roof surfaces
- `wall` - Walls and fences
- `bridge` - Bridges and overpasses

### Transportation:
- `road` - Roads and streets
- `path` - Pedestrian paths
- `parking` - Parking areas
- `rail` - Railway tracks

### Vegetation:
- `tree` - Trees and large plants
- `shrub` - Shrubs and bushes
- `lawn` - Grass areas
- `garden` - Garden beds

### Water Features:
- `water` - Lakes, rivers, ponds
- `fountain` - Fountains
- `pool` - Swimming pools

### Street Furniture:
- `bench` - Benches and seating
- `light` - Street lights
- `sign` - Signs and billboards
- `trash` - Trash bins

### Surfaces:
- `plaza` - Plazas and squares
- `court` - Sports courts
- `playground` - Playgrounds
- `terrain` - Terrain surfaces

## 🔌 Integration

### With OpenClaw Memory:
```javascript
// Store conversion history
await memory.set('gltf_conversions', {
  timestamp: new Date().toISOString(),
  input: 'site.geojson',
  output: 'model.glb',
  features: 142,
  triangles: 15420
});

// Recall user preferences
const userPrefs = await memory.get('gltf_user_preferences') || {};
```

### With File System:
```javascript
// Find GeoJSON files
const files = await exec('find . -name "*.geojson" -type f -not -path "./node_modules/*"');

// Check file size
const stats = await exec(`stat -f%z "${filePath}"`);
```

### With Other Skills:
```javascript
// Use with municipal-ai skill
const siteData = await skills.execute('municipal-ai', 'get-site-plan', { location });

// Integrate with vision search
const contextImages = await skills.execute('vision-search', 'find-context', { location });
```

## 📊 Output

### Generated Files:
- `.glb` - Binary GLTF (recommended)
- `.gltf` - JSON GLTF + external resources
- `manifest.json` - Conversion metadata
- `qa_report.json` - Quality assurance report
- `normalized.geojson` - Processed input data

### Manifest Example:
```json
{
  "generator": "OpenClaw GLTF Pipeline",
  "version": "1.0.0",
  "timestamp": "2026-04-15T21:51:00Z",
  "input_files": ["site.geojson"],
  "output_file": "scene.glb",
  "statistics": {
    "features": 142,
    "triangles": 15420,
    "materials": 8,
    "assets": 45
  },
  "configuration": {
    "realism_tier": 2,
    "crs": "EPSG:2039"
  },
  "warnings": [],
  "errors": []
}
```

## 🚨 Error Handling

### Common Issues:

1. **Missing Dependencies**
   ```
   Error: Module 'shapely' not found
   Fix: Run 'pip install shapely' or let the skill install it automatically
   ```

2. **Invalid GeoJSON**
   ```
   Error: Invalid GeoJSON structure
   Fix: Validate your GeoJSON at https://geojson.io/
   ```

3. **Missing CRS**
   ```
   Warning: No CRS specified, assuming EPSG:4326
   Fix: Add CRS to GeoJSON or use --assume-crs option
   ```

4. **Large File Size**
   ```
   Warning: Output file > 50MB
   Fix: Reduce realism tier or simplify geometry
   ```

### Recovery Actions:
- Auto-retry with simplified settings
- Suggest alternative configurations
- Provide example data for testing
- Offer to install missing dependencies

## 🧪 Testing

### Test Commands:
```
@gltf test example      # Test with example data
@gltf test validation   # Test validation logic
@gltf test performance  # Test conversion speed
@gltf test all          # Run all tests
```

### Test Coverage:
- GeoJSON parsing and validation
- Coordinate transformation
- Geometry generation
- Material application
- GLTF export
- Error handling

## 🔄 Updates & Maintenance

### Version History:
- **1.0.0** (2026-04-15): Initial release
  - Basic GeoJSON to GLTF conversion
  - Configurable realism tiers
  - Asset library support
  - QA reporting

### Planned Features:
- Real-time preview
- Material editor
- Batch processing
- Cloud rendering
- VR/AR export

## 🤝 Contributing

### Adding New Features:
1. Fork the skill repository
2. Add your feature with tests
3. Update documentation
4. Submit pull request

### Adding Assets:
1. Place GLB files in appropriate asset directory
2. Add metadata in `assets/manifest.yaml`
3. Test with example data
4. Submit for review

### Reporting Issues:
1. Check existing issues
2. Provide GeoJSON example
3. Include error messages
4. Describe expected behavior

## 📚 Resources

### Documentation:
- [GeoJSON Specification](https://geojson.org/)
- [GLTF Specification](https://www.khronos.org/gltf/)
- [OpenClaw Skills Guide](https://docs.openclaw.ai/skills)

### Tools:
- [GeoJSON.io](https://geojson.io/) - GeoJSON editor
- [GLTF Viewer](https://gltf-viewer.donmccurdy.com/) - Online viewer
- [QGIS](https://qgis.org/) - Desktop GIS
- [Blender](https://www.blender.org/) - 3D modeling

### Tutorials:
- "From GIS to 3D in 10 Minutes"
- "Creating Custom Materials"
- "Optimizing for Web Delivery"
- "Batch Processing Workflows"

## 🎯 Performance Tips

### For Large Datasets:
- Use realism tier 1 or 2
- Split into multiple layers
- Simplify geometry before conversion
- Use `--local-origin` for better precision

### For Web Delivery:
- Target < 10MB file size
- Use compressed GLB format
- Reduce triangle count
- Optimize textures

### For Quality:
- Use tier 3 for presentations
- Add custom assets
- Curate materials
- Include terrain data

## 🔮 Future Vision

### Short-term:
- Integration with popular GIS tools
- Template library for common scenarios
- Real-time collaboration features

### Long-term:
- AI-assisted design suggestions
- Photorealistic rendering pipeline
- AR/VR immersive experiences
- Automated quality assessment

---

**Ready to transform your GIS data into immersive 3D visualizations!** 🏙️✨