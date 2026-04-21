#!/usr/bin/env node
// QGIS/PostGIS Integration for Geoclaw
// Geospatial analysis and mapping capabilities
// Users can perform spatial queries, create maps, and analyze geographic data

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

class QgisPostgisIntegration {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.GEOCLAW_GEOSPATIAL_ENABLED === 'true',
      postgres: {
        host: process.env.GEOCLAW_POSTGRES_HOST || 'localhost',
        port: process.env.GEOCLAW_POSTGRES_PORT || 5432,
        database: process.env.GEOCLAW_POSTGRES_DB || 'geoclaw',
        user: process.env.GEOCLAW_POSTGRES_USER || 'postgres',
        password: process.env.GEOCLAW_POSTGRES_PASSWORD || '',
        ssl: process.env.GEOCLAW_POSTGRES_SSL === 'true'
      },
      qgis: {
        enabled: process.env.GEOCLAW_QGIS_ENABLED === 'true',
        path: process.env.GEOCLAW_QGIS_PATH || '/Applications/QGIS.app/Contents/MacOS/QGIS',
        projectsDir: process.env.GEOCLAW_QGIS_PROJECTS_DIR || path.join(process.cwd(), 'qgis-projects')
      },
      ...config
    };
    
    this.postgresClient = null;
    this.qgisProcess = null;
    this.connected = false;
    
    console.log("🗺️  QGIS/PostGIS Integration initialized");
    console.log(`   Enabled: ${this.config.enabled}`);
    if (this.config.enabled) {
      console.log(`   PostgreSQL: ${this.config.postgres.host}:${this.config.postgres.port}`);
      console.log(`   QGIS: ${this.config.qgis.enabled ? 'Enabled' : 'Disabled'}`);
    }
  }
  
  async start() {
    if (!this.config.enabled) {
      console.log("⚠️  Geospatial integration is disabled");
      console.log("   Enable it in .env: GEOCLAW_GEOSPATIAL_ENABLED=true");
      return false;
    }
    
    console.log("🚀 Starting geospatial integration...");
    
    try {
      // Connect to PostgreSQL/PostGIS
      await this.connectPostgres();
      
      // Check PostGIS extension
      await this.checkPostgis();
      
      // Ensure QGIS projects directory
      if (this.config.qgis.enabled) {
        this.ensureQgisProjectsDir();
      }
      
      this.connected = true;
      console.log("✅ Geospatial integration ready!");
      console.log(`   PostgreSQL: Connected to ${this.config.postgres.database}`);
      console.log(`   PostGIS: ${await this.hasPostgis() ? 'Available' : 'Not installed'}`);
      console.log(`   QGIS: ${this.config.qgis.enabled ? 'Ready' : 'Disabled'}`);
      console.log("   Commands available via Geoclaw");
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start geospatial integration: ${error.message}`);
      return false;
    }
  }
  
  async connectPostgres() {
    console.log("🔌 Connecting to PostgreSQL...");
    
    this.postgresClient = new Client({
      host: this.config.postgres.host,
      port: this.config.postgres.port,
      database: this.config.postgres.database,
      user: this.config.postgres.user,
      password: this.config.postgres.password,
      ssl: this.config.postgres.ssl
    });
    
    try {
      await this.postgresClient.connect();
      console.log("✅ PostgreSQL connection established");
    } catch (error) {
      console.error(`❌ PostgreSQL connection failed: ${error.message}`);
      console.log("💡 Tip: Make sure PostgreSQL is running and credentials are correct");
      throw error;
    }
  }
  
  async checkPostgis() {
    console.log("🔍 Checking PostGIS extension...");
    
    try {
      const result = await this.postgresClient.query(`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'postgis'
        ) as postgis_available;
      `);
      
      const hasPostgis = result.rows[0].postgis_available;
      
      if (hasPostgis) {
        console.log("✅ PostGIS extension is available");
      } else {
        console.log("⚠️  PostGIS extension not installed");
        console.log("💡 Install with: CREATE EXTENSION postgis;");
      }
      
      return hasPostgis;
    } catch (error) {
      console.error(`❌ Error checking PostGIS: ${error.message}`);
      return false;
    }
  }
  
  async hasPostgis() {
    try {
      const result = await this.postgresClient.query(`
        SELECT postgis_version() as version;
      `);
      return result.rows[0].version;
    } catch (error) {
      return false;
    }
  }
  
  ensureQgisProjectsDir() {
    if (!fs.existsSync(this.config.qgis.projectsDir)) {
      fs.mkdirSync(this.config.qgis.projectsDir, { recursive: true });
      console.log(`✅ Created QGIS projects directory: ${this.config.qgis.projectsDir}`);
    }
  }
  
  async spatialQuery(query, params = []) {
    if (!this.connected) {
      throw new Error('Geospatial integration not connected. Call start() first.');
    }
    
    console.log(`🗺️  Executing spatial query...`);
    console.log(`   Query: ${query.substring(0, 100)}...`);
    
    try {
      const result = await this.postgresClient.query(query, params);
      
      console.log(`✅ Query executed successfully`);
      console.log(`   Rows returned: ${result.rows.length}`);
      
      return {
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields ? result.fields.map(f => f.name) : [],
        note: 'Spatial query executed. Results include geometry data.'
      };
    } catch (error) {
      console.error(`❌ Spatial query failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        note: 'Failed to execute spatial query. Check PostGIS functions and table structure.'
      };
    }
  }
  
  async createSpatialTable(tableName, geometryType = 'POINT', srid = 4326) {
    if (!this.connected) {
      throw new Error('Geospatial integration not connected. Call start() first.');
    }
    
    console.log(`🗺️  Creating spatial table: ${tableName}`);
    console.log(`   Geometry type: ${geometryType}`);
    console.log(`   SRID: ${srid}`);
    
    const query = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        description TEXT,
        geom geometry(${geometryType}, ${srid}),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS ${tableName}_geom_idx 
      ON ${tableName} USING GIST (geom);
    `;
    
    try {
      await this.postgresClient.query(query);
      
      console.log(`✅ Spatial table created: ${tableName}`);
      
      return {
        success: true,
        tableName,
        geometryType,
        srid,
        note: `Spatial table "${tableName}" created with ${geometryType} geometry and SRID ${srid}.`
      };
    } catch (error) {
      console.error(`❌ Failed to create spatial table: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        note: 'Failed to create spatial table. Check permissions and PostGIS installation.'
      };
    }
  }
  
  async importGeoJson(tableName, geojson) {
    if (!this.connected) {
      throw new Error('Geospatial integration not connected. Call start() first.');
    }
    
    console.log(`🗺️  Importing GeoJSON to table: ${tableName}`);
    console.log(`   Features: ${geojson.features ? geojson.features.length : 'unknown'}`);
    
    const features = geojson.features || [];
    
    try {
      for (const feature of features) {
        const { geometry, properties } = feature;
        const geom = JSON.stringify(geometry);
        
        await this.postgresClient.query(`
          INSERT INTO ${tableName} (name, description, geom)
          VALUES ($1, $2, ST_GeomFromGeoJSON($3))
        `, [
          properties?.name || 'Unnamed',
          properties?.description || '',
          geom
        ]);
      }
      
      console.log(`✅ Imported ${features.length} features to ${tableName}`);
      
      return {
        success: true,
        tableName,
        featuresImported: features.length,
        note: `Imported ${features.length} features to "${tableName}".`
      };
    } catch (error) {
      console.error(`❌ Failed to import GeoJSON: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        note: 'Failed to import GeoJSON. Check GeoJSON format and table structure.'
      };
    }
  }
  
  async spatialAnalysis(analysisType, params = {}) {
    if (!this.connected) {
      throw new Error('Geospatial integration not connected. Call start() first.');
    }
    
    console.log(`🔍 Performing spatial analysis: ${analysisType}`);
    
    let query;
    let result;
    
    switch (analysisType) {
      case 'buffer':
        query = `
          SELECT 
            id,
            name,
            ST_AsGeoJSON(ST_Buffer(geom, $1)) as buffered_geom,
            ST_Area(ST_Buffer(geom, $1)) as area
          FROM ${params.table}
          ${params.where ? `WHERE ${params.where}` : ''}
        `;
        result = await this.spatialQuery(query, [params.distance || 100]);
        break;
        
      case 'intersection':
        query = `
          SELECT 
            a.id as a_id,
            a.name as a_name,
            b.id as b_id,
            b.name as b_name,
            ST_AsGeoJSON(ST_Intersection(a.geom, b.geom)) as intersection_geom,
            ST_Area(ST_Intersection(a.geom, b.geom)) as intersection_area
          FROM ${params.table1} a
          JOIN ${params.table2} b ON ST_Intersects(a.geom, b.geom)
          ${params.where ? `WHERE ${params.where}` : ''}
        `;
        result = await this.spatialQuery(query);
        break;
        
      case 'distance':
        query = `
          SELECT 
            a.id as from_id,
            a.name as from_name,
            b.id as to_id,
            b.name as to_name,
            ST_Distance(a.geom, b.geom) as distance
          FROM ${params.table1} a
          CROSS JOIN ${params.table2} b
          ${params.where ? `WHERE ${params.where}` : ''}
          ORDER BY distance
          LIMIT ${params.limit || 10}
        `;
        result = await this.spatialQuery(query);
        break;
        
      case 'nearest':
        query = `
          SELECT 
            target.id,
            target.name,
            (
              SELECT name 
              FROM ${params.referenceTable} 
              ORDER BY ST_Distance(target.geom, geom) 
              LIMIT 1
            ) as nearest_name,
            (
              SELECT ST_Distance(target.geom, geom)
              FROM ${params.referenceTable}
              ORDER BY ST_Distance(target.geom, geom)
              LIMIT 1
            ) as distance
          FROM ${params.targetTable} target
        `;
        result = await this.spatialQuery(query);
        break;
        
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
    
    return {
      success: true,
      analysisType,
      params,
      result,
      note: `Spatial analysis "${analysisType}" completed.`
    };
  }
  
  async createQgisProject(projectName, layers = []) {
    if (!this.config.qgis.enabled) {
      throw new Error('QGIS integration is disabled');
    }
    
    console.log(`🗺️  Creating QGIS project: ${projectName}`);
    
    const projectPath = path.join(this.config.qgis.projectsDir, `${projectName}.qgz`);
    
    // Create a simple QGIS project file (QML format)
    const qmlContent = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28.0-Firenze" styleCategories="AllStyleCategories">
  <title>${projectName}</title>
  <projectlayers>
    ${layers.map((layer, i) => `
    <maplayer>
      <id>${layer.id || `layer${i}`}</id>
      <datasource>${layer.datasource || ''}</datasource>
      <layername>${layer.name || `Layer ${i}`}</layername>
      <srs>
        <spatialrefsys>
          <proj4>+proj=longlat +datum=WGS84 +no_defs</proj4>
          <srsid>3452</srsid>
          <srid>4326</srid>
          <authid>EPSG:4326</authid>
          <description>WGS 84</description>
          <projectionacronym>longlat</projectionacronym>
          <ellipsoidacronym>EPSG:7030</ellipsoidacronym>
          <geographicflag>true</geographicflag>
        </spatialrefsys>
      </srs>
      <provider>postgres</provider>
      <vectorjoins/>
      <layerOpacity>1</layerOpacity>
      <singleSymbol>
        <symbol>
          <layer>
            <prop k="line_color" v="31,120,180,255"/>
            <prop k="line_style" v="solid"/>
            <prop k="line_width" v="0.26"/>
            <prop k="line_width_unit" v="MM"/>
            <prop k="outline_width" v="0"/>
            <prop k="outline_width_unit" v="MM"/>
          </layer>
        </symbol>
      </singleSymbol>
    </maplayer>
    `).join('')}
  </projectlayers>
</qgis>`;
    
    fs.writeFileSync(projectPath.replace('.qgz', '.qml'), qmlContent);
    
    console.log(`✅ QGIS project created: ${projectPath}`);
    
    return {
      success: true,
      projectName,
      projectPath,
      layers: layers.length,
      note: `QGIS project "${projectName}" created. Open with QGIS.`
    };
  }
  
  async openQgis(projectPath = null) {
    if (!this.config.qgis.enabled) {
      throw new Error('QGIS integration is disabled');
    }
    
    console.log("🗺️  Opening QGIS...");
    
    const qgisPath = this.config.qgis.path;
    
    if (!fs.existsSync(qgisPath)) {
      throw new Error(`QGIS not found at: ${qgisPath}`);
    }
    
    const args = projectPath ? [projectPath] : [];
    
    this.qgisProcess = spawn(qgisPath, args, {
      detached: true,
      stdio: 'ignore'
    });
    
    this.qgisProcess.unref();
    
    console.log("✅ QGIS started");
    
    return {
      success: true,
      pid: this.qgisProcess.pid,
      project: projectPath,
      note: 'QGIS application started. Use for visual geospatial analysis.'
    };
  }
  
  async getStatus() {
    const hasPostgis = await this.hasPostgis();
    
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      postgres: {
        host: this.config.postgres.host,
        port: this.config.postgres.port,
        database: this.config.postgres.database,
        connected: this.connected
      },
      postgis: hasPostgis ? {
        available: true,
        version: hasPostgis
      } : {
        available: false
      },
      qgis: {
        enabled: this.config.qgis.enabled,
        path: this.config.qgis.path,
        projectsDir: this.config.qgis.projectsDir,
        exists: fs.existsSync(this.config.qgis.path)
      },
      note: 'Geospatial integration provides mapping, spatial analysis, and GIS capabilities.'
    };
  }
  
  async stop() {
    console.log("🛑 Stopping geospatial integration...");
    
    if (this.postgresClient) {
      await this.postgresClient.end();
      console.log("✅ PostgreSQL connection closed");
    }
    
    if (this.qgisProcess && !this.qgisProcess.killed) {
      this.qgisProcess.kill();
      console.log("✅ QGIS process stopped");
    }
    
    this.connected = false;
    console.log("✅ Geospatial integration stopped");
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const geospatial = new QgisPostgisIntegration();
  
  async function run() {
    switch (command) {
      case 'start':
        await geospatial.start();
        break;
      case 'stop':
        await geospatial.stop();
        break;
      case 'status':
        const status = await geospatial.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;
      case 'query':
        if (args.length < 2) {
          console.error('Usage: node qgis-postgis-integration.js query "SELECT * FROM table"');
          process.exit(1);
        }
        await geospatial.start();
        const result = await geospatial.spatialQuery(args[1]);
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'create-table':
        if (args.length < 2) {
          console.error('Usage: node qgis