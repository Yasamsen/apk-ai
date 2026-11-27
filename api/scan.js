// Memindai website untuk pratinjau (nama, ikon, warna tema) sebelum build APK.
// Server mengambil halaman HTTPS publik, membaca <head> dan manifest, lalu mengirim ringkasan JSON.
// Alamat internal/privat diblokir agar endpoint ini tidak bisa dipakai untuk mengintip jaringan dalam.

import dns from 'node:dns/promises';
import net from 'node:net';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;       // maksimal pemindaian per IP per menit (best-effort, per instance)
const HTML_LIMIT = 600_000;      // byte HTML yang dibaca (cukup untuk <head>)
const JSON_LIMIT = 100_000;      // byte manifest yang dibaca
const MAX_REDIRECTS = 3;
const hits = new Map();

const JAVA_WORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue',
  'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if',
  'implements', 'import', 'in', 'instanceof', 'int', 'interface', 'is', 'long', 'native', 'new', 'null',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'this',
  'throw', 'throws', 'transient', 'true', 'false', 'try', 'void', 'volatile', 'while'
]);

class ScanError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function limited(ip) {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [key, list] of hits) if (!list.some(t => now - t < WINDOW_MS)) hits.delete(key);
  }
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('::ffff:')) {
      const rest = v.slice(7);
      return net.isIPv4(rest) ? isPrivateIp(rest) : true;
    }
    return v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v);
  }
  return true;
}

async function assertPublic(u) {
  if (u.protocol !== 'https:') throw new ScanError('Hanya website HTTPS yang bisa dipindai.');
  if (u.username || u.password) throw new ScanError('URL tidak boleh berisi username atau password.');
  if (u.port && u.port !== '443') throw new ScanError('Gunakan alamat website tanpa nomor port khusus.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ScanError('Alamat website tidak diizinkan.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new ScanError('Alamat website tidak diizinkan.');
    return;
  }
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new ScanError('Domain tidak ditemukan. Periksa penulisan URL.', 422);
  }
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) {
    throw new ScanError('Alamat website tidak diizinkan.');
  }
}

async function readLimited(response, limit) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let out = '';
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    out += decoder.decode(value, { stream: true });
    if (total >= limit) {
      try { await reader.cancel(); } catch { /* abaikan */ }
      break;
    }
  }
  return out;
}

async function fetchText(startUrl, { limit, accept, timeoutMs }) {
  let current = new URL(startUrl);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(current);
    const response = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Web2APK-Scanner/1.0)',
        'Accept': accept,
        'Accept-Language': 'id,en;q=0.8'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      try { await response.body?.cancel(); } catch { /* abaikan */ }
      if (!location) throw new ScanError('Pengalihan website tidak valid.', 502);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new ScanError(`Website membalas HTTP ${response.status}.`, 502);
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const text = await readLimited(response, limit);
    return { url: current.href, type, text };
  }
  throw new ScanError('Website terlalu banyak mengalihkan alamat.', 502);
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function safeChar(code) {
  try { return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''; } catch { return ''; }
}

function parseAttrs(text) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(text))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function clean(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function validColor(c) {
  const v = String(c || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v.toLowerCase() : null;
}

function httpsUrl(value, base) {
  try {
    const u = new URL(String(value || '').trim(), base);
    return u.protocol === 'https:' && u.hostname && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function maxSize(sizes) {
  const nums = String(sizes || '').match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : 0;
}

function rateIcon(c) {
  const path = c.url.split('#')[0].split('?')[0];
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  const type = (c.type || '').toLowerCase();
  const usable = ['png', 'jpg', 'jpeg'].includes(ext) || /image\/(png|jpe?g)/.test(type);
  let score = Math.min(c.size || 0, 512);
  if (usable) score += 10_000;
  if (c.apple) score += 500;
  return { usable, score };
}

function pickIcon(candidates) {
  let best = null;
  for (const c of candidates) {
    const r = rateIcon(c);
    if (!best || r.score > best.score) best = { url: c.url, usable: r.usable, score: r.score };
  }
  return best;
}

function parseHtml(html, base) {
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html.slice(0, 200_000);

  const meta = {};
  for (const m of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const a = parseAttrs(m[1]);
    const key = (a.name || a.property || a.itemprop || '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }

  const links = [];
  for (const m of head.matchAll(/<link\b([^>]*)>/gi)) links.push(parseAttrs(m[1]));

  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = clean(decodeEntities(titleMatch ? titleMatch[1] : ''), 120);

  const icons = [];
  let manifestHref = null;
  for (const l of links) {
    const rel = (l.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('manifest') && l.href) manifestHref = httpsUrl(l.href, base);
    if (rel.includes('mask-icon')) continue;
    if ((rel.includes('icon') || rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) && l.href) {
      const url = httpsUrl(l.href, base);
      if (url) icons.push({ url, type: l.type, size: maxSize(l.sizes), apple: rel.some(r => r.startsWith('apple-touch-icon')) });
    }
  }
  return { meta, title, icons, manifestHref };
}

function bestName(parts) {
  for (const p of parts) {
    const t = clean(p, 40);
    if (t) return t;
  }
  return '';
}

function suggestPackage(host) {
  if (!host || net.isIP(host)) return null;
  const parts = host.replace(/^www\./, '').toLowerCase().split('.').filter(Boolean).reverse().slice(0, 5)
    .map(p => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .map(p => (/^[0-9]/.test(p) ? 'a' + p : p))
    .map(p => (JAVA_WORDS.has(p) ? p + 'x' : p));
  if (!parts.length) return null;
  const pkg = [...parts, 'app'].join('.');
  return pkg.length <= 120 ? pkg : null;
}

async function loadManifest(href) {
  if (!href) return null;
  try {
    const r = await fetchText(href, { limit: JSON_LIMIT, accept: 'application/manifest+json,application/json;q=0.9,*/*;q=0.5', timeoutMs: 4000 });
    const json = JSON.parse(r.text);
    if (!json || typeof json !== 'object') return null;
    const icons = [];
    for (const i of Array.isArray(json.icons) ? json.icons : []) {
      const url = httpsUrl(i?.src, r.url);
      if (url) icons.push({ url, type: i.type, size: maxSize(i.sizes), apple: false });
    }
    return {
      name: json.short_name || json.name || '',
      themeColor: json.theme_color,
      backgroundColor: json.background_color,
      icons
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Gunakan metode GET.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'Terlalu banyak pemindaian. Coba lagi sebentar.' });

  const raw = String(req.query?.url || '').trim();
  if (!raw || raw.length > 2000) return res.status(400).json({ error: 'Masukkan URL website terlebih dahulu.' });

  let target;
  try { target = new URL(raw); } catch { return res.status(400).json({ error: 'URL tidak valid. Contoh: https://contoh.com' }); }

  try {
    const page = await fetchText(target, {
      limit: HTML_LIMIT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      timeoutMs: 7000
    });
    if (page.type && !/text\/html|application\/xhtml/.test(page.type)) {
      throw new ScanError('Alamat itu bukan halaman web (HTML).', 422);
    }

    const { meta, title, icons, manifestHref } = parseHtml(page.text, page.url);
    const manifest = await loadManifest(manifestHref);

    const allIcons = [...(manifest?.icons || []), ...icons];
    const icon = pickIcon(allIcons) || pickIcon([{ url: new URL('/favicon.ico', page.url).href, type: 'image/x-icon', size: 0 }]);
    const host = new URL(page.url).hostname;

    const appName = bestName([
      manifest?.name,
      meta['og:site_name'],
      meta['application-name'],
      meta['apple-mobile-web-app-title'],
      title.split(/\s+[|\u2013\u2014\u00b7\u2022-]\s+/)[0],
      title
    ]);

    return res.status(200).json({
      url: page.url,
      host,
      title,
      appName,
      description: clean(meta.description || meta['og:description'], 160),
      themeColor: validColor(meta['theme-color'] || manifest?.themeColor),
      backgroundColor: validColor(manifest?.backgroundColor),
      icon: icon ? icon.url : null,
      iconUsable: icon ? icon.usable : false,
      hasManifest: Boolean(manifest),
      suggestedPackage: suggestPackage(host)
    });
  } catch (err) {
    if (err instanceof ScanError) return res.status(err.status).json({ error: err.message });
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Website terlalu lama merespons. Coba lagi nanti.' });
    }
    console.error('scan failed', err?.message || err);
    return res.status(502).json({ error: 'Tidak bisa menghubungi website itu. Pastikan alamatnya benar dan bisa dibuka.' });
  }
}
