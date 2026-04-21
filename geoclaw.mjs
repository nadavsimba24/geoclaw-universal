#!/usr/bin/env node
// Geoclaw v3.0 - Universal Agent Platform CLI
// Entry point for global installation

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function printBanner() {
  console.log(`
🎭  Geoclaw v3.0 - Universal Agent Platform
────────────────────────────────────────────
Transparent automation with educational UX
`);
}

function printHelp() {
  console.log(`
Usage: geoclaw <command> [options]

Commands:
  start           Start Geoclaw agent platform
  setup           Interactive setup wizard
  update          Update to the latest version
  learn <topic>   Learn about a component
  status          Show platform status
  workflow        Magic workflow commands
  mcp             MCP integration commands
  help            Show this help

Examples:
  geoclaw start
  geoclaw setup
  geoclaw update
  geoclaw learn mcporter
  geoclaw learn n8n
  geoclaw status
  geoclaw workflow create
  geoclaw mcp list

Component topics:
  mcporter        MCP server discovery & calling
  n8n             Workflow automation
  qgis            Geospatial analysis
  web-scraping    Data collection
  vibe-kanban     Task management
  monday          Project management
  salesforce      CRM automation
  memory          Central Intelligence
  skills          GitHub CLI Skills

Learn more: https://github.com/nadavsimba24/geoclaw-universal
`);
}

async function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, 'scripts', scriptName);
  
  if (!existsSync(scriptPath)) {
    console.error(`❌ Script not found: ${scriptPath}`);
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args], {
      stdio: 'inherit',
      env: { ...process.env, GEOCLAW_DIR: __dirname }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printBanner();
    printHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'start':
      printBanner();
      await runScript('run.sh');
      break;

    case 'setup':
      printBanner();
      await runScript('setup-wizard-simple.sh');
      break;

    case 'learn':
      if (args.length < 2) {
        console.log('Usage: geoclaw learn <topic>');
        console.log('Topics: mcporter, n8n, qgis, web-scraping, vibe-kanban, monday, salesforce, memory, skills');
        break;
      }
      await runScript('educational-commands-complete.sh', ['learn', args[1]]);
      break;

    case 'status':
      await runScript('educational-commands-complete.sh', ['status']);
      break;

    case 'workflow':
      if (args.length < 2) {
        console.log('Usage: geoclaw workflow <subcommand>');
        console.log('Subcommands: create, execute, list');
        break;
      }
      await runScript('components/workflow-orchestrator.js', args.slice(1));
      break;

    case 'mcp':
      if (args.length < 2) {
        console.log('Usage: geoclaw mcp <subcommand>');
        console.log('Subcommands: list, explore, call');
        break;
      }
      await runScript('components/mcporter-integration.js', args.slice(1));
      break;

    case 'update':
      printBanner();
      await runScript('update.sh');
      break;

    case 'init':
      await runScript('geoclaw_init_universal.sh', args.slice(1));
      break;

    case 'help':
    case '--help':
    case '-h':
      printBanner();
      printHelp();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});