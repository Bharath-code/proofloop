import express from 'express';
import fsp from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { db } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const DATA = path.join(__dirname, '..', 'data');

const app = express();
app.use(express.json({ limit: '32kb' }));

const HEX = /^#[0-9a-f]{6}$/i;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const MAX_BODY_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// SSRF hardening.
// Demo-scope simplifications (documented, not silent):
// - No TOCTOU defense against DNS rebinding (the lookup result is not pinned
//   to the socket fetch actually uses). Closing that requires a custom
//   dispatcher/agent that connects to the resolved IP.
// - NAT64 (64:ff9b::/96) and 6to4/Teredo relays are not treated as private.
// ---------------------------------------------------------------------------

function parseHost(hostname) {
  let h = String(hostname).toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  return h;
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8 ("this network")
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) // 192.168.0.0/16
  );
}

function expandIpv6(addr) {
  if (addr.split('::').length > 2) return null;
  const [head, tail = ''] = addr.split('::');
  const headG = head ? head.split(':').filter(Boolean) : [];
  const tailG = tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - headG.length - tailG.length;
  if (missing < 0) return null;
  return [...headG, ...Array(missing).fill('0'), ...tailG].map((g) => g.padStart(4, '0'));
}

function isPrivateIPv6(addr) {
  const a = addr.toLowerCase();
  // Decimal-dotted IPv4 embedded directly (e.g. ::ffff:127.0.0.1)
  const dotted = a.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIPv4(dotted[1]);

  const groups = expandIpv6(a);
  if (!groups) return true; // unparseable → block
  if (groups.every((g) => g === '0000')) return true; // unspecified ::
  if (groups.slice(0, 7).every((g) => g === '0000') && groups[7] === '0001') return true; // loopback

  // IPv4-mapped ::ffff:0:0/96 (hex-encoded last two groups)
  if (groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff') {
    const hi = parseInt(groups[6], 16);
    const lo = parseInt(groups[7], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  const g0 = groups[0];
  if (g0.startsWith('fc') || g0.startsWith('fd')) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(g0)) return true; // fe80::/10 link-local
  return false;
}

function isPrivateLiteral(hostname) {
  const h = parseHost(hostname);
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIPv4(h)) return isPrivateIPv4(h);
  if (h.includes(':')) return isPrivateIPv6(h);
  return false; // domain names need DNS resolution
}

async function resolvesToPrivate(hostname) {
  const h = parseHost(hostname);
  if (isPrivateLiteral(h)) return true;
  if (net.isIPv4(h) || h.includes(':')) return false; // literal IP, already checked
  try {
    const addrs = await dns.lookup(h, { all: true });
    return addrs.some(({ address }) => isPrivateLiteral(address));
  } catch {
    return true; // unresolvable → block
  }
}

// Follows redirects manually, re-validating protocol + host on every hop.
async function safeFetch(urlStr, opts = {}) {
  let current = new URL(urlStr);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(current.protocol)) throw new Error('blocked protocol');
    if (await resolvesToPrivate(current.hostname)) throw new Error('blocked host');
    const res = await fetch(current, { ...opts, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('redirect without location');
      current = new URL(loc, current);
      continue;
    }
    return { res, finalUrl: current.toString() };
  }
  throw new Error('too many redirects');
}

// Streams the body with a hard byte cap so an oversized response can never
// fully buffer into memory.
async function readCapped(res, cap = MAX_BODY_BYTES) {
  const lenHeader = Number(res.headers.get('content-length'));
  if (Number.isFinite(lenHeader) && lenHeader > cap) throw new Error('response too large');
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      try {
        await reader.cancel();
      } catch {
        /* reader already closed */
      }
      throw new Error('response too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function meta(html, re) {
  const m = html.match(re);
  if (!m) return null;
  return decodeEntities(m[1].trim());
}

function hexLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function extractBrand(url) {
  const { res } = await safeFetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(6500),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('html') && !type.includes('text')) throw new Error('not html');
  const html = await readCapped(res);

  const ogSite =
    meta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    meta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  const ogTitle =
    meta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    meta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const title = meta(html, /<title[^>]*>([^<]+)<\/title>/i);
  const themeColor =
    meta(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ||
    meta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);

  let name = ogSite || ogTitle || title || null;
  if (name) {
    name = name
      .replace(/\s*[|·—-]\s*Google Maps\s*$/i, '')
      .split(/\s*[|·—–]\s*/)[0]
      .trim()
      .slice(0, 80);
  }

  // Build { href, isApple } pairs in one pass so the apple-touch-icon lookup
  // can never misalign with the href list.
  const iconTags = [
    ...html.matchAll(
      /<link[^>]+rel=["'][^"']*(?:apple-touch-icon|shortcut icon|icon)[^"']*["'][^>]*>/gi,
    ),
  ]
    .map((m) => ({
      href: m[0].match(/href=["']([^"']+)["']/i)?.[1] ?? null,
      isApple: /apple-touch-icon/i.test(m[0]),
    }))
    .filter((t) => t.href);

  const favicon = iconTags.find((t) => t.isApple)?.href ?? iconTags[0]?.href ?? '/favicon.ico';
  let logoUrl = null;
  try {
    logoUrl = decodeEntities(new URL(favicon, url).toString());
  } catch {
    logoUrl = null;
  }

  const themeClean = (themeColor || '').trim().toLowerCase();
  // Only accept usable accent colors: valid hex with mid-range luminance
  // (near-black/near-white theme-colors are invisible as widget accents).
  const accent =
    HEX.test(themeClean) && hexLuminance(themeClean) > 0.08 && hexLuminance(themeClean) < 0.92
      ? themeClean
      : null;

  return { name, logoUrl, accent };
}

async function resolveMapsName(url) {
  const { finalUrl } = await safeFetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(6500),
  });
  const u = new URL(finalUrl);
  const m = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (m) return decodeURIComponent(m[1].replace(/\+/g, ' '));
  const q = u.searchParams.get('q') || u.searchParams.get('query');
  return q || null;
}

app.post('/api/brand', async (req, res) => {
  const { url, resolveMaps } = req.body || {};
  if (typeof url !== 'string' || url.length > 2048) {
    return res.status(400).json({ ok: false, error: 'invalid url' });
  }
  let u;
  try {
    u = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid url' });
  }
  if (!/^https?:$/.test(u.protocol) || (await resolvesToPrivate(u.hostname))) {
    return res.status(400).json({ ok: false, error: 'blocked host' });
  }

  try {
    const isMaps =
      resolveMaps ||
      (u.hostname.includes('google.') && u.pathname.includes('/maps')) ||
      u.hostname === 'maps.app.goo.gl';
    if (isMaps) {
      const name = await resolveMapsName(u.toString());
      return res.json({ ok: true, name, logoUrl: null, accent: null });
    }
    const brand = await extractBrand(u.toString());
    return res.json({ ok: true, ...brand });
  } catch {
    return res.json({ ok: true, name: null, logoUrl: null, accent: null });
  }
});

// Serialize lead writes: a promise-chain mutex prevents concurrent
// read-modify-write cycles from clobbering each other's submissions.
let leadsLock = Promise.resolve();

app.post('/api/leads', (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ ok: false });
  }
  leadsLock = leadsLock.then(async () => {
    let saved = false;
    if (db) {
      try {
        // Plain insert: the gateway rejects anon upserts, so duplicates are
        // detected via the unique constraint (23505 = already subscribed).
        const { error } = await db.from('leads').insert({ email });
        if (!error || error.code === '23505') saved = true;
      } catch {
        /* fall through to file persistence */
      }
    }
    if (!saved) {
      try {
        await fsp.mkdir(DATA, { recursive: true });
        const file = path.join(DATA, 'leads.json');
        let leads = [];
        try {
          leads = JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch {
          /* first write or unreadable file → start fresh */
        }
        if (!leads.includes(email)) leads.push(email);
        await fsp.writeFile(file, JSON.stringify(leads, null, 2));
      } catch {
        /* demo persistence is best-effort */
      }
    }
    res.json({ ok: true });
  });
});

// Keep audit requests separate from the simple waitlist so the founder retains
// the agency + client context needed to perform the manual audit.
let auditsLock = Promise.resolve();

app.post('/api/audits', (req, res) => {
  const { email, agency: agencyRaw, client: clientRaw } = req.body || {};
  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    typeof agencyRaw !== 'string' ||
    !agencyRaw.trim() ||
    agencyRaw.length > 2048 ||
    typeof clientRaw !== 'string' ||
    !clientRaw.trim() ||
    clientRaw.length > 2048
  ) {
    return res.status(400).json({ ok: false });
  }

  auditsLock = auditsLock.then(async () => {
    const agency = agencyRaw.trim();
    const client = clientRaw.trim();
    let saved = false;
    if (db) {
      try {
        const { error } = await db
          .from('audit_requests')
          .insert({ email, agency_website: agency, client_website: client });
        if (!error) saved = true;
      } catch {
        /* fall through to file persistence */
      }
    }
    if (!saved) {
      try {
        await fsp.mkdir(DATA, { recursive: true });
        const file = path.join(DATA, 'audits.json');
        let audits = [];
        try {
          audits = JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch {
          /* first write or unreadable file → start fresh */
        }
        audits.push({ email, agency, client, createdAt: new Date().toISOString() });
        await fsp.writeFile(file, JSON.stringify(audits, null, 2));
      } catch {
        /* demo persistence is best-effort */
      }
    }
    res.json({ ok: true });
  });
});

app.use(express.static(DIST));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProofLoop demo listening on :${PORT}`);
});
