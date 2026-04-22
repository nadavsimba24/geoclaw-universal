#!/usr/bin/env node
// Geoclaw document ingestion — turns files into searchable memories (RAG)

const fs = require('fs');
const path = require('path');
const memory = require('./memory.js');

const CHUNK_SIZE = 800;     // characters per chunk
const CHUNK_OVERLAP = 100;  // overlap between chunks

// ── File readers ──────────────────────────────────────────────────────────────

function readText(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

function readCSV(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

function readPDF(filepath) {
  try {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(filepath);
    // pdf-parse returns a promise
    return pdfParse(buf).then(r => r.text);
  } catch (e) {
    throw new Error(
      'PDF support requires the "pdf-parse" package.\n' +
      '  Install: npm install -g pdf-parse\n' +
      'Or convert the PDF to .txt first.'
    );
  }
}

async function readFile(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  switch (ext) {
    case '.pdf': return await readPDF(filepath);
    case '.md':
    case '.markdown':
    case '.txt':
    case '.log':
    case '.json':
    case '.csv':
    case '.tsv':
    case '.xml':
    case '.html':
    case '.htm':
    case '':
      return readText(filepath);
    default:
      // Try as text; if it fails, warn the user
      try { return readText(filepath); }
      catch { throw new Error(`Unsupported file type: ${ext}. Use .txt, .md, .pdf, .csv, .json, or .html`); }
  }
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function chunk(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  // Normalize whitespace so chunks have clean boundaries
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length <= size) return [cleaned];

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + size, cleaned.length);

    // Try to break on paragraph boundary first, then sentence, then whitespace
    if (end < cleaned.length) {
      const paraBreak = cleaned.lastIndexOf('\n\n', end);
      const sentBreak = cleaned.lastIndexOf('. ', end);
      const wsBreak   = cleaned.lastIndexOf(' ', end);
      if (paraBreak > start + size / 2)      end = paraBreak;
      else if (sentBreak > start + size / 2) end = sentBreak + 1;
      else if (wsBreak > start + size / 2)   end = wsBreak;
    }

    chunks.push(cleaned.slice(start, end).trim());
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks.filter(c => c.length > 20);
}

// ── Main ingestion ────────────────────────────────────────────────────────────

async function ingest(filepath, opts = {}) {
  if (!fs.existsSync(filepath)) throw new Error(`File not found: ${filepath}`);

  const absPath = path.resolve(filepath);
  const basename = path.basename(filepath);

  console.log(`📄 Reading ${basename}...`);
  const text = await readFile(filepath);

  if (!text || text.trim().length < 50) {
    throw new Error('File is empty or too short to ingest.');
  }

  const chunks = chunk(text, opts.chunkSize || CHUNK_SIZE, opts.overlap || CHUNK_OVERLAP);
  console.log(`   Extracted ${chunks.length} chunks (${text.length} chars total)`);

  const tags = opts.tags || [];
  const saved = [];
  for (let i = 0; i < chunks.length; i++) {
    const entry = memory.remember(chunks[i], {
      type: 'document',
      source: basename,
      tags: [...tags, `file:${basename}`, `chunk:${i + 1}/${chunks.length}`],
    });
    saved.push(entry.id);
  }

  console.log(`✅ Saved ${saved.length} memory chunk(s) from ${basename}`);
  console.log(`   Search with: geoclaw recall "your question"`);
  return saved;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
Usage: geoclaw ingest <file> [--tag <tag>]...

Supported formats: .txt, .md, .pdf, .csv, .json, .html
(PDF requires: npm install -g pdf-parse)

Examples:
  geoclaw ingest manual.pdf
  geoclaw ingest notes.md --tag work
  geoclaw ingest data.csv --tag dataset --tag q1-2026

After ingestion, the content is searchable with:
  geoclaw recall "your question"

And automatically available as context inside 'geoclaw chat'.
`);
    process.exit(0);
  }

  const tags = [];
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) { tags.push(args[++i]); }
    else files.push(args[i]);
  }

  try {
    for (const f of files) await ingest(f, { tags });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

module.exports = { ingest, chunk };

if (require.main === module) main();
