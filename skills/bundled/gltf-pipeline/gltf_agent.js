/**
 * 🏗️ GLTF Pipeline Agent for OpenClaw
 * 
 * A sub-agent that converts GeoJSON layers with semantic properties
 * into navigable 3D GLTF/GLB models for GIS-adjacent visualization.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const execAsync = promisify(exec);

class GLTFPipelineAgent {
  constructor() {
    this.name = 'gltf-pipeline';
    this.version = '1.0.0';
    this.description = 'Convert GeoJSON to 3D GLTF/GLB models';
    
    // Default configuration
    this.config = {
      units: 'meters',
      source_crs: 'EPSG:4326',
      target_crs: 'EPSG:2039',
      realism_tier: 2,
      output_origin_mode: 'local_origin',
      defaults: {
        building_height: 4.0,
        level_height: 3.2,
        path_width: 1.5,
        tree_canopy_diameter: 4.0
      },
      materials: {
        building: 'concrete_light',
        roof: 'roof_gray',
        path: 'pavers_beige',
        road: 'asphalt_dark',
        water: 'water_blue',
        vegetation: 'vegetation_green'
      }
    };
    
    // State
    this.state = {
      isProcessing: false,
      lastConversion: null,
      conversionHistory: [],
      userPreferences: {}
    };
    
    // Paths
    this.skillDir = __dirname;
    this.configDir = path.join(this.skillDir, 'configs');
    this.examplesDir = path.join(this.skillDir, 'examples');
    this.assetsDir = path.join(this.skillDir, 'assets');
    
    // Ensure directories exist
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    const dirs = [this.configDir, this.examplesDir, this.assetsDir];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  async handleCommand(command, args, context) {
    console.log(`GLTF Agent: Handling command "${command}" with args:`, args);
    
    try {
      switch (command) {
        case 'convert':
          return await this.handleConvert(args, context);
        
        case 'batch':
          return await this.handleBatch(args, context);
        
        case 'example':
          return await this.handleExample(args, context);
        
        case 'config':
          return await this.handleConfig(args, context);
        
        case 'assets':
          return await this.handleAssets(args, context);
        
        case 'validate':
          return await this.handleValidate(args, context);
        
        case 'info':
          return await this.handleInfo(args, context);
        
        case 'qa':
          return await this.handleQA(args, context);
        
        case 'status':
          return await this.handleStatus(args, context);
        
        case 'help':
          return await this.handleHelp(args, context);
        
        default:
          return {
            success: false,
            message: `Unknown command: ${command}. Use '@gltf help' for available commands.`
          };
      }
    } catch (error) {
      console.error('GLTF Agent error:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        error: error.stack
      };
    }
  }
  
  async handleConvert(args, context) {
    if (this.state.isProcessing) {
      return {
        success: false,
        message: 'Another conversion is already in progress. Please wait.'
      };
    }
    
    const inputFile = args[0];
    const outputFile = args[1] || 'output/scene.glb';
    const options = this.parseOptions(args.slice(2));
    
    if (!inputFile) {
      return {
        success: false,
        message: 'Please specify an input GeoJSON file. Usage: @gltf convert <input.geojson> [output.glb] [options]'
      };
    }
    
    // Check if file exists
    try {
      await fs.access(inputFile);
    } catch {
      return {
        success: false,
        message: `File not found: ${inputFile}. Please provide a valid GeoJSON file path.`
      };
    }
    
    // Start processing
    this.state.isProcessing = true;
    
    try {
      // Create output directory if needed
      const outputDir = path.dirname(outputFile);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Build command
      const cmd = this.buildConversionCommand(inputFile, outputFile, options);
      
      // Execute conversion
      const result = await this.executeConversion(cmd, context);
      
      // Update state
      this.state.lastConversion = {
        timestamp: new Date().toISOString(),
        input: inputFile,
        output: outputFile,
        options: options,
        result: result
      };
      
      this.state.conversionHistory.push(this.state.lastConversion);
      
      return {
        success: true,
        message: this.formatConversionResult(result, outputFile),
        data: result
      };
      
    } finally {
      this.state.isProcessing = false;
    }
  }
  
  async handleBatch(args, context) {
    const folder = args[0] || '.';
    const options = this.parseOptions(args.slice(1));
    
    try {
      // Find all GeoJSON files in folder
      const { stdout } = await execAsync(`find "${folder}" -name "*.geojson" -type f -not -path "*/node_modules/*"`);
      const files = stdout.trim().split('\n').filter(f => f);
      
      if (files.length === 0) {
        return {
          success: false,
          message: `No GeoJSON files found in ${folder}`
        };
      }
      
      const results = [];
      const outputDir = path.join(folder, 'gltf_output');
      await fs.mkdir(outputDir, { recursive: true });
      
      for (const file of files) {
        const baseName = path.basename(file, '.geojson');
        const outputFile = path.join(outputDir, `${baseName}.glb`);
        
        const cmd = this.buildConversionCommand(file, outputFile, options);
        const result = await this.executeConversion(cmd, context);
        
        results.push({
          file,
          output: outputFile,
          result
        });
      }
      
      return {
        success: true,
        message: `Batch conversion complete. Processed ${files.length} files.`,
        data: results
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Batch conversion failed: ${error.message}`,
        error: error.stack
      };
    }
  }
  
  async handleExample(args, context) {
    const exampleName = args[0] || 'sample_site';
    const exampleFile = path.join(this.examplesDir, `${exampleName}.geojson`);
    
    try {
      await fs.access(exampleFile);
    } catch {
      // Create example if it doesn't exist
      await this.createExampleData();
    }
    
    const outputFile = `output/example_${exampleName}.glb`;
    const cmd = this.buildConversionCommand(exampleFile, outputFile, {});
    
    const result = await this.executeConversion(cmd, context);
    
    return {
      success: true,
      message: `Example conversion complete. Output: ${outputFile}\n` +
               `Features: ${result.features || 0}, Triangles: ${result.triangles || 0}`,
      data: result
    };
  }
  
  async handleConfig(args, context) {
    const subcommand = args[0];
    
    switch (subcommand) {
      case 'show':
        return {
          success: true,
          message: 'Current configuration:',
          data: this.config
        };
      
      case 'set':
        const key = args[1];
        const value = args[2];
        
        if (!key || !value) {
          return {
            success: false,
            message: 'Usage: @gltf config set <key> <value>'
          };
        }
        
        // Update configuration
        this.setConfigValue(key, value);
        
        return {
          success: true,
          message: `Configuration updated: ${key} = ${value}`
        };
      
      case 'reset':
        this.config = this.getDefaultConfig();
        return {
          success: true,
          message: 'Configuration reset to defaults'
        };
      
      case 'save':
        const profileName = args[1] || 'default';
        await this.saveConfigProfile(profileName);
        return {
          success: true,
          message: `Configuration saved as profile: ${profileName}`
        };
      
      case 'load':
        const loadProfile = args[1] || 'default';
        await this.loadConfigProfile(loadProfile);
        return {
          success: true,
          message: `Configuration loaded from profile: ${loadProfile}`
        };
      
      default:
        return {
          success: false,
          message: 'Usage: @gltf config <show|set|reset|save|load> [args]'
        };
    }
  }
  
  async handleAssets(args, context) {
    const subcommand = args[0];
    
    switch (subcommand) {
      case 'list':
        const assets = await this.listAssets();
        return {
          success: true,
          message: 'Available assets:',
          data: assets
        };
      
      case 'add':
        const type = args[1];
        const file = args[2];
        
        if (!type || !file) {
          return {
            success: false,
            message: 'Usage: @gltf assets add <type> <file>'
          };
        }
        
        const result = await this.addAsset(type, file);
        return {
          success: true,
          message: `Asset added: ${result.id}`,
          data: result
        };
      
      case 'remove':
        const id = args[1];
        if (!id) {
          return {
            success: false,
            message: 'Usage: @gltf assets remove <id>'
          };
        }
        
        await this.removeAsset(id);
        return {
          success: true,
          message: `Asset removed: ${id}`
        };
      
      case 'preview':
        const previewId = args[1];
        if (!previewId) {
          return {
            success: false,
            message: 'Usage: @gltf assets preview <id>'
          };
        }
        
        const preview = await this.getAssetPreview(previewId);
        return {
          success: true,
          message: `Asset preview: ${previewId}`,
          data: preview
        };
      
      default:
        return {
          success: false,
          message: 'Usage: @gltf assets <list|add|remove|preview> [args]'
        };
    }
  }
  
  async handleValidate(args, context) {
    const file = args[0];
    
    if (!file) {
      return {
        success: false,
        message: 'Please specify a GeoJSON file to validate.'
      };
    }
    
    try {
      const validation = await this.validateGeoJSON(file);
      return {
        success: true,
        message: `Validation results for ${file}:`,
        data: validation
      };
    } catch (error) {
      return {
        success: false,
        message: `Validation failed: ${error.message}`,
        error: error.stack
      };
    }
  }
  
  async handleInfo(args, context) {
    const file = args[0];
    
    if (!file) {
      return {
        success: false,
        message: 'Please specify a GeoJSON file.'
      };
    }
    
    try {
      const info = await this.getGeoJSONInfo(file);
      return {
        success: true,
        message: `GeoJSON information for ${file}:`,
        data: info
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get file info: ${error.message}`,
        error: error.stack
      };
    }
  }
  
  async handleQA(args, context) {
    const file = args[0];
    
    if (!file) {
      // Use last conversion if no file specified
      if (this.state.lastConversion) {
        const qaFile = path.join(path.dirname(this.state.lastConversion.output), 'qa_report.json');
        try {
          const qaData = await fs.readFile(qaFile, 'utf8');
          const qa = JSON.parse(qaData);
          return {
            success: true,
            message: 'QA report from last conversion:',
            data: qa
          };
        } catch {
          // Fall through to error
        }
      }
      
      return {
        success: false,
        message: 'Please specify a GeoJSON file or run a conversion first.'
      };
    }
    
    try {
      const qa = await this.generateQAReport(file);
      return {
        success: true,
        message: `QA report for ${file}:`,
        data: qa
      };
    } catch (error) {
      return {
        success: false,
        message: `QA generation failed: ${error.message}`,
        error: error.stack
      };
    }
  }
  
  async handleStatus(args, context) {
    const status = {
      isProcessing: this.state.isProcessing,
      lastConversion: this.state.lastConversion,
      conversionCount: this.state.conversionHistory.length,
      config: {
        realism_tier: this.config.realism_tier,
        units: this.config.units,
        crs: this.config.target_crs
      }
    };
    
    return {
      success: true,
      message: 'GLTF Pipeline Status:',
      data: status
    };
  }
  
  async handleHelp(args, context) {
    const helpText = `
🏗️ GLTF Pipeline Agent - Help

Available commands:

Conversion:
  @gltf convert <input.geojson> [output.glb] [options]
    Convert GeoJSON to 3D GLB model
    Options: --realism-tier=2 --local-origin --assume-crs=EPSG:4326
  
  @gltf batch <folder>
    Convert all GeoJSON files in folder
  
  @gltf example [name]
    Run conversion with example data

Configuration:
  @gltf config show
    Show current configuration
  
  @gltf config set <key> <value>
    Set configuration value
  
  @gltf config reset
    Reset to defaults
  
  @gltf config save <name>
    Save configuration profile

Assets:
  @gltf assets list
    List available assets
  
  @gltf assets add <type> <file>
    Add new asset
  
  @gltf assets remove <id>
    Remove asset
  
  @gltf assets preview <id>
    Preview asset

Utilities:
  @gltf validate <file>
    Validate GeoJSON file
  
  @gltf info <file>
    Show GeoJSON information
  
  @gltf qa <file>
    Generate QA report
  
  @gltf status
    Show conversion status
  
  @gltf help
    Show this help

Examples:
  @gltf convert site.geojson site_model.glb --realism-tier=2
  @gltf batch ./urban_data/
  @gltf example
  @gltf config set building_height 12.0
  @gltf assets list

Need more help? Check the skill documentation.
`;
    
    return {
      success: true,
      message: helpText.trim()
    };
  }
  
  // Utility methods
  
  parseOptions(args) {
    const options = {};
    
    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        if (value !== undefined) {
          options[key] = this.parseValue(value);
        } else {
          options[key] = true;
        }
      }
    }
    
    return options;
  }
  
  parseValue(value) {
    // Try to parse as number
    if (!isNaN(value) && value.trim() !== '') {
      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Return as string
    return value;
  }
  
  buildConversionCommand(inputFile, outputFile, options) {
    const cmdParts = [
      'python',
      '-m',
      'geojson_to_gltf',
      '--input',
      `"${inputFile}"`,
      '--output',
      `"${outputFile}"`,
      '--config',
      `"${path.join(this.configDir, 'default.yaml')}"`
    ];
    
    // Add options
    if (options['realism-tier']) {
      cmdParts.push('--realism-tier', options['realism-tier']);
    }
    
    if (options['local-origin']) {
      cmdParts.push('--local-origin');
    }
    
    if (options['assume-crs']) {
      cmdParts.push('--assume-crs', options['assume-crs']);
    }
    
    return cmdParts.join(' ');
  }
  
  async executeConversion(cmd, context) {
    console.log('Executing command:', cmd);
    
    // Check if Python and dependencies are available
    await this.checkDependencies();
    
    // Execute the command
    const { stdout, stderr } = await execAsync(cmd);
    
    // Parse output
    const result = this.parseConversionOutput(stdout, stderr);
    
    return result;
  }
  
  async checkDependencies() {
    try {
      // Check Python
      await execAsync('python --version');
      
      // Check required packages
      const packages = ['shapely', 'pyproj', 'trimesh', 'numpy', 'yaml', 'pygltflib'];
      
      for (const pkg of packages) {
        try {
          await execAsync(`python -c "import ${pkg}"`);
        } catch {
          console.warn(`Package ${pkg}