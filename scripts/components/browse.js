#!/usr/bin/env node
// Geoclaw web browsing — fetch a URL and extract readable content with typed
// refs the agent can reason about: [link N], [button N], [input text N], etc.
//
// Pure Node core: no npm deps. Static HTML only; JS-rendered SPAs are marked
// as "likely JS-rendered" in the result so the agent can tell the user.
//
// CLI:
//   geoclaw browse <url> [--format markdown|text|json] [--max N]
//
// API:
//   const { browse, readable } = require('./browse.js');
//   const result = await browse('https://example.com');
//   // { ok, url, title, markdown, refs, bytes, lang, hint? }

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_UA = 'Mozilla/5.0 (compatible; Geoclaw/1.0; +https://github.com/nadavsimba24/geoclaw-universal)';
const DEFAULT_TIMEOUT = 15000;
const DEFAULT_MAX = 20000;

// ── HTTP fetch (follows redirects, handles gzip) ─────────────────────────────

function fetchHtml(url, { userAgent = DEFAULT_UA, timeout = DEFAULT_TIMEOUT, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error(`invalid URL: ${url}`)); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return reject(new Error(`unsupported protocol: ${u.protocol}`));
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, u).toString();
        return fetchHtml(next, { userAgent, timeout, redirects: redirects - 1 }).then(resolve, reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(Object.assign(new Error(`HTTP ${res.statusCode} for ${url}`), { statusCode: res.statusCode }));
      }
      const chunks = [];
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      if (enc === 'gzip' || enc === 'deflate') {
        const zlib = require('zlib');
        stream = res.pipe(enc === 'gzip' ? zlib.createGunzip() : zlib.createInflate());
      }
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ctype = String(res.headers['content-type'] || '');
        const charset = /charset=([^;]+)/i.exec(ctype)?.[1]?.trim().toLowerCase() || 'utf-8';
        let text;
        try { text = buf.toString(charset === 'utf8' ? 'utf-8' : charset); }
        catch { text = buf.toString('utf-8'); }
        resolve({ url: u.toString(), html: text, contentType: ctype, bytes: buf.length });
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error(`timeout fetching ${url}`)));
  });
}

// ── HTML → Markdown with typed refs ──────────────────────────────────────────
// We don't use a full DOM parser. We tokenize the HTML stream enough to:
//   1. Drop <script>, <style>, <noscript>, <svg>, <iframe>, <head>
//   2. Extract the <title>
//   3. Walk block/inline tags producing markdown
//   4. Number <a>, <button>, <input>, <textarea>, <select> as refs
//   5. Record each ref's metadata (href, name, value, type, label)

const BLOCK_TAGS = new Set(['p','div','section','article','main','header','footer','nav','aside','ul','ol','li','table','tr','td','th','blockquote','pre','hr','form','fieldset','details','summary']);
const HEADING_TAGS = { h1:'# ', h2:'## ', h3:'### ', h4:'#### ', h5:'##### ', h6:'###### ' };
const SKIP_TAGS = new Set(['script','style','noscript','svg','iframe','head','template','meta','link']);

const ENTITY = {
  amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', ndash:'–', mdash:'—',
  lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”', hellip:'…',
};
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m);
}

function parseAttrs(tagContent) {
  const attrs = {};
  // Greedy enough for real-world tags; handles "a", 'a', and bareword values.
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  re.lastIndex = 0;
  let m;
  // Skip the tag name at the start.
  const nameMatch = /^\s*([a-zA-Z][-a-zA-Z0-9]*)\s*/.exec(tagContent);
  if (!nameMatch) return attrs;
  re.lastIndex = nameMatch[0].length;
  while ((m = re.exec(tagContent))) {
    const key = m[1].toLowerCase();
    const val = m[3] ?? m[4] ?? m[5] ?? '';
    attrs[key] = decodeEntities(val);
  }
  return attrs;
}

function readable(html, baseUrl) {
  const refs = {};
  let refId = 0;
  const nextRef = () => ++refId;

  // Extract <title> before we strip it.
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  // Extract lang hint.
  const langMatch = /<html[^>]*\blang\s*=\s*["']?([a-z]{2}(?:-[A-Za-z0-9]+)?)/i.exec(html);
  const lang = langMatch ? langMatch[1].toLowerCase() : '';

  // Strip comments, skipped blocks, and <head>.
  let src = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|iframe|head|template)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|noscript|svg|iframe|head|template)[^>]*\/?>/gi, '');

  // Prefer <main> or <article> body if present.
  const mainM = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(src);
  const articleM = !mainM && /<article[^>]*>([\s\S]*?)<\/article>/i.exec(src);
  if (mainM) src = mainM[1];
  else if (articleM) src = articleM[1];
  else {
    const bodyM = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(src);
    if (bodyM) src = bodyM[1];
  }

  // Tokenize: alternating tags and text.
  const tokens = [];
  const tagRe = /<(\/?)([a-zA-Z][-a-zA-Z0-9]*)([^>]*)>/g;
  let lastIndex = 0;
  let m;
  while ((m = tagRe.exec(src))) {
    if (m.index > lastIndex) {
      tokens.push({ kind: 'text', text: src.slice(lastIndex, m.index) });
    }
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const rest = m[3] || '';
    const selfClose = rest.trim().endsWith('/');
    tokens.push({ kind: closing ? 'close' : 'open', name, attrs: closing ? {} : parseAttrs(name + ' ' + rest), selfClose });
    lastIndex = tagRe.lastIndex;
  }
  if (lastIndex < src.length) tokens.push({ kind: 'text', text: src.slice(lastIndex) });

  // Walk tokens. We track a small stack for list/ol context.
  const out = [];
  const listStack = []; // { kind: 'ul'|'ol', index }
  const anchorStack = []; // stack of { id, startIdx } to capture <a>…</a> label
  const buttonStack = []; // stack for <button>…</button>
  const skipStack = []; // push skipped-tag names when we need to drop inner text

  const push = (s) => { if (s) out.push(s); };
  const nl = () => { if (!out.length || !/\n\n$/.test(out.join(''))) push('\n'); };

  function absUrl(href) {
    if (!href) return '';
    try { return new URL(href, baseUrl).toString(); } catch { return href; }
  }

  function trimText(t) {
    return decodeEntities(t).replace(/\s+/g, ' ');
  }

  for (const tok of tokens) {
    if (tok.kind === 'text') {
      if (skipStack.length) continue;
      const text = trimText(tok.text);
      if (!text.trim()) {
        // Collapse whitespace between tags to a single space.
        if (out.length && !/\s$/.test(out[out.length - 1])) push(' ');
        continue;
      }
      // Feed text to nearest open anchor/button label if any.
      if (anchorStack.length) anchorStack[anchorStack.length - 1].label += text;
      else if (buttonStack.length) buttonStack[buttonStack.length - 1].label += text;
      else push(text);
      continue;
    }

    const { kind, name, attrs } = tok;

    if (kind === 'open' && SKIP_TAGS.has(name)) {
      skipStack.push(name);
      continue;
    }
    if (kind === 'close' && SKIP_TAGS.has(name)) {
      const top = skipStack[skipStack.length - 1];
      if (top === name) skipStack.pop();
      continue;
    }
    if (skipStack.length) continue;

    if (kind === 'open') {
      if (name === 'br') { push('\n'); continue; }
      if (name === 'hr') { push('\n\n---\n\n'); continue; }
      if (HEADING_TAGS[name]) { push('\n\n' + HEADING_TAGS[name]); continue; }
      if (BLOCK_TAGS.has(name)) {
        if (name === 'ul' || name === 'ol') listStack.push({ kind: name, i: 0 });
        if (name === 'li') {
          const top = listStack[listStack.length - 1];
          const indent = '  '.repeat(Math.max(0, listStack.length - 1));
          push('\n' + indent + (top && top.kind === 'ol' ? `${++top.i}. ` : '- '));
          continue;
        }
        push('\n\n');
        continue;
      }
      if (name === 'a') {
        const id = nextRef();
        refs[id] = { type: 'link', href: absUrl(attrs.href), title: attrs.title || '' };
        anchorStack.push({ id, label: '' });
        continue;
      }
      if (name === 'button') {
        const id = nextRef();
        refs[id] = { type: 'button', name: attrs.name || '', value: attrs.value || '' };
        buttonStack.push({ id, label: '' });
        continue;
      }
      if (name === 'input') {
        const type = (attrs.type || 'text').toLowerCase();
        if (type === 'hidden' || type === 'submit' && !attrs.value) continue;
        const id = nextRef();
        refs[id] = { type: `input ${type}`, name: attrs.name || '', value: attrs.value || '', placeholder: attrs.placeholder || '' };
        const label = attrs.placeholder || attrs.value || attrs.name || type;
        push(` [input ${type} ${id}] ${label}`);
        continue;
      }
      if (name === 'textarea') {
        const id = nextRef();
        refs[id] = { type: 'textarea', name: attrs.name || '', placeholder: attrs.placeholder || '' };
        push(` [textarea ${id}] ${attrs.placeholder || attrs.name || ''}`);
        continue;
      }
      if (name === 'select') {
        const id = nextRef();
        refs[id] = { type: 'select', name: attrs.name || '' };
        push(` [select ${id}] ${attrs.name || ''}`);
        continue;
      }
      if (name === 'img') {
        const alt = (attrs.alt || '').trim();
        const src = absUrl(attrs.src);
        if (alt || src) {
          const id = nextRef();
          refs[id] = { type: 'image', src, alt };
          push(` [image ${id}] ${alt || src.split('/').pop() || 'image'}`);
        }
        continue;
      }
      if (name === 'strong' || name === 'b') { push('**'); continue; }
      if (name === 'em' || name === 'i')     { push('*'); continue; }
      if (name === 'code')                   { push('`'); continue; }
      // Unknown inline: passthrough text.
      continue;
    }

    // kind === 'close'
    if (name === 'a' && anchorStack.length) {
      const a = anchorStack.pop();
      const label = a.label.trim() || refs[a.id].href.replace(/^https?:\/\//, '').slice(0, 40);
      refs[a.id].label = label;
      push(`[link ${a.id}] ${label}`);
      continue;
    }
    if (name === 'button' && buttonStack.length) {
      const b = buttonStack.pop();
      const label = b.label.trim() || refs[b.id].name || 'button';
      refs[b.id].label = label;
      push(`[button ${b.id}] ${label}`);
      continue;
    }
    if (HEADING_TAGS[name])    { push('\n\n'); continue; }
    if (BLOCK_TAGS.has(name)) {
      if (name === 'ul' || name === 'ol') listStack.pop();
      push('\n');
      continue;
    }
    if (name === 'strong' || name === 'b') { push('**'); continue; }
    if (name === 'em' || name === 'i')     { push('*'); continue; }
    if (name === 'code')                   { push('`'); continue; }
  }

  // Collapse whitespace and empty lines.
  const md = out.join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, markdown: md, refs, lang };
}

// ── Playwright integration (optional) ────────────────────────────────────────

function hasPlaywright() {
  try { require.resolve('playwright'); return true; } catch { return false; }
}

// ── Public API ───────────────────────────────────────────────────────────────

async function browse(url, opts = {}) {
  const { maxChars = DEFAULT_MAX } = opts;
  const { url: finalUrl, html, bytes, contentType } = await fetchHtml(url, opts);
  const isHtml = /html|xml/i.test(contentType) || /^\s*</.test(html);
  if (!isHtml) {
    return {
      ok: true, url: finalUrl, title: '', markdown: html.slice(0, maxChars), refs: {}, bytes,
      contentType, lang: '',
    };
  }
  const { title, markdown, refs, lang } = readable(html, finalUrl);
  const truncated = markdown.length > maxChars;
  const out = {
    ok: true,
    url: finalUrl,
    title,
    markdown: truncated ? markdown.slice(0, maxChars) + '\n\n[...truncated]' : markdown,
    refs,
    bytes,
    lang,
  };
  // Heuristic: SPA pages often return tiny HTML bodies after stripping.
  if (!hasPlaywright() && markdown.length < 200 && bytes > 2000) {
    out.hint = 'page looks JS-rendered (little static content). Install Playwright for click/type access: `npm i playwright && npx playwright install chromium`.';
  }
  if (hasPlaywright()) out.playwright = true;
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`Usage: geoclaw browse <url> [options]

  --format <markdown|text|json>   output format (default: markdown)
  --max <N>                       truncate markdown to N chars (default: ${DEFAULT_MAX})
  --refs                          also print the ref table (links/buttons/inputs)
`);
}

async function main(argv) {
  const args = argv.slice(0);
  if (!args.length || args[0] === '-h' || args[0] === '--help') { printUsage(); return; }
  const url = args.shift();
  const opts = { format: 'markdown', showRefs: false, maxChars: DEFAULT_MAX };
  while (args.length) {
    const a = args.shift();
    if (a === '--format') opts.format = args.shift();
    else if (a === '--max') opts.maxChars = parseInt(args.shift(), 10);
    else if (a === '--refs') opts.showRefs = true;
  }
  try {
    const r = await browse(url, { maxChars: opts.maxChars });
    if (opts.format === 'json') {
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    if (r.title) console.log(`# ${r.title}\n`);
    console.log(`<${r.url}>\n`);
    console.log(r.markdown);
    if (opts.showRefs) {
      console.log('\n---\nRefs:');
      for (const [id, v] of Object.entries(r.refs)) {
        const extra = v.href || v.src || v.name || '';
        console.log(`  [${v.type} ${id}] ${v.label || ''}${extra ? '  → ' + extra : ''}`);
      }
    }
    if (r.hint) console.log(`\n(hint: ${r.hint})`);
  } catch (e) {
    console.error('browse failed:', e.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  browse,
  readable,
  fetchHtml,
  hasPlaywright,
};
