// Afropiano on Render: one small Node service that
//   1. serves the HTML/CSS/JS site from /public
//   2. runs the /api routes (orders, payment check, tickets, admin)
// The database is Supabase Postgres, reached only from here through DATABASE_URL.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const API = {
  'catalog': require('./api/catalog'),
  'order': require('./api/order'),
  'order-status': require('./api/order-status'),
  'submit-code': require('./api/submit-code'),
  'ticket': require('./api/ticket'),
  'ipn': require('./api/ipn'),
  'admin': require('./api/admin')
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
const COMPRESS = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);
const gzCache = new Map();

function baseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (_) { return null; }
  if (p.includes('\0')) return null;
  if (p === '/' || p === '') p = '/index.html';
  const tries = [p, p + '.html', path.join(p, 'index.html')];
  for (const t of tries) {
    const full = path.normalize(path.join(PUBLIC, t));
    if (full !== PUBLIC && !full.startsWith(PUBLIC + path.sep)) return null;   // no ../ tricks
    try { if (fs.statSync(full).isFile()) return full; } catch (_) { /* try next */ }
  }
  return null;
}

function serveStatic(req, res, pathname) {
  const file = resolveFile(pathname);
  baseHeaders(res);
  if (!file) {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found'); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  const rel = path.relative(PUBLIC, file);
  if (/^(admin|ticket)\.html$/.test(rel)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // html always fresh; images and files in /assets cached for a day (page links carry ?v= when they change)
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=86400');
  let buf = fs.readFileSync(file);
  if (COMPRESS.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const key = file + ':' + buf.length;
    if (!gzCache.has(key)) gzCache.set(key, zlib.gzipSync(buf));
    buf = gzCache.get(key);
    res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Length', buf.length);
  res.statusCode = 200;
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;

    if (p === '/healthz') {                       // Render health check. Add ?db=1 to also test the database.
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (u.searchParams.get('db')) {
        try { await require('./api/_lib/db').query('select 1'); res.end('{"ok":true,"db":true}'); }
        catch (e) { res.statusCode = 503; res.end(JSON.stringify({ ok: false, db: false, error: String(e.message).slice(0, 200) })); }
        return;
      }
      res.end('{"ok":true}'); return;
    }

    if (p.startsWith('/api/')) {
      const name = p.slice(5).replace(/\/$/, '');
      const handler = Object.prototype.hasOwnProperty.call(API, name) ? API[name] : null;
      baseHeaders(res);
      if (!handler) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end('{"error":"Not found"}'); return; }
      req.query = Object.fromEntries(u.searchParams);
      await handler(req, res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Method not allowed'); return; }
    serveStatic(req, res, p);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    res.end('{"error":"Server error"}');
  }
});

/* Create the database tables the first time the server starts (safe to run again: it only runs if tables are missing). */
async function ensureSchema() {
  if (!process.env.DATABASE_URL) { console.error('!! DATABASE_URL is not set. Orders will fail until you add it in Render > Environment.'); return; }
  const { query } = require('./api/_lib/db');
  const { rows: [r] } = await query(
    "select to_regclass('public.offer_stock') a, to_regclass('public.orders_v2') b, to_regclass('public.bank_credits') c, to_regclass('public.tickets') d");
  if (r.a && r.b && r.c && r.d) { console.log('Database ready.'); return; }
  console.log('Creating database tables...');
  await query(fs.readFileSync(path.join(__dirname, 'supabase.sql'), 'utf8'));
  console.log('Database tables created.');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('Afropiano listening on port ' + PORT);
  for (const k of ['DATABASE_URL', 'TICKET_SECRET', 'ADMIN_KEY', 'IPN_SECRET']) if (!process.env[k]) console.error('!! Missing environment variable: ' + k);
  ensureSchema().catch((e) => console.error('!! Database setup failed: ' + e.message + '\n   Check DATABASE_URL (use the Supabase "Session pooler" string) or run supabase.sql by hand in the Supabase SQL Editor.'));
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
