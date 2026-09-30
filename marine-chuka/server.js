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
  'verify': require('./api/verify'),
  'status': require('./api/status'),
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
    if (full !== PUBLIC && !full.startsWith(PUBLIC + path.sep)) return null;
    try { if (fs.statSync(full).isFile()) return full; } catch (_) { }
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

    if (p === '/healthz') {
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

server.listen(PORT, '0.0.0.0', () => {
  console.log('Afropiano listening on port ' + PORT);
  for (const k of ['DATABASE_URL', 'TICKET_SECRET', 'ADMIN_KEY', 'IPN_SECRET']) if (!process.env[k]) console.error('!! Missing environment variable: ' + k);
  require('./api/_lib/db').ensureSchema().catch((e) => console.error('   Check DATABASE_URL (use the Supabase "Session pooler" string). The server will retry on the next request.'));
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
