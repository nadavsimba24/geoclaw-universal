#!/usr/bin/env node
// Geoclaw web search — free-first, key-enhanced.
// Priority: Brave (key) → Serper (key) → DuckDuckGo HTML → DDG Instant Answers.
// Each returns { ok, results:[{title,url,snippet}], source, query }.

'use strict';

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');
const { URL } = require('url');

const DEFAULT_UA      = 'Mozilla/5.0 (compatible; Geoclaw/1.0; +https://github.com/nadavsimba24/geoclaw-universal)';
const DEFAULT_TIMEOUT = 12000;
const DEFAULT_LIMIT   = 8;

// ── Low-level HTTP ────────────────────────────────────────────────────────────

function httpGet(urlStr, { headers = {}, timeout = DEFAULT_TIMEOUT, redirects = 4 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET',
      headers: { 'User-Agent': DEFAULT_UA, 'Accept-Encoding': 'gzip,deflate', ...headers },
      timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, urlStr).href;
        res.resume();
        return resolve(httpGet(next, { headers, timeout, redirects: redirects - 1 }));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = res.headers['content-encoding'] || '';
        const dec = enc.includes('gzip')    ? () => zlib.gunzipSync(raw).toString('utf8')
                  : enc.includes('deflate') ? () => zlib.inflateSync(raw).toString('utf8')
                  : () => raw.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: dec() });
        } catch(e) {
          resolve({ status: res.statusCode, headers: res.headers, body: raw.toString('utf8') });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function httpJSON(urlStr, opts) {
  return httpGet(urlStr, opts).then(r => {
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(r.body);
  });
}

// ── Brave Search API (2000 free/month — console.brave.com) ───────────────────

async function searchBrave(query, { apiKey, limit = DEFAULT_LIMIT } = {}) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}&text_decorations=false`;
  const data = await httpJSON(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } });
  const results = (data.web?.results || []).map(r => ({
    title:   r.title   || '',
    url:     r.url     || '',
    snippet: r.description || '',
  }));
  return { ok: true, results, source: 'brave', query };
}

// ── Serper.dev (2500 free/month — serper.dev) ─────────────────────────────────

async function searchSerper(query, { apiKey, limit = DEFAULT_LIMIT } = {}) {
  const body = JSON.stringify({ q: query, num: limit });
  const data = await new Promise((resolve, reject) => {
    const req = https.request('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let s = '';
      res.on('data', c => (s += c));
      res.on('end', () => {
        try { resolve(JSON.parse(s)); }
        catch(e) { reject(new Error('bad json')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  const results = (data.organic || []).slice(0, limit).map(r => ({
    title:   r.title   || '',
    url:     r.link    || '',
    snippet: r.snippet || '',
  }));
  return { ok: true, results, source: 'serper', query };
}

// ── DuckDuckGo HTML scrape (free, no key) ─────────────────────────────────────

async function searchDDGHtml(query, { limit = DEFAULT_LIMIT } = {}) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const { body, status } = await httpGet(url, { headers: { 'Accept': 'text/html' } });
  if (status < 200 || status >= 300) throw new Error(`DDG HTML ${status}`);

  const results = [];
  // Each result: <a class="result__a" href="...">title</a> + <a class="result__snippet">snippet</a>
  const linkRe   = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe   = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const links   = [...body.matchAll(linkRe)].slice(0, limit);
  const snips   = [...body.matchAll(snipRe)].slice(0, limit);

  for (let i = 0; i < links.length; i++) {
    let href = links[i][1];
    const title = links[i][2].replace(/<[^>]+>/g, '').trim();
    const snippet = (snips[i]?.[1] || '').replace(/<[^>]+>/g, '').trim();
    // DDG wraps URLs through their redirect; unwrap if possible
    try {
      const uddg = new URL(href);
      const realUrl = uddg.searchParams.get('uddg') || uddg.searchParams.get('u') || href;
      href = realUrl;
    } catch { /* keep original */ }
    if (href && title) results.push({ title, url: href, snippet });
  }
  return { ok: true, results, source: 'duckduckgo', query };
}

// ── DuckDuckGo Instant Answers (always available, no key) ─────────────────────

async function searchDDGInstant(query, { limit = DEFAULT_LIMIT } = {}) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await httpJSON(url);
  const results = [];

  if (data.AbstractURL && data.AbstractText) {
    results.push({ title: data.Heading || query, url: data.AbstractURL, snippet: data.AbstractText });
  }
  for (const r of (data.RelatedTopics || []).slice(0, limit - 1)) {
    if (r.FirstURL && r.Text) {
      results.push({ title: r.Text.slice(0, 80), url: r.FirstURL, snippet: r.Text });
    }
    if (results.length >= limit) break;
  }
  if (results.length === 0 && data.Answer) {
    results.push({ title: query, url: '', snippet: data.Answer });
  }
  return { ok: true, results, source: 'duckduckgo-instant', query };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

const BRAVE_KEY  = process.env.GEOCLAW_BRAVE_API_KEY  || '';
const SERPER_KEY = process.env.GEOCLAW_SERPER_API_KEY || '';

async function webSearch(query, { limit = DEFAULT_LIMIT } = {}) {
  const errors = [];

  if (BRAVE_KEY) {
    try { return await searchBrave(query, { apiKey: BRAVE_KEY, limit }); }
    catch(e) { errors.push(`brave: ${e.message}`); }
  }

  if (SERPER_KEY) {
    try { return await searchSerper(query, { apiKey: SERPER_KEY, limit }); }
    catch(e) { errors.push(`serper: ${e.message}`); }
  }

  try { return await searchDDGHtml(query, { limit }); }
  catch(e) { errors.push(`ddg-html: ${e.message}`); }

  try { return await searchDDGInstant(query, { limit }); }
  catch(e) { errors.push(`ddg-instant: ${e.message}`); }

  return { ok: false, error: `all search backends failed: ${errors.join('; ')}`, query };
}

module.exports = { webSearch, searchBrave, searchSerper, searchDDGHtml, searchDDGInstant };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const query = args.filter(a => !a.startsWith('--')).join(' ');
  const fmt = args.includes('--json') ? 'json' : 'text';

  if (!query) {
    console.log('Usage: geoclaw search <query> [--json]');
    console.log('       GEOCLAW_BRAVE_API_KEY=... geoclaw search <query>');
    console.log('       GEOCLAW_SERPER_API_KEY=... geoclaw search <query>');
    process.exit(0);
  }

  webSearch(query).then(r => {
    if (fmt === 'json') { console.log(JSON.stringify(r, null, 2)); return; }
    if (!r.ok) { console.error(`search failed: ${r.error}`); process.exit(1); }
    console.log(`\n[${r.source}] Results for: ${r.query}\n`);
    for (const [i, res] of r.results.entries()) {
      console.log(`${i + 1}. ${res.title}`);
      if (res.url) console.log(`   ${res.url}`);
      if (res.snippet) console.log(`   ${res.snippet.slice(0, 160)}`);
      console.log('');
    }
  }).catch(e => { console.error(e.message); process.exit(1); });
}
