#!/usr/bin/env node
// Geoclaw Firecrawl integration — web scraping, crawling, and site mapping.
//
// Works with:
//   - Self-hosted Firecrawl (https://github.com/mendableai/firecrawl)
//     Default URL: http://localhost:3002  No API key needed.
//   - Firecrawl Cloud (https://firecrawl.dev)
//     Set GEOCLAW_FIRECRAWL_API_KEY to your FC-... key.
//
// Configure via .env:
//   GEOCLAW_FIRECRAWL_BASE_URL=http://localhost:3002   (self-hosted)
//   GEOCLAW_FIRECRAWL_API_KEY=FC-...                   (cloud or self-hosted with auth)

'use strict';

const https  = require('https');
const http   = require('http');
const { URL } = require('url');

const DEFAULT_BASE = process.env.GEOCLAW_FIRECRAWL_BASE_URL || 'http://localhost:3002';
const API_KEY      = process.env.GEOCLAW_FIRECRAWL_API_KEY  || '';
const TIMEOUT_MS   = parseInt(process.env.GEOCLAW_FIRECRAWL_TIMEOUT_MS || '60000', 10);
const CRAWL_POLL_MS = 2500;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(method, urlStr, body, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

    const req = lib.request(u, { method, headers, timeout: timeoutMs }, (res) => {
      let s = '';
      res.on('data', c => (s += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(Object.assign(
            new Error(`Firecrawl HTTP ${res.statusCode}: ${s.slice(0, 300)}`),
            { statusCode: res.statusCode },
          ));
        }
        try { resolve(JSON.parse(s)); }
        catch { resolve({ raw: s }); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Firecrawl request timed out after ${timeoutMs}ms`)));
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error(
          `Cannot connect to Firecrawl at ${DEFAULT_BASE}. ` +
          `Start it with: docker run -p 3002:3002 mendableai/firecrawl  ` +
          `or set GEOCLAW_FIRECRAWL_BASE_URL to point to your instance.`,
        ));
      } else {
        reject(e);
      }
    });
    if (data) req.write(data);
    req.end();
  });
}

function apiUrl(path) {
  return `${DEFAULT_BASE.replace(/\/+$/, '')}/v1/${path.replace(/^\//, '')}`;
}

// ── scrape ────────────────────────────────────────────────────────────────────
// Scrape a single URL. Returns markdown, html, or both.

async function scrape(url, opts = {}) {
  const {
    formats    = ['markdown'],
    maxChars   = 20000,
    screenshot = false,
    actions    = null,   // [{type:'click',selector:'...'}, {type:'scroll',...}]
  } = opts;

  const body = { url, formats: [...formats] };
  if (screenshot) body.formats.push('screenshot');
  if (actions && actions.length) body.actions = actions;

  const data = await request('POST', apiUrl('scrape'), body);

  const md = (data.data?.markdown || data.markdown || '').slice(0, maxChars);
  const truncated = (data.data?.markdown || data.markdown || '').length > maxChars;
  return {
    ok: true,
    url:      data.data?.metadata?.sourceURL || url,
    title:    data.data?.metadata?.title || '',
    markdown: md + (truncated ? '\n\n[...truncated]' : ''),
    html:     formats.includes('html') ? (data.data?.html || '') : undefined,
    screenshot: screenshot ? (data.data?.screenshot || null) : undefined,
    metadata: data.data?.metadata || {},
  };
}

// ── crawl ─────────────────────────────────────────────────────────────────────
// Crawl an entire website. Returns an array of scraped pages.
// Polls the crawl job until complete.

async function crawl(url, opts = {}) {
  const {
    limit      = 20,
    maxDepth   = 3,
    formats    = ['markdown'],
    maxChars   = 5000,
    onProgress = null,
  } = opts;

  // Start crawl job
  const start = await request('POST', apiUrl('crawl'), {
    url,
    limit,
    maxDepth,
    scrapeOptions: { formats },
  });

  const jobId = start.id || start.jobId;
  if (!jobId) throw new Error(`Firecrawl crawl: no job ID in response: ${JSON.stringify(start).slice(0, 200)}`);

  // Poll until done
  let attempts = 0;
  const maxAttempts = Math.ceil(TIMEOUT_MS / CRAWL_POLL_MS);
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, CRAWL_POLL_MS));
    attempts++;

    const status = await request('GET', apiUrl(`crawl/${jobId}`));
    if (onProgress) onProgress({ status: status.status, completed: status.completed, total: status.total });

    if (status.status === 'completed' || status.status === 'done') {
      const pages = (status.data || []).map(p => ({
        url:      p.metadata?.sourceURL || '',
        title:    p.metadata?.title     || '',
        markdown: (p.markdown || '').slice(0, maxChars),
      }));
      return { ok: true, jobId, pages, total: pages.length };
    }
    if (status.status === 'failed') {
      throw new Error(`Firecrawl crawl job ${jobId} failed`);
    }
  }
  throw new Error(`Firecrawl crawl job ${jobId} timed out after ${(maxAttempts * CRAWL_POLL_MS / 1000).toFixed(0)}s`);
}

// ── map ───────────────────────────────────────────────────────────────────────
// Return all URLs found on a site (fast — no content extraction).

async function map(url, opts = {}) {
  const { includeSubdomains = false, limit = 200 } = opts;
  const data = await request('POST', apiUrl('map'), { url, includeSubdomains, limit });
  const links = data.links || data.urls || [];
  return { ok: true, url, links, total: links.length };
}

// ── extract ───────────────────────────────────────────────────────────────────
// Extract structured data from a URL using a prompt/schema.

async function extract(url, { prompt, schema } = {}) {
  const body = { urls: [url] };
  if (prompt) body.prompt = prompt;
  if (schema) body.schema = schema;
  const data = await request('POST', apiUrl('extract'), body);
  return { ok: true, url, data: data.data || data };
}

// ── health check ──────────────────────────────────────────────────────────────

async function ping() {
  try {
    const data = await request('GET', `${DEFAULT_BASE.replace(/\/+$/, '')}/health`, null, 5000);
    return { ok: true, status: data.status || 'ok', base: DEFAULT_BASE };
  } catch (e) {
    return { ok: false, error: e.message, base: DEFAULT_BASE };
  }
}

module.exports = { scrape, crawl, map, extract, ping, DEFAULT_BASE };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const sub  = args[0];
  const rest = args.slice(1);
  const flag = (name) => rest.includes(`--${name}`);
  const opt  = (name, def) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : def; };

  async function main() {
    switch (sub) {
      case 'scrape': {
        const url = rest.find(a => !a.startsWith('--'));
        if (!url) { console.log('Usage: geoclaw firecrawl scrape <url> [--html] [--max N]'); return; }
        const res = await scrape(url, {
          formats: flag('html') ? ['markdown', 'html'] : ['markdown'],
          maxChars: parseInt(opt('max', '20000'), 10),
        });
        if (flag('json')) { console.log(JSON.stringify(res, null, 2)); return; }
        if (res.title) console.log(`# ${res.title}\n`);
        console.log(res.markdown);
        break;
      }
      case 'crawl': {
        const url = rest.find(a => !a.startsWith('--'));
        if (!url) { console.log('Usage: geoclaw firecrawl crawl <url> [--limit N] [--depth N]'); return; }
        console.log(`Crawling ${url}…`);
        const res = await crawl(url, {
          limit:    parseInt(opt('limit', '20'),  10),
          maxDepth: parseInt(opt('depth', '3'),   10),
          onProgress: p => process.stderr.write(`\r  ${p.status} ${p.completed || 0}/${p.total || '?'} pages`),
        });
        process.stderr.write('\n');
        if (flag('json')) { console.log(JSON.stringify(res, null, 2)); return; }
        console.log(`Crawled ${res.total} pages:\n`);
        for (const p of res.pages) {
          console.log(`## ${p.title || p.url}`);
          console.log(`URL: ${p.url}`);
          console.log(p.markdown.slice(0, 500) + (p.markdown.length > 500 ? '\n…' : ''));
          console.log('');
        }
        break;
      }
      case 'map': {
        const url = rest.find(a => !a.startsWith('--'));
        if (!url) { console.log('Usage: geoclaw firecrawl map <url> [--subdomains]'); return; }
        const res = await map(url, { includeSubdomains: flag('subdomains') });
        if (flag('json')) { console.log(JSON.stringify(res, null, 2)); return; }
        console.log(`Found ${res.total} URLs on ${url}:\n`);
        res.links.forEach(l => console.log(`  ${l}`));
        break;
      }
      case 'ping': {
        const res = await ping();
        console.log(res.ok ? `✓ Firecrawl reachable at ${res.base}` : `✗ ${res.error}`);
        break;
      }
      default:
        console.log('Usage: geoclaw firecrawl <subcommand> [options]');
        console.log('');
        console.log('Subcommands:');
        console.log('  scrape <url>   Scrape a single page → markdown');
        console.log('  crawl  <url>   Crawl an entire site → list of pages');
        console.log('  map    <url>   List all URLs on a site');
        console.log('  ping           Check if Firecrawl is running');
        console.log('');
        console.log('Setup:');
        console.log('  Self-hosted:  docker run -p 3002:3002 mendableai/firecrawl');
        console.log('                GEOCLAW_FIRECRAWL_BASE_URL=http://localhost:3002');
        console.log('  Cloud:        GEOCLAW_FIRECRAWL_API_KEY=FC-... (firecrawl.dev)');
    }
  }

  main().catch(e => { console.error(`firecrawl error: ${e.message}`); process.exit(1); });
}
