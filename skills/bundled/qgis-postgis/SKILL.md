---
name: qgis-postgis
description: 'QGIS and PostGIS geospatial integration — run spatial SQL queries, analyze geographic data, generate maps, work with vector/raster layers, perform GIS operations. Use when the user asks about maps, spatial analysis, geospatial queries, coordinates, shapefiles, geographic calculations, or PostGIS databases.'
metadata:
  {
    "openclaw":
      {
        "emoji": "🗺",
        "requires": { "env": ["POSTGIS_CONNECTION_STRING"] },
        "install": [],
      },
    "antonclaw":
      {
        "integration": "qgis-postgis",
        "module": "scripts/components/qgis-postgis-integration.js",
      },
  }
---

# QGIS / PostGIS Geospatial Integration

Run spatial SQL queries against PostGIS, execute QGIS processing algorithms, and work with geographic data.

## Setup

```bash
# In .env:
POSTGIS_CONNECTION_STRING=postgresql://user:pass@localhost:5432/geodata
QGIS_PYTHON_PATH=/usr/bin/python3   # optional, for QGIS processing
```

## PostGIS Operations

### Spatial Queries
```sql
-- Find all points within 5km of a location
SELECT name, ST_Distance(geom, ST_MakePoint(34.78, 32.08)::geography) AS dist_m
FROM poi WHERE ST_DWithin(geom::geography, ST_MakePoint(34.78, 32.08)::geography, 5000)
ORDER BY dist_m;

-- Count features per polygon (e.g. buildings per neighborhood)
SELECT n.name, COUNT(b.id) AS building_count
FROM neighborhoods n JOIN buildings b ON ST_Contains(n.geom, b.geom)
GROUP BY n.name ORDER BY building_count DESC;

-- Buffer and intersect
SELECT a.id FROM parcels a
WHERE ST_Intersects(a.geom, ST_Buffer(ST_MakePoint(34.78, 32.08)::geography, 1000)::geometry);
```

### Table Management
```
postgis_list_tables         — list all spatial tables and their geometry types
postgis_describe_table      — get schema + SRID + geometry type for a table
postgis_query               — run arbitrary spatial SQL
postgis_import_geojson      — import GeoJSON into a PostGIS table
postgis_export_geojson      — export query result as GeoJSON
```

## Common Geospatial Tasks

### Find nearest features
```
Find the 5 nearest hospitals to coordinate (32.08, 34.78) within 20km
```

### Area calculations
```
Calculate the total area in square kilometers of all agricultural zones in the Tel Aviv district
```

### Intersection analysis
```
Which census tracts intersect the new railway corridor buffer (500m)?
```

### Cluster analysis
```
Find all crime incidents within 200m of each other (spatial clustering)
```

### Export for mapping
```
Export all parcels in the Haifa district as GeoJSON for display in the web app
```

## Coordinate Systems

| SRID | Description |
|------|-------------|
| 4326 | WGS84 (GPS, lat/lon) |
| 32636 | UTM Zone 36N (Israel/Middle East) |
| 2039 | Israel TM (ITM — Israeli Transverse Mercator) |
| 3857 | Web Mercator (Google Maps, OpenStreetMap) |

Convert between systems:
```sql
SELECT ST_Transform(geom, 4326) FROM my_table WHERE id = 1;
```

## Integration with Workflows

PostGIS + n8n: Export spatial query results → trigger n8n workflow to process and send to Monday.com
```
Run the quarterly flood-risk analysis, export results as GeoJSON, then trigger the "Risk Report" n8n workflow
```

## Rules

1. Always check SRID before spatial operations — mismatched projections give wrong distances
2. Use `geography` type (not `geometry`) for distance/area calculations in meters
3. Large raster operations can be slow — add LIMIT or bounding box filter
4. Never drop or truncate production spatial tables without explicit user confirmation
5. `ST_IsValid()` before any union/intersection on imported data — invalid geometries cause crashes
