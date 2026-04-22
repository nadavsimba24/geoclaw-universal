#!/usr/bin/env node
// Geoclaw document ingestion — chunks files into searchable memories (RAG).

const fs = require('fs');
const path = require('path');
const memory = require('./memory.js');

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

// ── File readers ──────────────────────────────────────────────────────────────

function readText(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

async function readPDF(filepath) {
  let pdfParse;
  try { pdfParse = require('pdf-parse'); }
  catch {
    throw new Error(
      'PDF support requires the "pdf-parse" package.\n' +
      '  Install: npm install -g pdf-parse\n' +
      'Or convert the PDF to .txt first.'
    );
  }
  const buf = fs.readFileSync(filepath);
  const r = await pdfParse(buf);
  return r.text;
}

async function readDOCX(filepath) {
  let mammoth;
  try { mammoth = require('mammoth'); }
  catch {
    throw new Error(
      'DOCX support requires the "mammoth" package.\n' +
      '  Install: npm install -g mammoth'
    );
  }
  const r = await mammoth.extractRawText({ path: filepath });
  return r.value;
}

async function readXLSX(filepath) {
  let xlsx;
  try { xlsx = require('xlsx'); }
  catch {
    throw new Error(
      'XLSX support requires the "xlsx" package.\n' +
      '  Install: npm install -g xlsx'
    );
  }
  const wb = xlsx.readFile(filepath);
  const parts = [];
  for (const sheetName of wb.SheetNames) {
    const csv = xlsx.utils.sheet_to_csv(wb.Sheets[sheetName]);
    parts.push(`# Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n');
}

async function readFile(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  switch (ext) {
    case '.pdf':  return readPDF(filepath);
    case '.docx': return readDOCX(filepath);
    case '.xlsx':
    case '.xls':  return readXLSX(filepath);
    case '.md': case '.markdown':
    case '.txt': case '.log':
    case '.json': case '.csv': case '.tsv':
    case '.xml': case '.html': case '.htm':
    case '':
      return readText(filepath);
    default:
      try { return readText(filepath); }
      catch { throw new Error(`Unsupported file type: ${ext}. Use .txt/.md/.pdf/.docx/.xlsx/.csv/.json/.html`); }
  }
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function chunk(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length <= size) return [cleaned];

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + size, cleaned.length);
    if (end < cleaned.length) {
      const paraBreak = cleaned.lastIndexOf('\n\n', end);
      const sentBreak = cleaned.lastIndexOf('. ', end);
      const wsBreak   = cleaned.lastIndexOf(' ', end);
      if (paraBreak > start + size / 2)      end = paraBreak;
      else if (sentBreak > start + size / 2) end = sentBreak + 1;
      else if (wsBreak > start + size / 2)   end = wsBreak;
    }
    chunks.push(cleaned.slice(start, end).trim());
    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : end;
  }
  return chunks.filter(c => c.length > 20);
}

// ── Main ingestion ────────────────────────────────────────────────────────────

async function ingest(filepath, opts = {}) {
  if (!fs.existsSync(filepath)) throw new Error(`File not found: ${filepath}`);

  const basename = path.basename(filepath);
  const ws = opts.workspace || memory.activeWorkspace();

  console.log(`📄 Reading ${basename} (workspace: ${ws})...`);
  const text = await readFile(filepath);

  if (!text || text.trim().length < 50) {
    throw new Error('File is empty or too short to ingest.');
  }

  const chunks = chunk(text, opts.chunkSize || CHUNK_SIZE, opts.overlap || CHUNK_OVERLAP);
  console.log(`   Extracted ${chunks.length} chunks (${text.length} chars total)`);

  if (opts.replace) {
    const removed = memory.forgetBySource(basename, { workspace: ws });
    if (removed > 0) console.log(`   Removed ${removed} existing chunk(s) for ${basename}`);
  }

  const tags = opts.tags || [];
  const saved = [];
  let deduped = 0;
  for (let i = 0; i < chunks.length; i++) {
    const entry = memory.remember(chunks[i], {
      type: 'document',
      source: basename,
      tags: [...tags, `file:${basename}`, `chunk:${i + 1}/${chunks.length}`],
    }, { workspace: ws, dedup: true });
    if (entry._deduped) deduped++;
    saved.push(entry.id);
  }

  const newCount = saved.length - deduped;
  console.log(`✅ Saved ${newCount} new chunk(s) from ${basename}` +
    (deduped > 0 ? ` (${deduped} already existed, skipped)` : ''));
  console.log(`   Search with: geoclaw recall "your question"`);
  const result = { ids: saved, new: newCount, deduped, source: basename };
  // Backwards-compat: callers that did `for...of` or `.length` on the old array
  // still work because we attach length and iterator to the result object.
  Object.defineProperty(result, 'length', { get() { return this.ids.length; } });
  result[Symbol.iterator] = function* () { for (const id of this.ids) yield id; };
  return result;
}

async function removeSource(source, opts = {}) {
  const ws = opts.workspace || memory.activeWorkspace();
  const removed = memory.forgetBySource(source, { workspace: ws });
  console.log(`✓ removed ${removed} chunk(s) from source "${source}" in workspace "${ws}"`);
  return removed;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
Usage: geoclaw ingest <file> [--tag <tag>]... [--replace]
       geoclaw ingest --remove <source-filename>

Supported formats: .txt, .md, .pdf, .docx, .xlsx, .csv, .json, .html
(PDF requires pdf-parse, DOCX requires mammoth, XLSX requires xlsx.)

Flags:
  --tag <tag>     Attach a tag to every chunk (repeatable).
  --replace       Remove existing chunks from this source before re-ingesting.
  --remove <src>  Delete all chunks whose source is <src> and exit.

Active workspace: ${memory.activeWorkspace()}
Override with:    GEOCLAW_WORKSPACE=<name> geoclaw ingest ...

Examples:
  geoclaw ingest manual.pdf
  geoclaw ingest notes.md --tag work
  geoclaw ingest data.xlsx --tag accounting --replace
  geoclaw ingest --remove old-policy.pdf
`);
    process.exit(0);
  }

  const tags = [];
  const files = [];
  let replace = false;
  let removeTarget = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) tags.push(args[++i]);
    else if (args[i] === '--replace') replace = true;
    else if (args[i] === '--remove' && args[i + 1]) { removeTarget = args[++i]; }
    else files.push(args[i]);
  }

  try {
    if (removeTarget) {
      await removeSource(removeTarget);
      return;
    }
    for (const f of files) await ingest(f, { tags, replace });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

module.exports = { ingest, chunk, removeSource };

if (require.main === module) main();
