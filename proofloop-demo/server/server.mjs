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

// ---------------------------------------------------------------------------
// Workspace + review store. Supabase (service-role key) when configured,
// JSON-file fallback otherwise — mirrors the leads/audits pattern.
// ---------------------------------------------------------------------------

const ACCENT_RE = /^#[0-9a-f]{6}$|^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/i;

async function readStore(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(path.join(DATA, file), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeStore(file, data) {
  await fsp.mkdir(DATA, { recursive: true });
  await fsp.writeFile(path.join(DATA, file), JSON.stringify(data, null, 2));
}

function slugifyServer(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'client'
  );
}

async function allWorkspaces() {
  if (db && hasServiceKey) {
    try {
      const { data, error } = await db
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) return data ?? [];
    } catch {
      /* fall through to file store */
    }
  }
  return readStore('workspaces.json', []);
}

async function allReviews() {
  if (db && hasServiceKey) {
    try {
      const { data, error } = await db
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error) return data ?? [];
    } catch {
      /* fall through to file store */
    }
  }
  return readStore('reviews.json', []);
}

async function insertWorkspace(ws) {
  if (db && hasServiceKey) {
    try {
      const { error } = await db.from('workspaces').insert(ws);
      if (!error) return true;
    } catch {
      /* fall through to file store */
    }
  }
  const workspaces = await readStore('workspaces.json', []);
  workspaces.push(ws);
  await writeStore('workspaces.json', workspaces);
  return true;
}

async function insertReviews(rows) {
  if (db && hasServiceKey) {
    try {
      const { error } = await db.from('reviews').insert(rows);
      if (!error) return true;
    } catch {
      /* fall through to file store */
    }
  }
  const reviews = await readStore('reviews.json', []);
  reviews.push(...rows);
  await writeStore('reviews.json', reviews);
  return true;
}

async function updateReview(id, patch) {
  const clean = {};
  if (typeof patch.approved === 'boolean') clean.approved = patch.approved;
  if (typeof patch.text === 'string' && patch.text.trim()) clean.text = patch.text.trim().slice(0, 1000);
  if (typeof patch.author === 'string') clean.author = patch.author.trim().slice(0, 80);
  if (typeof patch.role === 'string') clean.role = patch.role.trim().slice(0, 80);
  if (Number.isInteger(patch.rating) && patch.rating >= 1 && patch.rating <= 5) clean.rating = patch.rating;
  if (!Object.keys(clean).length) return false;
  if (db && hasServiceKey) {
    try {
      const { error } = await db.from('reviews').update(clean).eq('id', id);
      if (!error) return true;
    } catch {
      /* fall through to file store */
    }
  }
  const reviews = await readStore('reviews.json', []);
  const row = reviews.find((r) => r.id === id);
  if (!row) return false;
  Object.assign(row, clean);
  await writeStore('reviews.json', reviews);
  return true;
}

async function deleteReview(id) {
  if (db && hasServiceKey) {
    try {
      const { error } = await db.from('reviews').delete().eq('id', id);
      if (!error) return true;
    } catch {
      /* fall through to file store */
    }
  }
  const reviews = await readStore('reviews.json', []);
  const next = reviews.filter((r) => r.id !== id);
  if (next.length === reviews.length) return false;
  await writeStore('reviews.json', next);
  return true;
}

async function uniqueSlug(base) {
  const taken = new Set((await allWorkspaces()).map((w) => w.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
}

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(503).json({ ok: false, error: 'ADMIN_TOKEN is not configured' });
  }
  if ((req.headers.authorization || '') !== `Bearer ${token}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

function workspaceRow(ws) {
  return {
    id: ws.id,
    slug: ws.slug,
    name: ws.name,
    logo_url: ws.logo_url ?? null,
    accent: ws.accent ?? null,
    place_id: ws.place_id ?? null,
    origin: ws.origin ?? 'admin',
    created_at: ws.created_at ?? new Date().toISOString(),
  };
}

function isValidReviewInput(r) {
  return (
    r &&
    typeof r.text === 'string' &&
    r.text.trim().length > 0 &&
    r.text.length <= 1000 &&
    Number.isInteger(r.rating) &&
    r.rating >= 1 &&
    r.rating <= 5
  );
}

// --- Admin endpoints (founder console) ---

app.post('/api/admin/workspaces', requireAdmin, async (req, res) => {
  const { url, name: nameRaw } = req.body || {};
  if (url !== undefined && (typeof url !== 'string' || url.length > 2048)) {
    return res.status(400).json({ ok: false, error: 'invalid url' });
  }
  let name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 80) : '';
  let logoUrl = null;
  let accent = null;
  let placeId = null;

  if (url && url.trim()) {
    let u;
    const raw = url.trim();
    try {
      u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid url' });
    }
    if (!/^https?:$/.test(u.protocol) || (await resolvesToPrivate(u.hostname))) {
      return res.status(400).json({ ok: false, error: 'blocked host' });
    }
    try {
      const isMaps =
        (u.hostname.includes('google.') && u.pathname.includes('/maps')) ||
        u.hostname === 'maps.app.goo.gl';
      if (isMaps) {
        const mapsName = await resolveMapsName(u.toString());
        if (mapsName) name = mapsName.slice(0, 80);
      } else {
        const brand = await extractBrand(u.toString());
        if (brand.name) name = brand.name.slice(0, 80);
        logoUrl = brand.logoUrl;
        accent = brand.accent;
      }
    } catch {
      /* keep whatever name/fallback we have */
    }
  }

  if (!name) return res.status(400).json({ ok: false, error: 'could not determine a name; pass one explicitly' });

  const slug = await uniqueSlug(slugifyServer(name));
  const ws = workspaceRow({
    id: crypto.randomUUID(),
    slug,
    name,
    logo_url: logoUrl,
    accent,
    place_id: placeId,
    origin: 'admin',
  });
  await insertWorkspace(ws);
  res.json({ ok: true, workspace: ws });
});

app.get('/api/admin/workspaces', requireAdmin, async (_req, res) => {
  const [workspaces, reviews] = await Promise.all([allWorkspaces(), allReviews()]);
  res.json({
    ok: true,
    workspaces: workspaces.map((w) => {
      const mine = reviews.filter((r) => r.workspace_id === w.id);
      return { ...w, review_count: mine.length, approved_count: mine.filter((r) => r.approved).length };
    }),
  });
});

app.get('/api/admin/workspaces/:id', requireAdmin, async (req, res) => {
  const workspaces = await allWorkspaces();
  const ws = workspaces.find((w) => w.id === req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });
  const reviews = (await allReviews()).filter((r) => r.workspace_id === ws.id);
  res.json({ ok: true, workspace: ws, reviews });
});

app.post('/api/admin/workspaces/:id/import/google', requireAdmin, async (req, res) => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return res.status(503).json({ ok: false, error: 'GOOGLE_PLACES_API_KEY is not configured' });
  }
  const workspaces = await allWorkspaces();
  const ws = workspaces.find((w) => w.id === req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });

  const textQuery = (req.body && typeof req.body.query === 'string' && req.body.query.trim()) || ws.name;
  let data;
  try {
    const apiRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.rating,places.userRatingCount,places.reviews',
      },
      body: JSON.stringify({ textQuery }),
      signal: AbortSignal.timeout(9000),
    });
    data = await apiRes.json();
    if (!apiRes.ok) {
      return res.status(502).json({ ok: false, error: `Places API: ${data?.error?.message ?? apiRes.status}` });
    }
  } catch {
    return res.status(502).json({ ok: false, error: 'Places API request failed' });
  }

  const place = data?.places?.[0];
  if (!place) return res.json({ ok: true, imported: 0 });

  const existing = (await allReviews())
    .filter((r) => r.workspace_id === ws.id)
    .map((r) => `${r.author}::${r.text}`);
  const fresh = (place.reviews ?? [])
    .map((r) => ({
      workspace_id: ws.id,
      author: (r.authorAttribution?.displayName ?? 'Google user').slice(0, 80),
      role: '',
      text: (r.text?.text ?? r.originalText?.text ?? '').trim().slice(0, 1000),
      rating: Math.round(r.rating ?? 5),
      when_label: (r.relativePublishTimeDescription ?? '').slice(0, 60),
      source: 'google',
      approved: false,
      created_at: new Date().toISOString(),
    }))
    .filter((r) => r.text && !existing.has(`${r.author}::${r.text}`))
    .slice(0, 10);

  if (fresh.length) await insertReviews(fresh);

  // Backfill place metadata on the workspace for repeat imports.
  const patch = { place_id: place.id };
  await updateWorkspaceMeta(ws.id, patch);
  res.json({ ok: true, imported: fresh.length, place: place.displayName ?? null });
});

async function updateWorkspaceMeta(id, patch) {
  if (db && hasServiceKey) {
    try {
      await db.from('workspaces').update(patch).eq('id', id);
      return;
    } catch {
      /* fall through to file store */
    }
  }
  const workspaces = await readStore('workspaces.json', []);
  const row = workspaces.find((w) => w.id === id);
  if (row) {
    Object.assign(row, patch);
    await writeStore('workspaces.json', workspaces);
  }
}

app.post('/api/admin/workspaces/:id/import/manual', requireAdmin, async (req, res) => {
  const workspaces = await allWorkspaces();
  const ws = workspaces.find((w) => w.id === req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });
  const raw = req.body && typeof req.body.text === 'string' ? req.body.text : '';
  if (!raw.trim() || raw.length > 20000) {
    return res.status(400).json({ ok: false, error: 'paste some review text (max 20k chars)' });
  }

  // Blocks separated by blank lines. First line: author (", role" optional).
  // Second line: bare rating number (optional). Remaining lines: quote text.
  const rows = [];
  for (const block of raw.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let author = '';
    let role = '';
    let rating = 5;
    let textLines = lines;
    const nameMatch = lines[0].match(/^(.+?)(?:,\s*(.+))?$/);
    const ratingMatch = lines[1] && lines[1].match(/^[1-5](\s*★+\s*|\s*\/\s*5)?$/);
    if (nameMatch && lines.length > 1) {
      author = nameMatch[1].trim().slice(0, 80);
      role = (nameMatch[2] ?? '').trim().slice(0, 80);
      if (ratingMatch) {
        rating = Number(lines[1][0]);
        textLines = lines.slice(2);
      } else {
        textLines = lines.slice(1);
      }
    }
    const text = textLines.join(' ').trim().slice(0, 1000);
    if (text) rows.push({ text, rating, author, role });
  }
  if (!rows.length) return res.status(400).json({ ok: false, error: 'no readable reviews found' });

  const inserted = rows.slice(0, 50).map((r) => ({
    id: crypto.randomUUID(),
    workspace_id: ws.id,
    author: r.author,
    role: r.role,
    text: r.text,
    rating: r.rating,
    when_label: '',
    source: 'manual',
    approved: false,
    created_at: new Date().toISOString(),
  }));
  await insertReviews(inserted);
  res.json({ ok: true, imported: inserted.length });
});

app.post('/api/admin/workspaces/:id/approve-all', requireAdmin, async (req, res) => {
  const reviews = (await allReviews()).filter(
    (r) => r.workspace_id === req.params.id && !r.approved,
  );
  for (const r of reviews) await updateReview(r.id, { approved: true });
  res.json({ ok: true, approved: reviews.length });
});

app.patch('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  const done = await updateReview(req.params.id, req.body || {});
  if (!done) return res.status(400).json({ ok: false, error: 'nothing updated' });
  res.json({ ok: true });
});

app.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  const done = await deleteReview(req.params.id);
  if (!done) return res.status(404).json({ ok: false, error: 'review not found' });
  res.json({ ok: true });
});

// --- Public widget API ---

app.get('/api/workspaces/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 60);
  const workspaces = await allWorkspaces();
  const ws = workspaces.find((w) => w.slug === slug);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });
  const reviews = (await allReviews()).filter((r) => r.workspace_id === ws.id && r.approved);
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.json({
    ok: true,
    workspace: {
      name: ws.name,
      slug: ws.slug,
      logo_url: ws.logo_url ?? null,
      accent: ws.accent ?? null,
    },
    reviews: reviews.map((r) => ({
      author: r.author,
      role: r.role,
      text: r.text,
      rating: r.rating,
      when_label: r.when_label,
    })),
  });
});

// Public wow-moment: the landing page "Build my widget" flow creates a real,
// seeded workspace so the embed snippet it shows actually works.
let demoLock = Promise.resolve();
const demoHits = new Map(); // ip -> [timestamps]
const DEMO_LIMIT = 10;
const DEMO_WINDOW_MS = 60 * 60 * 1000;

app.post('/api/demo-workspace', async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const hits = (demoHits.get(ip) ?? []).filter((t) => now - t < DEMO_WINDOW_MS);
  if (hits.length >= DEMO_LIMIT) {
    return res.status(429).json({ ok: false, error: 'too many demo workspaces from this address' });
  }
  hits.push(now);
  demoHits.set(ip, hits);

  const { name, accent, logoUrl, reviews } = req.body || {};
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (!cleanName) return res.status(400).json({ ok: false, error: 'name required' });
  const cleanAccent =
    typeof accent === 'string' && ACCENT_RE.test(accent.trim()) ? accent.trim().toLowerCase() : null;
  const cleanLogo =
    typeof logoUrl === 'string' && /^https:\/\//i.test(logoUrl) && logoUrl.length <= 2048
      ? logoUrl
      : null;
  const seed = Array.isArray(reviews) ? reviews.filter(isValidReviewInput).slice(0, 10) : [];
  if (!seed.length) return res.status(400).json({ ok: false, error: 'reviews required' });

  demoLock = demoLock.then(async () => {
    const slug = await uniqueSlug(slugifyServer(cleanName));
    const ws = workspaceRow({
      id: crypto.randomUUID(),
      slug,
      name: cleanName,
      logo_url: cleanLogo,
      accent: cleanAccent,
      place_id: null,
      origin: 'demo',
    });
    const rows = seed.map((r) => ({
      id: crypto.randomUUID(),
      workspace_id: ws.id,
      author: String(r.author ?? 'Client').slice(0, 80),
      role: String(r.role ?? '').slice(0, 80),
      text: r.text.trim(),
      rating: r.rating,
      when_label: String(r.when ?? '').slice(0, 60),
      source: 'sample',
      approved: true,
      created_at: new Date().toISOString(),
    }));
    try {
      await insertWorkspace(ws);
      await insertReviews(rows);
      res.json({ ok: true, slug: ws.slug, url: `/w/${ws.slug}` });
    } catch {
      res.status(500).json({ ok: false, error: 'could not save workspace' });
    }
  });
});

app.use(express.static(DIST));
// Hosted widget page: /w/:slug serves a standalone shell that loads its data
// client-side from /api/workspaces/:slug (same origin, no CORS needed).
app.get('/w/:slug', (_req, res) => {
  res.sendFile(path.join(DIST, 'widget.html'));
});
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProofLoop demo listening on :${PORT}`);
});
